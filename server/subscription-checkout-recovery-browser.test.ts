// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import {
  checkoutCheckpointKey,
  checkoutCheckpointSchema,
  readCheckoutCheckpoint,
  prepareCheckoutCheckpoint,
  scopedCheckoutAttempt,
  clearResolvedCheckout,
  withCheckoutLock,
} from "../client/src/lib/subscription-checkout-recovery";
const intent = {
  actorId: 1269,
  merchantId: 269,
  planId: 11,
  cycle: "yearly" as const,
};
const key = checkoutCheckpointKey(intent.actorId, intent.merchantId);
beforeEach(() => {
  window.localStorage.clear();
});
const saved = () => prepareCheckoutCheckpoint(intent, null).checkpoint;
const record = (checkpoint: ReturnType<typeof saved>, state = "completed") => ({
  actorId: 1269,
  merchantId: 269,
  checkoutAttemptId: checkpoint.checkoutAttemptId,
  checkedAt: new Date().toISOString(),
  found: true,
  transactionId: 42,
  state,
  planId: 11,
  billingCycle: "yearly",
  amountMinor: 244000,
  currency: "SAR",
  recordedCheckoutUrl: null,
  linkExpiresAt: null,
});
it("persists only a minimal strict checkpoint before allowing dispatch", () => {
  const prepared = prepareCheckoutCheckpoint(intent, null);
  expect(prepared.canSend).toBe(true);
  expect(readCheckoutCheckpoint(1269, 269)).toEqual({
    kind: "saved",
    checkpoint: prepared.checkpoint,
  });
  expect(Object.keys(prepared.checkpoint).sort()).toEqual(
    [
      "version",
      "actorId",
      "merchantId",
      "checkoutAttemptId",
      "planId",
      "cycle",
      "savedAt",
    ].sort()
  );
});
it("never replaces an unresolved attempt, even after its date is old or another plan is chosen", () => {
  const first = saved();
  first.savedAt = "2000-01-01T00:00:00.000Z";
  window.localStorage.setItem(key, JSON.stringify(first));
  expect(prepareCheckoutCheckpoint({ ...intent, planId: 12 }, null)).toEqual({
    checkpoint: first,
    canSend: false,
  });
  expect(prepareCheckoutCheckpoint(intent, null).canSend).toBe(false);
  expect(prepareCheckoutCheckpoint(intent, first.checkoutAttemptId)).toEqual({
    checkpoint: first,
    canSend: true,
  });
  expect(
    prepareCheckoutCheckpoint(
      { ...intent, cycle: "monthly" },
      first.checkoutAttemptId
    ).canSend
  ).toBe(false);
});
it.each(["{", "null", "[]", "x".repeat(601)])(
  "blocks malformed storage instead of starting a fresh charge: %s",
  raw => {
    window.localStorage.setItem(key, raw);
    expect(readCheckoutCheckpoint(1269, 269).kind).toBe("blocked");
    expect(() => saved()).toThrow();
  }
);
it.each([
  { actorId: 1270 },
  { merchantId: 270 },
  { version: 2 },
  { cycle: "weekly" },
  { extra: "hidden" },
  { planId: 0 },
])("rejects changed checkpoint fields %j", patch => {
  const first = saved();
  window.localStorage.setItem(key, JSON.stringify({ ...first, ...patch }));
  expect(readCheckoutCheckpoint(1269, 269).kind).toBe("blocked");
});
it("isolates the browser checkpoint by both account and merchant", () => {
  saved();
  expect(readCheckoutCheckpoint(1270, 269).kind).toBe("empty");
  expect(readCheckoutCheckpoint(1269, 270).kind).toBe("empty");
});
it("does not grant send permission when storage throws or silently drops writes", () => {
  expect(
    readCheckoutCheckpoint(1269, 269, () => {
      throw Error("denied");
    }).kind
  ).toBe("blocked");
  expect(() =>
    prepareCheckoutCheckpoint(intent, null, () => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }))
  ).toThrow();
  expect(() =>
    prepareCheckoutCheckpoint(intent, null, () => ({
      getItem: () => null,
      setItem: () => {
        throw Error("quota");
      },
      removeItem: () => {},
    }))
  ).toThrow();
});
it("does not regenerate the ID if storage vanished before an explicit same-attempt retry", () => {
  const first = saved();
  window.localStorage.removeItem(key);
  expect(() =>
    prepareCheckoutCheckpoint(intent, first.checkoutAttemptId)
  ).toThrow();
});
it.each(["pending", "unknown"])(
  "will not clear an unresolved %s attempt",
  state => {
    const first = saved();
    expect(() => clearResolvedCheckout(first, record(first, state))).toThrow();
    expect(readCheckoutCheckpoint(1269, 269).kind).toBe("saved");
  }
);
it.each(["completed", "failed", "refunded"])(
  "can clear an explicitly resolved %s attempt",
  state => {
    const first = saved();
    clearResolvedCheckout(first, record(first, state));
    expect(readCheckoutCheckpoint(1269, 269).kind).toBe("empty");
  }
);
it("rejects foreign, stale and inconsistent recovery responses", () => {
  const first = saved(),
    value = record(first);
  for (const patch of [
    { actorId: 2 },
    { merchantId: 2 },
    { checkoutAttemptId: crypto.randomUUID() },
    { found: false },
    { raw: "secret" },
  ]) {
    expect(scopedCheckoutAttempt({ ...value, ...patch }, first)).toBeNull();
    expect(() =>
      clearResolvedCheckout(first, { ...value, ...patch })
    ).toThrow();
  }
  const next = checkoutCheckpointSchema.parse({
    ...first,
    checkoutAttemptId: crypto.randomUUID(),
  });
  window.localStorage.setItem(key, JSON.stringify(next));
  expect(() => clearResolvedCheckout(first, value)).toThrow();
});
it("requires browser locking and serializes competing tab claims to the same checkpoint", async () => {
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: undefined,
  });
  const send = vi.fn();
  await expect(withCheckoutLock(1269, 269, send)).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
  let tail = Promise.resolve();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: (_key: string, action: () => Promise<any>) => {
        const next = tail.then(action);
        tail = next.then(() => {});
        return next;
      },
    },
  });
  const results = await Promise.all(
    [1, 2].map(() =>
      withCheckoutLock(1269, 269, async () =>
        prepareCheckoutCheckpoint(intent, null)
      )
    )
  );
  expect(results.map(r => r.canSend)).toEqual([true, false]);
  expect(results[0].checkpoint).toEqual(results[1].checkpoint);
});
