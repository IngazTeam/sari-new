import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const pool = vi.hoisted(() => ({ get: vi.fn(), connect: vi.fn(), begin: vi.fn(), execute: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }));
vi.mock('../db/connection', () => ({ getPool: pool.get }));
import { startIntakeHeartbeat } from './intake-execution';
const scope = { merchantId: 1, requestId: 'request', token: 'token' };
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); pool.get.mockResolvedValue({ getConnection: pool.connect });
  pool.connect.mockResolvedValue({ beginTransaction: pool.begin, execute: pool.execute, commit: pool.commit, rollback: pool.rollback, release: pool.release });
  pool.execute.mockResolvedValue([[{ id: 1 }]]);
});
afterEach(() => vi.useRealTimers());
it('renews periodically and cancels every future renewal on completion', async () => {
  const stop = startIntakeHeartbeat(scope);
  await vi.advanceTimersByTimeAsync(29_999); expect(pool.connect).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(pool.connect).toHaveBeenCalledTimes(1); expect(pool.commit).toHaveBeenCalledTimes(1); expect(pool.release).toHaveBeenCalledTimes(1);
  await stop(); await vi.advanceTimersByTimeAsync(90_000); expect(pool.connect).toHaveBeenCalledTimes(1);
});
it('stops after a failed renewal without reviving the lease', async () => {
  pool.execute.mockRejectedValueOnce(Error('connection interrupted'));
  const stop = startIntakeHeartbeat(scope); await vi.advanceTimersByTimeAsync(120_000); await stop();
  expect(pool.connect).toHaveBeenCalledTimes(1); expect(pool.rollback).toHaveBeenCalledTimes(1); expect(pool.commit).not.toHaveBeenCalled(); expect(pool.release).toHaveBeenCalledTimes(1);
});
it('does not overlap renewals and waits for the active renewal when stopping', async () => {
  let resolve!: (value: any) => void;
  pool.execute.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const stop = startIntakeHeartbeat(scope); await vi.advanceTimersByTimeAsync(90_000); expect(pool.connect).toHaveBeenCalledTimes(1);
  let stopped = false; const stopping = stop().then(() => { stopped = true; }); await Promise.resolve(); expect(stopped).toBe(false);
  resolve([[{ id: 1 }]]); await stopping; expect(stopped).toBe(true); expect(pool.release).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(90_000); expect(pool.connect).toHaveBeenCalledTimes(1);
});
