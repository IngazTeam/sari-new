import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ db: vi.fn(), transaction: vi.fn(), destroy: vi.fn(), remove: vi.fn(), update: vi.fn() }));
vi.mock('../db/connection', () => ({ getDb: mocks.db }));
vi.mock('../ai/session-context', () => ({ destroyMerchantSessions: mocks.destroy }));
import { withKnowledgeTransaction } from './transaction';
const deadlock = () => Object.assign(new Error('query failed'), { cause: { code: 'ER_LOCK_DEADLOCK' } });
const tx = {
  select: () => ({ from: () => ({ where: () => ({ for: async () => [{ id: 20 }] }) }) }),
  delete: () => ({ where: mocks.remove }),
  update: () => ({ set: () => ({ where: mocks.update }) }),
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.mockResolvedValue({ transaction: mocks.transaction });
  mocks.transaction.mockImplementation(async callback => callback(tx));
});
it('retries only a deadlock rolled back by the database, evicting memory once after commit', async () => {
  mocks.update.mockRejectedValueOnce(deadlock()).mockResolvedValue(undefined);
  const write = vi.fn().mockResolvedValue({ deleted: 2 });
  expect(await withKnowledgeTransaction(20, write)).toEqual({ deleted: 2 });
  expect(write).toHaveBeenCalledTimes(2);
  expect(mocks.remove).toHaveBeenCalledTimes(2);
  expect(mocks.destroy).toHaveBeenCalledExactlyOnceWith(20);
});
it('bounds deadlock retries and does not evict memory on failed commit', async () => {
  mocks.update.mockRejectedValue(deadlock());
  await expect(withKnowledgeTransaction(20, async () => 1)).rejects.toThrow('query failed');
  expect(mocks.transaction).toHaveBeenCalledTimes(3);
  expect(mocks.destroy).not.toHaveBeenCalled();
});
it.each(['ER_CHECK_CONSTRAINT_VIOLATED', 'PROTOCOL_CONNECTION_LOST', 'ER_LOCK_WAIT_TIMEOUT'])('never retries %s or an uncertain commit outcome', async code => {
  mocks.transaction.mockRejectedValue(Object.assign(new Error('failed'), { code }));
  await expect(withKnowledgeTransaction(20, async () => 1)).rejects.toThrow('failed');
  expect(mocks.transaction).toHaveBeenCalledOnce();
  expect(mocks.destroy).not.toHaveBeenCalled();
});
it('fails closed before writes on invalid identity or database unavailability', async () => {
  const write = vi.fn();
  await expect(withKnowledgeTransaction(0, write)).rejects.toThrow('Invalid merchant');
  expect(mocks.db).not.toHaveBeenCalled();
  mocks.db.mockResolvedValue(null);
  await expect(withKnowledgeTransaction(20, write)).rejects.toThrow('Database unavailable');
  expect(write).not.toHaveBeenCalled();
});
