import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestSariSession } from "../client/src/lib/test-sari-session";
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
let api: {
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  deal: ReturnType<typeof vi.fn>;
  rate: ReturnType<typeof vi.fn>;
  readRating: ReturnType<typeof vi.fn>;
};
let session: TestSariSession;
beforeEach(() => {
  api = {
    create: vi.fn().mockResolvedValue({ conversationId: 41 }),
    save: vi.fn().mockResolvedValue({ messageId: 1 }),
    send: vi.fn().mockResolvedValue({ response: "رد تجريبي" }),
    deal: vi.fn().mockResolvedValue({ dealId: 1, dealValue: 149.5 }),
    rate: vi
      .fn()
      .mockImplementation(async input => ({
        messageId: input.messageId,
        rating: input.rating,
        revision: input.expectedRevision + 1,
        replayed: false,
        superseded: false,
      })),
    readRating: vi
      .fn()
      .mockResolvedValue({ messageId: 1, rating: "negative", revision: 2 }),
  };
  let id = 0;
  session = new TestSariSession(api, () => `request-${++id}`);
});
describe("actual test workspace lifecycle", () => {
  it("waits for feedback acknowledgement and retries the same receipt after a lost reply", async () => {
    await session.start();
    await session.send("hello");
    const id = session.snapshot().messages[1].id;
    api.rate.mockRejectedValueOnce(Error("lost acknowledgement"));
    expect(await session.rate(id, "positive")).toBe(false);
    expect(session.snapshot().messages[1].rating).toBeUndefined();
    expect(session.snapshot().ratingHistory).toEqual([]);
    expect(await session.retry()).toBe(true);
    expect(api.rate.mock.calls[0][0]).toEqual(api.rate.mock.calls[1][0]);
    expect(session.snapshot().messages[1]).toMatchObject({
      rating: "positive",
      ratingRevision: 1,
    });
  });
  it("locks send, deal, reset and another rating while feedback is pending", async () => {
    await session.start();
    await session.send("hello");
    const wait = deferred<any>();
    api.rate.mockReturnValueOnce(wait.promise);
    const id = session.snapshot().messages[1].id,
      pending = session.rate(id, "positive");
    expect(await session.rate(id, "negative")).toBe(false);
    expect(await session.send("other")).toBe(false);
    expect(await session.start()).toBe(false);
    expect(await session.markDeal(10)).toBe(false);
    expect(session.snapshot().messages[1].rating).toBeUndefined();
    wait.resolve({
      messageId: 1,
      rating: "positive",
      revision: 1,
      replayed: false,
      superseded: false,
    });
    await pending;
    expect(session.snapshot().messages[1].rating).toBe("positive");
  });
  it("reads a conflicting rating without applying the stale selection", async () => {
    await session.start();
    await session.send("hello");
    const id = session.snapshot().messages[1].id;
    api.rate.mockRejectedValueOnce({ data: { code: "CONFLICT" } });
    await session.rate(id, "positive");
    expect(session.snapshot().ratingConflict).toBe(true);
    expect(await session.retry()).toBe(false);
    expect(api.rate).toHaveBeenCalledTimes(1);
    expect(await session.reviewRating()).toBe(true);
    expect(session.snapshot().messages[1]).toMatchObject({
      rating: "negative",
      ratingRevision: 2,
    });
    expect(session.snapshot().ratingHistory).toEqual([]);
    await session.rate(id, "positive");
    expect(api.rate.mock.calls[1][0].expectedRevision).toBe(2);
  });
  it("uses the latest state for a superseded receipt without claiming a new saved choice", async () => {
    await session.start();
    await session.send("hello");
    api.rate.mockResolvedValue({
      messageId: 1,
      rating: "negative",
      revision: 3,
      replayed: true,
      superseded: true,
    });
    expect(
      await session.rate(session.snapshot().messages[1].id, "positive")
    ).toBe(false);
    expect(session.snapshot()).toMatchObject({
      ratingSuperseded: true,
      error: null,
      ratingHistory: [],
    });
    expect(session.snapshot().messages[1].rating).toBe("negative");
  });
  it("does not count a guardrail notice as a model rating", async () => {
    api.send.mockResolvedValue({
      response: "simulation only",
      source: "guardrail",
      historyMessageCount: 20,
      historyTruncated: true,
    });
    await session.start();
    await session.send("hello");
    const reply = session.snapshot().messages[1];
    expect(reply).toMatchObject({
      source: "guardrail",
      historyTruncated: true,
    });
    await session.rate(reply.id, "positive");
    expect(session.snapshot().ratingHistory).toEqual([]);
  });
  it("releases the lock when session request identity creation fails", async () => {
    const broken = new TestSariSession(api, () => {
      throw new Error("UUID unavailable");
    });
    expect(await broken.start()).toBe(false);
    expect(broken.snapshot()).toMatchObject({ busy: false, error: "session" });
  });
  it("blocks send before session acknowledgement and locks duplicate starts synchronously", async () => {
    const wait = deferred<{ conversationId: number }>();
    api.create.mockReturnValue(wait.promise);
    const started = session.start();
    expect(await session.start()).toBe(false);
    expect(await session.send("hello")).toBe(false);
    expect(api.create).toHaveBeenCalledTimes(1);
    wait.resolve({ conversationId: 41 });
    await started;
    expect(session.snapshot().conversationId).toBe(41);
  });
  it("retries session creation with the same request ID after a lost acknowledgement", async () => {
    api.create.mockRejectedValueOnce(new Error("lost response"));
    expect(await session.start()).toBe(false);
    expect(session.snapshot().error).toBe("session");
    expect(await session.retry()).toBe(true);
    expect(api.create.mock.calls[0][0]).toEqual(api.create.mock.calls[1][0]);
  });
  it("saves the user before requesting a reply and reuses its ID on retry", async () => {
    await session.start();
    api.save.mockRejectedValueOnce(new Error("offline"));
    expect(await session.send("  hello  ")).toBe(false);
    expect(api.send).not.toHaveBeenCalled();
    expect(session.snapshot().messages).toHaveLength(1);
    await session.retry();
    expect(api.save.mock.calls[0][0]).toEqual(api.save.mock.calls[1][0]);
    expect(api.send).toHaveBeenCalledWith({
      conversationId: 41,
      clientMessageId: api.save.mock.calls[0][0].clientMessageId,
      message: "hello",
    });
    expect(session.snapshot().messages.map(m => m.role)).toEqual([
      "user",
      "assistant",
    ]);
  });
  it("retries saving a received reply without another provider request or duplicate message", async () => {
    await session.start();
    api.save
      .mockResolvedValueOnce({ messageId: 1 })
      .mockRejectedValueOnce(new Error("reply save timeout"));
    await session.send("Hello");
    expect(session.snapshot().error).toBe("saveReply");
    expect(await session.send("Second")).toBe(false);
    await session.retry();
    expect(api.send).toHaveBeenCalledTimes(1);
    expect(api.save.mock.calls[1][0]).toEqual(api.save.mock.calls[2][0]);
    expect(session.snapshot().messages).toHaveLength(2);
  });
  it("blocks reset and duplicate send while a provider response is pending", async () => {
    await session.start();
    const wait = deferred<{ response: string }>();
    api.send.mockReturnValue(wait.promise);
    const send = session.send("one");
    await Promise.resolve();
    expect(await session.start()).toBe(false);
    expect(await session.send("two")).toBe(false);
    wait.resolve({ response: "done" });
    await send;
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(session.snapshot().messages).toHaveLength(2);
  });
  it("announces a deal only after acknowledgement and retries the original amount", async () => {
    await session.start();
    await session.send("hello");
    const wait = deferred<{ dealId: number; dealValue: number }>();
    api.deal.mockReturnValueOnce(wait.promise);
    const deal = session.markDeal(149.5);
    expect(session.snapshot().deal).toBeNull();
    expect(await session.markDeal(200)).toBe(false);
    wait.resolve({ dealId: 2, dealValue: 149.5 });
    await deal;
    expect(session.snapshot().deal).toEqual({ value: 149.5 });
    expect(await session.markDeal(300)).toBe(false);
  });
  it("keeps an uncertain deal pending and reconciles with the same amount", async () => {
    await session.start();
    api.deal.mockRejectedValueOnce(new Error("lost ack"));
    await session.markDeal(149.5);
    expect(session.snapshot().deal).toBeNull();
    await session.retry();
    expect(api.deal.mock.calls[1][0]).toEqual(api.deal.mock.calls[0][0]);
    expect(session.snapshot().deal?.value).toBe(149.5);
  });
  it("preserves the old session on reset failure and clears all session state after success", async () => {
    await session.start();
    await session.send("hello");
    await session.rate(session.snapshot().messages[1].id, "positive");
    await session.markDeal(149.5);
    api.create
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ conversationId: 42 });
    await session.start();
    expect(session.snapshot().deal).not.toBeNull();
    expect(session.snapshot().messages).toHaveLength(2);
    await session.retry();
    expect(session.snapshot()).toMatchObject({
      conversationId: 42,
      messages: [],
      deal: null,
      ratingHistory: [],
      error: null,
    });
  });
  it("records toggled-off ratings as no data, not a fabricated zero score", async () => {
    await session.start();
    await session.send("hello");
    const id = session.snapshot().messages[1].id;
    await session.rate(id, "positive");
    await session.rate(id, "negative");
    await session.rate(id, "negative");
    expect(
      session.snapshot().ratingHistory.map(p => p.satisfactionRate)
    ).toEqual([100, 0, null]);
  });
  it.each([0, -1, NaN, Infinity, 1.001, 10000000000])(
    "rejects invalid deal amount %s without calling the API",
    async value => {
      await session.start();
      expect(await session.markDeal(value)).toBe(false);
      expect(api.deal).not.toHaveBeenCalled();
    }
  );
  it("does not resend a user message when an explicit reply retry is needed", async () => {
    await session.start();
    api.send.mockRejectedValueOnce(new Error("timeout"));
    await session.send("hello");
    expect(session.snapshot().error).toBe("reply");
    await session.retry();
    expect(
      api.save.mock.calls.filter(([input]) => input.sender === "user")
    ).toHaveLength(1);
    expect(api.send).toHaveBeenCalledTimes(2);
  });
  it("blocks forbidden retries without pretending the operation succeeded", async () => {
    api.create.mockRejectedValue({ data: { code: "FORBIDDEN" } });
    await session.start();
    expect(session.snapshot().forbidden).toBe(true);
    expect(await session.retry()).toBe(false);
    expect(api.create).toHaveBeenCalledTimes(1);
  });
});
