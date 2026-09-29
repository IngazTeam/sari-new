import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { randomUUID } from "node:crypto";
import { closeDb, getPool } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { ensureTestFeedbackSchema } from "./tests/helpers/test-feedback-schema";
import { createTestSession, saveOwnedTestMessage } from "./test-sari-store";
import {
  listSavedTestSessions,
  readSavedTestTranscript,
  saveTestFeedback,
} from "./test-feedback-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "recoverable test feedback in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      conversationId: number;
    beforeAll(ensureTestFeedbackSchema);
    beforeEach(async () => {
      owner = await createDisposableMerchant("feedback");
      other = await createDisposableMerchant("feedback-other");
      conversationId = (
        await createTestSession(owner.merchantId, { requestId: randomUUID() })
      ).conversationId;
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    const message = async (
      sender: "user" | "sari" = "sari",
      replySource?: "model" | "guardrail"
    ) =>
      saveOwnedTestMessage(owner.merchantId, {
        conversationId,
        clientMessageId: randomUUID(),
        sender,
        replySource,
        content: "محفوظ محليًا",
        responseTime: 1500,
      });
    const rate = (
      messageId: number,
      rating: "positive" | "negative" | null = "positive",
      expectedRevision = 0,
      requestId = randomUUID()
    ) => ({ conversationId, messageId, rating, expectedRevision, requestId });
    const write = (input: ReturnType<typeof rate>) =>
      saveTestFeedback(owner.merchantId, owner.userId, input);
    it("lists bounded tenant-owned sessions without repeated rows", async () => {
      for (let i = 0; i < 4; i++)
        await createTestSession(owner.merchantId, { requestId: randomUUID() });
      await createTestSession(other.merchantId, { requestId: randomUUID() });
      await message();
      const a = await listSavedTestSessions(owner.merchantId, { limit: 3 }),
        b = await listSavedTestSessions(owner.merchantId, {
          beforeId: a.nextCursor!,
          limit: 3,
        });
      expect(a.items).toHaveLength(3);
      expect(b.items).toHaveLength(2);
      expect(b.nextCursor).toBeNull();
      expect(new Set([...a.items, ...b.items].map(r => r.id)).size).toBe(5);
      expect(b.items.at(-1)).toMatchObject({
        id: conversationId,
        messageCount: 1,
        hasDeal: false,
      });
    });
    it("restores complete message pages in stable order and summarizes the whole session", async () => {
      await message("user");
      const a = await message("sari", "model"),
        b = await message("sari", "guardrail");
      await message();
      await message("user");
      await write(rate(a.messageId));
      const first = await readSavedTestTranscript(owner.merchantId, {
        conversationId,
        limit: 2,
      });
      const second = await readSavedTestTranscript(owner.merchantId, {
        conversationId,
        limit: 2,
        beforeId: first.nextCursor!,
      });
      const third = await readSavedTestTranscript(owner.merchantId, {
        conversationId,
        limit: 2,
        beforeId: second.nextCursor!,
      });
      expect(first.totalMessages).toBe(5);
      expect(first.feedback).toEqual({ replies: 2, positive: 1, negative: 0 });
      const all = [...third.items, ...second.items, ...first.items];
      expect(all).toHaveLength(5);
      expect(all.map(r => r.id)).toEqual(
        all.map(r => r.id).sort((x, y) => x - y)
      );
      expect(all.find(r => r.id === a.messageId)).toMatchObject({
        replySource: "model",
        rating: "positive",
        ratingRevision: 1,
      });
      expect(all.find(r => r.id === b.messageId)?.replySource).toBe(
        "guardrail"
      );
      expect(third.nextCursor).toBeNull();
    });
    it("rejects foreign transcripts and feedback targets without altering them", async () => {
      const m = await message();
      await expect(
        readSavedTestTranscript(other.merchantId, { conversationId })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        saveTestFeedback(other.merchantId, other.userId, rate(m.messageId))
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const foreign = (
        await createTestSession(other.merchantId, { requestId: randomUUID() })
      ).conversationId;
      await expect(
        write({ ...rate(m.messageId), conversationId: foreign })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(
        (await readSavedTestTranscript(owner.merchantId, { conversationId }))
          .items[0].rating
      ).toBeNull();
    });
    it("excludes user messages and guardrail notices from feedback", async () => {
      for (const m of [
        await message("user"),
        await message("sari", "guardrail"),
      ])
        await expect(write(rate(m.messageId))).rejects.toMatchObject({
          code: "PRECONDITION_FAILED",
        });
    });
    it("records one change and receipt under identical racing retries", async () => {
      const m = await message(),
        input = rate(m.messageId),
        results = await Promise.all(
          Array.from({ length: 8 }, () => write(input))
        );
      expect(results.filter(r => !r.replayed)).toHaveLength(1);
      expect(
        results.every(r => r.revision === 1 && r.rating === "positive")
      ).toBe(true);
      const [rows] = await (await getPool())!.execute<any>(
        "SELECT COUNT(*) n FROM test_message_feedback WHERE message_id=?",
        [m.messageId]
      );
      expect(Number(rows[0].n)).toBe(1);
    });
    it("rejects stale edits and returns current state when a receipt was superseded", async () => {
      const m = await message(),
        first = rate(m.messageId);
      await write(first);
      await write(rate(m.messageId, "negative", 1));
      await expect(write(rate(m.messageId, null, 0))).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(await write(first)).toMatchObject({
        rating: "negative",
        revision: 2,
        replayed: true,
        superseded: true,
      });
      await write(rate(m.messageId, null, 2));
      const d = await readSavedTestTranscript(owner.merchantId, {
        conversationId,
      });
      expect(d.items[0]).toMatchObject({ rating: null, ratingRevision: 3 });
      expect(d.feedback.negative).toBe(0);
    });
    it("allows one winner for competing changes at the same revision", async () => {
      const m = await message(),
        r = await Promise.allSettled([
          write(rate(m.messageId)),
          write(rate(m.messageId, "negative")),
        ]);
      expect(r.filter(x => x.status === "fulfilled")).toHaveLength(1);
      expect(r.filter(x => x.status === "rejected")[0]).toMatchObject({
        reason: { code: "CONFLICT" },
      });
    });
    it("binds a request to its original message, decision and revision", async () => {
      const a = await message(),
        b = await message(),
        input = rate(a.messageId);
      await write(input);
      for (const patch of [
        { messageId: b.messageId },
        { rating: "negative" },
        { expectedRevision: 1 },
      ])
        await expect(
          write({ ...input, ...patch } as any)
        ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await readSavedTestTranscript(owner.merchantId, { conversationId }))
        .items[1].rating
    ).toBeNull();
    await expect(saveTestFeedback(owner.merchantId,other.userId,input)).rejects.toMatchObject({code:"CONFLICT"});
    });
    it("preserves saved feedback and reply classification when migration repeats", async () => {
      const m = await message("sari", "model");
      await write(rate(m.messageId));
      await ensureTestFeedbackSchema();
      const d = await readSavedTestTranscript(owner.merchantId, {
        conversationId,
      });
      expect(d.items[0]).toMatchObject({
        rating: "positive",
        ratingRevision: 1,
        replySource: "model",
      });
    });
    it("rejects a changed reply classification when replaying a message save", async () => {
      const input = {
        conversationId,
        clientMessageId: randomUUID(),
        sender: "sari" as const,
        content: "reply",
        replySource: "model" as const,
      };
      await saveOwnedTestMessage(owner.merchantId, input);
      await expect(
        saveOwnedTestMessage(owner.merchantId, {
          ...input,
          replySource: "guardrail",
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  }
);
