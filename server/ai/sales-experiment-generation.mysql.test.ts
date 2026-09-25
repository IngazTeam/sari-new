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
  let input: GenerateSalesExperimentTurnInput, conversationId: number, incomingMessageId: number;
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
    incomingMessageId = Number((await query("INSERT INTO messages (conversationId,direction,messageType,content,createdAt) VALUES (?,'incoming','text','أريد معرفة العرض المناسب',?)", [conversationId, new Date(config.unix * 1000).toISOString().slice(0, 19).replace('T', ' ')])).insertId);
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
      expect(messages.at(-1)).toEqual({ role: 'user', content: 'أريد معرفة العرض المناسب' }); expect(messages[1]).toEqual(input.contextMessages![0]);
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
  function failCommit(phase: 'claim' | 'bind' | 'save' | 'settle', when: 'before' | 'after', failures = Infinity) {
    return (async () => {
      const pool = (await getPool())!, original = pool.getConnection.bind(pool);
      vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
        const c = await original(); let matched = false;
        return new Proxy(c, { get(target, key) {
          if (key === 'execute') return async (...args: any[]) => {
            const marker = { claim: 'INSERT INTO ai_sales_experiment_generations', bind: 'SET reservation_key=?', save: 'state=?,response_text=?', settle: "SET state = 'settled'" }[phase];
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
  it('does not contact a provider after the generation claim lease expires', async () => {
    const original = settings.getZahyPiRuntimeConfig;
    vi.spyOn(settings, 'getZahyPiRuntimeConfig').mockImplementationOnce(async () => {
      await query('UPDATE ai_sales_experiment_generations SET lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE merchant_id=?', [owner.merchantId]); return original();
    });
    expect(await generate()).toMatchObject({ state: 'blocked' }); expect(fetch).not.toHaveBeenCalled();
  });
});
