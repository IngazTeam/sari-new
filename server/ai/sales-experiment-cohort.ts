import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction } from './checkout-agreements';
import { loadSalesExperimentProtocol } from './sales-experiment-protocol';
import { requireCurrentLearningPolicyCandidate, LearningPolicyCandidateConflict } from './learning-policy-candidates';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { getSalesSectorPlaybook } from '../../shared/sales-sector-playbooks';
import { listSalesCohortSourcesInput, cohortSourcePage, type ListSalesCohortSourcesInput } from '../../shared/sales-cohort-inspection';
import { cohortPhone, evaluateSalesCohort, freezeSalesCohortInput, inspectSalesCohortInput, readSalesCohortInput, salesCohortSnapshot,
  type FreezeSalesCohortInput, type SalesCohortSnapshot } from './sales-experiment-cohort-contract';

const id = z.number().int().positive().safe();
export class SalesCohortConflict extends Error { constructor() { super('Sales cohort changed or is unavailable'); } }
const conflict = (): never => { throw new SalesCohortConflict(); };
const sqlUtc = (value: string) => value.slice(0, 23).replace('T', ' ');
async function lockMerchant(c: PoolConnection, merchant: number) {
  const [rows] = await c.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchant]);
  if (rows.length !== 1) conflict();
}
async function clock(c: PoolConnection) {
  const [rows] = await c.execute<any[]>("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS now");
  return String(rows[0].now).replace(/(\.\d{3})\d{3}Z$/, '$1Z');
}
async function currentProtocol(c: PoolConnection, merchant: number, protocolId: number, digest: string) {
  const record = await loadSalesExperimentProtocol(c, merchant, protocolId);
  if (record.state !== 'registered' || record.protocolDigest !== digest) conflict();
  const p = record.protocol;
  await requireCurrentLearningPolicyCandidate(c, merchant, p.candidate.id, p.candidate.artifactDigest);
  const [rows] = await c.execute<any[]>('SELECT playbook_id,revision FROM ai_sales_sector_settings WHERE merchant_id=? FOR SHARE', [merchant]);
  const requested = rows[0]?.playbook_id ?? 'general', sector = getSalesSectorPlaybook(requested);
  if (sector.id !== requested || Number(rows[0]?.revision ?? 0) !== p.sector.revision || sector.id !== p.sector.playbook.id || policyArtifactDigest(sector) !== p.sector.digest) conflict();
  return record;
}
function receipt(row: any) {
  try {
    const raw = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
    const snapshot = salesCohortSnapshot.parse(raw);
    if (policyArtifactDigest(raw) !== row.cohort_digest || policyArtifactDigest(snapshot) !== row.cohort_digest
      || snapshot.merchantId !== Number(row.merchant_id) || snapshot.protocolId !== Number(row.protocol_id)
      || snapshot.protocolDigest !== row.protocol_digest) conflict();
    return { cohortId: Number(row.id), cohortDigest: String(row.cohort_digest), snapshot,
      actorUserId: row.actor_user_id === null ? null : Number(row.actor_user_id), createdAt: row.created_at,
      eligibility: 'not_checked' as const, activationAllowed: false as const, experimentStarted: false as const };
  } catch { return conflict(); }
}
async function load(c: PoolConnection, merchant: number, protocolId: number) {
  const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_cohorts WHERE merchant_id=? AND protocol_id=? FOR SHARE', [merchant, protocolId]);
  if (rows.length !== 1) conflict();
  const frozen = receipt(rows[0]), protocol = await loadSalesExperimentProtocol(c, merchant, protocolId), s = frozen.snapshot;
  if (Date.parse(s.frozenAt) < Date.parse(protocol.protocol.registeredAt) || protocol.protocolDigest !== s.protocolDigest || protocol.protocol.design.cohort.population !== s.population
    || protocol.protocol.design.window.enrollmentStartsAt !== s.enrollmentStartsAt || protocol.protocol.design.window.enrollmentEndsAt !== s.enrollmentEndsAt) conflict();
  return frozen;
}

