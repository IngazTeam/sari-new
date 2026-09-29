import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { currentReportWindow, readWeeklyCohort } from "./reports/weekly-cohort";
describe.skipIf(!process.env.DATABASE_URL)("weekly cohort in MySQL", () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
    other: typeof owner;
  const window = currentReportWindow(new Date("2026-09-29T10:00:00Z"));
  const inside = "2026-09-28 12:00:00";
  beforeEach(async () => {
    owner = await createDisposableMerchant("weekly-cohort");
    other = await createDisposableMerchant("weekly-other");
  });
  afterEach(async () =>
    cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
  );
  afterAll(closeDb);
  async function conversation(
    merchantId = owner.merchantId,
    createdAt = inside
  ) {
    const [r] = await (await getPool())!.execute<any>(
      "INSERT INTO conversations (merchantId,customerPhone,createdAt) VALUES (?,'weekly-local-fixture',?)",
      [merchantId, createdAt]
    );
    return Number(r.insertId);
  }
  async function message(
    conversationId: number,
    createdAt = inside,
    direction = "incoming"
  ) {
    const [r] = await (await getPool())!.execute<any>(
      "INSERT INTO messages (conversationId,direction,content,createdAt) VALUES (?,?,'fixture',?)",
      [conversationId, direction, createdAt]
    );
    return Number(r.insertId);
  }
  async function analysis(
    conversationId: number,
    messageId: number,
    sentiment: string,
    createdAt = inside
  ) {
    await (await getPool())!.execute(
      "INSERT INTO sentiment_analysis (conversation_id,message_id,sentiment,confidence,created_at) VALUES (?,?,?,90,?)",
      [conversationId, messageId, sentiment, createdAt]
    );
  }
  it("counts one latest classification per conversation, never one per analysis", async () => {
    const c = await conversation(),
      m = await message(c);
    await analysis(c, m, "negative");
    await analysis(c, m, "happy");
    const c2 = await conversation();
    await analysis(c2, await message(c2), "angry");
    await conversation();
    expect(await readWeeklyCohort(owner.merchantId, window)).toMatchObject({
      totalConversations: 3,
      positiveCount: 1,
      negativeCount: 1,
      neutralCount: 0,
      unclassified: 1,
    });
  });
  it("uses message chronology before reanalysis chronology", async () => {
    const c = await conversation();
    const old = await message(c, "2026-09-28 09:00:00"),
      recent = await message(c);
    await analysis(c, recent, "neutral");
    await analysis(c, old, "positive", "2026-09-28 15:00:00");
    expect(await readWeeklyCohort(owner.merchantId, window)).toMatchObject({
      totalConversations: 1,
      positiveCount: 0,
      neutralCount: 1,
    });
  });
  it("isolates tenants and rejects an analysis pointing at another conversation's message", async () => {
    const own = await conversation(),
      foreign = await conversation(other.merchantId);
    const fm = await message(foreign);
    await analysis(foreign, fm, "positive");
    await analysis(own, fm, "positive");
    expect(await readWeeklyCohort(owner.merchantId, window)).toMatchObject({
      totalConversations: 1,
      positiveCount: 0,
      unclassified: 1,
    });
  });
  it("applies both window bounds to conversations, messages, and analyses", async () => {
    const old = "2026-09-26 23:59:59",
      future = "2026-09-29 10:00:01";
    for (const date of [old, future]) {
      const outside = await conversation(owner.merchantId, date);
      await analysis(outside, await message(outside), "positive");
      const badMessage = await conversation();
      await analysis(badMessage, await message(badMessage, date), "positive");
      const badAnalysis = await conversation();
      await analysis(badAnalysis, await message(badAnalysis), "positive", date);
    }
    const outgoing = await conversation();
    await analysis(
      outgoing,
      await message(outgoing, inside, "outgoing"),
      "positive"
    );
    expect(await readWeeklyCohort(owner.merchantId, window)).toMatchObject({
      totalConversations: 5,
      positiveCount: 0,
      unclassified: 5,
    });
  });
  it("includes exact UTC bounds and collapses every negative emotion", async () => {
    for (const [date, emotion] of [
      [window.sqlStart, "sad"],
      [window.sqlEnd, "frustrated"],
      [inside, "negative"],
    ]) {
      const c = await conversation(owner.merchantId, date);
      await analysis(c, await message(c, date), emotion, date);
    }
    expect(await readWeeklyCohort(owner.merchantId, window)).toMatchObject({
      totalConversations: 3,
      negativeCount: 3,
      unclassified: 0,
    });
  });
  it("filters keywords before limiting, including complaints separately, and does not call lifetime frequency weekly frequency", async () => {
    const pool = (await getPool())!;
    for (let i = 0; i < 11; i++)
      await pool.execute(
        "INSERT INTO keyword_analysis (merchant_id,keyword,category,frequency,last_seen_at) VALUES (?,?,'question',999,'2026-09-20 00:00:00')",
        [owner.merchantId, `old-${i}`]
      );
    for (let i = 0; i < 7; i++)
      await pool.execute(
        "INSERT INTO keyword_analysis (merchant_id,keyword,category,frequency,last_seen_at) VALUES (?,?,'question',100,?)",
        [owner.merchantId, `recent-${i}`, inside]
      );
    for (const [merchant, text, date] of [
      [owner.merchantId, "recent-complaint", inside],
      [owner.merchantId, "future-complaint", "2026-09-30 00:00:00"],
      [other.merchantId, "foreign", inside],
    ] as const)
      await pool.execute(
        "INSERT INTO keyword_analysis (merchant_id,keyword,category,frequency,last_seen_at) VALUES (?,?,'complaint',2,?)",
        [merchant, text, date]
      );
    const result = await readWeeklyCohort(owner.merchantId, window);
    expect(result.topKeywords).toEqual([
      "recent-0",
      "recent-1",
      "recent-2",
      "recent-3",
      "recent-4",
    ]);
    expect(result.topComplaints).toEqual(["recent-complaint"]);
  });
  it("returns an honest empty cohort", async () => {
    expect(await readWeeklyCohort(owner.merchantId, window)).toEqual({
      totalConversations: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      unclassified: 0,
      topKeywords: [],
      topComplaints: [],
    });
  });
});
