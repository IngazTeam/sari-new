import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock('../db/connection', () => ({ getDb: m.db }));
import { readVerifiedBotSections } from './teaching-read';
beforeEach(() => vi.resetAllMocks());
it.each([false, true])('does not label database unavailability as an empty knowledge snapshot (embeddings=%s)', async embeddings => {
  m.db.mockResolvedValue(null);
  await expect(readVerifiedBotSections(20, embeddings)).rejects.toThrow('Knowledge source unavailable');
});
it('keeps actual empty snapshots readable', async () => {
  const execute = vi.fn().mockResolvedValue([[]]);
  m.db.mockResolvedValue({ transaction: async (read: any) => read({ execute }) });
  expect(await readVerifiedBotSections(20, true)).toEqual([]); expect(execute).toHaveBeenCalledOnce();
});
