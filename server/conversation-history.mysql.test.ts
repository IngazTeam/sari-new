import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readConversationHistory,
  ConversationHistoryNotFound,
} from "./conversation-history";
describe.skipIf(!process.env.DATABASE_URL)(
  "conversation message history in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const query = async (sql: string, values: unknown[] = []) =>
      (await (await getPool())!.execute<any>(sql, values))[0];
    const conversation = async (merchantId = owner.merchantId) =>
      Number(
        (
          await query(
            "INSERT INTO conversations (merchantId,customerPhone,customerName) VALUES (?,'local-test','Local example')",
            [merchantId]
          )
        ).insertId
      );
    const message = async (
      id: number,
      date = "2026-10-01 10:00:00",
      text = "Local message"
    ) =>
      Number(
        (
          await query(
            "INSERT INTO messages (conversationId,direction,messageType,content,createdAt) VALUES (?,'incoming','text',?,?)",
            [id, text, date]
          )
        ).insertId
      );
    beforeEach(async () => {
      owner = await createDisposableMerchant("history210");
      other = await createDisposableMerchant("history210-other");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    const read = (id: number, more = {}) =>
      readConversationHistory(owner.merchantId, {
        conversationId: id,
        ...more,
      });
    it("returns the latest500 messages rather than freezing the inbox at the oldest500, with every older message reachable", async () => {
      const c = await conversation(),
        rows = Array.from({ length: 503 }, (_, i) => [
          c,
          "2026-10-01 10:00:00",
          `Message ${i + 1}`,
        ]);
      await query(
        `INSERT INTO messages (conversationId,createdAt,content,direction,messageType) VALUES ${rows.map(() => "(?,?,?,'incoming','text')").join(",")}`,
        rows.flat()
      );
      const first = await read(c, { limit: 500 });
      expect(first.items).toHaveLength(500);
      expect(first.items[0].content).toBe("Message 4");
      expect(first.items.at(-1)?.content).toBe("Message 503");
      expect(first.hasMore).toBe(true);
      const older = await read(c, {
        limit: 500,
        beforeId: first.nextBeforeId!,
      });
      expect(older.items.map(r => r.content)).toEqual([
        "Message 1",
        "Message 2",
        "Message 3",
      ]);
      expect(older.hasMore).toBe(false);
      expect(older.nextBeforeId).toBeNull();
    });
    it("orders by time and then id and keeps a cursor stable when newer messages arrive", async () => {
      const c = await conversation(),
        a = await message(c, "2026-09-30 10:00:00"),
        b = await message(c),
        d = await message(c),
        old = await message(c, "2026-09-29 10:00:00");
      const first = await read(c, { limit: 2 });
      expect(first.items.map(r => r.id)).toEqual([b, d]);
      await message(c, "2026-10-01 11:00:00");
      expect(
        (await read(c, { limit: 2, beforeId: first.nextBeforeId! })).items.map(
          r => r.id
        )
      ).toEqual([old, a]);
    });
    it("returns an owned empty conversation and never exposes another tenant or unknown conversation", async () => {
      const own = await conversation(),
        foreign = await conversation(other.merchantId);
      await message(foreign);
      expect(await read(own)).toMatchObject({
        merchantId: owner.merchantId,
        conversationId: own,
        items: [],
        hasMore: false,
        nextBeforeId: null,
      });
      await expect(read(foreign)).rejects.toBeInstanceOf(
        ConversationHistoryNotFound
      );
      await expect(read(2147483647)).rejects.toBeInstanceOf(
        ConversationHistoryNotFound
      );
    });
    it("refuses cursors from another conversation even inside the same tenant", async () => {
      const a = await conversation(),
        b = await conversation(),
        f = await conversation(other.merchantId);
      const bid = await message(b),
        fid = await message(f);
      await message(a);
      for (const beforeId of [bid, fid, 2147483647])
        await expect(read(a, { beforeId })).rejects.toBeInstanceOf(
          ConversationHistoryNotFound
        );
    });
    it("preserves message authors and media fields without mixing conversations", async () => {
      const a = await conversation(),
        b = await conversation();
      await message(b);
      await query(
        "INSERT INTO messages (conversationId,direction,messageType,content,sender_type,voiceUrl,createdAt) VALUES (?,'outgoing','voice','Local audio','merchant','/local-example.ogg','2026-10-01 10:00:00')",
        [a]
      );
      const result = await read(a);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        conversationId: a,
        senderType: "merchant",
        messageType: "voice",
        voiceUrl: "/local-example.ogg",
      });
    });
  }
);
