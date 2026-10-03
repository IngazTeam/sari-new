import { afterAll, afterEach, beforeEach, describe, it, expect } from "vitest";
import * as db from "./db";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";

describe.skipIf(!process.env.DATABASE_URL)(
  "inserted identities used by tenant workflows",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      serviceId: number,
      analysisId: number,
      competitorId: number;
    const query = async (sql: string, args: any[] = []) =>
      (await (await db.getPool())!.execute<any>(sql, args))[0];
    beforeEach(async () => {
      owner = await createDisposableMerchant("insert-id426");
      serviceId = (
        await query(
          "INSERT INTO services (merchant_id,name,duration_minutes) VALUES (?,'Fixture service',30)",
          [owner.merchantId]
        )
      ).insertId;
      analysisId = (
        await query(
          "INSERT INTO website_analyses (merchant_id,url,status) VALUES (?,'https://example.test','completed')",
          [owner.merchantId]
        )
      ).insertId;
      competitorId = (
        await query(
          "INSERT INTO competitor_analyses (merchant_id,name,url) VALUES (?,'Fixture competitor','https://example.test')",
          [owner.merchantId]
        )
      ).insertId;
    });
    afterEach(() =>
      cleanupDisposableMerchants([owner?.userId].filter(Boolean))
    );
    afterAll(db.closeDb);
    const cases = [
      {
        name: "service review",
        table: "service_reviews",
        create: () =>
          db.createServiceReview({
            merchantId: owner.merchantId,
            serviceId,
            customerPhone: "+12025550161",
            rating: 4,
            comment: "Fixture review",
          }),
      },
      {
        name: "Google integration",
        table: "google_integrations",
        create: () =>
          db.createGoogleIntegration({
            merchantId: owner.merchantId,
            integrationType: "sheets",
            sheetId: "fixture-only",
            isActive: 0,
          }),
      },
      {
        name: "booking slot",
        table: "booking_time_slots",
        create: () =>
          db.createTimeSlot({
            merchantId: owner.merchantId,
            serviceId,
            slotDate: "2026-10-20",
            startTime: "09:00",
            endTime: "09:30",
          }),
      },
      {
        name: "website insight",
        table: "website_insights",
        create: () =>
          db.createWebsiteInsight({
            merchantId: owner.merchantId,
            analysisId,
            category: "content",
            type: "recommendation",
            priority: "low",
            title: "Fixture insight",
            description: "Review source",
            confidence: 70,
          }),
      },
      {
        name: "extracted product",
        table: "extracted_products",
        create: () =>
          db.createExtractedProduct({
            merchantId: owner.merchantId,
            analysisId,
            name: "Fixture product",
            price: 0,
            currency: "USD",
            confidence: 60,
          }),
      },
      {
        name: "competitor analysis",
        table: "competitor_analyses",
        create: () =>
          db.createCompetitorAnalysis({
            merchantId: owner.merchantId,
            name: "New competitor",
            url: "https://example.test/new",
          }),
      },
      {
        name: "competitor product",
        table: "competitor_products",
        create: () =>
          db.createCompetitorProduct({
            merchantId: owner.merchantId,
            competitorId,
            name: "Fixture competitor product",
            price: 20,
            currency: "USD",
          }),
      },
      {
        name: "notification record",
        table: "notification_records",
        create: () =>
          db.createNotificationRecord({
            merchantId: owner.merchantId,
            notificationKey: "fixture-" + owner.merchantId,
            type: "fixture",
            message: "Local record only",
            sentAt: new Date("2026-10-03T12:00:00.000Z"),
          }),
      },
    ];
    for (const item of cases)
      it(`returns the actual ${item.name} row identity for distinct writes`, async () => {
        const first = await item.create(),
          second = await item.create();
        expect(Number.isSafeInteger(first)).toBe(true);
        expect(first).toBeGreaterThan(0);
        expect(second).toBeGreaterThan(first);
        const saved = await query(
          `SELECT id,merchant_id FROM ${item.table} WHERE merchant_id=? AND id IN (?,?) ORDER BY id`,
          [owner.merchantId, first, second]
        );
        expect(saved).toEqual([
          { id: first, merchant_id: owner.merchantId },
          { id: second, merchant_id: owner.merchantId },
        ]);
      });
    it("stores notification time through the declared Date column without string conversion errors", async () => {
      const when = new Date("2026-10-03T12:34:56.000Z");
      const id = await db.createNotificationRecord({
        merchantId: owner.merchantId,
        notificationKey: "time-fixture",
        type: "fixture",
        message: "Local only",
        sentAt: when,
      });
      const [record] = await query(
        "SELECT DATE_FORMAT(sent_at,'%Y-%m-%d %H:%i:%s') AS sentAt FROM notification_records WHERE merchant_id=? AND id=?",
        [owner.merchantId, id]
      );
      expect(record.sentAt).toBe("2026-10-03 12:34:56");
    });
    it("uses the new competitor identity to save products and update the same report", async () => {
      const id = await db.createCompetitorAnalysis({
        merchantId: owner.merchantId,
        name: "Pipeline fixture",
        url: "https://example.test/pipeline",
        status: "analyzing",
      });
      expect(id).toBeGreaterThan(0);
      const productId = await db.createCompetitorProduct({
        merchantId: owner.merchantId,
        competitorId: id,
        name: "Linked product",
      });
      await db.updateCompetitorAnalysis(id, {
        status: "completed",
        productCount: 1,
      });
      const [row] = await query(
        "SELECT c.status,c.product_count,p.id,p.competitor_id FROM competitor_analyses c JOIN competitor_products p ON p.competitor_id=c.id WHERE c.merchant_id=? AND c.id=?",
        [owner.merchantId, id]
      );
      expect(row).toEqual({
        status: "completed",
        product_count: 1,
        id: productId,
        competitor_id: id,
      });
    });
  }
);
