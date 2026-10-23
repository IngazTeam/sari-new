import { afterEach, describe, expect, it, vi } from 'vitest';
import { inboundConcurrency, startInboundPump } from './inbound-pump';
const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};
afterEach(() => vi.useRealTimers());
describe('bounded inbound execution', () => {
  it.each(['0', '5', '-1', '2junk', '1.5', ''])('rejects unsafe concurrency %j', value => {
    expect(() => inboundConcurrency(value)).toThrow('between 1 and 4');
  });
  it('runs another conversation while a slow one waits, without exceeding capacity, then drains both', async () => {
    vi.useFakeTimers();
    const jobs = [1, 2, 3]; const releases = [deferred(), deferred(), deferred()];
    const run = vi.fn((id: number) => releases[id - 1].promise);
    const stop = startInboundPump({ concurrency: 2, maintain: async () => {}, claim: async () => jobs.shift() ?? null, run, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(1500);
    expect(run.mock.calls).toEqual([[1], [2]]);
    releases[1].resolve(); await vi.advanceTimersByTimeAsync(500);
    expect(run.mock.calls).toEqual([[1], [2], [3]]);
    let stopped = false; const drain = stop().then(() => { stopped = true; });
    releases[0].resolve(); await vi.advanceTimersByTimeAsync(1000); expect(stopped).toBe(false);
    releases[2].resolve(); await drain; expect(stopped).toBe(true);
  });
  it('drains a claim that finishes during shutdown and does not claim again', async () => {
    vi.useFakeTimers(); const claimResult = deferred<number>(); const finish = deferred();
    const claim = vi.fn(() => claimResult.promise); const run = vi.fn(() => finish.promise);
    const stop = startInboundPump({ concurrency: 2, maintain: async () => {}, claim, run, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(0); const drain = stop(); claimResult.resolve(1);
    await vi.advanceTimersByTimeAsync(1000); expect(run).toHaveBeenCalledWith(1); expect(claim).toHaveBeenCalledOnce();
    finish.resolve(); await drain;
  });
  it('recovers polling after an error and never overlaps maintenance or claims', async () => {
    vi.useFakeTimers(); const first = deferred(); const onError = vi.fn();
    const maintain = vi.fn().mockImplementationOnce(() => first.promise).mockRejectedValueOnce(Error('unavailable')).mockResolvedValue(undefined);
    const claim = vi.fn().mockResolvedValue(null);
    const stop = startInboundPump({ concurrency: 2, maintain, claim, run: vi.fn(), onError });
    await vi.advanceTimersByTimeAsync(2000); expect(maintain).toHaveBeenCalledOnce(); expect(claim).not.toHaveBeenCalled();
    first.resolve(); await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledOnce(); expect(claim).toHaveBeenCalledTimes(2); await stop();
  });
  it('releases capacity after a processor failure without rerunning the failed claim', async () => {
    vi.useFakeTimers(); const jobs = [1, 2]; const onError = vi.fn();
    const run = vi.fn().mockRejectedValueOnce(Error('failed')).mockResolvedValue(undefined);
    const stop = startInboundPump({ concurrency: 1, maintain: async () => {}, claim: async () => jobs.shift() ?? null, run, onError });
    await vi.advanceTimersByTimeAsync(1000); await stop();
    expect(run.mock.calls).toEqual([[1], [2]]); expect(onError).toHaveBeenCalledOnce();
  });
});
