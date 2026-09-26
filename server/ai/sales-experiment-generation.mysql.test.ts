import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { seedApprovedSalesPlan } from '../tests/helpers/sales-launch';
import { authorizeSalesExperimentLaunch, prepareSalesExperimentLaunch, revokeSalesExperimentLaunch } from './sales-experiment-launch';
import { assignSalesExperimentCustomer } from './sales-experiment-assignment';
import { prepareSalesExperimentTurn } from './sales-experiment-turn';
import { generateSalesExperimentTurn, getSalesExperimentGeneration } from './sales-experiment-generation';
import type { GenerateSalesExperimentTurnInput } from './sales-experiment-generation-contract';
import { clearZahyPiRuntimeConfigCache } from './zahypi-client';
import { resolveSariTaskType } from './task-catalog';
import { runAiSettlementBatch } from './budget-settlement';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import * as settings from '../db_ai_settings';
import { claimSalesGenerationRecoveries, recoverSalesGenerationResult, runSalesGenerationRecoveryBatch } from './sales-generation-recovery';
import { loadSalesGenerationRecovery, reconcileSalesGenerationReservations } from './sales-experiment-generation';
import { aiBudgetReservationKey } from './budget-ledger';
import { prepareSalesGenerationOutputReview, recordSalesGenerationOutputReview, getSalesGenerationOutputReviews } from './sales-generation-output-review';
import { salesReplyReviewRubricDigest, type RecordSalesReplyReviewInput } from './sales-generation-output-review-contract';
import { refusalAcknowledgement } from './response-validator';
import { getSalesReplyReviewWorkspace, listSalesReplyReviews, submitSalesReplyReview } from './sales-reply-review-workspace';
import type { ReplyReviewSubmission } from '../../shared/sales-reply-review';
import { getSalesReplySendWorkspace, submitSalesReplySend } from './sales-reply-delivery';
import { prepareSalesReplyDelivery, authorizeSalesReplyDelivery, dispatchReviewedSalesReply, getSalesReplyDelivery, canDispatchSalesReply, reconcileSalesReplyConversation } from './sales-reply-delivery';
import { buildReplyPlan, dispatchReplyPlan } from '../messaging/reply-plan';
import { stageInteraction, finishInteractionDelivery, runInteractionJob } from './interaction-jobs';
import { sendMerchantWhatsApp, updateWhatsAppDeliveryStatus } from '../channels/whatsapp/service';
import { salesReplyDeliveryKey } from './sales-reply-delivery-contract';
import { claimSalesReplyProjections, recoverSalesReplyProjection, runSalesReplyRecoveryBatch, salesReplyRecoveryHealth } from './sales-reply-recovery';
import { purgeCompletedInboundPayloads } from '../messaging/retention';
import { reserveSalesReplyUsage } from './sales-reply-usage';
import { checkoutTransaction } from './checkout-agreements';
import { readSalesExperimentExposure } from './sales-experiment-exposure-contract';
import type { SendMerchantWhatsAppInput, WhatsAppProviderConfig } from '../channels/whatsapp/types';
const wa = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('axios', () => ({ default: { post: wa.post } }));

const config = vi.hoisted(() => ({ unix: null as number | null, provider: 'openai' as 'openai' | 'zahypi', model: '', enabled: true, actualModel: 'synthetic-model', finish: 'stop', usage: true, text: 'رد اصطناعي للاختبار فقط.' }));
vi.mock('../db_ai_settings', () => ({ getOpenAiApiKey: async () => 'synthetic-key', getActiveModel: async () => config.model, logAiUsage: async () => {}, estimateCost: () => 0,
  getZahyPiRuntimeConfig: async () => ({ enabled: config.enabled, provider: config.provider, model: config.model, apiKey: 'synthetic-key', baseUrl: 'https://api.zahypi.test/v1', projectId: 'sari', source: 'database' }),
  getZahyPiRuntimeMetadata: async () => ({ enabled: config.enabled, provider: config.provider, model: config.model, baseUrl: 'https://api.zahypi.test/v1', projectId: 'sari', source: 'database' }) }));
vi.mock('./checkout-agreements', async original => {
  const actual = await original<typeof import('./checkout-agreements')>();
  return { ...actual, checkoutTransaction: (run: any) => actual.checkoutTransaction(async c => {
    if (config.unix !== null) await c.query('SET timestamp=?', [config.unix]);
    try { return await run(c); } finally { if (config.unix !== null) await c.query('SET timestamp=DEFAULT'); }
  }) };
});

