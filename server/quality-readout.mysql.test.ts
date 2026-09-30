import { afterEach, afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readQualityReadout } from "./quality-readout";
describe.skipIf(!process.env.DATABASE_URL)(
  "quality generation evidence in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const now = new Date("2026-10-01T12:00:00Z");
    beforeEach(async () => {
      owner = await createDisposableMerchant("quality");
      other = await createDisposableMerchant("quality-other");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    const add = async (
      opts: {
        merchant?: number;
        at?: string;
        time?: number;
        short?: number;
        cache?: number;
        escalated?: number;
        sentiment?: string | null;
        question?: string;
        response?: string;
      } = {}
    ) => {
      await (await getPool())!.execute(
        "INSERT INTO sari_quality_metrics(merchant_id,question_text,response_text,response_time_ms,was_empty,was_cache_hit,was_escalated,customer_sentiment,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        [
          opts.merchant ?? owner.merchantId,
          opts.question ?? "Sample question",
          opts.response ?? "Sample response",
          opts.time ?? 100,
          opts.short ?? 0,
          opts.cache ?? 0,
          opts.escalated ?? 0,
          opts.sentiment ?? null,
          opts.at ?? "2026-09-30 12:00:00",
        ]
      );
    };
    const read = (days = 30) => readQualityReadout(owner.merchantId, days, now);
    it("returns a real empty period without fabricated performance or stable trend", async () => {
      const r = await read();
      expect(r.totalResponses).toBe(0);
      expect(r.avgResponseTimeMs).toBeNull();
      expect(r.cache.rate).toBeNull();
      expect(r.trend.state).toBe("insufficient");
      expect(r.recent).toEqual([]);
    });
    it("isolates tenants and bounds all current data with inclusive start and exclusive end", async () => {
      await add({ at: "2026-09-01 12:00:00" });
      await add({ at: "2026-09-01 11:59:59" });
      await add({ at: "2026-10-01 12:00:00" });
      await add({ at: "2026-10-01 12:00:01" });
      await add({ merchant: other.merchantId });
      const r = await read();
      expect(r.totalResponses).toBe(1);
      expect(r.questions[0].count).toBe(1);
      expect(r.recent).toHaveLength(1);
      expect(r.from).toBe("2026-09-01T12:00:00.000Z");
    });
    it("keeps unknown flags and sentiments separate and includes legitimate zero durations", async () => {
      await add({
        time: 0,
        cache: 1,
        short: 1,
        escalated: 2,
        sentiment: "happy",
      });
      await add({
        time: 200,
        cache: 0,
        short: 0,
        escalated: 1,
        sentiment: "angry",
      });
      await add({
        time: -1,
        cache: 2,
        short: 2,
        escalated: 0,
        sentiment: "unclassified",
      });
      await add({ time: -1, sentiment: null });
      const r = await read();
      expect(r.avgResponseTimeMs).toBe(100);
      expect(r.responseTimeSamples).toBe(2);
      expect(r.cache).toEqual({ yes: 1, no: 2, unknown: 1, rate: 33.3 });
      expect(r.sentiment).toEqual({
        positive: 1,
        neutral: 0,
        negative: 1,
        unknown: 2,
      });
      expect(r.escalation.unknown).toBe(1);
    });
    it("keeps exact question counts and bounded excerpts within the selected period", async () => {
      await add({ question: "Hello" });
      await add({ question: "hello" });
      await add({ question: "Hello" });
      await add({ question: "x".repeat(150), response: "r".repeat(120) });
      await add({ question: "Old", at: "2026-08-01 12:00:00" });
      const r = await read();
      expect(r.questions[0]).toEqual({ text: "Hello", count: 2 });
      expect(r.questions.find(q => q.text === "hello")?.count).toBe(1);
      expect(r.recent).toHaveLength(4);
      expect(r.recent[0].question).toHaveLength(80);
      expect(r.recent[0].response).toHaveLength(80);
    });
    it("compares disjoint seven-day samples while excluding unknown flags", async () => {
      for (let i = 0; i < 5; i++) {
        await add({ short: 0, at: "2026-09-24 12:00:00" });
        await add({ short: 1, at: "2026-09-24 11:59:59" });
      }
      await add({ short: 2 });
      const r = await read(7);
      expect(r.totalResponses).toBe(6);
      expect(r.trend.state).toBe("improving");
      expect(r.trend.current).toEqual({ yes: 0, no: 5, unknown: 1, rate: 0 });
      expect(r.trend.previous.yes).toBe(5);
    });
  }
);
