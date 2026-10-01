import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  pool: vi.fn(),
  execute: vi.fn(),
  loss: vi.fn(),
  identity: vi.fn(),
}));
vi.mock("../db", () => ({ getPool: mocks.pool }));
vi.mock("./contextual-sales-loss", () => ({
  recordContextualSalesLoss: mocks.loss,
}));
vi.mock("./conversation-understanding-context", () => ({
  conversationUnderstandingIdentity: mocks.identity,
}));
import { DEAL_STAGE_MAP, updateDealStage } from "./deal-stage";
const identity = { merchantId: 20, conversationId: 31, incomingMessageId: 47 };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.pool.mockResolvedValue({ execute: mocks.execute });
  mocks.execute.mockResolvedValue([[{ deal_stage: "new" }], []]);
  mocks.identity.mockReturnValue(identity);
});
afterEach(() => vi.restoreAllMocks());
const expectNoWrite = () => {
  expect(mocks.pool).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.loss).not.toHaveBeenCalled();
};
describe("deal stage evidence boundary", () => {
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined])(
    "rejects invalid store and conversation identities: %s",
    async (id) => {
      await updateDealStage(31, "ready_to_buy", id as number);
      await updateDealStage(id as number, "ready_to_buy", 20);
      expectNoWrite();
    },
  );
  it.each([...Object.keys(DEAL_STAGE_MAP), "declined", "post_purchase"])(
    "never mutates a preview: %s",
    async (intent) => {
      mocks.identity.mockReturnValue({ ...identity, mode: "preview" });
      await updateDealStage(31, intent, 20, "555000");
      expectNoWrite();
    },
  );
  it.each([{ merchantId: 21 }, { conversationId: 32 }])(
    "rejects another understanding scope: %j",
    async (mismatch) => {
      mocks.identity.mockReturnValue({ ...identity, ...mismatch });
      await updateDealStage(31, "ready_to_buy", 20);
      await updateDealStage(31, "declined", 20, "555000");
      expectNoWrite();
    },
  );
  it.each([
    "post_purchase",
    "paid",
    "purchased",
    "unknown",
    "__proto__",
    "constructor",
  ])(
    "does not infer a financial outcome or accept a prototype key: %s",
    async (intent) => {
      await updateDealStage(31, intent, 20);
      expectNoWrite();
    },
  );
  it("progresses only the selected tenant conversation at the version read", async () => {
    await updateDealStage(31, "ready_to_buy", 20);
    expect(mocks.execute.mock.calls).toEqual([
      [
        "SELECT deal_stage FROM conversations WHERE id = ? AND merchantId = ? LIMIT 1",
        [31, 20],
      ],
      [
        "UPDATE conversations SET deal_stage = ?,loss_reason=NULL,stalled_since=NULL WHERE id = ? AND merchantId = ? AND deal_stage <=> ?",
        ["ready", 31, 20, "new"],
      ],
    ]);
    expect(mocks.loss).not.toHaveBeenCalled();
  });
  it("never fabricates a row when the scoped conversation is missing", async () => {
    mocks.execute.mockResolvedValue([[], []]);
    await updateDealStage(31, "ready_to_buy", 20);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it.each(["paid", "purchased"])(
    "protects verified %s even from returning intent",
    async (deal_stage) => {
      mocks.execute.mockResolvedValue([[{ deal_stage }], []]);
      await updateDealStage(31, "returning", 20);
      expect(mocks.execute).toHaveBeenCalledTimes(1);
    },
  );
  it("does not move existing interest backwards", async () => {
    mocks.execute.mockResolvedValue([[{ deal_stage: "qualified" }], []]);
    await updateDealStage(31, "inquiring", 20);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it("compares null legacy stages without overwriting a concurrent change", async () => {
    mocks.execute.mockResolvedValue([[{ deal_stage: null }], []]);
    await updateDealStage(31, "inquiring", 20);
    expect(mocks.execute.mock.calls[1][1]).toEqual([
      "interested",
      31,
      20,
      null,
    ]);
  });
  it("requires the original understanding and phone for a decline", async () => {
    await updateDealStage(31, "declined", 20);
    mocks.identity.mockReturnValue(undefined);
    await updateDealStage(31, "declined", 20, "555000");
    expectNoWrite();
  });
  it("delegates declines to the evidence projection with the original source identity", async () => {
    await updateDealStage(31, "declined", 20, "555000");
    expect(mocks.loss).toHaveBeenCalledExactlyOnceWith({
      ...identity,
      customerPhone: "555000",
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("contains storage errors without exposing customer or SQL details", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.execute.mockRejectedValue(
      new Error("private phone and database credentials"),
    );
    mocks.loss.mockRejectedValue(
      new Error("private phone and database credentials"),
    );
    await updateDealStage(31, "inquiring", 20);
    await updateDealStage(31, "declined", 20, "555000");
    expect(warn.mock.calls).toEqual([
      ["[DealStage] Update deferred"],
      ["[DealStage] Decline projection deferred"],
    ]);
  });
});
