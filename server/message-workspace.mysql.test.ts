import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readMessageWorkspace,
  readLegacyMessageWorkspace,
} from "./message-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "message workspace evidence in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const now = new Date("2026-09-29T10:00:00Z"),
      inside = "2026-09-28 12:00:00";
    const read = () =>
      readMessageWorkspace(owner.merchantId, { period: "7d" }, now);
    beforeEach(async () => {
      owner = await createDisposableMerchant("messages");
      other = await createDisposableMerchant("messages-other");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    async function conversation(
      merchantId = owner.merchantId,
      phone = "local",
      date = inside
    ) {
      const [r] = await (await getPool())!.execute<any>(
        "INSERT INTO conversations (merchantId,customerPhone,createdAt) VALUES (?,?,?)",
        [merchantId, phone, date]
      );
      return Number(r.insertId);
    }
    async function message(
      c: number,
      kind = "text",
      direction = "incoming",
      date = inside,
      text = "local message"
    ) {
      const [r] = await (await getPool())!.execute<any>(
        "INSERT INTO messages (conversationId,messageType,direction,createdAt,content) VALUES (?,?,?,?,?)",
        [c, kind, direction, date, text]
      );
      return Number(r.insertId);
    }
    async function sentiment(
      c: number,
      m: number,
      kind: string,
      confidence = 80,
      date = inside
    ) {
      await (await getPool())!.execute(
        "INSERT INTO sentiment_analysis (conversation_id,message_id,sentiment,confidence,created_at) VALUES (?,?,?,?,?)",
        [c, m, kind, confidence, date]
      );
    }
    it("counts all four message kinds and directions in one window, including active old conversations", async () => {
      const c = await conversation(
          owner.merchantId,
          "old",
          "2026-01-01 00:00:00"
        ),
        foreign = await conversation(other.merchantId);
      await message(c, "text", "incoming", "2026-09-23 00:00:00");
      await message(c, "voice");
      await message(c, "image", "outgoing");
      await message(c, "document", "incoming", "2026-09-29 10:00:00");
      await message(c, "text", "incoming", "2026-09-22 23:59:59");
      await message(c, "text", "incoming", "2026-09-29 10:00:01");
      await message(foreign);
      const result = await read();
      expect(result.messages).toMatchObject({
        total: 4,
        incoming: 3,
        outgoing: 1,
        activeConversations: 1,
      });
      expect(
        result.messages.byType.map(r => [r.kind, r.count, r.share])
      ).toEqual([
        ["text", 1, 25],
        ["voice", 1, 25],
        ["image", 1, 25],
        ["document", 1, 25],
      ]);
      expect(result.daily).toHaveLength(7);
      expect(result.daily.reduce((n, r) => n + r.count, 0)).toBe(4);
      expect(result.hourly).toHaveLength(24);
      expect(result.hourly.reduce((n, r) => n + r.count, 0)).toBe(4);
      expect(result.hourly[12].count).toBe(2);
    });
    it("deduplicates sentiment by incoming message and excludes wrong conversation, future and outgoing analyses", async () => {
      const c = await conversation(),
        foreign = await conversation(other.merchantId),
        fm = await message(foreign);
      const a = await message(c),
        b = await message(c),
        d = await message(c),
        out = await message(c, "text", "outgoing");
      await sentiment(c, a, "negative");
      await sentiment(c, a, "happy", 0);
      await sentiment(c, b, "sad", 120);
      await sentiment(c, d, "positive", 80, "2026-09-30 00:00:00");
      await sentiment(c, out, "positive");
      await sentiment(c, fm, "positive");
      await sentiment(foreign, fm, "positive");
      const result = await read();
      expect(result.sentiment).toMatchObject({
        incoming: 3,
        classified: 2,
        unclassified: 1,
        confidence: { average: 0, validCount: 1, invalidCount: 1 },
        measuredSatisfaction: null,
      });
      expect(result.sentiment.classificationCoverage).toBeCloseTo(200 / 3);
      expect(
        result.sentiment.distribution.find(r => r.kind === "happy")
      ).toMatchObject({ count: 1 });
      expect(
        result.sentiment.distribution.find(r => r.kind === "negative")
      ).toMatchObject({ count: 0 });
    });
    it("counts literal product names in incoming text only and carries price evidence without inferring intent", async () => {
      const pool = (await getPool())!,
        c = await conversation(),
        foreign = await conversation(other.merchantId);
      await pool.execute(
        "INSERT INTO products (merchantId,name,price,price_unit,currency) VALUES (?,'100%_coffee',1250,'minor','SAR'),(?,'coffee',99,'unverified','USD'),(?,'foreign',100,'minor','SAR'),(?,'   ',0,'unverified','SAR')",
        [owner.merchantId, owner.merchantId, other.merchantId, owner.merchantId]
      );
      await message(c, "text", "incoming", inside, "100%_coffee 100%_coffee");
      await message(c, "text", "outgoing", inside, "100%_coffee");
      await message(c, "text", "incoming", "2026-09-20 00:00:00", "coffee");
      await message(foreign, "text", "incoming", inside, "coffee foreign");
      const result = await read();
      expect(result.products.rows).toHaveLength(2);
      expect(
        result.products.rows.find(p => p.productName === "100%_coffee")
      ).toMatchObject({
        mentionCount: 1,
        price: 1250,
        priceUnit: "minor",
        currency: "SAR",
      });
      expect(result.products.evidenceKind).toBe(
        "literal_current_catalog_name_in_incoming_text"
      );
    });
    it("describes exact-phone order association without claiming conversion or payment", async () => {
      const pool = (await getPool())!;
      for (const phone of ["matched", "old-order", "foreign-order", ""])
        await conversation(owner.merchantId, phone);
      for (const [merchant, phone, date] of [
        [owner.merchantId, "matched", inside],
        [owner.merchantId, "matched", inside],
        [owner.merchantId, "old-order", "2026-09-20 00:00:00"],
        [other.merchantId, "foreign-order", inside],
        [owner.merchantId, "", inside],
      ] as const)
        await pool.execute(
          "INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,status,createdAt) VALUES (?,?,'fixture','[]',0,'cancelled',?)",
          [merchant, phone, date]
        );
      expect((await read()).orderAssociation).toMatchObject({
        total: 4,
        positive: 1,
        ratio: 25,
        salesConversion: null,
        salesProficiency: null,
        includesAllOrderStatuses: true,
      });
    });
    it("uses the same tenant evidence inside exact compatibility bounds", async () => {
      const c = await conversation();
      await message(c, "text", "incoming", "2026-09-28 10:00:00");
      await message(c, "document", "incoming", "2026-09-28 10:00:01");
      await message(c, "voice", "incoming", "2026-09-28 10:00:02");
      await message(
        await conversation(other.merchantId),
        "image",
        "incoming",
        "2026-09-28 10:00:01"
      );
      const result = await readLegacyMessageWorkspace(
        owner.merchantId,
        { startDate: "2026-09-28T10:00:01Z", endDate: "2026-09-28T10:00:01Z" },
        { now }
      );
      expect(result.messages).toMatchObject({ total: 1, incoming: 1 });
      expect(
        result.messages.byType.find(r => r.kind === "document")?.count
      ).toBe(1);
      expect(result.daily).toEqual([{ date: "2026-09-28", count: 1 }]);
      expect(result.hourly.find(r => r.hour === 10)?.count).toBe(1);
    });
    it("rejects invalid compatibility limits before querying", async () => {
      await expect(
        readLegacyMessageWorkspace(owner.merchantId, {}, { days: 91 })
      ).rejects.toThrow();
      await expect(
        readLegacyMessageWorkspace(owner.merchantId, {}, { limit: 0 })
      ).rejects.toThrow();
    });
    it("returns zero counts but unavailable shares for a real empty tenant", async () => {
      const result = await read();
      expect(result.messages.total).toBe(0);
      expect(result.messages.byType.every(r => r.share === null)).toBe(true);
      expect(result.sentiment.confidence.average).toBeNull();
      expect(result.sentiment.classificationCoverage).toBeNull();
      expect(result.orderAssociation.ratio).toBeNull();
      expect(result.products.rows).toEqual([]);
      expect(result.daily.every(r => r.count === 0)).toBe(true);
    });
  }
);
