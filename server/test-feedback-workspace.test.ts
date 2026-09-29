import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  rate: vi.fn(),
  feedback: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./test-feedback-workspace", () => ({
  listSavedTestSessions: m.list,
  readSavedTestTranscript: m.read,
  saveTestFeedback: m.rate,
  readTestFeedback: m.feedback,
}));
import { testSariRouter } from "./routers-test-sari";
const caller = (user: any = { id: 7, role: "user" }) =>
  testSariRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
const input = {
  conversationId: 3,
  messageId: 4,
  requestId: "11111111-1111-4111-8111-111111111111",
  expectedRevision: 0,
  rating: "positive" as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
});
describe("test transcript and feedback access", () => {
  it("uses the verified tenant and reviewer for every operation", async () => {
    await caller().listSessions({});
    await caller().transcript({ conversationId: 3 });
    await caller().rateReply(input);
    await caller().feedback({ conversationId: 3, messageId: 4 });
    expect(m.list).toHaveBeenCalledWith(20, { limit: 20 });
    expect(m.read).toHaveBeenCalledWith(20, { conversationId: 3, limit: 20 });
    expect(m.rate).toHaveBeenCalledWith(20, 7, input);
    expect(m.feedback).toHaveBeenCalledWith(20, {
      conversationId: 3,
      messageId: 4,
    });
  });
  it.each(["viewer", "sales_supervisor"])(
    "allows %s to read but not rate",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role });
      await caller().listSessions({});
      await caller().transcript({ conversationId: 3 });
      await expect(caller().rateReply(input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(m.rate).not.toHaveBeenCalled();
    }
  );
  it("rejects sessionless and foreign membership access", async () => {
    await expect(caller(null).listSessions({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    m.access.mockResolvedValue(null);
    await expect(
      caller().transcript({ conversationId: 3 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.list).not.toHaveBeenCalled();
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each([{ limit: 0 }, { limit: 51 }, { beforeId: -1 }, { merchantId: 99 }])(
    "bounds list input %j",
    async value => {
      await expect(caller().listSessions(value as any)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(m.list).not.toHaveBeenCalled();
    }
  );
  it.each([
    { messageId: 0 },
    { requestId: "bad" },
    { expectedRevision: -1 },
    { rating: "five" },
    { reviewerId: 99 },
    { merchantId: 99 },
  ])("rejects forged feedback %j", async patch => {
    await expect(
      caller().rateReply({ ...input, ...patch } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.rate).not.toHaveBeenCalled();
  });
  it("hides source details on failed reads and writes", async () => {
    m.read.mockRejectedValue(Error("SQL confidential"));
    m.rate.mockRejectedValue(Error("SQL confidential"));
    for (const op of [
      () => caller().transcript({ conversationId: 3 }),
      () => caller().rateReply(input),
    ]) {
      try {
        await op();
        throw Error("unexpected success");
      } catch (error) {
        expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
        expect(String(error)).not.toContain("confidential");
      }
    }
  });
});
