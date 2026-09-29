import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./helpers/disposable-merchant";
import { closeDb } from "../db/connection";
import * as db from "../db";

describe.skipIf(!process.env.DATABASE_URL)("Analytics Functions", () => {
  let testMerchantId: number;

  let testUserId: number;
  beforeAll(async () => {
    const fixture = await createDisposableMerchant("legacy-messages");
    testMerchantId = fixture.merchantId;
    testUserId = fixture.userId;
  });
  afterAll(async () => {
    await cleanupDisposableMerchants([testUserId].filter(Boolean));
    await closeDb();
  });

  describe("getMessageStats", () => {
    it("should return zero stats for merchant with no messages", async () => {
      const stats = await db.getMessageStats(testMerchantId);

      expect(stats).toBeDefined();
      expect(stats.text).toBe(0);
      expect(stats.voice).toBe(0);
      expect(stats.image).toBe(0);
      expect(stats.total).toBe(0);
    });

    it("should return stats object with correct structure", async () => {
      const stats = await db.getMessageStats(testMerchantId);

      expect(stats).toHaveProperty("text");
      expect(stats).toHaveProperty("voice");
      expect(stats).toHaveProperty("image");
      expect(stats).toHaveProperty("total");
      expect(typeof stats.text).toBe("number");
      expect(typeof stats.voice).toBe("number");
      expect(typeof stats.image).toBe("number");
      expect(typeof stats.total).toBe("number");
    });
  });

  describe("getPeakHours", () => {
    it("should return all zero hour slots for merchant with no messages", async () => {
      const peakHours = await db.getPeakHours(testMerchantId);

      expect(Array.isArray(peakHours)).toBe(true);
      expect(peakHours).toHaveLength(24);
      expect(peakHours.every(row => row.count === 0)).toBe(true);
    });

    it("should return array of hour objects", async () => {
      const peakHours = await db.getPeakHours(testMerchantId);

      expect(Array.isArray(peakHours)).toBe(true);
      // If there are results, check structure
      if (peakHours.length > 0) {
        expect(peakHours[0]).toHaveProperty("hour");
        expect(peakHours[0]).toHaveProperty("count");
        expect(typeof peakHours[0].hour).toBe("number");
        expect(typeof peakHours[0].count).toBe("number");
      }
    });
  });

  describe("getTopProducts", () => {
    it("should return empty array for merchant with no product mentions", async () => {
      const topProducts = await db.getTopProducts(testMerchantId, 10);

      expect(Array.isArray(topProducts)).toBe(true);
      expect(topProducts.length).toBe(0);
    });

    it("should respect limit parameter", async () => {
      const limit = 5;
      const topProducts = await db.getTopProducts(testMerchantId, limit);

      expect(Array.isArray(topProducts)).toBe(true);
      expect(topProducts.length).toBeLessThanOrEqual(limit);
    });

    it("should return products with correct structure", async () => {
      const topProducts = await db.getTopProducts(testMerchantId, 10);

      expect(Array.isArray(topProducts)).toBe(true);
      // If there are results, check structure
      if (topProducts.length > 0) {
        expect(topProducts[0]).toHaveProperty("productId");
        expect(topProducts[0]).toHaveProperty("productName");
        expect(topProducts[0]).toHaveProperty("mentionCount");
        expect(topProducts[0]).toHaveProperty("price");
      }
    });
  });

  describe("getConversionRate", () => {
    it("returns no claimed conversion measurement for an empty merchant", async () => {
      const conversionRate = await db.getConversionRate(testMerchantId);

      expect(conversionRate).toBeDefined();
      expect(conversionRate.rate).toBeNull();
      expect(conversionRate.associationShare).toBeNull();
      expect(conversionRate.totalConversations).toBe(0);
      expect(conversionRate.convertedConversations).toBe(0);
    });

    it("should return conversion rate object with correct structure", async () => {
      const conversionRate = await db.getConversionRate(testMerchantId);

      expect(conversionRate).toHaveProperty("rate");
      expect(conversionRate).toHaveProperty("totalConversations");
      expect(conversionRate).toHaveProperty("convertedConversations");
      expect(conversionRate.rate).toBeNull();
      expect(typeof conversionRate.totalConversations).toBe("number");
      expect(typeof conversionRate.convertedConversations).toBe("number");
    });

    it("keeps absent association evidence separate from zero", async () => {
      const conversionRate = await db.getConversionRate(testMerchantId);

      expect(conversionRate.rate).toBeNull();
      expect(conversionRate.associationShare).toBeNull();
    });
  });

  describe("getDailyMessageCount", () => {
    it("should return empty array for merchant with no messages", async () => {
      const dailyMessages = await db.getDailyMessageCount(testMerchantId, 30);

      expect(Array.isArray(dailyMessages)).toBe(true);
      expect(dailyMessages).toHaveLength(30);
      expect(dailyMessages.every(row => row.count === 0)).toBe(true);
    });

    it("should return array of daily message objects", async () => {
      const dailyMessages = await db.getDailyMessageCount(testMerchantId, 30);

      expect(Array.isArray(dailyMessages)).toBe(true);
      // If there are results, check structure
      if (dailyMessages.length > 0) {
        expect(dailyMessages[0]).toHaveProperty("date");
        expect(dailyMessages[0]).toHaveProperty("count");
        expect(typeof dailyMessages[0].date).toBe("string");
        expect(typeof dailyMessages[0].count).toBe("number");
      }
    });

    it("should respect days parameter", async () => {
      const days = 7;
      const dailyMessages = await db.getDailyMessageCount(testMerchantId, days);

      expect(Array.isArray(dailyMessages)).toBe(true);
      // Should not return more days than requested
      expect(dailyMessages.length).toBeLessThanOrEqual(days);
    });
  });
});
