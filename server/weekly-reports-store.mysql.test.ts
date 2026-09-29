import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readWeeklyReportRecords,
  readWeeklyReportRecord,
} from "./weekly-reports-store";
describe.skipIf(!process.env.DATABASE_URL)(
  "weekly report scoped storage",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    beforeEach(async () => {
      owner = await createDisposableMerchant("report-read");
      other = await createDisposableMerchant("report-other");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    async function report(merchantId: number) {
      const [r] = await (await getPool())!.execute<any>(
        "INSERT INTO weekly_sentiment_reports (merchant_id,week_start_date,week_end_date,total_conversations,positive_count,negative_count,neutral_count,positive_percentage,satisfaction_score,top_keywords) VALUES (?,'2026-09-20 00:00:00','2026-09-26 23:59:59',10,4,2,1,99,100,'legacy text')",
        [merchantId]
      );
      return Number(r.insertId);
    }
    it("paginates deterministically without leaking foreign reports", async () => {
      const ids = [];
      for (let i = 0; i < 5; i++) ids.push(await report(owner.merchantId));
      await report(other.merchantId);
      const first = await readWeeklyReportRecords(owner.merchantId, 2, 1),
        second = await readWeeklyReportRecords(owner.merchantId, 2, 2),
        last = await readWeeklyReportRecords(owner.merchantId, 2, 3);
      expect([...first, ...second, ...last].map(r => r.id)).toEqual(
        ids.reverse()
      );
      expect(await readWeeklyReportRecords(owner.merchantId, 2, 4)).toEqual([]);
    });
    it("scopes detail reads in SQL and preserves raw values with explicit measurement limits", async () => {
      const id = await report(owner.merchantId);
      expect(await readWeeklyReportRecord(other.merchantId, id)).toBeNull();
      expect(
        await readWeeklyReportRecord(owner.merchantId, 2147483647)
      ).toBeNull();
      expect(await readWeeklyReportRecord(owner.merchantId, id)).toMatchObject({
        id,
        merchantId: owner.merchantId,
        topKeywords: "legacy text",
        positivePercentage: 99,
        satisfactionScore: 100,
        observation: { positiveShare: 40, unclassified: 3 },
        measuredSatisfaction: null,
        salesProficiency: null,
        evidenceKind: "legacy_report_without_generation_evidence",
      });
    });
    it("rejects invalid direct storage limits and treats a valid empty tenant as empty", async () => {
      await expect(
        readWeeklyReportRecords(owner.merchantId, 0, 1)
      ).rejects.toThrow("Invalid report selection");
      await expect(
        readWeeklyReportRecords(owner.merchantId, 53, 1)
      ).rejects.toThrow("Invalid report selection");
      await expect(
        readWeeklyReportRecord(owner.merchantId, -1)
      ).rejects.toThrow("Invalid report selection");
      expect(await readWeeklyReportRecords(owner.merchantId, 10, 1)).toEqual(
        []
      );
    });
  }
);
