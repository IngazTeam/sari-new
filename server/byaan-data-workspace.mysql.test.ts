import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { readByaanDataWorkspace } from './integrations/byaan-data-workspace';
import { toggleByaanDashboardFaq } from './integrations/byaan-dashboard-access';
import { byaanRouter } from './routers-byaan';
describe.skipIf(!process.env.DATABASE_URL)('Byaan complete data workspace MySQL', () => {
  let own: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof own;
  const q = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute<any>(sql, args))[0];
  const read = (kind: 'trainees' | 'faqs' | 'site', extra: any = {}) => readByaanDataWorkspace(own.userId, own.merchantId, { kind, ...extra });
  const caller = (actorId = own.userId) => byaanRouter.createCaller({ user: { id: actorId, role: 'user' }, req: { headers: { 'x-merchant-id': String(own.merchantId) } }, res: {} } as any);
  const faq = async (question = 'Question', active = 1, useInBot = 1) => (await q('INSERT INTO byaan_faqs(merchant_id,question,answer,is_active,use_in_bot) VALUES (?,?,?,?,?)', [own.merchantId, question, 'Answer', active, useInBot])).insertId;
  beforeEach(async () => {
    own = await createDisposableMerchant('by-data'); other = await createDisposableMerchant('by-data-foreign');
    await q("UPDATE merchants SET integration_source='byaan' WHERE id=?", [own.merchantId]);
    await q("INSERT INTO byaan_connections(merchant_id,tenant_domain,api_base_url,is_active,verified_at,sync_status) VALUES (?,?,?,1,NOW(),'active')", [own.merchantId, `data-${own.merchantId}.example.test`, 'https://example.test/api']);
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants([own.userId, other.userId]); }); afterAll(closeDb);
  it('counts and searches over 500 trainees including archived, with bounded stable pages', async () => {
    const values = Array.from({ length: 503 }, (_, i) => [own.merchantId, `e-${i}`, `Trainee ${i}`, i % 2 ? 'archived' : 'active']);
    await q('INSERT INTO byaan_trainees(merchant_id,external_id,name,status) VALUES ' + values.map(() => '(?,?,?,?)').join(','), values.flat());
    await q("INSERT INTO byaan_trainees(merchant_id,external_id,name,status) VALUES (?,'foreign','Foreign','active')", [other.merchantId]);
    const first = await read('trainees'); expect(first.summary).toMatchObject({ stored: 503, matched: 503, groups: [{ key: 'active', count: 252 }, { key: 'archived', count: 251 }, { key: 'unknown', count: 0 }] });
    expect(first.rows).toHaveLength(25); expect(first.pagination.pages).toBe(21); const second = await read('trainees', { page: 2 }); expect(second.rows.some(row => first.rows.some(one => one.id === row.id))).toBe(false);
    expect((await read('trainees', { page: 21 })).rows).toHaveLength(3); expect((await read('trainees', { page: 22 })).rows).toEqual([]);
    const search = await read('trainees', { search: 'Trainee 502' }); expect(search.rows).toHaveLength(1); expect(search.summary.stored).toBe(503); expect(search.summary.matched).toBe(1);
    expect((await read('trainees', { state: 'archived' })).pagination.total).toBe(251); expect(JSON.stringify(first)).not.toContain('Foreign');
  });
  it('shows archived and unknown trainee states and reports malformed/truncated course data', async () => {
    await q('INSERT INTO byaan_trainees(merchant_id,external_id,name,status,enrolled_courses) VALUES (?,?,?,?,?),(?,?,?,?,?)', [own.merchantId, 'bad', 'Bad', null, '{bad', own.merchantId, 'long', 'Long', 'archived', JSON.stringify(Array(105).fill('A'.repeat(300)))]);
    const result = await read('trainees'); expect(result.rows[0]).toMatchObject({ state: 'unknown', courseDataInvalid: true }); expect(result.rows[1]).toMatchObject({ state: 'archived', coursesTruncated: true });
    const row = result.rows[1]; if (row.kind !== 'trainees') throw Error(); expect(row.courses).toHaveLength(100); expect(row.courses[0]).toHaveLength(255);
  });
  it('searches literal percent and underscore without broadening the match', async () => {
    await faq('Price 50%_!'); await faq('Price 500000'); const result = await read('faqs', { search: '%_!' }); expect(result.rows).toHaveLength(1); expect(result.summary).toMatchObject({ stored: 2, matched: 1 });
  });
  it('counts all FAQ choices including malformed flags and filters independently', async () => {
    await faq('Included'); await faq('Excluded', 1, 0); await faq('Disabled', 0, 1); await faq('Invalid', 2, 1);
    const result = await read('faqs'); expect(result.summary.groups).toEqual(['included', 'excluded', 'disabled', 'unknown'].map(key => ({ key, count: 1 })));
    for (const state of ['included', 'excluded', 'disabled', 'unknown']) { const page = await read('faqs', { state }); expect(page.rows).toHaveLength(1); expect(page.rows[0].state).toBe(state); expect(page.summary.matched).toBe(4); }
    expect((await read('faqs', { state: 'unknown' })).rows[0]).toMatchObject({ isActive: null, useInBot: true });
  });
  it('provides site content including empty pages and safe raw text', async () => {
    await q("INSERT INTO byaan_site_content(merchant_id,page_type,title,content) VALUES (?,'about','About','<script>sample</script>'),(?,'vision','Vision','   '),(?,'about','Foreign','PRIVATE')", [own.merchantId, own.merchantId, other.merchantId]);
    const result = await read('site'); expect(result.rows).toHaveLength(2); expect(result.summary.groups).toEqual([{ key: 'content', count: 1 }, { key: 'empty', count: 1 }]);
    expect((await read('site', { search: 'script' })).rows).toHaveLength(1); expect((await read('site', { state: 'empty' })).pagination.total).toBe(1); expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
  it.each(['question','answer','is_active','use_in_bot'])('rejects a reviewed FAQ after %s changes', async field => {
    const id = await faq(); const row = (await read('faqs')).rows[0]; if (row.kind !== 'faqs') throw Error();
    await q(`UPDATE byaan_faqs SET ${field}=? WHERE id=?`, [field.endsWith('active') || field.endsWith('bot') ? 0 : 'Changed', id]);
    await expect(caller().changeFaq({ faqId: id, field: 'use_in_bot', value: false, revision: row.revision })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('one of two concurrent reviewed writes succeeds; the stale one cannot overwrite it', async () => {
    const id = await faq(); const row = (await read('faqs')).rows[0]; if (row.kind !== 'faqs') throw Error();
    const input = { faqId: id, field: 'use_in_bot' as const, value: false, revision: row.revision };
    const results = await Promise.allSettled([toggleByaanDashboardFaq(own.userId, own.merchantId, input), toggleByaanDashboardFaq(own.userId, own.merchantId, input)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect((await read('faqs')).rows[0]).toMatchObject({ state: 'excluded', useInBot: false });
  });
  it('applies kind-specific permissions on the mounted route', async () => {
    await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'sales_supervisor',1)", [own.merchantId, other.userId]);
    expect((await caller(other.userId).dataWorkspace({ kind: 'trainees' })).actorId).toBe(other.userId);
    for (const kind of ['faqs','site'] as const) await expect(caller(other.userId).dataWorkspace({ kind })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('fails closed on a disconnected source', async () => {
    await q('UPDATE byaan_connections SET is_active=0 WHERE merchant_id=?', [own.merchantId]);
    for (const kind of ['trainees','faqs','site'] as const) await expect(read(kind)).rejects.toMatchObject({ reason: 'inactive' });
  });
  it('scopes overview capabilities and latest request to the selected member account', async () => {
    await q("INSERT INTO byaan_resync_requests(merchant_id,actor_id,request_id,connection_revision,state) VALUES (?,?,'3bc2a3e4-8589-4d5f-a0f7-68be3fe727ea',?,'queued')", [own.merchantId, own.userId, 'a'.repeat(64)]);
    const owner = await caller().dashboardOverview(); expect(owner.connection).toMatchObject({ actorId: own.userId, merchantId: own.merchantId }); expect(owner.lastRequest).toMatchObject({ actorId: own.userId, outcome: 'queued' });
    await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'sales_supervisor',1)", [own.merchantId, other.userId]);
    expect(await caller(other.userId).dashboardOverview()).toMatchObject({ access: { trainees: true, faqs: false, site: false, sales: true, integrations: false }, lastRequest: null });
    await q("UPDATE merchant_members SET role='manager' WHERE merchant_id=? AND user_id=?", [own.merchantId, other.userId]);
    expect(await caller(other.userId).dashboardOverview()).toMatchObject({ access: { integrations: true }, lastRequest: null });
  });
  it('holds counts and rows on one snapshot during a committed concurrent insert', async () => {
    await faq('Initial'); const pool = (await getPool())!, getConnection = pool.getConnection.bind(pool); let injected = false;
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
      const tx = await getConnection(), execute = tx.execute.bind(tx);
      vi.spyOn(tx, 'execute').mockImplementation((async (sql: any, params: any) => {
        const result = await execute(sql, params);
        if (!injected && String(sql).startsWith('SELECT COUNT(*)')) { injected = true; const writer = await getConnection(); try { await writer.execute('INSERT INTO byaan_faqs(merchant_id,question,answer) VALUES (?,?,?)', [own.merchantId, 'Concurrent', 'Answer']); } finally { writer.release(); } }
        return result;
      }) as any); return tx;
    });
    const result = await read('faqs'); expect(injected).toBe(true); expect(result.summary.stored).toBe(1); expect(result.rows).toHaveLength(1); vi.restoreAllMocks(); expect((await read('faqs')).summary.stored).toBe(2);
  });
});
