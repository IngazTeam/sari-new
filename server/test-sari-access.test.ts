import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  create: vi.fn(),
  read: vi.fn(),
  turn: vi.fn(),
  save: vi.fn(),
  deal: vi.fn(),
  rate: vi.fn(),
  chat: vi.fn(),
  db: vi.fn(),
  metrics: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./test-sari-store", async original => ({
  ...(await original<typeof import("./test-sari-store")>()),
  createTestSession: mocks.create,
  readTestSession: mocks.read,
  readTestTurn: mocks.turn,
  saveOwnedTestMessage: mocks.save,
  saveOwnedTestDeal: mocks.deal,
}));
vi.mock("./_core/rateLimiter", () => ({ checkRateLimit: mocks.rate }));
vi.mock("./ai/sari-preview", () => ({ previewSari: mocks.chat }));
vi.mock("./db/connection", () => ({ getDb: mocks.db }));
vi.mock("./metrics", () => ({ calculateAllMetrics: mocks.metrics }));
import { testSariRouter } from "./routers-test-sari";
import { TestWorkspaceError } from "./test-sari-store";
const caller = (user: any = { id: 7, role: "user" }) =>
  testSariRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
const uuid = "11111111-1111-4111-8111-111111111111";
const message = {
  conversationId: 4,
  clientMessageId: uuid,
  sender: "user" as const,
  content: "hello",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  mocks.create.mockResolvedValue({ conversationId: 4 });
  mocks.read.mockResolvedValue({
    conversationId: 4,
    messageCount: 0,
    deal: null,
  });
  mocks.save.mockResolvedValue({ messageId: 1 });
  mocks.deal.mockResolvedValue({ dealId: 1, dealValue: 149.5 });
  mocks.rate.mockReturnValue({ allowed: true });
  mocks.chat.mockResolvedValue({
    response: "reply",
    source: "model",
    historyMessageCount: 1,
    historyTruncated: false,
  });
  mocks.turn.mockResolvedValue({
    history: [{ role: "user", content: "prior question" }],
    historyTruncated: false,
  });
  mocks.db.mockResolvedValue({});
  mocks.metrics.mockResolvedValue({ conversion: { totalRevenue: 149.5 } });
});
describe("test workspace API security boundaries", () => {
  it("registers the canonical router in the actual app rather than a duplicate inline router", () => {
    const app = readFileSync("server/routers.ts", "utf8");
    expect(app).toContain("testSari: testSariRouter");
    expect(app).not.toContain("testSari: router(");
  });
  it("uses the verified selected tenant for every operation", async () => {
    await caller().createConversation({ requestId: uuid });
    await caller().saveMessage(message);
    await caller().markAsDeal({ conversationId: 4, dealValue: 149.5 });
    await caller().getConversation({ conversationId: 4 });
    await caller().getMetrics({ period: "day" });
    expect(mocks.access).toHaveBeenCalledWith(7, 20);
    expect(mocks.create).toHaveBeenCalledWith(20, { requestId: uuid });
    expect(mocks.save).toHaveBeenCalledWith(20, message);
    expect(mocks.deal).toHaveBeenCalledWith(20, {
      conversationId: 4,
      dealValue: 149.5,
    });
    expect(mocks.read).toHaveBeenCalledWith(20, 4);
    expect(mocks.metrics).toHaveBeenCalledWith(20, "day");
  });
  it("rejects unauthenticated access before reading or writing", async () => {
    await expect(
      caller(null).createConversation({ requestId: uuid })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["owner", "manager", "sales_supervisor", "viewer"])(
    "scopes legacy metric reads by analytics membership for %s",
    async role => {
      mocks.access.mockResolvedValue({ merchantId: 20, role });
      await caller().getMetrics({});
      expect(mocks.metrics).toHaveBeenCalledWith(20, "day");
    }
  );
  it.each([
    { period: "all" },
    { period: "90d" },
    { merchantId: 99 },
    { from: "2026-01-01" },
  ])("rejects forged legacy metrics input %j", async input => {
    await expect(caller().getMetrics(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.metrics).not.toHaveBeenCalled();
  });
  it("denies legacy metrics without a session or selected-tenant membership", async () => {
    await expect(caller(null).getMetrics({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    mocks.access.mockResolvedValue(null);
    await expect(caller().getMetrics({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.metrics).not.toHaveBeenCalled();
  });
  it.each(["viewer", "agent", "sales_supervisor"])(
    "blocks writes by %s",
    async role => {
      mocks.access.mockResolvedValue({ merchantId: 20, role });
      for (const work of [
        () => caller().createConversation({ requestId: uuid }),
        () => caller().resetConversation({ requestId: uuid }),
        () => caller().saveMessage(message),
        () => caller().markAsDeal({ conversationId: 4, dealValue: 149.5 }),
        () =>
          caller().sendMessage({
            conversationId: 4,
            clientMessageId: uuid,
            message: "hello",
          }),
      ])
        await expect(work()).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.save).not.toHaveBeenCalled();
      expect(mocks.deal).not.toHaveBeenCalled();
      expect(mocks.chat).not.toHaveBeenCalled();
    }
  );
  it("verifies ownership before the provider request and never passes test-table IDs as production IDs", async () => {
    mocks.turn.mockRejectedValueOnce(new TestWorkspaceError("NOT_FOUND"));
    await expect(
      caller().sendMessage({
        conversationId: 888,
        clientMessageId: uuid,
        message: "hello",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.chat).not.toHaveBeenCalled();
    await caller().sendMessage({
      conversationId: 4,
      clientMessageId: uuid,
      message: "hello",
    });
    expect(mocks.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 20,
        userId: 7,
        message: "hello",
        history: [{ role: "user", content: "prior question" }],
      })
    );
    expect(mocks.chat.mock.calls[0][0]).not.toHaveProperty("conversationId");
  });
  it("enforces the rate limit before calling the provider", async () => {
    mocks.rate.mockReturnValue({ allowed: false });
    await expect(
      caller().sendMessage({
        conversationId: 4,
        clientMessageId: uuid,
        message: "hello",
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(mocks.chat).not.toHaveBeenCalled();
  });
  it("fails closed when persistence or metrics cannot be confirmed, without exposing SQL", async () => {
    mocks.save.mockRejectedValue(new Error("SQL password confidential"));
    await expect(caller().saveMessage(message)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    try {
      await caller().saveMessage(message);
    } catch (error) {
      expect(String(error)).not.toContain("confidential");
    }
    mocks.metrics.mockRejectedValue(new Error("SQL confidential"));
    await expect(caller().getMetrics({ period: "day" })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    try {
      await caller().getMetrics({ period: "day" });
    } catch (error) {
      expect(String(error)).not.toContain("confidential");
    }
  });
  it.each([
    { conversationId: 0 },
    { conversationId: 1.5 },
    { clientMessageId: "bad" },
    { content: " " },
    { content: "x".repeat(5001) },
    { responseTime: -1 },
  ])("rejects invalid message %# before database access", async patch => {
    await expect(
      caller().saveMessage({ ...message, ...patch })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([
    { conversationId: undefined, dealValue: 1 },
    { conversationId: 4, dealValue: 1.001 },
    { conversationId: 4, dealValue: Infinity },
    { conversationId: 4, dealValue: 5, messageCount: 999 },
    { conversationId: 4, dealValue: 5, merchantId: 99 },
  ])("rejects forged or imprecise deal fields %#", async input => {
    await expect(caller().markAsDeal(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.deal).not.toHaveBeenCalled();
  });
  it("does not accept empty, oversized or client-supplied conversation history", async () => {
    for (const input of [
      { conversationId: 4, clientMessageId: uuid, message: "" },
      { conversationId: 4, clientMessageId: uuid, message: "x".repeat(2001) },
      {
        conversationId: 4,
        clientMessageId: uuid,
        message: "hello",
        conversationHistory: [],
      },
    ])
      await expect(caller().sendMessage(input as any)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    expect(mocks.chat).not.toHaveBeenCalled();
  });
});
