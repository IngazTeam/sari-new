// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TestSariSession,
  loadedTestFeedback,
} from "../client/src/lib/test-sari-session";
import {
  readTestSessionReference,
  rememberTestSessionReference,
} from "../client/src/lib/test-session-reference";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
import type { SavedTestTranscript } from "../shared/test-feedback-workspace";
const message = (id: number) => ({
  id,
  clientMessageId: null,
  sender: "sari" as const,
  content: `reply ${id}`,
  sentAt: "2026-09-29T00:00:00Z",
  replySource: "model" as const,
  responseTime: 100,
  rating: "positive" as const,
  ratingRevision: 3,
  ratedAt: "2026-09-29T00:00:00Z",
});
const transcript = (
  patch: Partial<SavedTestTranscript> = {}
): SavedTestTranscript => ({
  merchantId: 20,
  conversationId: 12,
  startedAt: "2026-09-29T00:00:00Z",
  items: [message(31), message(32)],
  nextCursor: 31,
  totalMessages: 32,
  feedback: { replies: 32, positive: 32, negative: 0 },
  deal: { id: 1, value: 149.5 },
  ...patch,
});
let api: any, session: TestSariSession;
beforeEach(() => {
  sessionStorage.clear();
  api = {
    create: vi.fn().mockResolvedValue({ conversationId: 41 }),
    save: vi.fn().mockResolvedValue({ messageId: 99 }),
    send: vi.fn().mockResolvedValue({ response: "new reply" }),
    deal: vi.fn(),
    rate: vi.fn(),
    transcript: vi.fn().mockResolvedValue(transcript()),
  };
  session = new TestSariSession(api);
});
describe("saved session recovery", () => {
  it("excludes historic guardrail and user ratings while retaining unknown assistant sources", async () => {
    api.transcript.mockResolvedValue(
      transcript({
        items: [
          { ...message(1), sender: "user" },
          { ...message(2), replySource: "guardrail" },
          { ...message(3), replySource: null, rating: "negative" },
        ],
        nextCursor: null,
      })
    );
    await session.restore(12, 20);
    expect(loadedTestFeedback(session.snapshot().messages)).toEqual({
      positive: 0,
      negative: 1,
    });
  });
  it("restores saved IDs, revisions and deal without sending or creating", async () => {
    expect(await session.restore(12, 20)).toBe(true);
    expect(session.snapshot()).toMatchObject({
      conversationId: 12,
      totalMessages: 32,
      nextCursor: 31,
      deal: { value: 149.5 },
      ratingHistory: [],
      restored: true,
    });
    expect(session.snapshot().messages[0]).toMatchObject({
      id: "saved-31",
      savedId: 31,
      ratingRevision: 3,
      rating: "positive",
    });
    expect(api.create).not.toHaveBeenCalled();
    expect(api.send).not.toHaveBeenCalled();
  });
  it.each([{ merchantId: 21 }, { conversationId: 13 }, { nextCursor: 99 }])(
    "keeps the current session for a mismatched response %j",
    async patch => {
      await session.start();
      await session.send("keep me");
      const before = session.snapshot().messages;
      api.transcript.mockResolvedValue(transcript(patch));
      expect(await session.restore(12, 20)).toBe(false);
      expect(session.snapshot().conversationId).toBe(41);
      expect(session.snapshot().messages).toEqual(before);
    }
  );
  it("locks replacement and preserves a failed reply operation when opening is canceled", async () => {
    await session.start();
    api.send.mockRejectedValueOnce(Error("offline"));
    await session.send("saved user");
    api.transcript.mockRejectedValueOnce(Error("offline"));
    expect(await session.restore(12, 20)).toBe(false);
    session.cancelRestore();
    expect(session.snapshot().error).toBe("reply");
    expect(await session.retry()).toBe(true);
    expect(
      api.save.mock.calls.filter((c: any) => c[0].sender === "user")
    ).toHaveLength(1);
  });
  it("retries an older page using the same cursor and retains newer ratings", async () => {
    await session.restore(12, 20);
    api.transcript.mockRejectedValueOnce(Error("offline"));
    expect(await session.loadOlder(20)).toBe(false);
    expect(session.snapshot().messages).toHaveLength(2);
    api.transcript.mockResolvedValue(
      transcript({ items: [message(1), message(2)], nextCursor: null })
    );
    expect(await session.retry()).toBe(true);
    expect(api.transcript.mock.calls[1][0]).toEqual(
      api.transcript.mock.calls[2][0]
    );
    expect(session.snapshot().messages.map(m => m.savedId)).toEqual([
      1, 2, 31, 32,
    ]);
    expect(session.snapshot().nextCursor).toBeNull();
    expect(await session.loadOlder(20)).toBe(false);
  });
  it("does not accept another operation while opening and makes a deliberate new send afterward", async () => {
    let resolve!: (value: SavedTestTranscript) => void;
    api.transcript.mockReturnValue(new Promise(done => (resolve = done)));
    const operation = session.restore(12, 20);
    expect(await session.start()).toBe(false);
    expect(await session.restore(13, 20)).toBe(false);
    expect(await session.send("no")).toBe(false);
    resolve(transcript());
    await operation;
    await session.send("deliberate");
    expect(api.send).toHaveBeenCalledTimes(1);
    expect(api.send.mock.calls[0][0].conversationId).toBe(12);
    expect(session.snapshot().totalMessages).toBe(34);
  });
  it("refuses automatic retries after access denial and retains the old session", async () => {
    await session.start();
    api.transcript.mockRejectedValue({ data: { code: "FORBIDDEN" } });
    await session.restore(12, 20);
    expect(await session.retry()).toBe(false);
    expect(session.snapshot().conversationId).toBe(41);
  });
  it("keeps references account-scoped, clears them at logout and ignores late writes", () => {
    const epoch = knowledgeCacheEpoch();
    expect(rememberTestSessionReference("1:20:test", 12, epoch)).toBe(true);
    expect(readTestSessionReference("2:20:test")).toBeNull();
    expect(sessionStorage.getItem("sary:test-session:v1:1:20:test")).toBe("12");
    clearKnowledgeWorkspace();
    expect(readTestSessionReference("1:20:test")).toBeNull();
    expect(rememberTestSessionReference("1:20:test", 12, epoch)).toBe(false);
  });
  it("rejects invalid references and tolerates disabled browser storage", () => {
    expect(
      rememberTestSessionReference("1:20:test", NaN, knowledgeCacheEpoch())
    ).toBe(false);
    const blocked = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw Error("blocked");
      });
    expect(
      rememberTestSessionReference("1:20:test", 12, knowledgeCacheEpoch())
    ).toBe(false);
    blocked.mockRestore();
  });
});