/** Freezes supported predicates before enrollment; no caller can turn prose into executable authority. */
export async function freezeSalesExperimentCohort(merchantId: number, actorUserId: number, value: FreezeSalesCohortInput) {
  const merchant = id.parse(merchantId), actor = id.parse(actorUserId), input = freezeSalesCohortInput.parse(value);
  const payload = policyArtifactDigest({ actor, input });
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const [existing] = await c.execute<any[]>('SELECT * FROM ai_sales_experiment_cohorts WHERE merchant_id=? AND request_id=? FOR SHARE', [merchant, input.requestId]);
    if (existing.length) {
      if (existing[0].payload_digest !== payload) conflict();
      return { ...await load(c, merchant, input.protocolId), reused: true };
    }
    const p = (await currentProtocol(c, merchant, input.protocolId, input.protocolDigest)).protocol, frozenAt = await clock(c);
    if (Date.parse(frozenAt) >= Date.parse(p.design.window.enrollmentStartsAt)) conflict();
    const [prior] = await c.execute<any[]>('SELECT id FROM ai_sales_experiment_cohorts WHERE merchant_id=? AND protocol_id=? FOR SHARE', [merchant, input.protocolId]);
    if (prior.length) conflict();
    const snapshot = salesCohortSnapshot.parse({ version: 'sales-cohort-snapshot.v1', merchantId: merchant, protocolId: input.protocolId,
      protocolDigest: input.protocolDigest, frozenAt, population: p.design.cohort.population,
      enrollmentStartsAt: p.design.window.enrollmentStartsAt, enrollmentEndsAt: p.design.window.enrollmentEndsAt,
      rules: input.rules, matchesRegisteredDefinition: input.matchesRegisteredDefinition, mappingReview: input.mappingReview,
      mappingApproval: 'operator_attestation_only', activationAllowed: false });
    await c.execute(`INSERT INTO ai_sales_experiment_cohorts (merchant_id,protocol_id,request_id,payload_digest,protocol_digest,cohort_digest,snapshot,actor_user_id)
      VALUES (?,?,?,?,?,?,?,?)`, [merchant, input.protocolId, input.requestId, payload, input.protocolDigest, policyArtifactDigest(snapshot), JSON.stringify(snapshot), actor]);
    return { ...await load(c, merchant, input.protocolId), reused: false };
  });
}
export async function getSalesExperimentCohort(merchantId: number, value: { protocolId: number }) {
  const merchant = id.parse(merchantId), input = readSalesCohortInput.parse(value);
  return checkoutTransaction(async c => { await lockMerchant(c, merchant); return load(c, merchant, input.protocolId); });
}

/** An absent definition is a successful owned read, never a swallowed storage error. */
export async function prepareSalesExperimentCohort(merchantId: number, value: { protocolId: number }) {
  const merchant = id.parse(merchantId), input = readSalesCohortInput.parse(value);
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const record = await loadSalesExperimentProtocol(c, merchant, input.protocolId);
    const [rows] = await c.execute<any[]>('SELECT id FROM ai_sales_experiment_cohorts WHERE merchant_id=? AND protocol_id=? FOR SHARE', [merchant, input.protocolId]);
    const frozen = rows.length ? await load(c, merchant, input.protocolId) : null;
    const preparedAt = await clock(c);
    let status: 'available' | 'already_frozen' | 'withdrawn' | 'window_started' | 'source_changed' = 'available';
    if (frozen) status = 'already_frozen';
    else if (record.state !== 'registered') status = 'withdrawn';
    else if (Date.parse(preparedAt) >= Date.parse(record.protocol.design.window.enrollmentStartsAt)) status = 'window_started';
    else {
      try { await currentProtocol(c, merchant, input.protocolId, record.protocolDigest); }
      catch (error) {
        if (!(error instanceof SalesCohortConflict) && !(error instanceof LearningPolicyCandidateConflict)) throw error;
        status = 'source_changed';
      }
    }
    return { protocolId: input.protocolId, protocolDigest: record.protocolDigest, preparedAt, status, frozen,
      canFreeze: status === 'available', activationAllowed: false as const, experimentStarted: false as const };
  });
}

function messageDigest(merchant: number, conversationId: number, conversation: any, message: any) {
  return policyArtifactDigest({ version: 'cohort-message-selection.v1', merchant, conversationId, incomingMessageId: Number(message.id),
    customerName: conversation.customerName ?? null, customerPhone: String(conversation.customerPhone), messageType: String(message.messageType),
    content: String(message.content ?? ''), receivedAt: String(message.received_at) });
}

/** Bounded, owned discovery. No qualification prefilter or automatic inspection. */
export async function listSalesExperimentCohortSources(merchantId: number, value: ListSalesCohortSourcesInput) {
  const merchant = id.parse(merchantId), input = listSalesCohortSourcesInput.parse(value);
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const frozen = await load(c, merchant, input.protocolId);
    if (frozen.cohortDigest !== input.cohortDigest) conflict();
    await currentProtocol(c, merchant, input.protocolId, frozen.snapshot.protocolDigest);
    // Escape LIKE metacharacters with an explicit escape character; values never enter SQL syntax.
    const pattern = `%${input.search.replace(/[!%_]/g, character => `!${character}`)}%`;
    const [rows] = await c.execute<any[]>(`SELECT c.id AS conversation_id,c.customerName,c.customerPhone,m.id,m.messageType,m.content,
      DATE_FORMAT(m.createdAt,'%Y-%m-%dT%H:%i:%s.000Z') AS received_at
      FROM conversations c JOIN messages m ON m.id=(SELECT latest.id FROM messages latest
        WHERE latest.conversationId=c.id AND latest.direction='incoming' ORDER BY latest.id DESC LIMIT 1)
      WHERE c.merchantId=? ${input.beforeId ? 'AND c.id<?' : ''}
        AND (c.customerName LIKE ? ESCAPE '!' OR c.customerPhone LIKE ? ESCAPE '!')
      ORDER BY c.id DESC LIMIT ${input.limit + 1}`, [merchant, ...(input.beforeId ? [input.beforeId] : []), pattern, pattern]);
    const selected = rows.slice(0, input.limit);
    return cohortSourcePage.parse({ protocolId: input.protocolId, cohortDigest: frozen.cohortDigest, search: input.search, beforeId: input.beforeId ?? null, limit: input.limit,
      listedAt: await clock(c), activationAllowed: false, nextBeforeId: rows.length > selected.length ? Number(selected.at(-1)!.conversation_id) : null,
      items: selected.map(row => { const points = Array.from(String(row.content ?? '')); return {
        conversationId: Number(row.conversation_id), incomingMessageId: Number(row.id), customerName: row.customerName ?? null, customerPhone: String(row.customerPhone),
        messageType: row.messageType, preview: row.messageType === 'text' ? points.slice(0, 320).join('') : '', previewTruncated: row.messageType === 'text' && points.length > 320,
        receivedAt: String(row.received_at), messageDigest: messageDigest(merchant, Number(row.conversation_id), row, row),
      }; }),
    });
  });
}

