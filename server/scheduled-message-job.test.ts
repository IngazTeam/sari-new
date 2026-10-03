import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), prepare: vi.fn(), schema: vi.fn(), pool: vi.fn() }));
vi.mock('./db/connection', () => ({ getPool: mocks.pool }));
vi.mock('./scheduled-message-authorization', () => ({ ensureScheduledAuthoritySchema: mocks.schema }));
vi.mock('./scheduled-message-preparation', () => ({ prepareScheduledMessage: mocks.prepare }));
import { checkScheduledMessages } from './jobs/scheduled-messages';
beforeEach(() => { vi.resetAllMocks(); mocks.pool.mockResolvedValue({ execute: mocks.execute }); mocks.schema.mockResolvedValue(undefined); mocks.prepare.mockResolvedValue('prepared'); });
it('prepares all keyset pages without converting prepared campaigns into sent counts', async () => {
  const rows = Array.from({ length: 205 }, (_, i) => ({ id: i + 1, merchant_id: 1000 + i }));
  mocks.execute.mockImplementation(async (_sql, [cursor]) => [rows.filter(r => r.id > cursor).slice(0, 100)]);
  expect(await checkScheduledMessages()).toEqual({ checked: 205, prepared: 205, skipped: 0, failed: 0 });
  expect(mocks.execute.mock.calls.map(([, args]) => args[0])).toEqual([0, 100, 200, 205]);
  expect(mocks.prepare).toHaveBeenLastCalledWith(1204, 205);
});
it('isolates one preparation failure and continues later tenants without exposing definitions in logs', async () => {
  mocks.execute.mockResolvedValueOnce([[{ id: 1, merchant_id: 10 }, { id: 2, merchant_id: 20 }, { id: 3, merchant_id: 30 }]]).mockResolvedValueOnce([[]]);
  mocks.prepare.mockRejectedValueOnce(Error('PRIVATE')).mockResolvedValueOnce('skipped').mockResolvedValueOnce('prepared');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try { expect(await checkScheduledMessages()).toEqual({ checked: 3, prepared: 1, skipped: 1, failed: 1 }); expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE'); } finally { log.mockRestore(); }
});
it('surfaces a schema or database outage instead of reporting an empty successful check', async () => {
  mocks.schema.mockRejectedValueOnce(Error('Schema unavailable')); await expect(checkScheduledMessages()).rejects.toThrow('Schema unavailable'); expect(mocks.prepare).not.toHaveBeenCalled();
  mocks.pool.mockResolvedValueOnce(null); await expect(checkScheduledMessages()).rejects.toThrow('unavailable');
});
it('retires the global-channel worker and its legacy sent timestamp updater', () => {
  const worker = readFileSync('server/jobs/scheduled-messages.ts', 'utf8'), db = readFileSync('server/db.ts', 'utf8');
  expect(worker).not.toMatch(/sendCampaign|sendTextMessage|lastSentAt|getConversationsByMerchantId/);
  expect(db).not.toMatch(/export async function (getScheduledMessagesToSend|updateScheduledMessageLastSent)/);
});
