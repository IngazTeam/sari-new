import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("./db/connection", () => ({
  getDb: m.db,
  formatDateForDB: (date: Date) =>
    date.toISOString().slice(0, 19).replace("T", " "),
}));
import { readConversationInbox } from "./conversation-inbox";
beforeEach(() => vi.resetAllMocks());
it.each([0, -1, 1.1, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "rejects invalid merchant %s before accessing storage",
  async id => {
    await expect(readConversationInbox(id)).rejects.toThrow(
      "Invalid inbox context"
    );
    expect(m.db).not.toHaveBeenCalled();
  }
);
it("rejects an invalid clock before accessing storage", async () => {
  await expect(readConversationInbox(1, {}, new Date("bad"))).rejects.toThrow(
    "Invalid inbox context"
  );
  expect(m.db).not.toHaveBeenCalled();
});
it.each([{}, { search: "test" }, { needsHuman: true }])(
  "fails visibly when storage is missing for %j",
  async input => {
    m.db.mockResolvedValue(null);
    await expect(readConversationInbox(1, input)).rejects.toThrow(
      "Conversation data is temporarily unavailable"
    );
  }
);
it("does not fall back to an empty list when the transaction fails", async () => {
  const transaction = vi.fn().mockRejectedValue(Error("read failed"));
  m.db.mockResolvedValue({ transaction });
  await expect(readConversationInbox(1)).rejects.toThrow("read failed");
  expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
});
