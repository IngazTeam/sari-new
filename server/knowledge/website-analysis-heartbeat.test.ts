import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ advance: vi.fn() }));
vi.mock("./website-analysis-jobs", () => ({
  advanceWebsiteAnalysisJob: m.advance,
}));
import { startWebsiteAnalysisHeartbeat } from "./website-analysis-execution";
const scope = { merchantId: 1, jobId: randomUUID(), token: randomUUID() };
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  m.advance.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
it("renews only at the interval and stops cleanly", async () => {
  const stop = startWebsiteAnalysisHeartbeat(scope);
  await vi.advanceTimersByTimeAsync(29_999);
  expect(m.advance).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(m.advance).toHaveBeenCalledExactlyOnceWith(scope);
  await stop();
  await vi.advanceTimersByTimeAsync(90_000);
  expect(m.advance).toHaveBeenCalledOnce();
});
it("does not overlap slow renewals and waits for one pending renewal on stop", async () => {
  let finish!: () => void;
  m.advance.mockImplementation(
    () => new Promise<void>(resolve => (finish = resolve))
  );
  const stop = startWebsiteAnalysisHeartbeat(scope);
  await vi.advanceTimersByTimeAsync(90_000);
  expect(m.advance).toHaveBeenCalledOnce();
  let stopped = false;
  const pending = stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(false);
  finish();
  await pending;
  expect(stopped).toBe(true);
});
it("stops after a renewal failure without blindly retrying the execution", async () => {
  m.advance.mockRejectedValue(Error("unavailable"));
  const stop = startWebsiteAnalysisHeartbeat(scope);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(m.advance).toHaveBeenCalledOnce();
  await stop();
});
