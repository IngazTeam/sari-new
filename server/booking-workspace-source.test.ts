import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ db: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock('./db/connection', () => ({ getDb: m.db }));
import { readBookingWorkspace, readBookingDetails } from './booking-workspace';
beforeEach(() => { vi.resetAllMocks(); m.db.mockResolvedValue({ transaction: m.transaction }); m.transaction.mockImplementation(async callback => callback({ execute: m.execute })); });
describe('booking workspace storage failures', () => {
  for (const detail of [false, true]) {
    const read = () => detail ? readBookingDetails(7, 20, { bookingId: 31 }) : readBookingWorkspace(7, 20, {});
    it(`does not turn unavailable storage into an empty ${detail ? 'detail' : 'list'}`, async () => {
      m.db.mockResolvedValue(null); await expect(read()).rejects.toThrow('Booking data unavailable');
      m.db.mockRejectedValue(Error('private connection string')); await expect(read()).rejects.toThrow('Booking data unavailable');
    });
    it.each([undefined, {}, [[]], [[{ id: 21 }]]])(`rejects malformed scope rows ${detail} %j`, async result => { m.execute.mockResolvedValue(result); await expect(read()).rejects.toThrow('Booking data unavailable'); });
    it(`redacts failure inside the transaction ${detail}`, async () => { m.execute.mockResolvedValueOnce([[{ id: 20 }]]).mockRejectedValueOnce(Error('private SQL')); await expect(read()).rejects.toThrow('Booking data unavailable'); expect(m.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'repeatable read', accessMode: 'read only' }); });
  }
});