/** Point-in-time inspection only. Never assigns an arm, writes a denominator or dispatches a reply. */
export async function inspectSalesExperimentCohort(merchantId: number, value: z.infer<typeof inspectSalesCohortInput>) {
  const merchant = id.parse(merchantId), input = inspectSalesCohortInput.parse(value);
  return checkoutTransaction(async c => {
    await lockMerchant(c, merchant);
    const frozen = await load(c, merchant, input.protocolId), s: SalesCohortSnapshot = frozen.snapshot;
    if (frozen.cohortDigest !== input.cohortDigest) conflict();
    const current = await currentProtocol(c, merchant, input.protocolId, s.protocolDigest);
    if (s.population !== current.protocol.design.cohort.population || s.enrollmentStartsAt !== current.protocol.design.window.enrollmentStartsAt
      || s.enrollmentEndsAt !== current.protocol.design.window.enrollmentEndsAt) conflict();
    const [conversations] = await c.execute<any[]>(`SELECT customerName,customerPhone,status,human_takeover,automation_after_message_id,deal_stage FROM conversations
      WHERE id=? AND merchantId=? FOR SHARE`, [input.conversationId, merchant]);
    if (conversations.length !== 1) conflict();
    const conversation = conversations[0];
    const [messages] = await c.execute<any[]>(`SELECT id,messageType,content,DATE_FORMAT(createdAt,'%Y-%m-%dT%H:%i:%s.000Z') AS received_at
      FROM messages WHERE id=? AND conversationId=? AND direction='incoming' FOR SHARE`, [input.incomingMessageId, input.conversationId]);
    if (messages.length !== 1) conflict();
    const [latest] = await c.execute<any[]>('SELECT id FROM messages WHERE conversationId=? AND direction=\'incoming\' ORDER BY id DESC LIMIT 1 FOR SHARE', [input.conversationId]);
    const message = messages[0], phone = cohortPhone.safeParse(conversation.customerPhone), selectedDigest = messageDigest(merchant, input.conversationId, conversation, messages[0]);
    if (input.expectedMessageDigest && input.expectedMessageDigest !== selectedDigest) conflict();
    // Exact two canonical spellings, scoped to this merchant; never LIKE/REPLACE arbitrary phone strings.
    const [prior] = phone.success ? await c.execute<any[]>(`SELECT m.id FROM conversations c JOIN messages m ON m.conversationId=c.id
      WHERE c.merchantId=? AND c.customerPhone IN (?,?) AND m.direction='incoming' AND m.createdAt<? LIMIT 1 FOR SHARE`,
    [merchant, phone.data, `+${phone.data}`, sqlUtc(s.enrollmentStartsAt)]) : [[]];
    const inspectedAt = await clock(c);
    const facts = { phone: String(conversation.customerPhone), status: String(conversation.status), humanTakeover: Number(conversation.human_takeover) !== 0,
      dealStage: conversation.deal_stage, postHandoff: Number.isSafeInteger(Number(conversation.automation_after_message_id)) && Number(conversation.automation_after_message_id) >= 0
        && input.incomingMessageId > Number(conversation.automation_after_message_id),
      latestInbound: Number(latest[0]?.id) === input.incomingMessageId, messageType: String(message.messageType),
      content: String(message.content ?? ''), messageReceivedAt: String(message.received_at), inspectedAt, priorInbound: prior.length > 0 };
    return { ...evaluateSalesCohort(s, facts), protocolId: input.protocolId, cohortDigest: frozen.cohortDigest, inspectedAt,
      conversationId: input.conversationId, incomingMessageId: input.incomingMessageId, messageDigest: selectedDigest,
      // Evidence fingerprint only; neither raw customer text nor phone leaks into the inspection response.
      sourceDigest: policyArtifactDigest({ merchant, conversationId: input.conversationId, incomingMessageId: input.incomingMessageId, facts }) };
  });
}
