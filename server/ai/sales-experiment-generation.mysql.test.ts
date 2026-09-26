import { randomUUID } from 'node:crypto';
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
  const query = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const generate = (value = input, merchant = owner.merchantId, actor = owner.userId) => generateSalesExperimentTurn(merchant, actor, value);
  const get = (generationId: number, merchant = owner.merchantId) => getSalesExperimentGeneration(merchant, { generationId });
  const ledger = () => query('SELECT * FROM ai_usage_reservations WHERE scope_key=?', [`merchant:${owner.merchantId}`]);
  const revoke = () => revokeSalesExperimentLaunch(owner.merchantId, owner.userId, { launchId: launch.launchId, launchDigest: launch.launchDigest, requestId: randomUUID(), reason: 'Stop the synthetic generation after reviewing current safety conditions.' });
  beforeEach(async ctx => {
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
  function failCommit(phase: 'claim' | 'bind' | 'save' | 'settle' | 'receipt' | 'recover' | 'usage' | 'reserve' | 'link' | 'review', when: 'before' | 'after', failures = Infinity) {
    return (async () => {
      const pool = (await getPool())!, original = pool.getConnection.bind(pool);
      vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
        const c = await original(); let matched = false;
        return new Proxy(c, { get(target, key) {
          if (key === 'execute') return async (...args: any[]) => {
            const marker = { claim: 'INSERT INTO ai_sales_experiment_generations', bind: 'SET reservation_key=?', save: 'state=?,response_text=?', settle: "SET state = 'settled'", receipt: 'SET provider_receipt=?', recover: 'SET recovery_token=?', usage: 'SET usage_prompt_tokens=?', reserve: 'INSERT INTO ai_usage_reservations', link: 'SET reservation_key = ?', review: 'INSERT INTO ai_sales_generation_output_reviews' }[phase];
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
