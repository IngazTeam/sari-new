import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction } from './checkout-agreements';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { loadSalesExperimentTurnPrompt } from './sales-experiment-turn';
import { generateSalesExperimentTurnInput, readSalesExperimentGenerationInput, salesGenerationRecipe, salesGenerationSnapshot,
  type GenerateSalesExperimentTurnInput } from './sales-experiment-generation-contract';
import { evaluationCompletion } from './learning-policy-evaluation-contract';
import { policyGenerationRoute } from './learning-policy-evaluation';
import { getActiveModel } from '../db_ai_settings';
import { resolveZahyPiRuntimeConfig, runWithZahyPiContext } from './zahypi-client';
import { callGPT4, type ChatMessage } from './openai';
import { AiBudgetError, aiBudgetReservationKey, type AiBudgetAttempt, type AiCompletionMetadata } from './budget-ledger';
import { parseReplyProviderJobReceipt, type AiProviderJobReceipt } from './provider-job-receipt';
import { getPool } from '../db/connection';
import { latestSalesReplyReviewReceipt } from './sales-generation-output-review-store';

const id = z.number().int().positive().safe(), flags = { generationAllowed: false as const, dispatchAllowed: false as const, exposureRecorded: false as const };
const decode = (value: any) => typeof value === 'string' ? JSON.parse(value) : value;
export class SalesExperimentGenerationConflict extends Error { constructor() { super('Sales experiment generation changed or is unavailable'); } }
const conflict = (): never => { throw new SalesExperimentGenerationConflict(); };
async function lock(c: PoolConnection, merchant: number) {
  const [rows] = await c.execute<any[]>('SELECT userId FROM merchants WHERE id=? FOR UPDATE', [merchant]);
  if (rows.length !== 1) return conflict(); return Number(rows[0].userId);
}
async function now(c: PoolConnection) {
  const [rows] = await c.execute<any[]>("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now");
  return String(rows[0].now).replace(/(\.\d{3})\d{3}Z$/, '$1Z');
}
function authorization(row: any) {
  try {
    const raw = decode(row.snapshot), s = salesGenerationSnapshot.parse(raw);
    if (policyArtifactDigest(raw) !== row.authorization_digest || policyArtifactDigest(s) !== row.authorization_digest
      || s.merchantId !== Number(row.merchant_id) || s.turnId !== Number(row.turn_id)
      || row.actor_user_id !== null && s.actorUserId !== Number(row.actor_user_id)
      || !['dispatching', 'responded', 'invalid', 'blocked', 'uncertain'].includes(row.state)) return conflict();
    const expected = s.version === 'sales-turn-generation-authorization.v2' ? aiBudgetReservationKey(`merchant:${s.merchantId}`, s.providerRequestId) : null;
    if (row.expected_reservation_key !== expected || expected !== null && row.reservation_key !== null && row.reservation_key !== expected) return conflict();
    const response = { text: row.response_text, metadata: row.response_metadata === null ? null : decode(row.response_metadata) };
    if (['responded', 'invalid'].includes(row.state)) {
      if (!row.reservation_key || !row.response_digest || row.response_digest !== responseDigest(row, response)) return conflict();
      if (row.state === 'responded' && (!validText(response.text) || !evaluationCompletion.safeParse(response.metadata).success
        || response.metadata.finishReason !== 'stop' || response.metadata.model !== s.observedModel)) return conflict();
    } else if (row.response_digest !== null || response.text !== null || response.metadata !== null) return conflict();
    providerReceipt(row, s);
    return { snapshot: s, response };
  } catch { return conflict(); }
}
function validText(text: unknown): text is string { return typeof text === 'string' && text.trim().length > 0 && text.length <= 32000; }
function responseDigest(row: any, response: unknown) { return policyArtifactDigest({ authorizationDigest: row.authorization_digest, reservationKey: row.reservation_key, response }); }
function receiptDigest(row: any, value: unknown) {
  return policyArtifactDigest({ authorizationDigest: row.authorization_digest, reservationKey: row.reservation_key, receipt: value });
}
function providerReceipt(row: any, s: z.infer<typeof salesGenerationSnapshot>) {
  if (row.provider_receipt === null) { if (row.provider_receipt_digest !== null) return conflict(); return null; }
  const raw = decode(row.provider_receipt), r = parseReplyProviderJobReceipt(raw);
  if (!row.reservation_key || s.provider !== 'zahypi' || r.tenantId !== `merchant:${s.merchantId}`
    || s.version === 'sales-turn-generation-authorization.v2' && r.traceId !== s.providerRequestId
    || receiptDigest(row, raw) !== row.provider_receipt_digest || receiptDigest(row, r) !== row.provider_receipt_digest
    || policyArtifactDigest({ provider: s.provider, model: s.model, route: r.configFingerprint }) !== s.routeDigest) return conflict();
  return r;
}
async function load(c: PoolConnection, merchant: number, generationId: number) {
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_generations WHERE merchant_id=? AND id=? FOR UPDATE', [merchant, generationId]);
  if (rows.length !== 1) return conflict(); authorization(rows[0]); return rows[0];
}
async function receipt(c: PoolConnection, row: any) {
  const parsed = authorization(row);
  let cost = null;
  if (row.reservation_key) {
    const [rows] = await c.execute<any[]>(`SELECT scope_key,request_id,provider,model,task_type,state,price_version,reserved_micro_usd,settled_micro_usd
      FROM ai_usage_reservations WHERE reservation_key=? FOR SHARE`, [row.reservation_key]);
    const r = rows[0], s = parsed.snapshot;
    if (r && (r.scope_key !== `merchant:${s.merchantId}` || r.provider !== s.provider || r.model !== s.model || r.task_type !== salesGenerationRecipe.taskType
      || s.version === 'sales-turn-generation-authorization.v2' && r.request_id !== s.providerRequestId)) return conflict();
    cost = r ? { state: String(r.state), priceVersion: String(r.price_version), heldMicroUsd: r.state === 'settled' ? 0 : Number(r.reserved_micro_usd),
      settledMicroUsd: r.settled_micro_usd === null ? null : Number(r.settled_micro_usd) } : { state: 'unavailable' };
  }
  const outputReview = await latestSalesReplyReviewReceipt(c, Number(row.merchant_id), Number(row.id));
  return { generationId: id.parse(Number(row.id)), authorizationDigest: String(row.authorization_digest), ...parsed,
    state: row.state as 'dispatching' | 'responded' | 'invalid' | 'blocked' | 'uncertain', actorPresent: row.actor_user_id !== null,
    responseDigest: row.response_digest as string | null, failureCode: row.failure_code as string | null, cost,
    reservationLink: row.reservation_key ? 'linked' as const : row.expected_reservation_key ? 'not_observed' as const : 'legacy_unresolved' as const,
    outputReview, assessment: outputReview ? 'human_review_recorded' as const : 'not_assessed' as const, eligibility: 'not_checked' as const, ...flags };
}
type Input = z.infer<typeof generateSalesExperimentTurnInput>;
export type SalesGenerationClaim = Readonly<{ merchant: number; generationId: number; token: string; authorizationDigest: string; recoveryToken?: string }>;
type Claim = SalesGenerationClaim;
async function current(c: PoolConnection, merchant: number, input: Pick<Input, 'turnId' | 'turnDigest' | 'baseSystemPrompt' | 'contextMessages'>) {
  const turn = await loadSalesExperimentTurnPrompt(c, merchant, input);
  if (turn.kind !== 'resolved') return conflict();
  const messages: ChatMessage[] = [{ role: 'system', content: turn.systemPrompt }, ...input.contextMessages, { role: 'user', content: turn.customerMessage }];
  return { turn, messages, inputDigest: policyArtifactDigest({ messages, recipe: salesGenerationRecipe }) };
}
/** Internal review composition under the merchant lock. Returns evidence, never a transport permit. */
export async function loadSalesGenerationReviewSource(c: PoolConnection, merchant: number, generationId: number,
  context: Pick<Input, 'baseSystemPrompt' | 'contextMessages'>) {
  const owner = await lock(c, merchant), row = await load(c, merchant, generationId), s = authorization(row).snapshot;
  if (row.state !== 'responded' || row.actor_user_id === null || owner !== s.actorUserId) return conflict();
  const checked = await current(c, merchant, { ...context, turnId: s.turnId, turnDigest: s.turnDigest });
  if (checked.inputDigest !== s.inputDigest || checked.turn.snapshot.promptDigest !== s.promptDigest
    || checked.turn.snapshot.routeDigest !== s.routeDigest || Date.parse(checked.turn.checkedAt) < Date.parse(s.authorizedAt)) return conflict();
  return { generationId, authorizationDigest: String(row.authorization_digest), responseDigest: String(row.response_digest),
    responseText: String(row.response_text), snapshot: s, turn: checked.turn.snapshot, customerMessage: checked.turn.customerMessage,
    lastAssistantMessage: context.contextMessages.filter(m => m.role === 'assistant').at(-1)?.content,
    checkedAt: checked.turn.checkedAt };
}
async function claimed(c: PoolConnection, claim: Claim) {
  const owner = await lock(c, claim.merchant), row = await load(c, claim.merchant, claim.generationId);
  if (row.claim_token !== claim.token || row.authorization_digest !== claim.authorizationDigest) return conflict(); return { row, owner, snapshot: authorization(row).snapshot };
}
async function recoveryLease(c: PoolConnection, claim: Claim) {
  if (!claim.recoveryToken) return;
  const [rows] = await c.execute<any[]>(`SELECT id FROM ai_sales_experiment_generations WHERE id=? AND recovery_token=?
    AND recovery_lease_until>UTC_TIMESTAMP(3)`, [claim.generationId, claim.recoveryToken]);
  if (rows.length !== 1) return conflict();
}
async function attemptOwned(c: PoolConnection, claim: Claim, attempt: AiBudgetAttempt, s: z.infer<typeof salesGenerationSnapshot>) {
  if (attempt.scopeKey !== `merchant:${claim.merchant}` || attempt.provider !== s.provider || attempt.model !== s.model || attempt.taskType !== salesGenerationRecipe.taskType) return conflict();
  if (s.version === 'sales-turn-generation-authorization.v2' && (attempt.requestId !== s.providerRequestId
    || attempt.reservationKey !== aiBudgetReservationKey(attempt.scopeKey, s.providerRequestId))) return conflict();
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_usage_reservations WHERE reservation_key=? FOR SHARE', [attempt.reservationKey]);
  const r = rows[0]; if (!r || r.scope_key !== attempt.scopeKey || r.request_id !== attempt.requestId || r.provider !== attempt.provider || r.model !== attempt.model
    || r.task_type !== attempt.taskType || !['reserved', 'unknown', 'settled'].includes(r.state)) return conflict();
}
/** Correlation only: never settles, releases, dispatches or treats a ledger row as permission to send. */
async function restoreReservation(c: PoolConnection, row: any) {
  const { snapshot: s } = authorization(row);
  if (row.reservation_key !== null || s.version !== 'sales-turn-generation-authorization.v2') return false;
  const [rows] = await c.execute<any[]>('SELECT reservation_key FROM ai_usage_reservations WHERE reservation_key=? FOR SHARE', [row.expected_reservation_key]);
  if (!rows.length) return false;
  await attemptOwned(c, { merchant: s.merchantId, generationId: Number(row.id), token: row.claim_token, authorizationDigest: row.authorization_digest },
    { reservationKey: row.expected_reservation_key, requestId: s.providerRequestId, scopeKey: `merchant:${s.merchantId}`, provider: s.provider, model: s.model, taskType: salesGenerationRecipe.taskType }, s);
  await c.execute('UPDATE ai_sales_experiment_generations SET reservation_key = ? WHERE id=?', [row.expected_reservation_key, row.id]);
  row.reservation_key = row.expected_reservation_key; return true;
}
/** Bounded SQL-only repair. Legacy attempts have no provable identity and are deliberately excluded. */
export async function reconcileSalesGenerationReservations(limit = 5) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5) throw Error('Invalid sales reservation batch');
  const pool = await getPool(); if (!pool) return conflict();
  const [rows] = await pool.execute<any[]>(`SELECT g.id,g.merchant_id,g.authorization_digest FROM ai_sales_experiment_generations g
    INNER JOIN ai_usage_reservations r ON r.reservation_key=g.expected_reservation_key
    WHERE g.reservation_key IS NULL AND g.expected_reservation_key IS NOT NULL
      AND (g.recovery_next_at IS NULL OR g.recovery_next_at<=UTC_TIMESTAMP(3)) ORDER BY g.id LIMIT ${limit}`);
  const result = { inspected: rows.length, linked: 0, deferred: 0 };
  for (const candidate of rows) {
    try {
      const linked = await checkoutTransaction(async c => {
        await lock(c, Number(candidate.merchant_id)); const row = await load(c, Number(candidate.merchant_id), Number(candidate.id));
        if (row.authorization_digest !== candidate.authorization_digest) return conflict();
        return restoreReservation(c, row);
      });
      if (linked) result.linked++;
    } catch {
      result.deferred++;
      await pool.execute(`UPDATE ai_sales_experiment_generations SET recovery_next_at=TIMESTAMPADD(SECOND,60,UTC_TIMESTAMP(3)),
        recovery_last_error='budget_link_deferred' WHERE id=? AND merchant_id=? AND authorization_digest=? AND reservation_key IS NULL`,
        [candidate.id, candidate.merchant_id, candidate.authorization_digest]);
    }
  }
  return result;
}
async function bind(claim: Claim, input: Input, attempt: AiBudgetAttempt) {
  await checkoutTransaction(async c => {
    const { row, owner, snapshot: s } = await claimed(c, claim);
    if (owner !== s.actorUserId || row.actor_user_id === null || row.state !== 'dispatching'
      || row.reservation_key !== null && row.reservation_key !== attempt.reservationKey) return conflict();
    await attemptOwned(c, claim, attempt, s);
    const checked = await current(c, claim.merchant, input);
    if (checked.inputDigest !== s.inputDigest || checked.turn.snapshot.promptDigest !== s.promptDigest || checked.turn.snapshot.routeDigest !== s.routeDigest
      || Date.parse(checked.turn.checkedAt) < Date.parse(s.authorizedAt)) return conflict();
    const [leases] = await c.execute<any[]>('SELECT lease_until>UTC_TIMESTAMP(3) AS valid FROM ai_sales_experiment_generations WHERE id=?', [claim.generationId]);
    if (!Number(leases[0]?.valid)) return conflict();
    await c.execute('UPDATE ai_sales_experiment_generations SET reservation_key=? WHERE id=?', [attempt.reservationKey, claim.generationId]);
  });
}
/** Durable receipt before polling; retries only local storage, including an uncertain commit acknowledgement. */
async function accepted(claim: Claim, value: AiProviderJobReceipt, attempt: AiBudgetAttempt) {
  const r = parseReplyProviderJobReceipt(value);
  for (let retry = 0; retry < 3; retry++) {
    try {
      await checkoutTransaction(async c => {
        const { row, snapshot: s } = await claimed(c, claim); await attemptOwned(c, claim, attempt, s);
        if (row.reservation_key !== attempt.reservationKey || r.traceId !== attempt.requestId) return conflict();
        const digest = receiptDigest(row, r);
        providerReceipt({ ...row, provider_receipt: r, provider_receipt_digest: digest }, s);
        if (row.provider_receipt !== null) { if (row.provider_receipt_digest !== digest) return conflict(); return; }
        if (!['dispatching', 'uncertain'].includes(row.state)) return conflict();
        await c.execute(`UPDATE ai_sales_experiment_generations SET provider_receipt=?,provider_receipt_digest=?,
          recovery_next_at=TIMESTAMPADD(SECOND,90,UTC_TIMESTAMP(3)) WHERE id=?`, [JSON.stringify(r), digest, claim.generationId]);
      });
      return;
    } catch (error) { if (retry === 2 || error instanceof SalesExperimentGenerationConflict) throw error; }
  }
}
export async function saveSalesGenerationResponse(claim: Claim, attempt: AiBudgetAttempt, text: string, metadata: AiCompletionMetadata | undefined) {
  const parsed = evaluationCompletion.safeParse(metadata), response = { text: validText(text) ? text : null, metadata: parsed.success ? parsed.data : null };
  // Retry local persistence only. Never ask the provider to generate again after an uncertain save.
  for (let retry = 0; retry < 3; retry++) {
    try {
      await checkoutTransaction(async c => {
        const { row, snapshot: s } = await claimed(c, claim); await attemptOwned(c, claim, attempt, s);
        if (row.reservation_key !== attempt.reservationKey) return conflict();
        await recoveryLease(c, claim);
        const digest = responseDigest(row, response);
        if (['responded', 'invalid'].includes(row.state)) { if (row.response_digest !== digest) return conflict(); return; }
        if (!['dispatching', 'uncertain'].includes(row.state)) return conflict();
        const valid = response.text !== null && response.metadata?.finishReason === 'stop' && response.metadata.model === s.observedModel;
        await c.execute(`UPDATE ai_sales_experiment_generations SET state=?,response_text=?,response_metadata=?,response_digest=?,failure_code=?,
          completed_at=UTC_TIMESTAMP(3),lease_until=NULL WHERE id=?`, [valid ? 'responded' : 'invalid', response.text,
          response.metadata ? JSON.stringify(response.metadata) : null, digest, valid ? null : 'invalid_completion', claim.generationId]);
      });
      return;
    } catch (error) { if (retry === 2 || error instanceof SalesExperimentGenerationConflict) throw error; }
  }
}
/** Loads only already accepted work. Revoked sources may retain historical output, never a send permission. */
export async function loadSalesGenerationRecovery(claim: Claim) {
  if (!claim.recoveryToken) return conflict();
  return checkoutTransaction(async c => {
    const { row, snapshot: s } = await claimed(c, claim); await recoveryLease(c, claim);
    if (!['dispatching', 'uncertain'].includes(row.state)) return null;
    const r = providerReceipt(row, s); if (!r) return conflict();
    const attempt: AiBudgetAttempt = { reservationKey: row.reservation_key, requestId: r.traceId, scopeKey: r.tenantId,
      provider: 'zahypi', model: s.model, taskType: r.taskType };
    await attemptOwned(c, claim, attempt, s); return { receipt: r, attempt };
  });
}
async function fail(claim: Claim, error: unknown) {
  await checkoutTransaction(async c => {
    const { row } = await claimed(c, claim); if (row.state !== 'dispatching') return;
    const code = error instanceof AiBudgetError && ['budget_exceeded', 'price_required', 'policy_required'].includes(error.code) ? error.code : 'generation_unavailable';
    await c.execute('UPDATE ai_sales_experiment_generations SET state=?,failure_code=?,lease_until=NULL WHERE id=?',
      [row.reservation_key ? 'uncertain' : 'blocked', code, claim.generationId]);
  });
}
/** Historical read, including stale/late outputs. It does not return a usable send permission. */
export async function getSalesExperimentGeneration(merchantId: number, value: z.infer<typeof readSalesExperimentGenerationInput>) {
  const merchant = id.parse(merchantId), input = readSalesExperimentGenerationInput.parse(value);
  return checkoutTransaction(async c => {
    await lock(c, merchant); const row = await load(c, merchant, input.generationId);
    await restoreReservation(c, row);
    if (row.state === 'dispatching') {
      const [changed] = await c.execute<any>(`UPDATE ai_sales_experiment_generations SET state='uncertain',failure_code='dispatch_acknowledgement_unknown',lease_until=NULL
        WHERE id=? AND state='dispatching' AND (lease_until IS NULL OR lease_until<=UTC_TIMESTAMP(3))`, [input.generationId]);
      if (changed.affectedRows) { row.state = 'uncertain'; row.failure_code = 'dispatch_acknowledgement_unknown'; }
    }
    return receipt(c, row);
  });
}

