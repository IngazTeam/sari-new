import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./conversation-history", async original => ({
  ...(await original<typeof import("./conversation-history")>()),
  readConversationHistory: m.read,
}));
import { router } from "./_core/trpc";
import { conversationHistoryProcedures } from "./routers-conversation-history";
import { ConversationHistoryNotFound } from "./conversation-history";
const routes = router(conversationHistoryProcedures);
const caller = (user: any = { id: 7, role: "user" }) =>
  routes.createCaller({
    user,
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "viewer", memberId: 2 });
  m.read.mockResolvedValue({
    items: [{ id: 3 }],
    merchantId: 20,
    conversationId: 4,
    hasMore: true,
    nextBeforeId: 3,
  });
});
describe("conversation history boundary", () => {
  it.each(["owner", "manager", "viewer", "sales_supervisor"])(
    "reads verified tenant for %s",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 2 });
      expect(
        await caller().messageHistory({ conversationId: 4, beforeId: 80 })
      ).toMatchObject({ merchantId: 20, hasMore: true, nextBeforeId: 3 });
      expect(m.read).toHaveBeenCalledWith(20, {
        conversationId: 4,
        beforeId: 80,
        limit: 50,
      });
    }
  );
  it("preserves the legacy array shape with the most recent 500 records", async () => {
    expect(await caller().getMessages({ conversationId: 4 })).toEqual([
      { id: 3 },
    ]);
    expect(m.read).toHaveBeenCalledWith(20, { conversationId: 4, limit: 500 });
  });
  it.each([
    { conversationId: 0 },
    { conversationId: -1 },
    { conversationId: 1.2 },
    { conversationId: 4, beforeId: 0 },
    { conversationId: 4, limit: 501 },
    { conversationId: 4, limit: 1.1 },
    { conversationId: 4, merchantId: 999 },
    { conversationId: 4, cursor: "forged" },
  ])("rejects invalid input %j before reading", async input => {
    await expect(caller().messageHistory(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each([
    { conversationId: 0 },
    { conversationId: 1.2 },
    { conversationId: 4, merchantId: 999 },
  ])("validates legacy input %j", async input => {
    await expect(caller().getMessages(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("rejects missing authentication and revoked membership before data access", async () => {
    await expect(
      caller(null).messageHistory({ conversationId: 4 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    m.access.mockResolvedValue(null);
    await expect(
      caller().messageHistory({ conversationId: 4 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("returns the same safe error for foreign and absent history", async () => {
    m.read.mockRejectedValue(new ConversationHistoryNotFound());
    await expect(
      caller().getMessages({ conversationId: 4 })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Conversation history unavailable",
    });
    await expect(
      caller().messageHistory({ conversationId: 4 })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Conversation history unavailable",
    });
  });
  it("does not leak SQL or turn failure into an empty history", async () => {
    m.read.mockRejectedValue(Error("private SQL failure"));
    await expect(
      caller().messageHistory({ conversationId: 4 })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Conversation history unavailable",
    });
  });
});