describe.skipIf(!process.env.DATABASE_URL)('sales policy turn generation through real adapters and MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, users: number[], initialModel: string;
  let seeded: Awaited<ReturnType<typeof seedApprovedSalesPlan>>, launch: Awaited<ReturnType<typeof authorizeSalesExperimentLaunch>>;
  let input: GenerateSalesExperimentTurnInput, conversationId: number, incomingMessageId: number, customerMessage: string;
  let usagePlanIds: number[] = [];
  const query = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const generate = (value = input, merchant = owner.merchantId, actor = owner.userId) => generateSalesExperimentTurn(merchant, actor, value);
  const get = (generationId: number, merchant = owner.merchantId) => getSalesExperimentGeneration(merchant, { generationId });
  const ledger = () => query('SELECT * FROM ai_usage_reservations WHERE scope_key=?', [`merchant:${owner.merchantId}`]);
  const revoke = () => revokeSalesExperimentLaunch(owner.merchantId, owner.userId, { launchId: launch.launchId, launchDigest: launch.launchDigest, requestId: randomUUID(), reason: 'Stop the synthetic generation after reviewing current safety conditions.' });
  beforeEach(async ctx => {
    usagePlanIds = [];
    config.unix = null; config.provider = ctx.task.name.includes('ZahyPi') ? 'zahypi' : 'openai'; config.enabled = true;
    config.model = initialModel = `turn-fixture-${randomUUID()}`; config.actualModel = 'synthetic-model'; config.finish = 'stop'; config.usage = true; config.text = 'رد اصطناعي للاختبار فقط.';
    clearZahyPiRuntimeConfigCache(); vi.stubEnv('ZAHYPI_ALLOWED_ORIGINS', 'https://api.zahypi.test');
    owner = await createDisposableMerchant('generation-owner'); other = await createDisposableMerchant('generation-reviewer'); users = [owner.userId, other.userId];
    const sub = await query("INSERT INTO merchant_subscriptions (merchant_id,status,billing_cycle,start_date,end_date,trial_ends_at) VALUES (?,'trial','monthly',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY))", [owner.merchantId]);
    await query('UPDATE merchants SET current_subscription_id=? WHERE id=?', [sub.insertId, owner.merchantId]);
    await query("INSERT INTO ai_budget_policies (scope_key,version,daily_limit_micro_usd,enabled) VALUES (?,'fixture',100000000,1)", [`merchant:${owner.merchantId}`]);
    for (const provider of ['openai', 'zahypi']) await query("INSERT INTO ai_price_cards (provider,model,version,input_micro_usd_per_million,output_micro_usd_per_million,flat_micro_usd,max_input_tokens,enabled) VALUES (?,?,'generation-fixture',1,1,1,1000000,1)", [provider, config.model]);
    seeded = await seedApprovedSalesPlan(owner, other.userId);
    const p = await prepareSalesExperimentLaunch(owner.merchantId, { protocolId: seeded.protocol.protocolId });
    launch = await authorizeSalesExperimentLaunch(owner.merchantId, owner.userId, { protocolId: seeded.protocol.protocolId, requestId: randomUUID(), basisDigest: p.basisDigest,
      reviewId: p.basis.reviewId, reviewDigest: p.basis.reviewDigest, reason: 'Authorize a synthetic independently reviewed plan for isolated tests.', reviewedBoundPlanAndDecision: true, understandsNoMessagesSent: true });
    config.unix = Math.ceil(Date.parse(p.basis.window.enrollmentStartsAt) / 1000) + 60;
    conversationId = Number((await query("INSERT INTO conversations (merchantId,customerPhone,status,deal_stage) VALUES (?,'966500000988','active','new')", [owner.merchantId])).insertId);
    customerMessage = ctx.task.name.includes('refusal review') ? 'لا أريد الشراء' : 'أريد معرفة العرض المناسب';
    incomingMessageId = Number((await query("INSERT INTO messages (conversationId,direction,messageType,content,createdAt) VALUES (?,'incoming','text',?,?)", [conversationId, customerMessage, new Date(config.unix * 1000).toISOString().slice(0, 19).replace('T', ' ')])).insertId);
    const a = await assignSalesExperimentCustomer(owner.merchantId, { conversationId, incomingMessageId, protocolId: seeded.protocol.protocolId, launchId: launch.launchId, launchDigest: launch.launchDigest });
    if (a.kind !== 'assigned') throw Error('Missing fixture assignment');
    const baseSystemPrompt = 'PRIVATE_SERVER_CONTEXT: معلومات النشاط المعتمدة.';
    const turn = await prepareSalesExperimentTurn(owner.merchantId, { assignmentId: a.receipt.assignmentId, assignmentDigest: a.receipt.assignmentDigest,
      conversationId, incomingMessageId, requestId: randomUUID(), intent: 'inquiring', baseSystemPrompt });
    if (turn.kind !== 'recorded') throw Error('Missing fixture turn');
    input = { turnId: turn.receipt.turnId, turnDigest: turn.receipt.turnDigest, baseSystemPrompt, requestId: randomUUID(),
      contextMessages: [{ role: 'assistant', content: 'PRIVATE_SERVER_HISTORY: كيف أساعدك؟' }], reason: 'Authorize exactly one synthetic provider generation without sending a customer message.', allowProviderCharge: true, understandsNoCustomerMessage: true };
    transport();
  });
  afterEach(async () => {
    config.unix = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); clearZahyPiRuntimeConfigCache();
    for (const p of await query('SELECT * FROM ai_budget_periods WHERE scope_key=?', [`merchant:${owner.merchantId}`]))
      await query("UPDATE ai_budget_periods SET reserved_micro_usd=reserved_micro_usd-?,spent_micro_usd=spent_micro_usd-? WHERE scope_key='global' AND period_start=?", [p.reserved_micro_usd, p.spent_micro_usd, p.period_start]);
    for (const table of ['ai_usage_reservations', 'ai_budget_periods', 'ai_budget_policies']) await query(`DELETE FROM ${table} WHERE scope_key=?`, [`merchant:${owner.merchantId}`]);
    await query('DELETE FROM ai_price_cards WHERE model=?', [initialModel]); await cleanupDisposableMerchants(users);
    for (const planId of usagePlanIds) await query('DELETE FROM subscription_plans WHERE id=?', [planId]);
  });
  afterAll(closeDb);
  function transport() {
    const mock = vi.fn(async (_url: any, init: any) => {
      expect(init.method).toBe('POST'); const h = init.headers as Record<string, string>;
      const [row] = await query('SELECT * FROM ai_sales_experiment_generations WHERE merchant_id=?', [owner.merchantId]);
      const reservation = (await ledger()).find((r: any) => r.reservation_key === row.reservation_key);
      expect(row.state).toBe('dispatching'); expect(reservation.state).toBe('reserved');
      expect(h['X-Client-Request-Id'] ?? h['X-Trace-Id']).toBe(reservation.request_id);
      const body = JSON.parse(init.body), messages = config.provider === 'openai' ? body.messages : body.input.messages;
      expect(messages[0].content).toContain(input.baseSystemPrompt); expect(messages[0].content).toContain('سياسة البيع المشتركة v1');
      expect(messages.at(-1)).toEqual({ role: 'user', content: customerMessage }); expect(messages[1]).toEqual(input.contextMessages![0]);
      const usage = { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 };
      if (config.provider === 'openai') {
        return Response.json({ id: 'chatcmpl-fixture', model: config.actualModel, choices: [{ message: { content: config.text }, finish_reason: config.finish }], ...(config.usage ? { usage } : {}) });
      }
      const contract = resolveSariTaskType('sari.reply');
      return Response.json({ job_id: randomUUID(), status: 'completed', project_id: 'sari', tenant_id: h['X-ZahyPi-Tenant'], task_type: 'sari.reply', trace_id: h['X-Trace-Id'],
        run_manifest_id: randomUUID(), route: config.actualModel, usage, structured_output: { ...contract.sampleOutput, traceId: h['X-Trace-Id'], applicationResponse: config.text } });
    }); vi.stubGlobal('fetch', mock); return mock;
  }
  it.each(['OpenAI', 'ZahyPi'])('generates once with %s, keeps the original output and settles the shared budget without dispatch', async () => {
    const r = await generate(); expect(r).toMatchObject({ state: 'responded', assessment: 'not_assessed', generationAllowed: false, dispatchAllowed: false, exposureRecorded: false,
      response: { text: config.text }, cost: { state: 'settled', heldMicroUsd: 0, priceVersion: 'generation-fixture' } });
    expect(fetch).toHaveBeenCalledOnce(); expect(await ledger()).toHaveLength(1);
    const raw = JSON.stringify(await query('SELECT * FROM ai_sales_experiment_generations WHERE id=?', [r.generationId]));
    expect(raw).not.toContain('synthetic-key'); expect(raw).not.toContain('PRIVATE_SERVER_CONTEXT'); expect(raw).not.toContain('PRIVATE_SERVER_HISTORY');
    expect(await query('SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
    expect(await get(r.generationId)).toEqual(r); await closeDb(); expect(await generate()).toEqual(r); expect(fetch).toHaveBeenCalledOnce();
  });
  it('serializes concurrent and delayed requests without repeating generation', async () => {
    const results = await Promise.all([generate(), generate(), generate()]); expect(new Set(results.map(r => r.generationId)).size).toBe(1);
    expect(await generate()).toMatchObject({ state: 'responded' }); expect(fetch).toHaveBeenCalledOnce();
    await expect(generate({ ...input, requestId: randomUUID() })).rejects.toThrow(); expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(['baseSystemPrompt', 'contextMessages', 'turnDigest', 'reason', 'actor'])('rejects changed %s under the original request identity', async field => {
    await generate(); const changed = field === 'contextMessages' ? [] : field === 'turnDigest' ? 'f'.repeat(64) : 'Changed authorization context must never reuse the previous identity.';
    await expect(generate(field === 'actor' ? input : { ...input, [field]: changed }, owner.merchantId, field === 'actor' ? other.userId : owner.userId)).rejects.toThrow(); expect(fetch).toHaveBeenCalledOnce();
  });
  it('isolates merchant and owner boundaries for new generation and history', async () => {
    await expect(generate(input, other.merchantId, other.userId)).rejects.toThrow(); await expect(generate(input, owner.merchantId, other.userId)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
    const r = await generate(); await expect(get(r.generationId, other.merchantId)).rejects.toThrow();
  });
  it.each(['source', 'route', 'disabled', 'revoked', 'human', 'processed', 'owner', 'window'])('blocks %s drift before creating or charging a generation', async mode => {
    if (mode === 'source') await query("UPDATE messages SET content='Changed source' WHERE id=?", [incomingMessageId]);
    if (mode === 'route') config.model += '-changed'; if (mode === 'disabled') config.enabled = false; if (mode === 'revoked') await revoke();
    if (mode === 'human') await query('UPDATE conversations SET human_takeover=1 WHERE id=?', [conversationId]);
    if (mode === 'processed') await query('UPDATE messages SET isProcessed=1 WHERE id=?', [incomingMessageId]);
    if (mode === 'owner') await query('UPDATE merchants SET userId=? WHERE id=?', [other.userId, owner.merchantId]);
    if (mode === 'window') config.unix! += 365 * 86400;
    await expect(generate()).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled(); expect(await ledger()).toHaveLength(0);
    if (mode === 'owner') await query('UPDATE merchants SET userId=? WHERE id=?', [owner.userId, owner.merchantId]);
  });
  it.each(['price_required', 'budget_exceeded'])('records %s without transport and never retries the same turn automatically', async reason => {
    if (reason === 'price_required') await query('DELETE FROM ai_price_cards WHERE model=?', [initialModel]);
    else await query('UPDATE ai_budget_policies SET daily_limit_micro_usd=0 WHERE scope_key=?', [`merchant:${owner.merchantId}`]);
    const r = await generate(); expect(r).toMatchObject({ state: 'blocked', failureCode: reason }); expect(fetch).not.toHaveBeenCalled();
    await generate(); expect(fetch).not.toHaveBeenCalled(); expect(await ledger()).toHaveLength(0);
  });
  it.each(['OpenAI', 'ZahyPi'])('never repeats an uncertain %s provider create after a transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw Error('synthetic private upstream detail'); }));
    const r = await generate(); expect(r).toMatchObject({ state: 'uncertain', failureCode: 'generation_unavailable', cost: { state: 'unknown' } });
    expect(JSON.stringify(r)).not.toContain('upstream'); await generate(); expect(fetch).toHaveBeenCalledOnce(); expect(await ledger()).toHaveLength(1);
  });
  it('rechecks human ownership after reservation but before HTTP', async () => {
    const original = settings.getZahyPiRuntimeConfig;
    vi.spyOn(settings, 'getZahyPiRuntimeConfig').mockImplementationOnce(async () => {
      await query('UPDATE conversations SET human_takeover=1 WHERE id=?', [conversationId]); return original();
    });
    expect(await generate()).toMatchObject({ state: 'blocked' }); expect(fetch).not.toHaveBeenCalled(); expect((await ledger())[0].state).toBe('unknown');
    await generate(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['revoked', 'source-deleted', 'owner-changed'])('retains a paid late answer after %s without making it deliverable', async mode => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (...args) => {
      const response = await original(...args);
      if (mode === 'revoked') await revoke();
      if (mode === 'source-deleted') await query('DELETE FROM conversations WHERE id=?', [conversationId]);
      if (mode === 'owner-changed') await query('UPDATE merchants SET userId=? WHERE id=?', [other.userId, owner.merchantId]);
      return response;
    });
    const r = await generate(); expect(r).toMatchObject({ state: 'responded', eligibility: 'not_checked', dispatchAllowed: false, cost: { state: 'settled' } });
    expect(await generate()).toEqual(r); expect(fetch).toHaveBeenCalledOnce();
    if (mode === 'owner-changed') await query('UPDATE merchants SET userId=? WHERE id=?', [owner.userId, owner.merchantId]);
  });
  it.each(['finish', 'model', 'usage', 'empty'])('does not approve an invalid completion: %s', async mode => {
    if (mode === 'finish') config.finish = 'length'; if (mode === 'model') config.actualModel = 'unreviewed-model';
    if (mode === 'usage') config.usage = false; if (mode === 'empty') config.text = '';
    const r = await generate(); expect(r).toMatchObject({ state: mode === 'empty' ? 'uncertain' : 'invalid',
      failureCode: mode === 'empty' ? 'generation_unavailable' : 'invalid_completion', dispatchAllowed: false, assessment: 'not_assessed' });
    // The existing adapter rejects an empty completion before its handoff hook. Keep the budget held; do not manufacture saved output.
    if (mode === 'empty') expect(r).toMatchObject({ response: { text: null, metadata: null }, cost: { state: 'unknown' } });
    await generate(); expect(fetch).toHaveBeenCalledOnce();
  });
  function failCommit(phase: 'claim' | 'bind' | 'save' | 'settle' | 'receipt' | 'recover' | 'usage' | 'reserve' | 'link' | 'review' | 'delivery' | 'dispatch' | 'projection' | 'projection-claim', when: 'before' | 'after', failures = Infinity) {
    return (async () => {
      const pool = (await getPool())!, original = pool.getConnection.bind(pool);
      vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
        const c = await original(); let matched = false;
        return new Proxy(c, { get(target, key) {
          if (key === 'execute') return async (...args: any[]) => {
            const marker = { claim: 'INSERT INTO ai_sales_experiment_generations', bind: 'SET reservation_key=?', save: 'state=?,response_text=?', settle: "SET state = 'settled'", receipt: 'SET provider_receipt=?', recover: 'SET recovery_token=?', usage: 'SET usage_prompt_tokens=?', reserve: 'INSERT INTO ai_usage_reservations', link: 'SET reservation_key = ?', review: 'INSERT INTO ai_sales_generation_output_reviews', delivery: 'INSERT INTO ai_sales_reply_deliveries', dispatch: "SET state='dispatching',dispatch_started_at", projection: 'SET outgoing_message_reference=?', 'projection-claim': 'SET projection_token=?' }[phase];
            if (String(args[0]).includes(marker)) matched = true; return (target.execute as any)(...args);
          };
          if (key === 'commit') return async () => {
            const fail = matched && failures > 0; if (fail) failures--;
            if (fail && when === 'before') throw Error('Synthetic lost commit acknowledgement');
            await target.commit(); if (fail && when === 'after') throw Error('Synthetic lost commit acknowledgement');
          };
          const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value;
        } }) as any;
      });
    })();
  }
  it.each(['before', 'after'] as const)('does not dispatch when initial persistence loses acknowledgement %s commit', async when => {
    await failCommit('claim', when); await expect(generate()).rejects.toThrow(); vi.restoreAllMocks(); expect(fetch).not.toHaveBeenCalled();
    const r = await generate(); expect(fetch).toHaveBeenCalledTimes(when === 'before' ? 1 : 0);
    if (when === 'after') {
      expect(r.state).toBe('dispatching'); await query('UPDATE ai_sales_experiment_generations SET lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE id=?', [r.generationId]);
      expect(await get(r.generationId)).toMatchObject({ state: 'uncertain', failureCode: 'dispatch_acknowledgement_unknown' });
      await generate(); expect(fetch).not.toHaveBeenCalled();
    }
  });
  it.each(['before', 'after'] as const)('never contacts the provider after binding acknowledgement is lost %s commit', async when => {
    await failCommit('bind', when); const r = await generate(); vi.restoreAllMocks();
    expect(r.state).toBe(when === 'after' ? 'uncertain' : 'blocked'); expect(fetch).not.toHaveBeenCalled();
    expect((await ledger())[0].state).toBe('unknown'); await generate(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['before', 'after'] as const)('preserves safe replay after response acknowledgement is lost %s commit', async when => {
    await failCommit('save', when); const r = await generate(); vi.restoreAllMocks();
    expect(r.state).toBe(when === 'before' ? 'uncertain' : 'responded'); await generate(); expect(fetch).toHaveBeenCalledOnce();
  });
  it('retries two transient local response saves without repeating the provider call', async () => {
    await failCommit('save', 'before', 2); expect(await generate()).toMatchObject({ state: 'responded', cost: { state: 'settled' } }); expect(fetch).toHaveBeenCalledOnce();
  });
  it('retains the response when settlement fails and reconciles cost without generation', async () => {
    await failCommit('settle', 'before'); const r = await generate(); vi.restoreAllMocks();
    expect(r).toMatchObject({ state: 'responded', cost: { state: 'unknown' } });
    await query('UPDATE ai_usage_reservations SET settlement_next_at=UTC_TIMESTAMP(3) WHERE scope_key=?', [`merchant:${owner.merchantId}`]);
    await runAiSettlementBatch(); expect(await get(r.generationId)).toMatchObject({ cost: { state: 'settled' } }); await generate(); expect(fetch).toHaveBeenCalledOnce();
  });
  it('accepts a late response from the original claim after expiration without authorizing another attempt', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (...args) => {
      const response = await original(...args), [row] = await query('SELECT id FROM ai_sales_experiment_generations WHERE merchant_id=?', [owner.merchantId]);
      await query('UPDATE ai_sales_experiment_generations SET lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE id=?', [row.id]);
      expect(await get(Number(row.id))).toMatchObject({ state: 'uncertain' }); return response;
    });
    expect(await generate()).toMatchObject({ state: 'responded' }); await generate(); expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(['response', 'authorization', 'metadata', 'reservation'])('rejects stored %s corruption', async mode => {
    const r = await generate();
    if (mode === 'response') await query("UPDATE ai_sales_experiment_generations SET response_text='Injected' WHERE id=?", [r.generationId]);
    if (mode === 'authorization') await query("UPDATE ai_sales_experiment_generations SET snapshot=JSON_SET(snapshot,'$.turnId',99999999) WHERE id=?", [r.generationId]);
    if (mode === 'metadata') await query("UPDATE ai_sales_experiment_generations SET response_metadata=JSON_SET(response_metadata,'$.model','injected') WHERE id=?", [r.generationId]);
    if (mode === 'reservation') await query('UPDATE ai_sales_experiment_generations SET reservation_key=? WHERE id=?', [randomUUID(), r.generationId]);
    await expect(get(r.generationId)).rejects.toThrow(); expect(fetch).toHaveBeenCalledOnce();
  });
  it('keeps the recorded charge when current source or model becomes unavailable after completion', async () => {
    const r = await generate(); config.enabled = false; config.model = 'unavailable'; await revoke();
    expect(await generate()).toEqual(r); expect(await get(r.generationId)).toEqual(r); expect(fetch).toHaveBeenCalledOnce();
  });
  it('refuses rehashed generation authority changed between the claim and budget binding', async () => {
    const original = settings.getZahyPiRuntimeConfig;
    vi.spyOn(settings, 'getZahyPiRuntimeConfig').mockImplementationOnce(async () => {
      const [row] = await query('SELECT * FROM ai_sales_experiment_generations WHERE merchant_id=?', [owner.merchantId]);
      const snapshot = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot; snapshot.observedModel = 'unreviewed-model';
      await query('UPDATE ai_sales_experiment_generations SET snapshot=?,authorization_digest=? WHERE id=?', [JSON.stringify(snapshot), policyArtifactDigest(snapshot), row.id]); return original();
    });
    await expect(generate()).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
  const dueRecovery = () => query('UPDATE ai_sales_experiment_generations SET recovery_next_at=UTC_TIMESTAMP(3) WHERE merchant_id=?', [owner.merchantId]);
  async function pendingZahyPi() {
    const original = vi.mocked(fetch).getMockImplementation()!; let job: any;
    vi.mocked(fetch).mockImplementation(async (...args) => {
      if ((args[1] as any).method === 'POST') {
        job = await (await original(...args)).json(); return Response.json({ job_id: job.job_id, status: 'queued' });
      }
      const [row] = await query('SELECT provider_receipt FROM ai_sales_experiment_generations WHERE merchant_id=?', [owner.merchantId]);
      expect(row.provider_receipt).not.toBeNull(); throw Error('Synthetic worker lost while awaiting accepted job');
    });
    const r = await generate(); expect(r).toMatchObject({ state: 'uncertain', cost: { state: 'unknown' } });
    config.unix = null; await dueRecovery();
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      expect(init?.method).toBe('GET'); expect(String(url).endsWith(`/jobs/${job.job_id}`)).toBe(true); expect(init?.body).toBeUndefined(); return Response.json(job);
    });
    return { r, job };
  }
  it('recovers ZahyPi accepted output after disconnect using one GET and the original held budget', async () => {
    const { r } = await pendingZahyPi(); await closeDb();
    expect(await runSalesGenerationRecoveryBatch()).toEqual({ claimed: 1, saved: 1, skipped: 0, deferred: 0 });
    expect(await get(r.generationId)).toMatchObject({ state: 'responded', response: { text: config.text }, cost: { state: 'settled' }, dispatchAllowed: false, exposureRecorded: false });
    await generate(); expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ claimed: 0 });
    expect(vi.mocked(fetch).mock.calls.filter(c => c[1]?.method === 'POST')).toHaveLength(1); expect(fetch).toHaveBeenCalledTimes(3); expect(await ledger()).toHaveLength(1);
    expect(await query('SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
  });
  it.each(['before', 'after'] as const)('retries ZahyPi acceptance persistence locally after two failures %s commit', async when => {
    await failCommit('receipt', when, 2); expect(await generate()).toMatchObject({ state: 'responded', cost: { state: 'settled' } });
    expect(fetch).toHaveBeenCalledOnce(); const [row] = await query('SELECT provider_receipt FROM ai_sales_experiment_generations WHERE merchant_id=?', [owner.merchantId]); expect(row.provider_receipt).not.toBeNull();
  });
  it('does not guess a ZahyPi job when all receipt saves fail before commit', async () => {
    await failCommit('receipt', 'before'); const r = await generate(); vi.restoreAllMocks(); config.unix = null; await dueRecovery();
    expect(r).toMatchObject({ state: 'uncertain', cost: { state: 'unknown' } }); expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ claimed: 0 }); await generate(); expect(fetch).toHaveBeenCalledOnce();
  });
  it('serializes ZahyPi recovery claims and fences a stale worker after lease replacement', async () => {
    const { r } = await pendingZahyPi(), batches = await Promise.all([claimSalesGenerationRecoveries(), claimSalesGenerationRecoveries()]);
    expect(batches.flat()).toHaveLength(1); const first = batches.flat()[0];
    await query('UPDATE ai_sales_experiment_generations SET recovery_lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE id=?', [r.generationId]); await dueRecovery();
    const [second] = await claimSalesGenerationRecoveries(); expect(second.recoveryToken).not.toBe(first.recoveryToken);
    expect(await recoverSalesGenerationResult(first)).toBe('deferred'); expect(fetch).toHaveBeenCalledTimes(2);
    expect(await recoverSalesGenerationResult(second)).toBe('saved'); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('skips ZahyPi recovery when the original in-flight request saves the same accepted job first', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!; let job: any, finish!: (response: Response) => void, entered!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    vi.mocked(fetch).mockImplementation(async (...args) => {
      if (args[1]?.method === 'POST') { job = await (await original(...args)).json(); return Response.json({ job_id: job.job_id, status: 'queued' }); }
      return new Promise<Response>(resolve => { finish = resolve; entered(); });
    });
    const generation = generate(); await waiting; config.unix = null;
    await dueRecovery(); expect(await claimSalesGenerationRecoveries()).toHaveLength(0);
    await query('UPDATE ai_sales_experiment_generations SET lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE merchant_id=?', [owner.merchantId]);
    const [claim] = await claimSalesGenerationRecoveries(); expect(claim).toBeDefined();
    finish(Response.json(job)); expect(await generation).toMatchObject({ state: 'responded', cost: { state: 'settled' } });
    expect(await recoverSalesGenerationResult(claim)).toBe('skipped'); expect(fetch).toHaveBeenCalledTimes(2); expect(await ledger()).toHaveLength(1);
  });
  it.each(['before', 'after'] as const)('retains ZahyPi recovery after claim acknowledgement is lost %s commit', async when => {
    const { r } = await pendingZahyPi(); await failCommit('recover', when);
    await expect(claimSalesGenerationRecoveries()).rejects.toThrow(); vi.restoreAllMocks(); expect(fetch).toHaveBeenCalledTimes(2);
    if (when === 'after') {
      expect(await claimSalesGenerationRecoveries()).toHaveLength(0);
      await query('UPDATE ai_sales_experiment_generations SET recovery_lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE id=?', [r.generationId]); await dueRecovery();
    }
    expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ saved: 1 }); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each(['tenant', 'task', 'trace', 'fingerprint', 'digest', 'reservation', 'claim', 'actor'])('refuses ZahyPi recovery with altered %s before HTTP', async mode => {
    const { r } = await pendingZahyPi(); const [claim] = await claimSalesGenerationRecoveries();
    const [row] = await query('SELECT * FROM ai_sales_experiment_generations WHERE id=?', [r.generationId]);
    const receipt = typeof row.provider_receipt === 'string' ? JSON.parse(row.provider_receipt) : row.provider_receipt;
    if (mode === 'tenant') receipt.tenantId = `merchant:${other.merchantId}`;
    if (mode === 'task') receipt.taskType = 'sari.learning.pattern-analysis';
    if (mode === 'trace') receipt.traceId = randomUUID();
    if (mode === 'fingerprint') receipt.configFingerprint = 'f'.repeat(64);
    if (['tenant', 'task', 'trace', 'fingerprint'].includes(mode)) await query('UPDATE ai_sales_experiment_generations SET provider_receipt=?,provider_receipt_digest=? WHERE id=?',
      [JSON.stringify(receipt), policyArtifactDigest({ authorizationDigest: row.authorization_digest, reservationKey: row.reservation_key, receipt }), r.generationId]);
    if (mode === 'digest') await query("UPDATE ai_sales_experiment_generations SET provider_receipt_digest=REPEAT('f',64) WHERE id=?", [r.generationId]);
    if (mode === 'reservation') await query('UPDATE ai_usage_reservations SET request_id=? WHERE reservation_key=?', [randomUUID(), row.reservation_key]);
    if (mode === 'claim') (claim as any).token = randomUUID();
    if (mode === 'actor') (claim as any).merchant = other.merchantId;
    await expect(loadSalesGenerationRecovery(claim)).rejects.toThrow(); expect(await recoverSalesGenerationResult(claim)).toBe('deferred'); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(['disabled', 'provider', 'route'])('honors ZahyPi administrator %s changes during recovery', async mode => {
    const { r } = await pendingZahyPi(); if (mode === 'disabled') config.enabled = false; if (mode === 'provider') config.provider = 'openai'; if (mode === 'route') config.model += '-changed';
    expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ deferred: 1 }); expect(fetch).toHaveBeenCalledTimes(2);
    expect(await get(r.generationId)).toMatchObject({ state: 'uncertain', cost: { state: 'unknown' } });
  });
  it.each(['revoked', 'source-deleted', 'owner-changed'])('retains ZahyPi recovered historical output after %s without customer delivery', async mode => {
    const { r } = await pendingZahyPi(); if (mode === 'revoked') await revoke(); if (mode === 'source-deleted') await query('DELETE FROM conversations WHERE id=?', [conversationId]);
    if (mode === 'owner-changed') await query('UPDATE merchants SET userId=? WHERE id=?', [other.userId, owner.merchantId]);
    expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ saved: 1 }); expect(await get(r.generationId)).toMatchObject({ state: 'responded', dispatchAllowed: false, eligibility: 'not_checked' });
    if (mode === 'owner-changed') await query('UPDATE merchants SET userId=? WHERE id=?', [owner.userId, owner.merchantId]);
  });
  it('defers a still running ZahyPi job with bounded backoff and no additional generation', async () => {
    const { job } = await pendingZahyPi(); job.status = 'running'; expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ deferred: 1 });
    const [row] = await query('SELECT recovery_attempts,recovery_token,recovery_next_at>UTC_TIMESTAMP(3) AS is_delayed,recovery_last_error FROM ai_sales_experiment_generations WHERE merchant_id=?', [owner.merchantId]);
    expect(row).toMatchObject({ recovery_attempts: 1, recovery_token: null, is_delayed: 1, recovery_last_error: 'provider_lookup_deferred' });
    expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ claimed: 0 }); job.status = 'completed'; await dueRecovery(); expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ saved: 1 });
    expect(vi.mocked(fetch).mock.calls.filter(c => c[1]?.method === 'POST')).toHaveLength(1);
  });
  it('stores an unreviewed ZahyPi output as invalid and still settles its original usage', async () => {
    const { r, job } = await pendingZahyPi(); job.route = 'unreviewed-model';
    expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ saved: 1 }); expect(await get(r.generationId)).toMatchObject({ state: 'invalid', cost: { state: 'settled' }, dispatchAllowed: false });
    expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ claimed: 0 });
  });
  it('fences ZahyPi recovery that loses its lease during HTTP while retaining billed usage', async () => {
    const { r, job } = await pendingZahyPi(); const [claim] = await claimSalesGenerationRecoveries();
    vi.mocked(fetch).mockImplementation(async () => { await query('UPDATE ai_sales_experiment_generations SET recovery_lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE id=?', [r.generationId]); return Response.json(job); });
    expect(await recoverSalesGenerationResult(claim)).toBe('deferred'); expect(await get(r.generationId)).toMatchObject({ state: 'uncertain' });
    expect((await ledger())[0].usage_prompt_tokens).toBe(5); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each(['before', 'after'] as const)('recovers ZahyPi output safely after response commit failure %s commit', async when => {
    const { r } = await pendingZahyPi(); await failCommit('save', when); const result = await runSalesGenerationRecoveryBatch(); vi.restoreAllMocks();
    expect(result).toMatchObject(when === 'before' ? { deferred: 1 } : { saved: 1 });
    if (when === 'before') { expect((await ledger())[0].usage_prompt_tokens).toBe(5); await dueRecovery(); expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ saved: 1 }); }
    expect(await get(r.generationId)).toMatchObject({ state: 'responded', cost: { state: 'settled' } }); expect(vi.mocked(fetch).mock.calls.filter(c => c[1]?.method === 'POST')).toHaveLength(1);
  });
  it('retains recovered ZahyPi output when settlement fails and reconciles without another GET', async () => {
    const { r } = await pendingZahyPi(); await failCommit('settle', 'before'); expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ saved: 1 }); vi.restoreAllMocks();
    expect(await get(r.generationId)).toMatchObject({ state: 'responded', cost: { state: 'unknown' } });
    await query('UPDATE ai_usage_reservations SET settlement_next_at=UTC_TIMESTAMP(3) WHERE scope_key=?', [`merchant:${owner.merchantId}`]); await runAiSettlementBatch();
    expect(await get(r.generationId)).toMatchObject({ cost: { state: 'settled' } }); expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ claimed: 0 }); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each(['before', 'after'] as const)('keeps ZahyPi recovery pending until usage persistence is acknowledged %s commit', async when => {
    const { r } = await pendingZahyPi(); await failCommit('usage', when); expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ deferred: 1 }); vi.restoreAllMocks();
    expect(await get(r.generationId)).toMatchObject({ state: 'uncertain', response: { text: null, metadata: null }, cost: { state: 'unknown' } });
    expect((await ledger())[0].usage_received_at !== null).toBe(when === 'after');
    await dueRecovery(); expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ saved: 1 });
    expect(await get(r.generationId)).toMatchObject({ state: 'responded', cost: { state: 'settled' } });
    expect(vi.mocked(fetch).mock.calls.filter(c => c[1]?.method === 'POST')).toHaveLength(1); expect(await ledger()).toHaveLength(1);
  });
  it('does not contact a provider after the generation claim lease expires', async () => {
    const original = settings.getZahyPiRuntimeConfig;
    vi.spyOn(settings, 'getZahyPiRuntimeConfig').mockImplementationOnce(async () => {
      await query('UPDATE ai_sales_experiment_generations SET lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE merchant_id=?', [owner.merchantId]); return original();
    });
    expect(await generate()).toMatchObject({ state: 'blocked' }); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['OpenAI', 'ZahyPi'])('uses the persisted identity for the %s transport and budget reservation', async () => {
    const r = await generate(), [row] = await query('SELECT * FROM ai_sales_experiment_generations WHERE id=?', [r.generationId]), [budget] = await ledger();
    const s = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
    expect(s.version).toBe('sales-turn-generation-authorization.v2'); expect(s.providerRequestId).toBe(budget.request_id);
    expect(row.expected_reservation_key).toBe(aiBudgetReservationKey(`merchant:${owner.merchantId}`, s.providerRequestId));
    expect(row.reservation_key).toBe(row.expected_reservation_key); expect(r.reservationLink).toBe('linked');
    const headers = vi.mocked(fetch).mock.calls[0][1]!.headers as any; expect(headers['X-Client-Request-Id'] ?? headers['X-Trace-Id']).toBe(s.providerRequestId);
    expect(s.providerRequestId).not.toBe(input.requestId); expect(s.providerRequestId).not.toBe(row.claim_token);
  });
  it.each(['OpenAI', 'ZahyPi'])('retains the %s held cost when budget commit acknowledgement is lost', async () => {
    await failCommit('reserve', 'after'); const r = await generate(); vi.restoreAllMocks();
    expect(r).toMatchObject({ state: 'blocked', reservationLink: 'linked', cost: { state: 'reserved' }, dispatchAllowed: false });
    expect(r.cost && 'heldMicroUsd' in r.cost && r.cost.heldMicroUsd).toBeGreaterThan(0); expect(await ledger()).toHaveLength(1);
    await closeDb(); expect(await generate()).toEqual(r); expect(await reconcileSalesGenerationReservations()).toMatchObject({ linked: 0 }); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['OpenAI', 'ZahyPi'])('does not invent a %s reservation after a rolled-back budget write', async () => {
    await failCommit('reserve', 'before'); const r = await generate(); vi.restoreAllMocks();
    expect(r).toMatchObject({ state: 'blocked', reservationLink: 'not_observed', cost: null }); expect(await ledger()).toHaveLength(0);
    expect(await reconcileSalesGenerationReservations()).toMatchObject({ inspected: 0 }); await generate(); expect(fetch).not.toHaveBeenCalled();
  });
  async function unlinked() {
    await failCommit('bind', 'before', 1); const r = await generate(); vi.restoreAllMocks();
    expect(r).toMatchObject({ state: 'blocked', cost: { state: 'unknown' } });
    // Represents a process stopped before the final historical read repaired its committed reservation.
    await query('UPDATE ai_sales_experiment_generations SET reservation_key=NULL WHERE id=?', [r.generationId]);
    return r;
  }
  it('repairs an unlinked budget row in the background after reconnect without touching balances or transport', async () => {
    const r = await unlinked(), before = await query('SELECT * FROM ai_budget_periods WHERE scope_key=?', [`merchant:${owner.merchantId}`]);
    await closeDb(); expect(await runSalesGenerationRecoveryBatch()).toEqual({ claimed: 0, saved: 0, skipped: 0, deferred: 0 });
    expect(await get(r.generationId)).toMatchObject({ reservationLink: 'linked', cost: { state: 'unknown' }, state: 'blocked' });
    expect(await query('SELECT * FROM ai_budget_periods WHERE scope_key=?', [`merchant:${owner.merchantId}`])).toEqual(before); expect(fetch).not.toHaveBeenCalled();
  });
  it('serializes background and historical budget linking without duplicating the reservation', async () => {
    const r = await unlinked(); await Promise.all([get(r.generationId), get(r.generationId), reconcileSalesGenerationReservations(), reconcileSalesGenerationReservations()]);
    expect(await get(r.generationId)).toMatchObject({ reservationLink: 'linked', cost: { state: 'unknown' } }); expect(await ledger()).toHaveLength(1); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['before', 'after'] as const)('recovers a lost financial-link acknowledgement %s commit without provider activity', async when => {
    const r = await unlinked(); await failCommit('link', when); expect(await reconcileSalesGenerationReservations()).toMatchObject({ deferred: 1 }); vi.restoreAllMocks();
    const [row] = await query('SELECT * FROM ai_sales_experiment_generations WHERE id=?', [r.generationId]); expect(row.reservation_key !== null).toBe(when === 'after');
    await query('UPDATE ai_sales_experiment_generations SET recovery_next_at=NULL WHERE id=?', [r.generationId]);
    expect(await reconcileSalesGenerationReservations()).toMatchObject({ linked: when === 'before' ? 1 : 0 });
    expect(await get(r.generationId)).toMatchObject({ reservationLink: 'linked', cost: { state: 'unknown' } }); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['request_id', 'provider', 'model', 'task_type', 'state', 'scope_key'])('rejects a mismatched financial ledger %s and defers its repair', async field => {
    const r = await unlinked(), [budget] = await ledger();
    await query(`UPDATE ai_usage_reservations SET ${field}=? WHERE reservation_key=?`, [field === 'state' ? 'released' : field === 'scope_key' ? 'global' : 'unrelated-identity', budget.reservation_key]);
    await expect(get(r.generationId)).rejects.toThrow(); expect(await reconcileSalesGenerationReservations()).toMatchObject({ linked: 0, deferred: 1 });
    expect(await reconcileSalesGenerationReservations()).toMatchObject({ inspected: 0 });
    const [row] = await query('SELECT reservation_key FROM ai_sales_experiment_generations WHERE id=?', [r.generationId]); expect(row.reservation_key).toBeNull(); expect(fetch).not.toHaveBeenCalled();
    await query(`UPDATE ai_usage_reservations SET ${field}=? WHERE reservation_key=?`, [budget[field], budget.reservation_key]);
  });
  it.each(['revoked', 'deleted-source', 'changed-owner', 'disabled-provider'])('recovers original cost after %s without reauthorizing generation', async mode => {
    const r = await unlinked(); if (mode === 'revoked') await revoke(); if (mode === 'deleted-source') await query('DELETE FROM conversations WHERE id=?', [conversationId]);
    if (mode === 'changed-owner') await query('UPDATE merchants SET userId=? WHERE id=?', [other.userId, owner.merchantId]); if (mode === 'disabled-provider') config.enabled = false;
    expect(await reconcileSalesGenerationReservations()).toMatchObject({ linked: 1 }); expect(await get(r.generationId)).toMatchObject({ cost: { state: 'unknown' }, dispatchAllowed: false, generationAllowed: false });
    await generate(); expect(fetch).not.toHaveBeenCalled(); if (mode === 'changed-owner') await query('UPDATE merchants SET userId=? WHERE id=?', [owner.userId, owner.merchantId]);
  });
  it.each([['OpenAI', false], ['OpenAI', true], ['ZahyPi', false], ['ZahyPi', true]] as const)('allows %s pre-dispatch budget linking and honors human takeover=%s', async (_provider, human) => {
    const original = settings.getZahyPiRuntimeConfig;
    vi.spyOn(settings, 'getZahyPiRuntimeConfig').mockImplementationOnce(async () => {
      const pool = (await getPool())!, originalConnection = pool.getConnection.bind(pool);
      vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
        const c = await originalConnection(); let reserved = false;
        return new Proxy(c, { get(target, key) {
          if (key === 'execute') return async (...args: any[]) => { if (String(args[0]).includes('INSERT INTO ai_usage_reservations')) reserved = true; return (target.execute as any)(...args); };
          if (key === 'commit') return async () => { await target.commit(); if (reserved) { reserved = false; await reconcileSalesGenerationReservations(); if (human) await query('UPDATE conversations SET human_takeover=1 WHERE id=?', [conversationId]); } };
          const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value;
        } }) as any;
      }); return original();
    });
    expect(await generate()).toMatchObject({ reservationLink: 'linked', cost: { state: human ? 'unknown' : 'settled' } }); expect(fetch).toHaveBeenCalledTimes(human ? 0 : 1);
  });
  it.each(['expected key', 'rehashed request ID'])('rejects damaged persisted budget authority: %s', async mode => {
    const r = await unlinked();
    if (mode === 'expected key') await query('UPDATE ai_sales_experiment_generations SET expected_reservation_key=? WHERE id=?', ['f'.repeat(64), r.generationId]);
    else {
      const [row] = await query('SELECT snapshot FROM ai_sales_experiment_generations WHERE id=?', [r.generationId]);
      const s = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot; s.providerRequestId = randomUUID();
      await query('UPDATE ai_sales_experiment_generations SET snapshot=?,authorization_digest=? WHERE id=?', [JSON.stringify(s), policyArtifactDigest(s), r.generationId]);
    }
    await expect(get(r.generationId)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
  async function legacy(generationId: number) {
    const [row] = await query('SELECT * FROM ai_sales_experiment_generations WHERE id=?', [generationId]);
    const s = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot; delete s.providerRequestId; s.version = 'sales-turn-generation-authorization.v1';
    const authorizationDigest = policyArtifactDigest(s), response = { text: row.response_text, metadata: row.response_metadata === null ? null : typeof row.response_metadata === 'string' ? JSON.parse(row.response_metadata) : row.response_metadata };
    const providerReceipt = row.provider_receipt === null ? null : typeof row.provider_receipt === 'string' ? JSON.parse(row.provider_receipt) : row.provider_receipt;
    await query('UPDATE ai_sales_experiment_generations SET snapshot=?,authorization_digest=?,expected_reservation_key=NULL,response_digest=?,provider_receipt_digest=? WHERE id=?',
      [JSON.stringify(s), authorizationDigest, row.response_digest ? policyArtifactDigest({ authorizationDigest, reservationKey: row.reservation_key, response }) : null,
        providerReceipt ? policyArtifactDigest({ authorizationDigest, reservationKey: row.reservation_key, receipt: providerReceipt }) : null, generationId]);
  }
  it.each(['OpenAI', 'ZahyPi'])('preserves a linked legacy %s response and charge without inventing a new identity', async () => {
    const r = await generate(); await legacy(r.generationId);
    expect(await get(r.generationId)).toMatchObject({ state: 'responded', reservationLink: 'linked', snapshot: { version: 'sales-turn-generation-authorization.v1' }, cost: { state: 'settled' } });
    await generate(); expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not guess a legacy unlinked budget from matching route, amount or timestamps', async () => {
    const r = await unlinked(); await legacy(r.generationId);
    expect(await get(r.generationId)).toMatchObject({ reservationLink: 'legacy_unresolved', cost: null }); expect(await reconcileSalesGenerationReservations()).toMatchObject({ inspected: 0 });
    expect(await ledger()).toHaveLength(1); expect(fetch).not.toHaveBeenCalled();
  });
  it('still recovers a legacy ZahyPi job with an existing receipt and reservation', async () => {
    const { r } = await pendingZahyPi(); await legacy(r.generationId);
    expect(await runSalesGenerationRecoveryBatch()).toMatchObject({ saved: 1 }); expect(await get(r.generationId)).toMatchObject({ state: 'responded', cost: { state: 'settled' } });
  });
  const publicRead = (generationId: number, actor = owner.userId) => getSalesReplyReviewWorkspace(owner.merchantId, actor, { generationId });
  const publicSubmit = (value: ReplyReviewSubmission) => submitSalesReplyReview(owner.merchantId, owner.userId, value);
  async function publicFixture() {
    const r = await generate(), w = await publicRead(r.generationId); expect(w.canReview).toBe(true); vi.mocked(fetch).mockClear();
    const value: ReplyReviewSubmission = { generationId: r.generationId, requestId: randomUUID(), basisDigest: w.basis!.digest,
      rubricDigest: w.basis!.rubricDigest, expectedRevision: w.expectedRevision, checks: { answersQuestion: true, groundedInBusiness: true,
        appropriateNextStep: true, respectsCustomerDecision: true, noUnverifiedCommitment: true, languageAndClarity: true },
      quote: config.text, rationale: 'Human judgment against the authoritative customer question and current business evidence.', reviewedEntireResponse: true, understandsNoMessageSent: true };
    return { r, w, value };
  }
  async function deliveryFixture(provider: 'green_api' | 'meta_cloud' = 'green_api') {
    const f = await publicFixture(); await publicSubmit(f.value);
    const account = `fixture-${randomUUID()}`, token = `private-wa-${randomUUID()}`;
    const instanceRecordId = Number((await query(`INSERT INTO whatsapp_instances
      (merchant_id,instance_id,token,status,is_primary,provider,api_url,phone_number_id,provider_account_id)
      VALUES (?,?,?,'active',1,?,'https://api.green-api.com','1234567890','test-account')`, [owner.merchantId, account, token, provider])).insertId);
    const prepare = () => prepareSalesReplyDelivery(owner.merchantId, owner.userId, { generationId: f.r.generationId, instanceRecordId });
    const prepared = await prepare();
    const value = { generationId: f.r.generationId, instanceRecordId, requestId: randomUUID(), basisDigest: prepared.basisDigest,
      reason: 'Explicitly authorize this exact reviewed reply to the verified synthetic recipient.', allowSendCustomerMessage: true as const, reviewedExactRecipientAndResponse: true as const };
    wa.post.mockReset(); wa.post.mockResolvedValue({ status: 200, data: { idMessage: 'fixture-receipt', messages: [{ id: 'fixture-receipt' }] } });
    const auth = () => authorizeSalesReplyDelivery(owner.merchantId, owner.userId, value);
    return { ...f, value, reviewValue: f.value, instanceRecordId, prepare, auth, prepared, account, token };
  }
  const deliveryIdentity = (r: Awaited<ReturnType<typeof authorizeSalesReplyDelivery>>) => ({ deliveryId: r.deliveryId, authorizationDigest: r.authorizationDigest });
  const exposures = () => query('SELECT * FROM ai_sales_experiment_exposures WHERE merchant_id=?', [owner.merchantId]);
  it('transport exposure: catches an old worker projection after migration during rolling activation',async()=>{
    const f=await deliveryFixture(),r=await f.auth();await dispatch(r);
    await query('DELETE FROM ai_sales_experiment_exposures WHERE merchant_id=?',[owner.merchantId]);
    await query('UPDATE ai_sales_reply_deliveries SET projection_attempts=8 WHERE merchant_id=?',[owner.merchantId]);config.unix=null;
    const results=await Promise.all([runSalesReplyRecoveryBatch(),runSalesReplyRecoveryBatch()]);
    expect(results.reduce((n,v)=>n+v.claimed,0)).toBe(1);expect(results.reduce((n,v)=>n+v.projected,0)).toBe(1);
    expect(await exposures()).toHaveLength(1);expect((await projectionRow()).projection_attempts).toBe(1);
    expect((await runSalesReplyRecoveryBatch()).claimed).toBe(0);expect((await usageSubscription()).messages_used).toBe(2);expect(wa.post).toHaveBeenCalledOnce();
  });
  it('transport exposure: projects from one verified receipt even if retention follows that read',async()=>{
    const f=await deliveryFixture(),r=await f.auth();await sendMerchantWhatsApp(deliveryInput(r));
    const pool=(await getPool())!,original=pool.getConnection.bind(pool);let pruned=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){
      if(key==='execute')return async(...args:any[])=>{const result=await (target.execute as any)(...args);
        if(!pruned&&String(args[0]).startsWith('SELECT * FROM whatsapp_message_deliveries')) {
          pruned=true;await target.execute('UPDATE whatsapp_message_deliveries SET request_json=NULL WHERE merchant_id=?',[owner.merchantId]);
        }return result;};const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;
    }}) as any;});
    expect(await reconcileSalesReplyConversation(owner.merchantId,deliveryIdentity(r))).toMatchObject({exposureRecorded:true,outgoingMessageId:expect.any(Number)});
    vi.restoreAllMocks();expect(pruned).toBe(true);expect(await exposures()).toHaveLength(1);expect((await usageSubscription()).messages_used).toBe(2);
    expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['green_api','meta_cloud'] as const)('transport exposure: records exact frozen assignment and original reply for %s once', async provider => {
    const f=await deliveryFixture(provider), r=await f.auth(); expect(await exposures()).toHaveLength(0);
    expect((await deliveryRead(r)).exposureRecorded).toBe(false); await dispatch(r);
    const saved=await exposures();expect(saved).toHaveLength(1); const s=readSalesExperimentExposure(saved[0]);
    expect(s).toMatchObject({merchantId:owner.merchantId,generationId:f.r.generationId,deliveryId:r.deliveryId,
      authorizationDigest:r.authorizationDigest,conversationId,incomingMessageId,provider,scope:'provider_acceptance_only',humanReviewed:true});
    const [assignment]=await query('SELECT * FROM ai_sales_experiment_assignments WHERE merchant_id=?',[owner.merchantId]);
    expect(s).toMatchObject({assignmentId:Number(assignment.id),assignmentDigest:assignment.assignment_digest,arm:assignment.arm,customerKey:assignment.customer_key});
    for(const secret of [config.text,'966500000988',f.token,f.account,input.baseSystemPrompt,'fixture-receipt'])expect(JSON.stringify(saved)).not.toContain(secret);
    await Promise.all([dispatch(r),dispatch(r),dispatch(r)]);expect(await exposures()).toEqual(saved);expect(wa.post).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();expect((await deliveryRead(r)).exposureRecorded).toBe(true);
  });
  it.each(['not_attempted','unknown','rejected','suppressed'] as const)('transport exposure: does not invent acceptance from %s',async mode=>{
    const f=await deliveryFixture(),r=await f.auth();
    if(mode==='unknown')wa.post.mockRejectedValue(Error('synthetic disconnect'));
    if(mode==='rejected')wa.post.mockResolvedValue({status:400,data:{error:'synthetic rejection'}});
    if(mode==='suppressed')await revoke();
    const result=mode==='not_attempted'?await deliveryRead(r):await dispatch(r);
    expect(result).toMatchObject({transport:mode,exposureRecorded:false});expect(await exposures()).toHaveLength(0);
  });
  it.each(['delivered','read','failed'] as const)('transport exposure: preserves acceptance when the callback is %s before local projection',async status=>{
    const f=await deliveryFixture(),r=await f.auth();await sendMerchantWhatsApp(deliveryInput(r));
    expect(await exposures()).toHaveLength(0); // A status read must not write attribution.
    await deliveryRead(r);expect(await exposures()).toHaveLength(0);
    await updateWhatsAppDeliveryStatus({provider:'green_api',providerAccount:f.account,providerMessageId:'fixture-receipt',status});
    expect(await dispatch(r)).toMatchObject({transport:status,exposureRecorded:true});const saved=await exposures();
    await dispatch(r);expect(await exposures()).toEqual(saved);expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['before','after'] as const)('transport exposure: recovers a lost projection commit %s acknowledgement atomically',async when=>{
    const f=await deliveryFixture(),r=await f.auth();await failCommit('projection',when);
    await expect(dispatch(r)).rejects.toThrow();vi.restoreAllMocks();expect(await exposures()).toHaveLength(when==='before'?0:1);
    await dispatch(r);expect(await exposures()).toHaveLength(1);expect((await usageSubscription()).messages_used).toBe(2);expect(wa.post).toHaveBeenCalledOnce();
  });
  it('transport exposure: late recovery uses the original dispatch window after revocation',async()=>{
    const f=await deliveryFixture(),r=await f.auth();await sendMerchantWhatsApp(deliveryInput(r));await revoke();
    config.unix=Math.ceil(Date.parse(r.authorization.basis.observationEndsAt)/1000)+60;
    expect((await dispatch(r)).exposureRecorded).toBe(true);const s=readSalesExperimentExposure((await exposures())[0]);
    expect(Date.parse(s.acceptanceObservedAt)).toBeGreaterThan(Date.parse(s.observationEndsAt));
    expect(Date.parse(s.dispatchStartedAt)).toBeLessThan(Date.parse(s.observationEndsAt));expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['generation','turn','assignment','review'] as const)('transport exposure: refuses corrupted %s evidence without partial accounting',async kind=>{
    const f=await deliveryFixture(),r=await f.auth();await sendMerchantWhatsApp(deliveryInput(r));
    const tables={generation:['ai_sales_experiment_generations','authorization_digest'],turn:['ai_sales_experiment_turns','turn_digest'],
      assignment:['ai_sales_experiment_assignments','assignment_digest'],review:['ai_sales_generation_output_reviews','review_digest']};
    const [table,column]=tables[kind];await query(`UPDATE ${table} SET ${column}=? WHERE merchant_id=?`,['f'.repeat(64),owner.merchantId]);
    await expect(dispatch(r)).rejects.toThrow();expect(await exposures()).toHaveLength(0);expect((await usageSubscription()).messages_used).toBe(0);
    expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['digest','merchant','delivery','assignment','outbox','rehashed-authority'] as const)('transport exposure: rejects damaged saved %s binding',async kind=>{
    const f=await deliveryFixture(),r=await f.auth();await dispatch(r);const [row]=await exposures();
    if(kind==='rehashed-authority') {const s=readSalesExperimentExposure(row);s.authorizationDigest='f'.repeat(64);
      await query('UPDATE ai_sales_experiment_exposures SET snapshot=?,exposure_digest=? WHERE id=?',[JSON.stringify(s),policyArtifactDigest(s),row.id]);}
    else {const column={digest:'exposure_digest',merchant:'merchant_id',delivery:'delivery_id',assignment:'assignment_id',outbox:'outbox_id'}[kind];
      // Foreign-key-bound columns are changed inside the signed snapshot, not by disabling SQL constraints.
      if(kind==='merchant'||kind==='delivery') {const s=readSalesExperimentExposure(row);(s as any)[kind==='merchant'?'merchantId':'deliveryId']++;
        await query('UPDATE ai_sales_experiment_exposures SET snapshot=?,exposure_digest=? WHERE id=?',[JSON.stringify(s),policyArtifactDigest(s),row.id]);}
      else await query(`UPDATE ai_sales_experiment_exposures SET ${column}=? WHERE id=?`,[kind==='digest'?'f'.repeat(64):Number(row[column])+1,row.id]);}
    await expect(deliveryRead(r)).rejects.toThrow();await expect(dispatch(r)).rejects.toThrow();expect(wa.post).toHaveBeenCalledOnce();
  });
  it('transport exposure: migration backfill requeues SQL repair without changing allocation or sending again',async()=>{
    const f=await deliveryFixture(),r=await f.auth();await dispatch(r);
    const allocation=await query('SELECT * FROM ai_sales_experiment_assignments WHERE merchant_id=?',[owner.merchantId]);
    await query('DELETE FROM ai_sales_experiment_exposures WHERE merchant_id=?',[owner.merchantId]);
    const migration=readFileSync('drizzle/0124_sales_experiment_exposures.sql','utf8').split('--> statement-breakpoint')[1];await query(migration);
    config.unix=null;expect((await runSalesReplyRecoveryBatch()).projected).toBe(1);expect(await exposures()).toHaveLength(1);
    expect(await query('SELECT * FROM ai_sales_experiment_assignments WHERE merchant_id=?',[owner.merchantId])).toEqual(allocation);
    expect((await usageSubscription()).messages_used).toBe(2);expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['accepted','failed'] as const)('transport exposure: rolls back %s evidence if the recovery lease expires during insertion',async mode=>{
    const f=await deliveryFixture(),r=await f.auth();await sendMerchantWhatsApp(deliveryInput(r));config.unix=null;await dueProjection();
    if(mode==='failed')await updateWhatsAppDeliveryStatus({provider:'green_api',providerAccount:f.account,providerMessageId:'fixture-receipt',status:'failed'});
    const [claim]=await claimSalesReplyProjections(),pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){
      if(key==='execute')return async(...args:any[])=>{const result=await (target.execute as any)(...args);
        if(String(args[0]).includes('INSERT INTO ai_sales_experiment_exposures')) {
          await target.execute('UPDATE ai_sales_reply_deliveries SET projection_lease_until=TIMESTAMPADD(MICROSECOND,1000,UTC_TIMESTAMP(3)) WHERE id=?',[claim.deliveryId]);
          await target.query('SELECT SLEEP(0.02)');
        }return result;};const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;
    }}) as any;});
    await expect(reconcileSalesReplyConversation(owner.merchantId,deliveryIdentity(r),claim.token)).rejects.toThrow();vi.restoreAllMocks();
    expect(await exposures()).toHaveLength(0);expect((await usageSubscription()).messages_used).toBe(0);
    await dueProjection();await runSalesReplyRecoveryBatch();expect(await exposures()).toHaveLength(1);expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['green_api', 'meta_cloud'] as const)('public reply send: explicit %s message, replay and read-only recovery', async provider => {
    const f=await deliveryFixture(provider), args={generationId:f.r.generationId,instanceRecordId:f.instanceRecordId};
    const choose=await getSalesReplySendWorkspace(owner.merchantId,owner.userId,{generationId:f.r.generationId});
    expect(choose).toMatchObject({stage:'choose_account',preview:null,receipt:null});
    const ready=await getSalesReplySendWorkspace(owner.merchantId,owner.userId,args);
    expect(ready).toMatchObject({stage:'ready',preview:{basisDigest:f.value.basisDigest,recipient:'966500000988',responseText:config.text}});
    for(const secret of [f.token,f.account,'accountDigest','authorizationDigest','PRIVATE_SERVER','providerMessageId'])expect(JSON.stringify(ready)).not.toContain(secret);
    expect(wa.post).not.toHaveBeenCalled();
    expect(await query('SELECT id FROM ai_sales_reply_deliveries WHERE merchant_id=?',[owner.merchantId])).toHaveLength(0);
    const r=await submitSalesReplySend(owner.merchantId,owner.userId,f.value);expect(r).toMatchObject({transport:'accepted',exposureRecorded:true,requestId:f.value.requestId});
    expect(await submitSalesReplySend(owner.merchantId,owner.userId,f.value)).toEqual(r);
    await updateWhatsAppDeliveryStatus({provider,providerAccount:f.account,providerMessageId:'fixture-receipt',status:'read'});
    expect(await getSalesReplySendWorkspace(owner.merchantId,owner.userId,args)).toMatchObject({stage:'recorded',preview:null,receipt:{transport:'read'}});
    expect(wa.post).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();expect((await usageSubscription()).messages_used).toBe(2);
    expect(Object.keys(r).sort()).toEqual(['actorUserId','authorizedAt','basisDigest','deliveryId','exposureRecorded','generationId','instanceRecordId','recipient','requestId','responseText','transport'].sort());
  });
  it('public reply send: concurrent confirmations retain one request and one provider call',async()=>{
    const f=await deliveryFixture();const results=await Promise.all([1,2,3].map(()=>submitSalesReplySend(owner.merchantId,owner.userId,f.value)));
    expect(new Set(results.map(r=>r.deliveryId)).size).toBe(1);expect(wa.post).toHaveBeenCalledOnce();expect((await usageSubscription()).messages_used).toBe(2);
  });
  it.each(['foreign-tenant','foreign-actor','inactive-owner','inactive-merchant'])('public reply send: denies %s on preview, submission and saved request replay',async kind=>{
    const f=await deliveryFixture();await f.auth();
    if(kind==='inactive-owner')await query("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);
    if(kind==='inactive-merchant')await query("UPDATE merchants SET status='suspended' WHERE id=?",[owner.merchantId]);
    const m=kind==='foreign-tenant'?other.merchantId:owner.merchantId,a=['foreign-tenant','foreign-actor'].includes(kind)?other.userId:owner.userId;
    await expect(getSalesReplySendWorkspace(m,a,{generationId:f.r.generationId})).rejects.toThrow();
    await expect(submitSalesReplySend(m,a,f.value)).rejects.toThrow();expect(wa.post).not.toHaveBeenCalled();
  });
  it.each(['rejected','unknown','not_attempted'])('public reply send: status recovery never sends %s again',async kind=>{
    const f=await deliveryFixture();
    if(kind==='not_attempted')await f.auth();
    else {if(kind==='unknown')wa.post.mockRejectedValue(Error('synthetic transport lost'));else wa.post.mockResolvedValue({status:400,data:{error:'rejected'}});
      expect((await submitSalesReplySend(owner.merchantId,owner.userId,f.value)).transport).toBe(kind);}
    const calls=wa.post.mock.calls.length;
    for(let i=0;i<3;i++)expect(await getSalesReplySendWorkspace(owner.merchantId,owner.userId,{generationId:f.r.generationId})).toMatchObject({stage:'recorded',receipt:{transport:kind}});
    expect(wa.post.mock.calls.length).toBe(calls);expect((await usageSubscription()).messages_used).toBe(0);
  });
  it.each(['account','review','turn','quota'])('public reply send: stale %s cannot send using an earlier preview',async kind=>{
    const f=await deliveryFixture(), args={generationId:f.r.generationId,instanceRecordId:f.instanceRecordId};
    expect((await getSalesReplySendWorkspace(owner.merchantId,owner.userId,args)).stage).toBe('ready');
    if(kind==='account')await query("UPDATE whatsapp_instances SET token='rotated-synthetic-token' WHERE id=?",[f.instanceRecordId]);
    if(kind==='review'){const w=await publicRead(f.r.generationId);await publicSubmit({...f.reviewValue,expectedRevision:w.expectedRevision,requestId:randomUUID(),checks:{...f.reviewValue.checks,answersQuestion:false}});}
    if(kind==='turn')await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','new turn')",[conversationId]);
    if(kind==='quota')await query("UPDATE merchant_subscriptions SET status='cancelled' WHERE merchant_id=?",[owner.merchantId]);
    if(kind==='quota'){expect((await getSalesReplySendWorkspace(owner.merchantId,owner.userId,args)).stage).toBe('capacity_unavailable');
      expect((await submitSalesReplySend(owner.merchantId,owner.userId,f.value)).transport).toBe('suppressed');}
    else await expect(submitSalesReplySend(owner.merchantId,owner.userId,f.value)).rejects.toThrow();
    expect(wa.post).not.toHaveBeenCalled();
  });
  it('public reply send: preview does not list a foreign, inactive or unconfigured account',async()=>{
    const f=await deliveryFixture();await query("UPDATE whatsapp_instances SET status='inactive',is_primary=0 WHERE id=?",[f.instanceRecordId]);
    expect(await getSalesReplySendWorkspace(owner.merchantId,owner.userId,{generationId:f.r.generationId,instanceRecordId:f.instanceRecordId})).toMatchObject({stage:'unavailable',accounts:[],preview:null});
    await query("UPDATE whatsapp_instances SET status='active',token='' WHERE id=?",[f.instanceRecordId]);
    expect((await getSalesReplySendWorkspace(owner.merchantId,owner.userId,{generationId:f.r.generationId})).accounts).toEqual([]);
    expect(wa.post).not.toHaveBeenCalled();
  });
  const dispatch = (r: Awaited<ReturnType<typeof authorizeSalesReplyDelivery>>) => dispatchReviewedSalesReply(owner.merchantId, deliveryIdentity(r));
  const deliveryRead = (r: Awaited<ReturnType<typeof authorizeSalesReplyDelivery>>) => getSalesReplyDelivery(owner.merchantId, deliveryIdentity(r));
  function deliveryInput(r: Awaited<ReturnType<typeof authorizeSalesReplyDelivery>>): SendMerchantWhatsAppInput {
    const b = r.authorization.basis;
    return { merchantId: b.merchantId, instanceRecordId: b.instanceRecordId, to: b.recipient, text: b.responseText, kind: 'text',
      idempotencyKey: salesReplyDeliveryKey(b.merchantId, r.deliveryId), salesReplyGuard: deliveryIdentity(r) };
  }
  it.each(['green_api', 'meta_cloud'] as const)('reviewed delivery: sends %s once and separates acceptance, delivery and read receipts', async provider => {
    const f = await deliveryFixture(provider), budget = await ledger(), r = await f.auth();
    expect(r).toMatchObject({ state: 'authorized', transport: 'not_attempted', dispatchAllowed: false, exposureRecorded: false });
    expect(wa.post).not.toHaveBeenCalled(); expect(JSON.stringify(r)).not.toContain(f.token);
    const results = await Promise.all([dispatch(r), dispatch(r), dispatch(r)]);
    expect(results.some(x => x.transport === 'accepted')).toBe(true); expect(wa.post).toHaveBeenCalledOnce();
    expect(await dispatch(r)).toMatchObject({ state: 'dispatching', transport: 'accepted', providerMessageId: 'fixture-receipt', exposureRecorded: true });
    const payload = wa.post.mock.calls[0][1]; expect(provider === 'green_api' ? payload.message : payload.text.body).toBe(config.text);
    expect(await updateWhatsAppDeliveryStatus({ provider, providerAccount: 'wrong-account', providerMessageId: 'fixture-receipt', status: 'read' })).toBe('not_found');
    expect(await updateWhatsAppDeliveryStatus({ provider, providerAccount: f.account, providerMessageId: 'fixture-receipt', status: 'delivered' })).toBe('updated');
    expect((await deliveryRead(r)).transport).toBe('delivered');
    await updateWhatsAppDeliveryStatus({ provider, providerAccount: f.account, providerMessageId: 'fixture-receipt', status: 'read' });
    expect((await deliveryRead(r)).transport).toBe('read'); await revoke(); expect((await dispatch(r)).transport).toBe('read');
    expect(wa.post).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled(); expect(await ledger()).toEqual(budget);
    expect(await query('SELECT reply_origin,state,outgoing_message_reference FROM ai_interaction_jobs WHERE merchant_id=?', [owner.merchantId]))
      .toEqual([expect.objectContaining({ reply_origin: 'reviewed', state: 'reviewed_reserved', outgoing_message_reference: expect.any(Number) })]);
    expect(await runInteractionJob()).toBe(false);
  });
  it('reviewed delivery: only current v2 approval authorizes and concurrent UUID replay cannot create another attempt', async () => {
    const f = await deliveryFixture(); const rows = await Promise.all([f.auth(), f.auth(), f.auth()]);
    expect(rows[0]).toEqual(rows[1]); expect(rows[1]).toEqual(rows[2]); expect(wa.post).not.toHaveBeenCalled();
    for (const value of [{ ...f.value, reason: 'Changed authorization meaning under the same UUID.' }, { ...f.value, requestId: randomUUID() }])
      await expect(authorizeSalesReplyDelivery(owner.merchantId, owner.userId, value)).rejects.toThrow();
    await expect(authorizeSalesReplyDelivery(other.merchantId, other.userId, f.value)).rejects.toThrow();
    await expect(authorizeSalesReplyDelivery(owner.merchantId, other.userId, f.value)).rejects.toThrow();
    await expect(getSalesReplyDelivery(other.merchantId, deliveryIdentity(rows[0]))).rejects.toThrow();
    await expect(dispatchReviewedSalesReply(owner.merchantId, { ...deliveryIdentity(rows[0]), authorizationDigest: 'f'.repeat(64) })).rejects.toThrow();
  });
  const ordinaryPlan = (f: Awaited<ReturnType<typeof deliveryFixture>>) => buildReplyPlan({ merchantId: owner.merchantId,
    instanceId: f.instanceRecordId, providerAccount: f.account, eventId: `ordinary-${incomingMessageId}`, conversationId,
    incomingMessageId, to: '966500000988', text: 'الرد العادي المنافس' });
  const projectionRow = async () => (await query('SELECT * FROM ai_sales_reply_deliveries WHERE merchant_id=?', [owner.merchantId]))[0];
  const usageSubscription = async () => (await query('SELECT * FROM merchant_subscriptions WHERE merchant_id=? ORDER BY id LIMIT 1', [owner.merchantId]))[0];
  async function usageFixture(limit = 2) {
    const f = await deliveryFixture(), r = await f.auth();
    const planId = Number((await query("INSERT INTO subscription_plans (name,name_en,monthly_price,yearly_price,max_customers,message_limit) VALUES ('Synthetic reply usage','Synthetic reply usage',1,10,100,?)", [limit])).insertId);
    usagePlanIds.push(planId); await query("UPDATE merchant_subscriptions SET plan_id=?,status='active' WHERE merchant_id=?", [planId,owner.merchantId]);
    return {f,r,subscription:await usageSubscription(),planId};
  }
  it.each([2,4])('shared reply usage: reviewed and ordinary turns compete atomically for capacity %s',async limit=>{
    const {f,r}=await usageFixture(limit);
    const conv=Number((await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500000988','active')",[owner.merchantId])).insertId);
    const msg=Number((await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','استفسار آخر')",[conv])).insertId);
    const p=buildReplyPlan({merchantId:owner.merchantId,instanceId:f.instanceRecordId,providerAccount:f.account,eventId:randomUUID(),conversationId:conv,incomingMessageId:msg,to:'966500000988',text:'رد عادي اصطناعي'});
    wa.post.mockRejectedValue(Error('Synthetic unknown transport'));
    const outcomes=await Promise.allSettled([dispatch(r),dispatchReplyPlan(p)]);
    const debug={outcomes:outcomes.map(v=>v.status==='rejected'?{status:v.status,code:v.reason?.code}:{status:v.status}),ordinary:await query('SELECT state,usage_state FROM ai_interaction_jobs WHERE merchant_id=?',[owner.merchantId]),
      delivery:await query('SELECT state,usage_state FROM ai_sales_reply_deliveries WHERE merchant_id=?',[owner.merchantId]),
      transport:await query('SELECT status,error_code FROM whatsapp_message_deliveries WHERE merchant_id=?',[owner.merchantId])};
    expect(wa.post.mock.calls.length,JSON.stringify(debug)).toBe(limit/2);expect((await usageSubscription()).messages_used).toBe(0);
    const [[held]]=await (await getPool())!.execute<any[]>(`SELECT
      (SELECT COALESCE(SUM(usage_units),0) FROM ai_sales_reply_deliveries WHERE merchant_id=? AND usage_state='held')+
      (SELECT COALESCE(SUM(usage_units),0) FROM ai_interaction_jobs WHERE merchant_id=? AND usage_state='held') AS total`,[owner.merchantId,owner.merchantId]);
    expect(Number(held.total)).toBe(limit);
  });
  it('reply usage: reserves before provider IO and charges two units once with projected history', async () => {
    const {r}=await usageFixture();
    wa.post.mockImplementation(async()=>{expect(await projectionRow()).toMatchObject({usage_state:'held',usage_units:2});expect((await usageSubscription()).messages_used).toBe(0);
      return {status:200,data:{idMessage:'fixture-receipt'}};});
    await Promise.all([dispatch(r),dispatch(r),dispatch(r)]);
    expect(await projectionRow()).toMatchObject({usage_state:'charged',projection_state:'projected'});expect((await usageSubscription()).messages_used).toBe(2);
    await closeDb();await dispatch(r);expect((await usageSubscription()).messages_used).toBe(2);expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each([0,1])('reply usage: refuses insufficient capacity %s before provider IO', async limit => {
    const {r}=await usageFixture(limit);expect((await dispatch(r)).transport).toBe('suppressed');
    expect(wa.post).not.toHaveBeenCalled();expect(await projectionRow()).toMatchObject({usage_state:'pending',state:'authorized'});expect((await usageSubscription()).messages_used).toBe(0);
  });
  it.each(['missing','foreign','cancelled','expired','trial-ended','future-start','future-reset','no-plan','invalid-count','overflow','invalid-limit'])('reply usage: rejects %s subscription evidence', async mode => {
    const {r,planId}=await usageFixture();
    if(mode==='missing')await query('UPDATE merchants SET current_subscription_id=NULL WHERE id=?',[owner.merchantId]);
    if(mode==='foreign')await query('UPDATE merchant_subscriptions SET merchant_id=? WHERE merchant_id=?',[other.merchantId,owner.merchantId]);
    if(mode==='cancelled')await query("UPDATE merchant_subscriptions SET status='cancelled' WHERE merchant_id=?",[owner.merchantId]);
    if(mode==='expired')await query("UPDATE merchant_subscriptions SET end_date='2000-01-01' WHERE merchant_id=?",[owner.merchantId]);
    if(mode==='trial-ended')await query("UPDATE merchant_subscriptions SET status='trial',trial_ends_at='2000-01-01' WHERE merchant_id=?",[owner.merchantId]);
    if(mode==='future-start')await query("UPDATE merchant_subscriptions SET start_date='2037-01-01' WHERE merchant_id=?",[owner.merchantId]);
    if(mode==='future-reset')await query("UPDATE merchant_subscriptions SET last_reset_at='2037-01-01' WHERE merchant_id=?",[owner.merchantId]);
    if(mode==='no-plan')await query('UPDATE merchant_subscriptions SET plan_id=NULL WHERE merchant_id=?',[owner.merchantId]);
    if(mode==='invalid-count')await query('UPDATE merchant_subscriptions SET messages_used=-1 WHERE merchant_id=?',[owner.merchantId]);
    if(mode==='overflow')await query('UPDATE merchant_subscriptions SET messages_used=2147483646 WHERE merchant_id=?',[owner.merchantId]);
    if(mode==='invalid-limit')await query('UPDATE subscription_plans SET message_limit=-2 WHERE id=?',[planId]);
    expect((await dispatch(r)).transport).toBe('suppressed');expect(wa.post).not.toHaveBeenCalled();expect((await projectionRow()).usage_state).toBe('pending');
  });
  it.each(['trial','unlimited'])('reply usage: permits %s while still recording exact usage', async mode => {
    const {r}=await usageFixture(-1);if(mode==='trial')await query("UPDATE merchant_subscriptions SET status='trial',plan_id=NULL WHERE merchant_id=?",[owner.merchantId]);
    await dispatch(r);expect(wa.post).toHaveBeenCalledOnce();expect((await usageSubscription()).messages_used).toBe(2);
  });
  it.each(['before','after'] as const)('reply usage: lost final dispatch acknowledgement %s commit never starts provider IO', async when => {
    const {r}=await usageFixture();await failCommit('dispatch',when);await dispatch(r);vi.restoreAllMocks();
    expect(wa.post).not.toHaveBeenCalled();expect((await usageSubscription()).messages_used).toBe(0);
    expect((await projectionRow()).usage_state).toBe(when==='before'?'pending':'released');
  });
  it.each(['before','after'] as const)('reply usage: settlement acknowledgement lost %s commit cannot double-charge', async when => {
    const {r}=await usageFixture();await failCommit('projection',when);await expect(dispatch(r)).rejects.toThrow();vi.restoreAllMocks();
    expect((await usageSubscription()).messages_used).toBe(when==='before'?0:2);expect((await projectionRow()).usage_state).toBe(when==='before'?'held':'charged');
    await dispatch(r);expect((await usageSubscription()).messages_used).toBe(2);expect(wa.post).toHaveBeenCalledOnce();
  });
  it('reply usage: unresolved transport holds capacity without billing or a second send', async () => {
    const {r}=await usageFixture();wa.post.mockRejectedValue(Error('Synthetic connection lost'));await dispatch(r);await dispatch(r);
    expect(await projectionRow()).toMatchObject({usage_state:'held',usage_units:2});expect((await usageSubscription()).messages_used).toBe(0);expect(wa.post).toHaveBeenCalledOnce();
  });
  it('reply usage: a definitive provider rejection releases capacity without charging', async () => {
    const {r}=await usageFixture();wa.post.mockResolvedValue({status:400,data:{error:'synthetic rejection'}});await dispatch(r);
    expect((await projectionRow()).usage_state).toBe('released');expect((await usageSubscription()).messages_used).toBe(0);await dispatch(r);expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['reset','deleted','replacement','cancelled'])('reply usage: late recovery respects the original %s subscription period', async mode => {
    const {r,subscription}=await usageFixture();await sendMerchantWhatsApp(deliveryInput(r));
    if(mode==='reset')await query("UPDATE merchant_subscriptions SET messages_used=7,last_reset_at='2030-01-01' WHERE id=?",[subscription.id]);
    if(mode==='deleted')await query('DELETE FROM merchant_subscriptions WHERE id=?',[subscription.id]);
    if(mode==='cancelled')await query("UPDATE merchant_subscriptions SET status='cancelled' WHERE id=?",[subscription.id]);
    let replacement=0;
    if(mode==='replacement'){await query("UPDATE merchant_subscriptions SET status='cancelled' WHERE id=?",[subscription.id]);
      replacement=Number((await query("INSERT INTO merchant_subscriptions (merchant_id,status,billing_cycle,start_date,end_date) VALUES (?,'active','monthly',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY))",[owner.merchantId])).insertId);
      await query('UPDATE merchants SET current_subscription_id=? WHERE id=?',[replacement,owner.merchantId]);}
    await reconcileSalesReplyConversation(owner.merchantId,deliveryIdentity(r));await reconcileSalesReplyConversation(owner.merchantId,deliveryIdentity(r));
    expect((await projectionRow()).usage_state).toBe(['reset','deleted'].includes(mode)?'historical':'charged');
    if(mode!=='deleted')expect((await usageSubscription()).messages_used).toBe(mode==='reset'?7:2);
    if(replacement)expect((await query('SELECT messages_used FROM merchant_subscriptions WHERE id=?',[replacement]))[0].messages_used).toBe(0);
    expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['usage_digest','usage_subscription_id','usage_period_start','usage_reserved_at'])('reply usage: corrupted %s cannot alter counters or history', async column => {
    const {r}=await usageFixture();await sendMerchantWhatsApp(deliveryInput(r));
    const value=column==='usage_digest'?'f'.repeat(64):column==='usage_subscription_id'?999999:'2030-01-01';
    await query(`UPDATE ai_sales_reply_deliveries SET ${column}=? WHERE merchant_id=?`,[value,owner.merchantId]);
    await expect(reconcileSalesReplyConversation(owner.merchantId,deliveryIdentity(r))).rejects.toThrow();
    expect((await usageSubscription()).messages_used).toBe(0);expect(await query("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",[conversationId])).toHaveLength(0);
  });
  it('reply usage: existing legacy transport history never invents a subscription charge', async () => {
    const {r}=await usageFixture();await sendMerchantWhatsApp(deliveryInput(r));
    await query("UPDATE ai_sales_reply_deliveries SET usage_state='legacy',usage_subscription_id=NULL,usage_period_start=NULL,usage_units=0,usage_reserved_at=NULL,usage_digest=NULL WHERE merchant_id=?",[owner.merchantId]);
    await dispatch(r);expect((await usageSubscription()).messages_used).toBe(0);expect((await projectionRow()).usage_state).toBe('legacy');
  });
  it('reply usage: a dispatching record missing its reservation cannot bypass settlement', async () => {
    const {r}=await usageFixture();await sendMerchantWhatsApp(deliveryInput(r));
    await query("UPDATE ai_sales_reply_deliveries SET usage_state='pending',usage_subscription_id=NULL,usage_period_start=NULL,usage_units=0,usage_reserved_at=NULL,usage_digest=NULL WHERE merchant_id=?",[owner.merchantId]);
    await expect(dispatch(r)).rejects.toThrow();expect((await usageSubscription()).messages_used).toBe(0);
    expect(await query("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",[conversationId])).toHaveLength(0);expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['authorization','subscription'])('reply usage: final %s expiry after quota reads rolls back the consumed authorization', async mode => {
    const {r}=await usageFixture();
    if(mode==='subscription')await query('UPDATE merchant_subscriptions SET end_date=? WHERE merchant_id=?',[new Date((config.unix!+1)*1000).toISOString().slice(0,19).replace('T',' '),owner.merchantId]);
    const pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){
      if(key==='execute')return async(...args:any[])=>{if(String(args[0]).includes("SET usage_state='held'"))await target.query('SET timestamp=?',[config.unix!+(mode==='authorization'?120:2)]);
        return (target.execute as any)(...args);};const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;}}) as any;});
    await dispatch(r);vi.restoreAllMocks();expect(wa.post).not.toHaveBeenCalled();expect(await projectionRow()).toMatchObject({state:'authorized',usage_state:'pending'});
  });
  it.each(['before-projection','after-projection'])('reply usage: delivery failure %s does not erase a proven accepted send', async mode => {
    const {r,f}=await usageFixture();await sendMerchantWhatsApp(deliveryInput(r));
    if(mode==='after-projection')await reconcileSalesReplyConversation(owner.merchantId,deliveryIdentity(r));
    await updateWhatsAppDeliveryStatus({provider:'green_api',providerAccount:f.account,providerMessageId:'fixture-receipt',status:'failed'});
    await reconcileSalesReplyConversation(owner.merchantId,deliveryIdentity(r));await reconcileSalesReplyConversation(owner.merchantId,deliveryIdentity(r));
    expect((await usageSubscription()).messages_used).toBe(2);expect((await projectionRow()).usage_state).toBe('charged');expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['failed','rejected'])('reply usage: a worker lease expiring during %s settlement rolls back usage changes', async mode => {
    const {r,f}=await usageFixture();if(mode==='rejected')wa.post.mockResolvedValue({status:400,data:{}});
    await sendMerchantWhatsApp(deliveryInput(r));config.unix=null;
    if(mode==='failed')await updateWhatsAppDeliveryStatus({provider:'green_api',providerAccount:f.account,providerMessageId:'fixture-receipt',status:'failed'});
    await dueProjection();const [claim]=await claimSalesReplyProjections();
    const pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){
      if(key==='execute')return async(...args:any[])=>{if(String(args[0]).includes('SET usage_state=?,usage_settled_at=')){
        await target.execute('UPDATE ai_sales_reply_deliveries SET projection_lease_until=TIMESTAMPADD(MICROSECOND,1000,UTC_TIMESTAMP(3)) WHERE id=?',[claim.deliveryId]);await target.query('SELECT SLEEP(0.02)');
      }return (target.execute as any)(...args);};const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;}}) as any;});
    expect(await recoverSalesReplyProjection(claim)).toBe('deferred');vi.restoreAllMocks();
    expect((await projectionRow()).usage_state).toBe('held');expect((await usageSubscription()).messages_used).toBe(0);expect(wa.post).toHaveBeenCalledOnce();
    await dueProjection();await runSalesReplyRecoveryBatch();expect((await projectionRow()).usage_state).toBe(mode==='failed'?'charged':'released');
    expect((await usageSubscription()).messages_used).toBe(mode==='failed'?2:0);expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each([2,4])('reply usage: SQL reservations for distinct replies share capacity %s under contention', async limit => {
    const {r}=await usageFixture(limit), first=await projectionRow();
    // This fixture isolates quota storage from generation quality. It grants no channel authority.
    const [source]=await query('SELECT t.* FROM ai_sales_experiment_turns t JOIN ai_sales_experiment_generations g ON g.turn_id=t.id WHERE g.id=?',[r.authorization.basis.generationId]);
    const turn=await query("INSERT INTO ai_sales_experiment_turns (merchant_id,protocol_id,assignment_id,conversation_reference,message_reference,request_id,payload_digest,turn_digest,snapshot) VALUES (?,?,?,?,?,?,?,?,'{}')",
      [owner.merchantId,source.protocol_id,source.assignment_id,conversationId,incomingMessageId+1000000,randomUUID(),'a'.repeat(64),'b'.repeat(64)]);
    const generation=await query("INSERT INTO ai_sales_experiment_generations (merchant_id,turn_id,actor_user_id,request_id,payload_digest,authorization_digest,snapshot,state,claim_token) VALUES (?,?,?,?,?,?,'{}','uncertain',?)",
      [owner.merchantId,turn.insertId,owner.userId,randomUUID(),'a'.repeat(64),'b'.repeat(64),randomUUID()]);
    const second=await query("INSERT INTO ai_sales_reply_deliveries (merchant_id,generation_id,message_reference,actor_user_id,request_id,payload_digest,basis_digest,authorization_digest,snapshot,state,usage_state) VALUES (?,?,?,?,?,?,?,?,'{}','authorized','pending')",
      [owner.merchantId,generation.insertId,incomingMessageId+1000000,owner.userId,randomUUID(),'a'.repeat(64),'b'.repeat(64),'c'.repeat(64)]);
    const reserve=(deliveryId:number)=>checkoutTransaction(async c=>{await c.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[owner.merchantId]);
      await c.execute("UPDATE ai_sales_reply_deliveries SET state='dispatching',dispatch_started_at=UTC_TIMESTAMP(3) WHERE id=?",[deliveryId]);
      const [rows]=await c.execute<any[]>('SELECT * FROM ai_sales_reply_deliveries WHERE id=? FOR UPDATE',[deliveryId]);
      await reserveSalesReplyUsage(c,rows[0],r.authorization.expiresAt);});
    const results=await Promise.allSettled([reserve(first.id),reserve(Number(second.insertId))]);
    expect(results.filter(v=>v.status==='fulfilled')).toHaveLength(limit/2);
    expect((await query("SELECT SUM(usage_units) AS held FROM ai_sales_reply_deliveries WHERE merchant_id=? AND usage_state='held'",[owner.merchantId]))[0].held).toBe(String(limit));
    expect((await usageSubscription()).messages_used).toBe(0);expect(wa.post).not.toHaveBeenCalled();
  });
  const dueProjection = () => query('UPDATE ai_sales_reply_deliveries SET projection_next_at=UTC_TIMESTAMP(3),projection_lease_until=NULL,projection_token=NULL WHERE merchant_id=? AND projection_state=\'pending\'', [owner.merchantId]);
  async function recoveryFixture(provider: 'green_api'|'meta_cloud' = 'green_api', accepted = true) {
    const f = await deliveryFixture(provider), r = await f.auth();
    if (!accepted) wa.post.mockRejectedValue(Error('Synthetic transport uncertainty'));
    await sendMerchantWhatsApp(deliveryInput(r)); config.unix = null; await dueProjection();
    return {f,r};
  }
  it.each(['green_api','meta_cloud'] as const)('projection worker: repairs accepted %s transport once without another provider request', async provider => {
    const {r} = await recoveryFixture(provider), budget = await ledger();
    expect(await runSalesReplyRecoveryBatch()).toEqual({claimed:1,projected:1,review:0,deferred:0,skipped:0});
    expect(await projectionRow()).toMatchObject({projection_state:'projected',projection_attempts:1,projection_token:null,projection_next_at:null});
    expect((await runSalesReplyRecoveryBatch()).claimed).toBe(0); expect((await dispatch(r)).outgoingMessageId).toEqual(expect.any(Number));
    expect(wa.post).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled(); expect(await ledger()).toEqual(budget); expect(await runInteractionJob()).toBe(false);
  });
  it('projection worker: never consumes or sends an unattempted authorization', async () => {
    const f=await deliveryFixture();await f.auth();config.unix=null;await dueProjection();
    expect((await runSalesReplyRecoveryBatch()).claimed).toBe(0);expect(wa.post).not.toHaveBeenCalled();expect((await projectionRow()).state).toBe('authorized');
  });
  it('projection worker: recovers from durable SQL in a fresh process with no test transport mocks', async () => {
    await recoveryFixture();
    const code="import {assertDisposableDatabase} from './server/tests/helpers/disposable-merchant.ts';assertDisposableDatabase();const {runSalesReplyRecoveryBatch}=await import('./server/ai/sales-reply-recovery.ts');const {closeDb}=await import('./server/db/connection.ts');try{console.log('RECOVERED:'+JSON.stringify(await runSalesReplyRecoveryBatch()));}finally{await closeDb();}";
    const output=execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{encoding:'utf8',windowsHide:true,timeout:30000,env:process.env});
    const match=output.match(/RECOVERED:(\{[^\n]+\})/);expect(match).not.toBeNull();expect(JSON.parse(match![1])).toMatchObject({projected:1,claimed:1});
    expect((await projectionRow()).projection_state).toBe('projected');expect(wa.post).toHaveBeenCalledOnce();
  });
  it('projection worker: serializes claims and fences the expired holder after a replacement', async () => {
    await recoveryFixture();const batches=await Promise.all([claimSalesReplyProjections(),claimSalesReplyProjections(),claimSalesReplyProjections()]);
    expect(batches.flat()).toHaveLength(1);const old=batches.flat()[0];await dueProjection();const [current]=await claimSalesReplyProjections();
    expect(current.token).not.toBe(old.token);expect(await recoverSalesReplyProjection(old)).toBe('skipped');
    expect(await recoverSalesReplyProjection(current)).toBe('projected');expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['before','after'] as const)('projection worker: recovers lost projection acknowledgement %s commit', async when => {
    await recoveryFixture();await failCommit('projection',when);const result=await runSalesReplyRecoveryBatch();vi.restoreAllMocks();
    expect(result[when==='before'?'deferred':'skipped']).toBe(1);
    if(when==='before'){await dueProjection();expect((await runSalesReplyRecoveryBatch()).projected).toBe(1);}
    expect((await projectionRow()).projection_state).toBe('projected');expect(wa.post).toHaveBeenCalledOnce();
    expect(await query("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",[conversationId])).toHaveLength(1);
  });
  it.each(['before','after'] as const)('projection worker: recovers claim acknowledgement lost %s commit without writing history prematurely', async when => {
    await recoveryFixture();await failCommit('projection-claim',when);await expect(claimSalesReplyProjections()).rejects.toThrow();vi.restoreAllMocks();
    expect(await query("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",[conversationId])).toHaveLength(0);
    if(when==='after')expect(await claimSalesReplyProjections()).toEqual([]);
    await dueProjection();expect((await runSalesReplyRecoveryBatch()).projected).toBe(1);expect(wa.post).toHaveBeenCalledOnce();
  });
  it('projection worker: backs off uncertainty and parks the eighth attempt for review without resending', async () => {
    await recoveryFixture('green_api',false);expect((await runSalesReplyRecoveryBatch()).deferred).toBe(1);
    expect(await claimSalesReplyProjections()).toEqual([]);
    expect(await projectionRow()).toMatchObject({projection_state:'pending',projection_attempts:1,projection_last_error:'transport_unknown'});
    await query('UPDATE ai_sales_reply_deliveries SET projection_attempts=7 WHERE merchant_id=?',[owner.merchantId]);await dueProjection();
    expect((await runSalesReplyRecoveryBatch()).review).toBe(1);expect(await projectionRow()).toMatchObject({projection_state:'review',projection_next_at:null,projection_token:null});
    expect(await claimSalesReplyProjections()).toEqual([]);expect(wa.post).toHaveBeenCalledOnce();
  });
  it('projection worker: retires an expired eighth lease instead of claiming a ninth attempt', async () => {
    await recoveryFixture();await query('UPDATE ai_sales_reply_deliveries SET projection_attempts=8 WHERE merchant_id=?',[owner.merchantId]);
    expect(await claimSalesReplyProjections()).toEqual([]);expect(await projectionRow()).toMatchObject({projection_state:'review',projection_last_error:'attempts_exhausted'});
  });
  it.each(['invalid','f'.repeat(64)])('projection worker: parks corrupt authorization digest %s without poisoning future batches', async digest => {
    await recoveryFixture();await query('UPDATE ai_sales_reply_deliveries SET authorization_digest=? WHERE merchant_id=?',[digest,owner.merchantId]);
    expect((await runSalesReplyRecoveryBatch()).projected).toBe(0);expect(await projectionRow()).toMatchObject({projection_state:'review',projection_last_error:'evidence_unavailable'});
    expect(await claimSalesReplyProjections()).toEqual([]);expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['request-corrupt','retained-body-purged','failed','source-deleted'] as const)('projection worker: does not manufacture history from %s', async mode => {
    const {f}=await recoveryFixture();
    if(mode==='request-corrupt')await query("UPDATE whatsapp_message_deliveries SET request_json=JSON_OBJECT('text','Forged') WHERE merchant_id=?",[owner.merchantId]);
    if(mode==='retained-body-purged'){await query('UPDATE whatsapp_message_deliveries SET status_updated_at=TIMESTAMPADD(DAY,-31,UTC_TIMESTAMP()) WHERE merchant_id=?',[owner.merchantId]);await purgeCompletedInboundPayloads();}
    if(mode==='failed')await updateWhatsAppDeliveryStatus({provider:'green_api',providerAccount:f.account,providerMessageId:'fixture-receipt',status:'failed'});
    if(mode==='source-deleted')await query('DELETE FROM messages WHERE id=?',[incomingMessageId]);
    const result=await runSalesReplyRecoveryBatch();expect(result.projected).toBe(0);expect(result.review+result.deferred).toBe(1);
    expect(await query("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",[conversationId])).toHaveLength(0);expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['merchant','digest','token'] as const)('projection worker: refuses forged claim %s without disturbing its real owner', async mode => {
    await recoveryFixture();const [claim]=await claimSalesReplyProjections(),forged={...claim};
    if(mode==='merchant')forged.merchantId=other.merchantId;if(mode==='digest')forged.authorizationDigest='f'.repeat(64);if(mode==='token')forged.token=randomUUID();
    expect(await recoverSalesReplyProjection(forged)).toBe('skipped');expect((await projectionRow()).projection_token).toBe(claim.token);
    expect(await recoverSalesReplyProjection(claim)).toBe('projected');expect(wa.post).toHaveBeenCalledOnce();
  });
  it('projection worker: final SQL lease guard rolls back history if expiry occurs after the source read', async () => {
    await recoveryFixture();const [claim]=await claimSalesReplyProjections();
    const pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await original();return new Proxy(c,{get(target,key){
      if(key==='execute')return async(...args:any[])=>{if(String(args[0]).includes("SET projection_state='projected'")){
        await target.execute('UPDATE ai_sales_reply_deliveries SET projection_lease_until=TIMESTAMPADD(MICROSECOND,1000,UTC_TIMESTAMP(3)) WHERE id=?',[claim.deliveryId]);
        await target.query('SELECT SLEEP(0.02)');
      }return (target.execute as any)(...args);};const v=(target as any)[key];return typeof v==='function'?v.bind(target):v;}}) as any;});
    expect(await recoverSalesReplyProjection(claim)).toBe('review');vi.restoreAllMocks();
    expect(await query("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",[conversationId])).toHaveLength(0);
    expect((await query('SELECT isProcessed FROM messages WHERE id=?',[incomingMessageId]))[0].isProcessed).toBe(0);expect(wa.post).toHaveBeenCalledOnce();
  });
  it('projection health: uses current administrator authority and returns aggregate counts only', async () => {
    await recoveryFixture();await expect(salesReplyRecoveryHealth(owner.userId)).rejects.toThrow();
    await query("UPDATE users SET role='admin' WHERE id=?",[owner.userId]);
    const health=await salesReplyRecoveryHealth(owner.userId);expect(health).toEqual([{status:'pending',count:1,due:1,oldestSeconds:0}]);
    expect(JSON.stringify(health)).not.toContain(config.text);expect(JSON.stringify(health)).not.toContain('966500000988');
    await query("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);await expect(salesReplyRecoveryHealth(owner.userId)).rejects.toThrow();
  });
  it.each(['ordinary-first', 'reviewed-first', 'concurrent'] as const)('shared reservation: elects one owner for %s', async mode => {
    const f = await deliveryFixture(), p = ordinaryPlan(f);
    if (mode === 'ordinary-first') { await stageInteraction(p); await expect(f.auth()).rejects.toThrow(); }
    if (mode === 'reviewed-first') { await f.auth(); expect(await dispatchReplyPlan(p)).toBe('reply_reserved'); }
    if (mode === 'concurrent') {
      const results = await Promise.allSettled([stageInteraction(p), f.auth()]);
      expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    }
    const [job] = await query('SELECT * FROM ai_interaction_jobs WHERE merchant_id=?', [owner.merchantId]);
    if (job.reply_origin === 'ordinary') expect(await dispatchReplyPlan(p)).toBe('sent');
    else {
      const r = await f.auth(); await finishInteractionDelivery(p, true);
      expect(await dispatch(r)).toMatchObject({ transport: 'accepted', outgoingMessageId: expect.any(Number) });
    }
    expect(wa.post).toHaveBeenCalledOnce();
    expect(await query('SELECT id FROM ai_interaction_jobs WHERE merchant_id=?', [owner.merchantId])).toHaveLength(1);
  });
  it.each(['before','after'] as const)('reviewed projection: repairs lost acknowledgement %s commit without resending', async when => {
    const f = await deliveryFixture(), r = await f.auth(); await failCommit('projection', when);
    await expect(dispatch(r)).rejects.toThrow(); vi.restoreAllMocks(); expect(wa.post).toHaveBeenCalledOnce();
    const repaired = await reconcileSalesReplyConversation(owner.merchantId, deliveryIdentity(r));
    expect(repaired).toMatchObject({ transport: 'accepted', outgoingMessageId: expect.any(Number), exposureRecorded: true });
    expect(await dispatch(r)).toEqual(repaired); expect(wa.post).toHaveBeenCalledOnce();
    const messages = await query("SELECT * FROM messages WHERE conversationId=? AND direction='outgoing'", [conversationId]);
    expect(messages).toHaveLength(1); expect(messages[0]).toMatchObject({ content: config.text, aiResponse: config.text, sender_type: 'assistant', isProcessed: 1 });
    expect((await query('SELECT isProcessed FROM messages WHERE id=?', [incomingMessageId]))[0].isProcessed).toBe(1);
    expect(await runInteractionJob()).toBe(false);
  });
  it('reviewed projection: repairs after newer conversation activity without moving its timestamp or rechecking expired authority', async () => {
    const f = await deliveryFixture(), r = await f.auth();
    await sendMerchantWhatsApp(deliveryInput(r));
    const future = new Date((config.unix! + 900) * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await query("INSERT INTO messages (conversationId,direction,messageType,content,createdAt) VALUES (?,'incoming','text','سؤال جديد',?)", [conversationId, future]);
    await query('UPDATE conversations SET lastMessageAt=?,human_takeover=1 WHERE id=?', [future, conversationId]);
    config.unix! += 600; await revoke();
    const before = await query('SELECT lastMessageAt FROM conversations WHERE id=?', [conversationId]);
    const result = await dispatch(r); expect(result.outgoingMessageId).toEqual(expect.any(Number));
    expect(await query('SELECT lastMessageAt FROM conversations WHERE id=?', [conversationId])).toEqual(before);
    expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['unknown','rejected','failed'] as const)('reviewed projection: does not invent conversation output from %s transport', async mode => {
    const f = await deliveryFixture(), r = await f.auth();
    if (mode === 'unknown') wa.post.mockRejectedValue(Error('Synthetic loss'));
    if (mode === 'rejected') wa.post.mockResolvedValue({ status: 400, data: { error: 'Synthetic rejection' } });
    await sendMerchantWhatsApp(deliveryInput(r));
    if (mode === 'failed') await updateWhatsAppDeliveryStatus({ provider: 'green_api', providerAccount: f.account, providerMessageId: 'fixture-receipt', status: 'failed' });
    expect((await reconcileSalesReplyConversation(owner.merchantId, deliveryIdentity(r))).outgoingMessageId).toBeNull();
    expect(await query("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'", [conversationId])).toHaveLength(0);
    expect((await query('SELECT isProcessed FROM messages WHERE id=?', [incomingMessageId]))[0].isProcessed).toBe(0);
    expect(await runInteractionJob()).toBe(false); expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['text','role','reference','deleted','job-digest','job-text','job-owner'] as const)('reviewed projection: rejects tampered %s and never recreates history blindly', async mode => {
    const f = await deliveryFixture(), r = await f.auth(), sent = await dispatch(r);
    if (mode === 'text') await query("UPDATE messages SET content='Changed' WHERE id=?", [sent.outgoingMessageId]);
    if (mode === 'role') await query("UPDATE messages SET sender_type='merchant' WHERE id=?", [sent.outgoingMessageId]);
    if (mode === 'reference') await query('UPDATE ai_interaction_jobs SET outgoing_message_reference=? WHERE merchant_id=?', [incomingMessageId, owner.merchantId]);
    if (mode === 'deleted') await query('DELETE FROM messages WHERE id=?', [sent.outgoingMessageId]);
    if (mode === 'job-digest') await query("UPDATE ai_interaction_jobs SET reply_digest=REPEAT('f',64) WHERE merchant_id=?", [owner.merchantId]);
    if (mode === 'job-text') await query("UPDATE ai_interaction_jobs SET reply_text='Changed' WHERE merchant_id=?", [owner.merchantId]);
    if (mode === 'job-owner') await query('UPDATE ai_interaction_jobs SET sales_delivery_id=sales_delivery_id+1 WHERE merchant_id=?', [owner.merchantId]);
    await expect(dispatch(r)).rejects.toThrow(); expect(wa.post).toHaveBeenCalledOnce();
  });
  it('reviewed projection: refuses an unrelated row that occupies the deterministic history key', async () => {
    const f = await deliveryFixture(), r = await f.auth(); await sendMerchantWhatsApp(deliveryInput(r));
    await query("INSERT INTO messages (conversationId,direction,messageType,content,externalId) VALUES (?,'outgoing','text','Forged',?)", [conversationId, `sales-reply:${owner.merchantId}:${r.deliveryId}`]);
    await expect(dispatch(r)).rejects.toThrow(); expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['missing', 'rejected', 'legacy', 'corrupt', 'long'])('reviewed delivery: refuses %s output review before authorization', async mode => {
    if (mode === 'long') config.text = 'أ'.repeat(4097);
    const f = await publicFixture();
    if (mode === 'legacy') { const review = await prepareSalesGenerationOutputReview(owner.merchantId, { generationId: f.r.generationId, baseSystemPrompt: input.baseSystemPrompt, contextMessages: input.contextMessages });
      await recordSalesGenerationOutputReview(owner.merchantId, owner.userId, { ...f.value, basisDigest: review.basisDigest, baseSystemPrompt: input.baseSystemPrompt, contextMessages: input.contextMessages } as any); }
    else if (mode !== 'missing') await publicSubmit({ ...f.value, quote: f.value.quote.slice(0, 1000), checks: { ...f.value.checks, groundedInBusiness: mode !== 'rejected' } });
    if (mode === 'corrupt') await query("UPDATE ai_sales_generation_output_reviews SET review_digest=REPEAT('f',64) WHERE generation_id=?", [f.r.generationId]);
    const instanceRecordId = Number((await query("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,provider) VALUES (?,'fixture','secret','active','green_api')", [owner.merchantId])).insertId);
    await expect(prepareSalesReplyDelivery(owner.merchantId, owner.userId, { generationId: f.r.generationId, instanceRecordId })).rejects.toThrow();
    expect(await query('SELECT id FROM ai_sales_reply_deliveries WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
  const deliveryDrifts = ['source', 'route', 'disabled', 'revoked', 'human', 'processed', 'owner', 'owner-disabled', 'merchant-disabled', 'window', 'new-inbound', 'outgoing', 'phone', 'account-token', 'account-provider', 'account-disabled', 'review-new', 'review-rejected', 'interaction', 'expired'] as const;
  async function driftDelivery(mode: typeof deliveryDrifts[number], f: Awaited<ReturnType<typeof deliveryFixture>>) {
    if (mode === 'source') await query("UPDATE messages SET content='New source' WHERE id=?", [incomingMessageId]);
    if (mode === 'route') config.model += '-changed'; if (mode === 'disabled') config.enabled = false; if (mode === 'revoked') await revoke();
    if (mode === 'human') await query('UPDATE conversations SET human_takeover=1 WHERE id=?', [conversationId]);
    if (mode === 'processed') await query('UPDATE messages SET isProcessed=1 WHERE id=?', [incomingMessageId]);
    if (mode === 'owner') await query('UPDATE merchants SET userId=? WHERE id=?', [other.userId, owner.merchantId]);
    if (mode === 'owner-disabled') await query("UPDATE users SET account_status='deletion_pending' WHERE id=?", [owner.userId]);
    if (mode === 'merchant-disabled') await query("UPDATE merchants SET status='suspended' WHERE id=?", [owner.merchantId]);
    if (mode === 'window') config.unix! += 365 * 86400; if (mode === 'expired') config.unix! += 120;
    if (mode === 'new-inbound' || mode === 'outgoing') await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,?,'text','New turn')", [conversationId, mode === 'new-inbound' ? 'incoming' : 'outgoing']);
    if (mode === 'phone') await query("UPDATE conversations SET customerPhone='966500000999' WHERE id=?", [conversationId]);
    if (mode === 'account-token') await query("UPDATE whatsapp_instances SET token='rotated-token' WHERE id=?", [f.instanceRecordId]);
    if (mode === 'account-provider') await query("UPDATE whatsapp_instances SET provider='meta_cloud' WHERE id=?", [f.instanceRecordId]);
    if (mode === 'account-disabled') await query("UPDATE whatsapp_instances SET status='inactive',is_primary=0 WHERE id=?", [f.instanceRecordId]);
    if (mode === 'review-new' || mode === 'review-rejected') await publicSubmit({ ...f.reviewValue, requestId: randomUUID(), expectedRevision: 1,
      checks: { ...f.reviewValue.checks, groundedInBusiness: mode !== 'review-rejected' } });
    if (mode === 'interaction') await query("UPDATE ai_interaction_jobs SET reply_digest=REPEAT('f',64) WHERE merchant_id=?", [owner.merchantId]);
  }
  it.each(deliveryDrifts)('reviewed delivery: rechecks %s before provider I/O', async mode => {
    const f = await deliveryFixture(), r = await f.auth(); await driftDelivery(mode, f);
    if (mode === 'account-provider') await expect(dispatch(r)).rejects.toThrow();
    else { const result = await dispatch(r); expect(['not_attempted', 'suppressed']).toContain(result.transport); }
    expect(wa.post).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    if (mode === 'owner') await query('UPDATE merchants SET userId=? WHERE id=?', [owner.userId, owner.merchantId]);
  });
  it.each(['before', 'after'] as const)('reviewed delivery: recovers authorization acknowledgement lost %s commit without sending', async when => {
    const f = await deliveryFixture(); await failCommit('delivery', when); await expect(f.auth()).rejects.toThrow(); vi.restoreAllMocks();
    const r = await f.auth(); expect(await f.auth()).toEqual(r); expect(wa.post).not.toHaveBeenCalled();
    expect(await query('SELECT id FROM ai_sales_reply_deliveries WHERE merchant_id=?', [owner.merchantId])).toHaveLength(1);
  });
  it.each(['before', 'after'] as const)('reviewed delivery: never sends after dispatch acknowledgement lost %s commit', async when => {
    const f = await deliveryFixture(), r = await f.auth(); await failCommit('dispatch', when); const result = await dispatch(r); vi.restoreAllMocks();
    expect(result.transport).toBe('suppressed'); expect(wa.post).not.toHaveBeenCalled();
    expect((await dispatch(r)).transport).toBe('suppressed'); expect(wa.post).not.toHaveBeenCalled();
  });
  it.each(['unknown', 'rejected', 'missing-receipt', 'persistence'])('reviewed delivery: preserves %s transport without a second provider call', async mode => {
    const f = await deliveryFixture(), r = await f.auth();
    if (mode === 'unknown') wa.post.mockRejectedValue(Error('Synthetic ambiguous network failure'));
    if (mode === 'rejected') wa.post.mockResolvedValue({ status: 400, data: {} });
    if (mode === 'missing-receipt') wa.post.mockResolvedValue({ status: 200, data: {} });
    if (mode === 'persistence') { const pool = (await getPool())!, execute = pool.execute.bind(pool);
      vi.spyOn(pool, 'execute').mockImplementation((...args: any[]) => { if (String(args[0]).includes('SET provider_message_id = ?')) return Promise.reject(Error('Synthetic save failure')); return (execute as any)(...args); }); }
    expect((await dispatch(r)).transport).toBe(mode === 'rejected' ? 'rejected' : 'unknown');
    await dispatch(r); await sendMerchantWhatsApp({ ...deliveryInput(r), retryFailed: true }); expect(wa.post).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['recipient', 'text', 'guard', 'instance', 'media', 'message', 'provider'])('reviewed delivery: rejects forged %s transport payload or receipt', async field => {
    const f = await deliveryFixture(), r = await f.auth(), input = deliveryInput(r);
    const cfg: WhatsAppProviderConfig = { provider: 'green_api', instanceId: f.account, token: f.token, apiUrl: 'https://api.green-api.com', phoneNumberId: '1234567890', providerAccountId: 'test-account' };
    const changed = field === 'recipient' ? { to: '966500000999' } : field === 'text' ? { text: 'Unreviewed' } : field === 'guard' ? { salesReplyGuard: { ...deliveryIdentity(r), authorizationDigest: 'f'.repeat(64) } }
      : field === 'instance' ? { instanceRecordId: f.instanceRecordId + 1 } : field === 'media' ? { mediaUrl: 'https://example.test/image.png' } : field === 'message' ? { messageId: incomingMessageId } : {};
    expect(await canDispatchSalesReply({ ...input, ...changed }, field === 'provider' ? { ...cfg, token: 'changed' } : cfg)).toBe(false);
    expect(wa.post).not.toHaveBeenCalled(); expect((await deliveryRead(r)).state).toBe('authorized');
    await dispatch(r); const [out] = await query('SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=?', [owner.merchantId]);
    const request = typeof out.request_json === 'string' ? JSON.parse(out.request_json) : out.request_json;
    if (field === 'provider') await query("UPDATE whatsapp_message_deliveries SET provider='meta_cloud' WHERE id=?", [out.id]);
    else { const bad = field === 'recipient' ? { to: '966500000999' } : field === 'text' ? { text: 'Replaced text' } : field === 'guard' ? { salesReplyGuard: { ...deliveryIdentity(r), deliveryId: r.deliveryId + 1 } } : { extra: 'unbound' };
      await query('UPDATE whatsapp_message_deliveries SET request_json=? WHERE id=?', [JSON.stringify({ ...request, ...bad }), out.id]); }
    await expect(deliveryRead(r)).rejects.toThrow(); await expect(dispatch(r)).rejects.toThrow(); expect(wa.post).toHaveBeenCalledOnce();
  });
  it('reviewed delivery: rechecks expiry after the final outbox read', async () => {
    const f = await deliveryFixture(), r = await f.auth(), pool = (await getPool())!, original = pool.getConnection.bind(pool);
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
      const c = await original(); let current = false;
      return new Proxy(c, { get(target, key) {
        if (key === 'execute') return async (...args: any[]) => {
          if (String(args[0]).startsWith('SELECT * FROM whatsapp_instances')) current = true;
          const result = await (target.execute as any)(...args);
          if (current && String(args[0]).startsWith('SELECT * FROM whatsapp_message_deliveries')) await target.query('SET timestamp=?', [config.unix! + 120]);
          return result;
        }; const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value;
      } }) as any;
    });
    expect((await dispatch(r)).transport).toBe('suppressed'); expect(wa.post).not.toHaveBeenCalled();
  });
  it('reviewed delivery: a deleted outbox never renews a consumed authorization', async () => {
    const f = await deliveryFixture(), r = await f.auth(); await dispatch(r);
    await query('DELETE FROM whatsapp_message_deliveries WHERE merchant_id=?', [owner.merchantId]);
    expect((await dispatch(r)).transport).toBe('unknown'); expect(wa.post).toHaveBeenCalledOnce();
    expect(await sendMerchantWhatsApp(deliveryInput(r))).toMatchObject({ accepted: false, errorCode: 'sales_reply_suppressed' });
    expect(wa.post).toHaveBeenCalledOnce();
  });
  it('reviewed delivery: account deletion preserves historical acceptance without permitting another send', async () => {
    const f = await deliveryFixture(), r = await f.auth(); await dispatch(r);
    await query('DELETE FROM whatsapp_instances WHERE id=?', [f.instanceRecordId]);
    expect((await deliveryRead(r)).transport).toBe('accepted'); await dispatch(r); expect(wa.post).toHaveBeenCalledOnce();
  });
  it('reviewed delivery: rejects preparation after the conservative inbound freshness window', async () => {
    const f = await deliveryFixture(); config.unix! += 86400;
    await expect(f.prepare()).rejects.toThrow(); await expect(f.auth()).rejects.toThrow(); expect(wa.post).not.toHaveBeenCalled();
  });
  it('reviewed delivery: a provider failure callback is a delivery failure, not an unsent or retryable reply', async () => {
    const f = await deliveryFixture(), r = await f.auth(); await dispatch(r);
    await updateWhatsAppDeliveryStatus({ provider: 'green_api', providerAccount: f.account, providerMessageId: 'fixture-receipt', status: 'failed', errorCode: 'recipient_unreachable' });
    expect((await dispatch(r)).transport).toBe('failed'); expect(wa.post).toHaveBeenCalledOnce();
  });
  it.each(['expiry', 'clock-rollback'])('reviewed delivery: atomically refuses %s between final clock read and authorization consumption', async mode => {
    const f = await deliveryFixture(), r = await f.auth(), pool = (await getPool())!, original = pool.getConnection.bind(pool);
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
      const c = await original();
      return new Proxy(c, { get(target, key) {
        if (key === 'execute') return async (...args: any[]) => {
          if (String(args[0]).includes("SET state='dispatching',dispatch_started_at")) await target.query('SET timestamp=?', [config.unix! + (mode === 'expiry' ? 120 : -1)]);
          return (target.execute as any)(...args);
        }; const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value;
      } }) as any;
    });
    expect(await dispatch(r)).toMatchObject({ transport: 'suppressed', state: 'authorized' }); expect(wa.post).not.toHaveBeenCalled();
  });
  it('reviewed delivery: consumes once while a concurrent channel reservation holds the outbox before its merchant FK lock', async () => {
    const f = await deliveryFixture(), r = await f.auth(), send = deliveryInput(r), pool = (await getPool())!;
    await query(`INSERT INTO whatsapp_message_deliveries (merchant_id,instance_id,provider,idempotency_key,direction,status,request_json)
      VALUES (?,?,'green_api',?,'outgoing','queued',?)`, [owner.merchantId, f.instanceRecordId, send.idempotencyKey,
      JSON.stringify({ to: send.to, kind: send.kind, text: send.text, salesReplyGuard: send.salesReplyGuard })]);
    const held = await pool.getConnection(), original = pool.getConnection.bind(pool);
    let locked!: () => void; const merchantLocked = new Promise<void>(resolve => { locked = resolve; });
    await held.beginTransaction();
    try {
      await held.execute('SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? FOR UPDATE', [owner.merchantId, send.idempotencyKey]);
      vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
        const c = await original();
        return new Proxy(c, { get(target, key) {
          if (key === 'execute') return async (...args: any[]) => {
            const result = await (target.execute as any)(...args);
            if (String(args[0]).startsWith('SELECT userId,status FROM merchants')) locked();
            return result;
          }; const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value;
        } }) as any;
      });
      const consume = canDispatchSalesReply(send, { provider: 'green_api', instanceId: f.account, token: f.token,
        apiUrl: 'https://api.green-api.com', phoneNumberId: '1234567890', providerAccountId: 'test-account' });
      await merchantLocked;
      const parent = held.execute('SELECT id FROM merchants WHERE id=? FOR SHARE', [owner.merchantId]).then(() => true, () => false);
      expect(await Promise.all([consume, parent])).toEqual([true, true]);
      expect(wa.post).not.toHaveBeenCalled();
    } finally { await held.rollback(); held.release(); }
    expect((await deliveryRead(r)).state).toBe('dispatching');
  });
  it.each(['OpenAI', 'ZahyPi'])('public workspace loads %s original output without exposing private prompt or history', async () => {
    const { r, w, value } = await publicFixture(), before = await ledger();
    expect(w.basis).toMatchObject({ customerMessage, lastAssistantMessage: '' });
    const saved = await publicSubmit(value), after = await publicRead(r.generationId), list = await listSalesReplyReviews(owner.merchantId, {});
    expect(saved).toMatchObject({ requestId: value.requestId, outcome: 'approved', dispatchAllowed: false, exposureRecorded: false, eligibility: 'not_checked' });
    expect(after).toMatchObject({ expectedRevision: 1, reviewCurrentAtRead: true, history: [saved] });
    expect(list.items).toEqual([{ generationId: r.generationId, state: 'responded', reviewOutcome: 'approved', revision: 1 }]);
    const raw = JSON.stringify([w, saved, after, list]); expect(raw).not.toContain('PRIVATE_SERVER'); expect(raw).not.toContain('synthetic-key');
    expect(raw).not.toContain('baseSystemPrompt'); expect(raw).not.toContain('contextMessages'); expect(await ledger()).toEqual(before);
    expect(await query('SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
  it('public workspace separates manager read from owner write and isolates tenant data', async () => {
    const { r, value } = await publicFixture(); expect(await publicRead(r.generationId, other.userId)).toMatchObject({ canReview: false, stage: 'owner_required', basis: null });
    await expect(submitSalesReplyReview(owner.merchantId, other.userId, value)).rejects.toThrow();
    await expect(getSalesReplyReviewWorkspace(other.merchantId, other.userId, { generationId: r.generationId })).rejects.toThrow();
    await expect(submitSalesReplyReview(other.merchantId, other.userId, value)).rejects.toThrow();
    expect((await listSalesReplyReviews(other.merchantId, {})).items).toEqual([]); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['source', 'route', 'disabled', 'revoked', 'human', 'processed', 'owner', 'window', 'new-inbound', 'deleted', 'handoff'])('public workspace retains history but blocks a new review after %s drift', async mode => {
    const { r, value } = await publicFixture(), saved = await publicSubmit(value);
    if (mode === 'source') await query("UPDATE messages SET content='changed' WHERE id=?", [incomingMessageId]);
    if (mode === 'route') config.model += '-changed'; if (mode === 'disabled') config.enabled = false; if (mode === 'revoked') await revoke();
    if (mode === 'human') await query('UPDATE conversations SET human_takeover=1 WHERE id=?', [conversationId]);
    if (mode === 'processed') await query('UPDATE messages SET isProcessed=1 WHERE id=?', [incomingMessageId]);
    if (mode === 'owner') await query('UPDATE merchants SET userId=? WHERE id=?', [other.userId, owner.merchantId]);
    if (mode === 'window') config.unix! += 365 * 86400;
    if (mode === 'new-inbound') await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','new question')", [conversationId]);
    if (mode === 'deleted') await query('DELETE FROM conversations WHERE id=?', [conversationId]);
    if (mode === 'handoff') await query('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?', [conversationId]);
    expect(await publicRead(r.generationId)).toMatchObject({ canReview: false, reviewCurrentAtRead: false, history: [saved] });
    await expect(publicSubmit({ ...value, requestId: randomUUID(), expectedRevision: 1 })).rejects.toThrow();
    expect(await publicSubmit(value)).toEqual(saved); expect(fetch).not.toHaveBeenCalled();
    if (mode === 'owner') await query('UPDATE merchants SET userId=? WHERE id=?', [owner.userId, owner.merchantId]);
  });
  it.each(['before', 'after'] as const)('public workspace recovers a lost save acknowledgement %s commit', async when => {
    const { r, value } = await publicFixture(); await failCommit('review', when); await expect(publicSubmit(value)).rejects.toThrow(); vi.restoreAllMocks();
    const result = await publicSubmit(value); expect((await publicRead(r.generationId)).history).toEqual([result]); expect(await publicSubmit(value)).toEqual(result); expect(fetch).not.toHaveBeenCalled();
  });
  it('public workspace serializes competing reviewers and preserves request identity', async () => {
    const { r, value } = await publicFixture(); const same = await Promise.all([publicSubmit(value), publicSubmit(value), publicSubmit(value)]);
    expect(new Set(same.map(v => v.reviewId)).size).toBe(1);
    await expect(publicSubmit({ ...value, rationale: 'Changed human justification under the same submitted request identity.' })).rejects.toThrow();
    await expect(publicSubmit({ ...value, requestId: randomUUID() })).rejects.toThrow();
    const next = await publicSubmit({ ...value, requestId: randomUUID(), expectedRevision: 1, checks: { ...value.checks, groundedInBusiness: false } });
    expect(next).toMatchObject({ revision: 2, outcome: 'rejected' }); expect((await publicRead(r.generationId)).history).toHaveLength(2); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['تم إنشاء طلبك الآن', 'تواصل معي على private@example.test', '[أدخل السعر]'])('public review cannot pass an unsafe reply: %s', async response => {
    config.text = response; const { w, value } = await publicFixture(); expect(w.basis!.gate.some(g => g.severity === 'critical')).toBe(true);
    expect(await publicSubmit(value)).toMatchObject({ outcome: 'rejected' }); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([false, true])('public refusal review only accepts the exact acknowledgement: %s', async correct => {
    config.text = correct ? refusalAcknowledgement(customerMessage) : 'لدينا عرض رائع، أكمل الطلب الآن';
    const { value } = await publicFixture(); expect(await publicSubmit(value)).toMatchObject({ outcome: correct ? 'approved' : 'rejected' }); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['invalid', 'uncertain'])('public workspace retains incomplete %s attempts without a writable basis', async state => {
    if (state === 'invalid') config.finish = 'length'; else vi.mocked(fetch).mockRejectedValue(Error('synthetic timeout'));
    const r = await generate(); expect(await publicRead(r.generationId)).toMatchObject({ canReview: false, basis: null, stage: 'incomplete' }); expect(fetch).toHaveBeenCalledOnce();
  });
  it('public workspace shows old internal reviews as historical and requires a new current-turn basis', async () => {
    const { r, value } = await reviewFixture(); const saved = await recordReview(value), w = await publicRead(r.generationId);
    expect(w).toMatchObject({ canReview: true, reviewCurrentAtRead: false, expectedRevision: 1, history: [{ reviewId: saved.reviewId }] });
    expect(w.basis!.digest).not.toBe(value.basisDigest); expect(fetch).not.toHaveBeenCalled();
  });
  it('public list uses a bounded descending cursor and never returns response text', async () => {
    const { r } = await publicFixture(); const first = await listSalesReplyReviews(owner.merchantId, { limit: 1 });
    expect(first.items[0].generationId).toBe(r.generationId); expect(first.nextCursor).toBeNull();
    expect(JSON.stringify(first)).not.toContain(config.text); expect((await listSalesReplyReviews(owner.merchantId, { beforeId: r.generationId, limit: 1 })).items).toEqual([]);
    await expect(listSalesReplyReviews(owner.merchantId, { limit: 100 })).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
  it('public review rechecks expiry inside its save transaction', async () => {
    const { r, value } = await publicFixture(), pool = (await getPool())!, original = pool.getConnection.bind(pool);
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
      const c = await original(); return new Proxy(c, { get(target, key) {
        if (key === 'execute') return async (...args: any[]) => {
          const result = await (target.execute as any)(...args);
          if (String(args[0]).includes('ORDER BY revision DESC LIMIT 20')) await target.query('SET timestamp=?', [config.unix! + 365 * 86400]);
          return result;
        }; const v = (target as any)[key]; return typeof v === 'function' ? v.bind(target) : v;
      } }) as any;
    });
    await expect(publicSubmit(value)).rejects.toThrow(); vi.restoreAllMocks(); expect((await publicRead(r.generationId)).history).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['quote', 'basisDigest', 'rubricDigest', 'expectedRevision'])('public review rejects a changed %s before persistence', async field => {
    const { r, value } = await publicFixture(); const change = field === 'quote' ? 'Not in the response' : field === 'expectedRevision' ? 7 : 'f'.repeat(64);
    await expect(publicSubmit({ ...value, [field]: change })).rejects.toThrow(); expect((await publicRead(r.generationId)).history).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
  it('public review does not return a corrupted saved judgment as approved', async () => {
    const { r, value } = await publicFixture(), saved = await publicSubmit(value);
    await query("UPDATE ai_sales_generation_output_reviews SET snapshot=JSON_SET(snapshot,'$.checks.answersQuestion',false) WHERE id=?", [saved.reviewId]);
    await expect(publicRead(r.generationId)).rejects.toThrow(); await expect(listSalesReplyReviews(owner.merchantId, {})).rejects.toThrow();
    await expect(publicSubmit(value)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
  const reviewContext = (generationId: number) => ({ generationId, baseSystemPrompt: input.baseSystemPrompt, contextMessages: input.contextMessages });
  const history = (generationId: number, merchant = owner.merchantId) => getSalesGenerationOutputReviews(merchant, { generationId });
  const recordReview = (value: RecordSalesReplyReviewInput, merchant = owner.merchantId, actor = owner.userId) => recordSalesGenerationOutputReview(merchant, actor, value);
  async function reviewFixture() {
    const r = await generate(), prepared = await prepareSalesGenerationOutputReview(owner.merchantId, reviewContext(r.generationId));
    vi.mocked(fetch).mockClear();
    const value: RecordSalesReplyReviewInput = { ...reviewContext(r.generationId), requestId: randomUUID(), basisDigest: prepared.basisDigest,
      rubricDigest: salesReplyReviewRubricDigest, expectedRevision: prepared.expectedRevision,
      checks: { answersQuestion: true, groundedInBusiness: true, appropriateNextStep: true, respectsCustomerDecision: true, noUnverifiedCommitment: true, languageAndClarity: true },
      quote: config.text, rationale: 'Human judgment about the exact synthetic saved answer and its appropriate next step.', reviewedEntireResponse: true, understandsNoMessageSent: true };
    return { r, prepared, value };
  }
  it.each(['OpenAI', 'ZahyPi'])('persists an exact %s original-output review without any additional provider call or delivery', async () => {
    const { r, prepared, value } = await reviewFixture(), before = await ledger(), result = await recordReview(value);
    expect(prepared.reviewCurrentAtRead).toBe(false); expect(result).toMatchObject({ snapshot: { outcome: 'approved', revision: 1, basis: { responseText: config.text } }, dispatchAllowed: false, exposureRecorded: false });
    expect((await prepareSalesGenerationOutputReview(owner.merchantId, reviewContext(r.generationId))).reviewCurrentAtRead).toBe(true);
    expect((await history(r.generationId)).history).toHaveLength(1); expect(await ledger()).toEqual(before); expect(fetch).not.toHaveBeenCalled();
    expect(await get(r.generationId)).toMatchObject({ assessment: 'human_review_recorded', outputReview: { reviewId: result.reviewId, outcome: 'approved', eligibility: 'not_checked', dispatchAllowed: false } });
    expect(await query('SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=?', [owner.merchantId])).toHaveLength(0);
    const raw = JSON.stringify(await query('SELECT * FROM ai_sales_generation_output_reviews WHERE merchant_id=?', [owner.merchantId]));
    expect(raw).not.toContain('PRIVATE_SERVER_CONTEXT'); expect(raw).not.toContain('PRIVATE_SERVER_HISTORY'); expect(raw).not.toContain('synthetic-key');
  });
  it('recovers a saved review after reconnection and serializes identical concurrent requests', async () => {
    const { r, value } = await reviewFixture(), results = await Promise.all([recordReview(value), recordReview(value), recordReview(value)]);
    expect(new Set(results.map(row => row.reviewId)).size).toBe(1); await closeDb(); expect(await recordReview(value)).toMatchObject({ reviewId: results[0].reviewId, reused: true });
    expect((await history(r.generationId)).history).toHaveLength(1); expect(fetch).not.toHaveBeenCalled();
  });
  it('prevents competing judgments from overwriting the same review revision', async () => {
    const { r, value } = await reviewFixture();
    const results = await Promise.allSettled([recordReview(value), recordReview({ ...value, requestId: randomUUID(), checks: { ...value.checks, answersQuestion: false } })]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1); expect((await history(r.generationId)).history).toHaveLength(1); expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps a rejected revision after a later human reassessment', async () => {
    const { r, value } = await reviewFixture();
    await recordReview({ ...value, checks: { ...value.checks, answersQuestion: false } });
    await recordReview({ ...value, requestId: randomUUID(), expectedRevision: 1 });
    expect((await history(r.generationId)).history.map(v => v.snapshot.outcome)).toEqual(['approved', 'rejected']); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['before', 'after'] as const)('preserves review retry after a lost acknowledgement %s commit', async when => {
    const { r, value } = await reviewFixture(); await failCommit('review', when); await expect(recordReview(value)).rejects.toThrow(); vi.restoreAllMocks();
    expect((await history(r.generationId)).history).toHaveLength(when === 'after' ? 1 : 0);
    expect(await recordReview(value)).toMatchObject({ reused: when === 'after', snapshot: { revision: 1 } }); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['quote', 'rationale', 'checks', 'context', 'prompt', 'actor'])('rejects changes to review %s under a saved request ID', async mode => {
    const { value } = await reviewFixture(); await recordReview(value);
    const changed = mode === 'quote' ? { quote: 'changed' } : mode === 'rationale' ? { rationale: 'A completely different justification for this recorded review.' }
      : mode === 'checks' ? { checks: { ...value.checks, groundedInBusiness: false } } : mode === 'context' ? { contextMessages: [] } : mode === 'prompt' ? { baseSystemPrompt: 'changed' } : {};
    await expect(recordReview({ ...value, ...changed }, owner.merchantId, mode === 'actor' ? other.userId : owner.userId)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['source', 'route', 'disabled', 'revoked', 'human', 'processed', 'owner', 'window', 'new-inbound', 'deleted', 'handoff'])('blocks new final-output review after %s drift but keeps its historical receipt', async mode => {
    const { r, value } = await reviewFixture(); const saved = await recordReview(value);
    if (mode === 'source') await query("UPDATE messages SET content='changed' WHERE id=?", [incomingMessageId]);
    if (mode === 'route') config.model += '-changed'; if (mode === 'disabled') config.enabled = false; if (mode === 'revoked') await revoke();
    if (mode === 'human') await query('UPDATE conversations SET human_takeover=1 WHERE id=?', [conversationId]);
    if (mode === 'processed') await query('UPDATE messages SET isProcessed=1 WHERE id=?', [incomingMessageId]);
    if (mode === 'owner') await query('UPDATE merchants SET userId=? WHERE id=?', [other.userId, owner.merchantId]);
    if (mode === 'window') config.unix! += 365 * 86400;
    if (mode === 'new-inbound') await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','new question')", [conversationId]);
    if (mode === 'deleted') await query('DELETE FROM conversations WHERE id=?', [conversationId]);
    if (mode === 'handoff') await query('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?', [conversationId]);
    await expect(prepareSalesGenerationOutputReview(owner.merchantId, reviewContext(r.generationId))).rejects.toThrow();
    await expect(recordReview({ ...value, requestId: randomUUID(), expectedRevision: 1 })).rejects.toThrow();
    expect(await recordReview(value)).toMatchObject({ reviewId: saved.reviewId, reused: true, eligibility: 'not_checked', dispatchAllowed: false });
    expect(await get(r.generationId)).toMatchObject({ assessment: 'human_review_recorded', outputReview: { eligibility: 'not_checked', dispatchAllowed: false } });
    expect((await history(r.generationId)).history).toHaveLength(1); expect(fetch).not.toHaveBeenCalled();
    if (mode === 'owner') await query('UPDATE merchants SET userId=? WHERE id=?', [owner.userId, owner.merchantId]);
  });
  it('isolates final-output review history and writes by merchant and current owner', async () => {
    const { r, value } = await reviewFixture(); await expect(history(r.generationId, other.merchantId)).rejects.toThrow();
    await expect(recordReview(value, other.merchantId, other.userId)).rejects.toThrow(); await expect(recordReview(value, owner.merchantId, other.userId)).rejects.toThrow();
    expect((await history(r.generationId)).history).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['quote', 'basis', 'context', 'prompt'])('rejects a mismatched final-review %s before writing', async mode => {
    const { r, value } = await reviewFixture(), changed = mode === 'quote' ? { quote: 'not in original output' } : mode === 'basis' ? { basisDigest: 'f'.repeat(64) }
      : mode === 'context' ? { contextMessages: [] } : { baseSystemPrompt: 'not the original context' };
    await expect(recordReview({ ...value, ...changed })).rejects.toThrow(); expect((await history(r.generationId)).history).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['تم إنشاء طلبك الآن', 'تواصل معي على private@example.test', '[أدخل السعر]'])('cannot approve an unsafe original output: %s', async response => {
    config.text = response; const { prepared, value } = await reviewFixture(); expect(prepared.evidence.gate.some(v => v.severity === 'critical')).toBe(true);
    expect(await recordReview(value)).toMatchObject({ snapshot: { outcome: 'rejected', basis: { responseText: response } } }); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([false, true])('refusal review only accepts the exact no-pressure acknowledgement: %s', async correct => {
    config.text = correct ? refusalAcknowledgement(customerMessage) : 'لدينا عرض رائع، أكمل الطلب الآن';
    const { value } = await reviewFixture(); expect(await recordReview(value)).toMatchObject({ snapshot: { outcome: correct ? 'approved' : 'rejected' } }); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['invalid', 'uncertain'])('does not prepare an incomplete %s response for review', async state => {
    if (state === 'invalid') config.finish = 'length'; else vi.mocked(fetch).mockRejectedValue(Error('synthetic timeout'));
    const r = await generate(); await expect(prepareSalesGenerationOutputReview(owner.merchantId, reviewContext(r.generationId))).rejects.toThrow(); expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(['snapshot', 'outcome', 'digest', 'actor', 'revision'])('detects stored final-review %s corruption', async field => {
    const { r, value } = await reviewFixture(), saved = await recordReview(value);
    if (field === 'snapshot') await query("UPDATE ai_sales_generation_output_reviews SET snapshot=JSON_SET(snapshot,'$.basis.responseText','injected') WHERE id=?", [saved.reviewId]);
    if (field === 'outcome') await query("UPDATE ai_sales_generation_output_reviews SET outcome='rejected' WHERE id=?", [saved.reviewId]);
    if (field === 'digest') await query('UPDATE ai_sales_generation_output_reviews SET review_digest=? WHERE id=?', ['f'.repeat(64), saved.reviewId]);
    if (field === 'actor') await query('UPDATE ai_sales_generation_output_reviews SET actor_user_id=? WHERE id=?', [other.userId, saved.reviewId]);
    if (field === 'revision') await query('UPDATE ai_sales_generation_output_reviews SET revision=2 WHERE id=?', [saved.reviewId]);
    await expect(history(r.generationId)).rejects.toThrow(); await expect(recordReview(value)).rejects.toThrow(); await expect(get(r.generationId)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects a final review when the observation window closes while the transaction is running', async () => {
    const { r, value } = await reviewFixture(), pool = (await getPool())!, original = pool.getConnection.bind(pool);
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
      const c = await original(); return new Proxy(c, { get(target, key) {
        if (key === 'execute') return async (...args: any[]) => {
          const result = await (target.execute as any)(...args);
          if (String(args[0]).includes('ORDER BY revision DESC LIMIT 20')) await target.query('SET timestamp=?', [config.unix! + 365 * 86400]);
          return result;
        };
        const v = (target as any)[key]; return typeof v === 'function' ? v.bind(target) : v;
      } }) as any;
    });
    await expect(recordReview(value)).rejects.toThrow(); vi.restoreAllMocks(); expect((await history(r.generationId)).history).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['judgment', 'quote', 'identity'])('rejects a rehashed but internally inconsistent review %s', async mode => {
    const { r, value } = await reviewFixture(), saved = await recordReview(value);
    const s = structuredClone(saved.snapshot);
    if (mode === 'judgment') s.checks.answersQuestion = false;
    if (mode === 'quote') s.quote = 'An excerpt that never appeared in the reviewed response.';
    if (mode === 'identity') s.basis.generationId++; // Rehash the nested basis too; the cross-identity constraint must reject it.
    s.basisDigest = policyArtifactDigest(s.basis);
    await query('UPDATE ai_sales_generation_output_reviews SET snapshot=?,basis_digest=?,review_digest=? WHERE id=?', [JSON.stringify(s), s.basisDigest, policyArtifactDigest(s), saved.reviewId]);
    await expect(history(r.generationId)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
});