/** Internal, explicit single-turn generation by the current owner. No live chat/router/WhatsApp activation. */
export async function generateSalesExperimentTurn(merchantId: number, actorUserId: number, value: GenerateSalesExperimentTurnInput) {
  const merchant = id.parse(merchantId), actor = id.parse(actorUserId), input = generateSalesExperimentTurnInput.parse(value);
  const { baseSystemPrompt, contextMessages, ...metadata } = input;
  const payload = policyArtifactDigest({ actor, metadata, basePromptDigest: policyArtifactDigest(baseSystemPrompt), contextDigest: policyArtifactDigest(contextMessages) });
  const work = await checkoutTransaction(async c => {
    const owner = await lock(c, merchant);
    const [prior] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_generations WHERE merchant_id=? AND request_id=? FOR UPDATE', [merchant, input.requestId]);
    if (prior.length) { if (prior[0].payload_digest !== payload) return conflict(); authorization(prior[0]); return { generationId: Number(prior[0].id), dispatch: null }; }
    if (owner !== actor) return conflict();
    const checked = await current(c, merchant, input), t = checked.turn, s = t.snapshot;
    const [existing] = await c.execute<any[]>('SELECT id FROM ai_sales_experiment_generations WHERE merchant_id=? AND turn_id=? FOR SHARE', [merchant, input.turnId]);
    if (existing.length) return conflict();
    const authorizedAt = await now(c); if (Date.parse(authorizedAt) < Date.parse(t.checkedAt)) return conflict();
    const snapshot = salesGenerationSnapshot.parse({ version: 'sales-turn-generation-authorization.v2', providerRequestId: randomUUID(), merchantId: merchant, actorUserId: actor,
      turnId: input.turnId, turnDigest: input.turnDigest, conversationId: s.conversationId, incomingMessageId: s.incomingMessageId,
      promptDigest: s.promptDigest, inputDigest: checked.inputDigest, contextDigest: policyArtifactDigest(contextMessages),
      provider: t.route.provider, model: t.route.model, observedModel: t.route.observedModel, routeDigest: s.routeDigest, recipe: salesGenerationRecipe,
      authorizedAt, observationEndsAt: s.observationEndsAt, reason: input.reason, allowProviderCharge: true, understandsNoCustomerMessage: true,
      scope: 'single_turn_generation_only', dispatchAllowed: false, exposureRecorded: false });
    if (snapshot.version !== 'sales-turn-generation-authorization.v2') return conflict();
    const token = randomUUID();
    const [inserted] = await c.execute<any>(`INSERT INTO ai_sales_experiment_generations
      (merchant_id,turn_id,actor_user_id,request_id,payload_digest,authorization_digest,snapshot,state,claim_token,expected_reservation_key,lease_until)
      VALUES (?,?,?,?,?,?,?,'dispatching',?,?,TIMESTAMPADD(SECOND,90,UTC_TIMESTAMP(3)))`,
      [merchant, input.turnId, actor, input.requestId, payload, policyArtifactDigest(snapshot), JSON.stringify(snapshot), token,
        aiBudgetReservationKey(`merchant:${merchant}`, snapshot.providerRequestId)]);
    return { generationId: Number(inserted.insertId), dispatch: { claim: { merchant, generationId: Number(inserted.insertId), token, authorizationDigest: policyArtifactDigest(snapshot) }, messages: checked.messages, snapshot } };
  });
  if (work.dispatch) {
    const d = work.dispatch;
    try {
      await runWithZahyPiContext({ merchantId: merchant, conversationId: `sales-generation-${d.claim.token}`, taskType: salesGenerationRecipe.taskType }, async () => {
        const actual = policyGenerationRoute(await resolveZahyPiRuntimeConfig(undefined, { refresh: true }), await getActiveModel());
        if (actual.digest !== d.snapshot.routeDigest) return conflict();
        await callGPT4(d.messages, { merchantId: merchant, model: d.snapshot.model, taskType: 'sari.reply',
          temperature: salesGenerationRecipe.temperature, maxTokens: salesGenerationRecipe.maxTokens, noRetry: true,
          lifecycle: { requestId: d.snapshot.providerRequestId, beforeDispatch: attempt => bind(d.claim, input, attempt), afterJobAccepted: (receipt, attempt) => accepted(d.claim, receipt, attempt),
            afterResponse: (text, attempt, metadata) => saveSalesGenerationResponse(d.claim, attempt, text, metadata) } });
      });
    } catch (error) { await fail(d.claim, error); }
  }
  return getSalesExperimentGeneration(merchant, { generationId: work.generationId });
}
