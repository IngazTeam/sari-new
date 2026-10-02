import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn(), active: vi.fn(), toggle: vi.fn(), trainees: vi.fn(), faqs: vi.fn(), sql: vi.fn(), pool: vi.fn(), resync: vi.fn(), status: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: m.access }));
vi.mock('./integrations/byaan-connection-workspace', async original => ({ ...await original<typeof import('./integrations/byaan-connection-workspace')>(), readByaanConnectionWorkspace: m.read }));
vi.mock('./integrations/byaan-dashboard-access', async original => ({ ...await original<typeof import('./integrations/byaan-dashboard-access')>(), requireActiveByaanMerchant: m.active, toggleByaanDashboardFaq: m.toggle }));
vi.mock('./db', async original => ({ ...await original<typeof import('./db')>(), getPool: m.pool }));
vi.mock('./integrations/byaan', () => ({ getByaanTraineePage: m.trainees, getByaanFaqPage: m.faqs, requestByaanResync: m.resync, updateByaanSyncStatus: m.status }));
import { byaanRouter } from './routers-byaan';
import { appRouter } from './routers';
import { ByaanDashboardFault } from './integrations/byaan-dashboard-access';
const names = ['getStatus', 'getTrainees', 'getFaqs', 'toggleFaq', 'getSiteContent', 'triggerResync'] as const;
let selected = 20;
const snapshot = () => ({ managedContent: true, present: true, verifiedAt: '2026-10-01T00:00:00Z', state: 'configured', source: 'byaan', tenantDomain: 'academy.example.test', lastSyncAt: null, hasSyncErrors: true, counts: { activeTrainees: 503, activeFaqs: 31, catalog: 601, sitePages: 12 } });
beforeEach(() => {
  vi.resetAllMocks(); selected++;
  m.access.mockResolvedValue({ merchantId: selected, role: 'owner' }); m.read.mockResolvedValue(snapshot());
  m.active.mockResolvedValue({ merchant: { id: selected } }); m.toggle.mockResolvedValue({ success: true });
  m.trainees.mockResolvedValue({ items: [{ id: 1, name: 'Allowed', enrolled_courses: '["Course"]', private: 'PRIVATE' }], nextCursor: 1 });
  m.faqs.mockResolvedValue({ items: [{ id: 2, question: 'Question', answer: 'Answer', is_active: 0, use_in_bot: 1, embedding: 'PRIVATE' }], nextCursor: null });
  m.pool.mockResolvedValue({ execute: m.sql }); m.sql.mockResolvedValue([[]]); m.resync.mockResolvedValue({ success: true });
});
for (const mounted of [false, true]) {
  const api = (user: any = { id: 7, role: 'user' }) => { const ctx = { user, merchantId: 999, merchantRole: 'owner', req: { headers: { 'x-merchant-id': String(selected) } }, res: {} } as any; return mounted ? appRouter.createCaller(ctx).byaan : byaanRouter.createCaller(ctx); };
  const call = (name: typeof names[number], caller = api()) => (caller[name] as any)(name === 'toggleFaq' ? { faqId: 3, field: 'use_in_bot', value: false } : undefined);
  it.each(['owner', 'manager'])(`uses the selected member tenant for every %s action (${mounted})`, async role => {
    m.access.mockResolvedValue({ merchantId: selected, role }); for (const name of names) await call(name);
    expect(m.access).toHaveBeenCalledWith(7, selected); expect(m.read).toHaveBeenCalledWith(7, selected);
    expect(m.active).toHaveBeenCalledWith(selected); expect(m.toggle).toHaveBeenCalledWith(7, selected, { faqId: 3, field: 'use_in_bot', value: false });
    expect(m.trainees).toHaveBeenCalledWith(selected, { limit: 50 }); expect(m.faqs).toHaveBeenCalledWith(selected, { limit: 50 });
    expect(m.sql.mock.calls[0][1]).toEqual([selected]); expect(m.resync).toHaveBeenCalledWith(selected);
  });
  it.each(names)(`rejects anonymous and revoked users before %s (${mounted})`, async name => {
    await expect(call(name, api(null))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    m.access.mockResolvedValue(null); await expect(call(name)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(m.read).not.toHaveBeenCalled(); expect(m.active).not.toHaveBeenCalled(); expect(m.toggle).not.toHaveBeenCalled(); expect(m.resync).not.toHaveBeenCalled();
  });
  it.each(['viewer', 'sales_supervisor'])(`applies feature permissions to %s (${mounted})`, async role => {
    m.access.mockResolvedValue({ merchantId: selected, role }); await call('getStatus');
    if (role === 'sales_supervisor') await call('getTrainees'); else await expect(call('getTrainees')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    for (const name of ['getFaqs', 'getSiteContent', 'toggleFaq', 'triggerResync'] as const) await expect(call(name)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(m.faqs).not.toHaveBeenCalled(); expect(m.sql).not.toHaveBeenCalled(); expect(m.toggle).not.toHaveBeenCalled(); expect(m.resync).not.toHaveBeenCalled();
  });
  it.each(names)(`redacts unexpected dependency errors for %s (${mounted})`, async name => {
    for (const method of [m.read, m.active, m.toggle, m.sql]) method.mockRejectedValue(Error('PRIVATE_SQL api_key=secret'));
    await expect(call(name)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Byaan dashboard data unavailable' });
  });
  it(`retains complete stored counts on disabled and unlinked connections (${mounted})`, async () => {
    for (const [state, present] of [['disabled', true], ['unlinked', false], ['pending_verification', true]] as const) {
      m.read.mockResolvedValue({ ...snapshot(), state, present, verifiedAt: state === 'disabled' ? snapshot().verifiedAt : null });
      expect(await api().getStatus()).toMatchObject({ actorId: 7, merchantId: selected, connected: false, verificationPending: state === 'pending_verification', stats: { courses: 601, trainees: 503, faqs: 31, sitePages: 12 } });
    }
  });
  it(`rejects injected scopes and invalid identifiers without mutation (${mounted})`, async () => {
    for (const faqId of [0, -1, 1.5, 2147483648]) await expect(api().toggleFaq({ faqId, field: 'is_active', value: true })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(api().toggleFaq({ faqId: 1, field: 'is_active', value: true, merchantId: 999 } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    for (const name of ['getTrainees', 'getFaqs'] as const) await expect(api()[name]({ cursor: 1, merchantId: 999 } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(m.toggle).not.toHaveBeenCalled(); expect(m.active).not.toHaveBeenCalled();
  });
  it(`fails closed for an unavailable site-content store and inactive connection (${mounted})`, async () => {
    m.pool.mockResolvedValue(null); await expect(api().getSiteContent()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    m.active.mockRejectedValue(new ByaanDashboardFault('inactive'));
    await expect(api().getTrainees()).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); expect(m.trainees).not.toHaveBeenCalled();
  });
  it(`preserves safe projections and bounds malformed course data (${mounted})`, async () => {
    expect(JSON.stringify(await api().getTrainees())).not.toContain('PRIVATE'); expect(JSON.stringify(await api().getFaqs())).not.toContain('PRIVATE');
    m.trainees.mockResolvedValue({ items: [{ id: 1, enrolled_courses: JSON.stringify(Array(105).fill({ name: 'A'.repeat(300) })) }], nextCursor: null });
    const page = await api().getTrainees(); expect(page.items[0].enrolledCourses).toHaveLength(100); expect(page.items[0].enrolledCourses[0]).toHaveLength(255);
  });
}
