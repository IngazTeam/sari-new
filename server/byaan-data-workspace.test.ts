import { beforeEach, expect, it, vi } from 'vitest';
import { byaanDataInput, byaanDataWorkspaceSchema, byaanFaqChangeInput } from '../shared/byaan-data-workspace';
const m = vi.hoisted(() => ({ pool: vi.fn(), execute: vi.fn(), query: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), destroy: vi.fn() }));
vi.mock('./db/connection', () => ({ getPool: m.pool }));
import { readByaanDataWorkspace } from './integrations/byaan-data-workspace';
import { byaanFaqRevision } from './integrations/byaan-data-values';
beforeEach(() => {
  vi.resetAllMocks(); m.pool.mockResolvedValue({ getConnection: async () => m });
  m.execute.mockResolvedValueOnce([[{ source: 'byaan', active: 1, verifiedAt: '2026-10-01' }]])
    .mockResolvedValueOnce([[{ count: 0 }]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
});
it.each(['trainees', 'faqs', 'site'])('reads empty %s consistently in a read-only snapshot', async kind => {
  const result = await readByaanDataWorkspace(7, 20, { kind });
  expect(result).toMatchObject({ actorId: 7, merchantId: 20, selection: { kind, state: 'all', search: '', page: 1 }, summary: { stored: 0, matched: 0 }, pagination: { page: 1, pages: 0, total: 0 }, rows: [] });
  expect(m.query.mock.calls).toEqual([['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'], ['START TRANSACTION READ ONLY']]);
  expect(m.commit).toHaveBeenCalledOnce(); expect(m.release).toHaveBeenCalledOnce();
});
it.each([{ kind: 'faqs', state: 'archived' }, { kind: 'trainees', state: 'included' }, { kind: 'site', state: 'active' }, { kind: 'wrong' }, { kind: 'faqs', page: 0 }, { kind: 'faqs', page: 1.1 }, { kind: 'faqs', page: 1_000_001 }, { kind: 'faqs', search: 'x'.repeat(101) }, { kind: 'faqs', merchantId: 21 }])('rejects invalid selection %j', input => expect(byaanDataInput.safeParse(input).success).toBe(false));
it.each([null, 1, undefined, {}])('fails on malformed storage result %j', async result => { m.execute.mockReset().mockResolvedValue(result); await expect(readByaanDataWorkspace(7, 20, { kind: 'faqs' })).rejects.toMatchObject({ reason: 'unavailable' }); expect(m.rollback).toHaveBeenCalledOnce(); });
it.each([null, 'invalid', -1, 0.5, '1e3'])('rejects malformed counts %j', async count => {
  m.execute.mockReset().mockResolvedValueOnce([[{ source: 'byaan', active: 1, verifiedAt: 'date' }]]).mockResolvedValueOnce([[{ count }]]);
  await expect(readByaanDataWorkspace(7, 20, { kind: 'faqs' })).rejects.toMatchObject({ reason: 'unavailable' });
});
it('escapes LIKE wildcards literally, binds the search and bounds pages', async () => {
  await readByaanDataWorkspace(7, 20, { kind: 'faqs', search: '  %_!  ', page: 100, state: 'disabled' });
  const [sql, args] = m.execute.mock.calls[3]; expect(sql).toContain("LIKE ? ESCAPE '!'"); expect(sql).not.toContain('%_!');
  expect(args).toEqual([20, '%!%!_!!%', '%!%!_!!%', '%!%!_!!%', 'disabled', 25, 2475]);
});
it('destroys a connection after uncertain commit, never treating it as reusable', async () => {
  m.commit.mockRejectedValue(Error('PRIVATE commit')); await expect(readByaanDataWorkspace(7, 20, { kind: 'site' })).rejects.toMatchObject({ reason: 'unavailable' });
  expect(m.destroy).toHaveBeenCalledOnce(); expect(m.release).not.toHaveBeenCalled(); expect(m.rollback).not.toHaveBeenCalled();
});
it('destroys a connection after rollback failure and redacts SQL', async () => {
  m.execute.mockReset().mockRejectedValue(Error('PRIVATE SQL')); m.rollback.mockRejectedValue(Error('PRIVATE rollback'));
  await expect(readByaanDataWorkspace(7, 20, { kind: 'site' })).rejects.toThrow('byaan_dashboard:unavailable'); expect(m.destroy).toHaveBeenCalledOnce(); expect(m.release).not.toHaveBeenCalled();
});
it('revision changes with tenant, content and both merchant knowledge choices', () => {
  const row = { id: 3, merchantId: 20, question: 'Question', answer: 'Answer', category: null, isActive: 1, useInBot: 1, syncedAt: null };
  const revision = byaanFaqRevision(row);
  for (const patch of [{ merchantId: 21 }, { id: 4 }, { question: 'Changed' }, { answer: 'Changed' }, { category: 'Category' }, { isActive: 0 }, { useInBot: 0 }, { syncedAt: '2026-10-01T00:00:00Z' }]) expect(byaanFaqRevision({ ...row, ...patch })).not.toBe(revision);
  expect(byaanFaqChangeInput.safeParse({ faqId: 3, field: 'is_active', value: true }).success).toBe(false);
});
it('rejects response disagreement in tenant, page count, row kind and state groups', async () => {
  const empty = await readByaanDataWorkspace(7, 20, { kind: 'faqs' });
  for (const patch of [{ summary: { ...empty.summary, matched: 1 } }, { pagination: { ...empty.pagination, page: 2 } }, { summary: { ...empty.summary, groups: [{ key: 'active', count: 0 }] } }]) expect(byaanDataWorkspaceSchema.safeParse({ ...empty, ...patch }).success).toBe(false);
});
