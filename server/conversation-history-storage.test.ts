import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("./db/connection", () => ({ getDb: m.db }));
import { readConversationHistory } from "./conversation-history";
beforeEach(() => vi.resetAllMocks());
it.each([0, -1, 1.2, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "rejects invalid tenant %s before reading",
  async id => {
    await expect(
      readConversationHistory(id, { conversationId: 1 })
    ).rejects.toThrow("Invalid history context");
    expect(m.db).not.toHaveBeenCalled();
  }
);
it("rejects missing storage instead of claiming an empty conversation", async () => {
  m.db.mockResolvedValue(null);
  await expect(
    readConversationHistory(1, { conversationId: 1 })
  ).rejects.toThrow("Conversation history unavailable");
});
it("propagates snapshot failure", async () => {
  const transaction = vi.fn().mockRejectedValue(Error("read failed"));
  m.db.mockResolvedValue({ transaction });
  await expect(
    readConversationHistory(1, { conversationId: 1 })
  ).rejects.toThrow("read failed");
  expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
});
