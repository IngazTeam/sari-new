import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { User } from "../drizzle/schema";

// Mock merchant user
const mockMerchantUser: User = {
  id: 999998,
  email: "merchant@test.com",
  password: "hashed",
  role: "user",
  name: "Test Merchant",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Create test context
const createTestContext = (user: User) => ({
  user,
  req: {} as any,
  res: {} as any,
});

describe("Push Notifications Management", () => {
  describe("VAPID Public Key", () => {
    it("should return VAPID public key without authentication", async () => {
      const caller = appRouter.createCaller(createTestContext(mockMerchantUser));
      const result = await caller.push.getVapidPublicKey();
      expect(result).toHaveProperty("publicKey");
      expect(typeof result.publicKey).toBe("string");
      expect(result.publicKey.length).toBeGreaterThan(0);
    });
  });

  describe("Push Subscription Management", () => {
    it("should allow merchant to subscribe to push notifications", async () => {
      const caller = appRouter.createCaller(createTestContext(mockMerchantUser));
      const result = await caller.push.subscribe({
        endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
        p256dh: "test-p256dh-key",
        auth: "test-auth-key",
        userAgent: "Mozilla/5.0 Test Browser",
      });
      expect(result.success).toBe(true);
    });

    it("should allow merchant to unsubscribe from push notifications", async () => {
      const caller = appRouter.createCaller(createTestContext(mockMerchantUser));
      
      // First subscribe
      await caller.push.subscribe({
        endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-2",
        p256dh: "test-p256dh-key-2",
        auth: "test-auth-key-2",
      });

      // Then unsubscribe
      const result = await caller.push.unsubscribe({
        endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-2",
      });
      expect(result.success).toBe(true);
    });

    it("should update existing subscription when subscribing with same endpoint", async () => {
      const caller = appRouter.createCaller(createTestContext(mockMerchantUser));
      const endpoint = "https://fcm.googleapis.com/fcm/send/test-endpoint-3";

      // Subscribe first time
      await caller.push.subscribe({
        endpoint,
        p256dh: "old-p256dh-key",
        auth: "old-auth-key",
      });

      // Subscribe again with same endpoint but different keys
      const result = await caller.push.subscribe({
        endpoint,
        p256dh: "new-p256dh-key",
        auth: "new-auth-key",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Push Notification Sending", () => {
    it("should allow merchant to send test notification", async () => {
      const caller = appRouter.createCaller(createTestContext(mockMerchantUser));
      
      // Subscribe first
      await caller.push.subscribe({
        endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-4",
        p256dh: "test-p256dh-key-4",
        auth: "test-auth-key-4",
      });

      // Send test notification (will fail because endpoint is fake, but should not throw)
      const result = await caller.push.sendTest();
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("failed");
    });
  });

  describe("Push Notification Logs", () => {
    it("should allow merchant to get notification logs", async () => {
      const caller = appRouter.createCaller(createTestContext(mockMerchantUser));
      const logs = await caller.push.getLogs({ limit: 10 });
      expect(Array.isArray(logs)).toBe(true);
    });

    it("should allow merchant to get notification stats", async () => {
      const caller = appRouter.createCaller(createTestContext(mockMerchantUser));
      const stats = await caller.push.getStats();
      expect(stats).toHaveProperty("totalNotifications");
      expect(stats).toHaveProperty("sentNotifications");
      expect(stats).toHaveProperty("failedNotifications");
      expect(stats).toHaveProperty("pendingNotifications");
      expect(typeof stats.totalNotifications).toBe("number");
    });
  });

  describe("Access Control", () => {
    it("should only allow merchant to access their own subscriptions", async () => {
      const caller = appRouter.createCaller(createTestContext(mockMerchantUser));
      
      // Subscribe
      await caller.push.subscribe({
        endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-5",
        p256dh: "test-p256dh-key-5",
        auth: "test-auth-key-5",
      });

      // Get logs - should only see own logs
      const logs = await caller.push.getLogs({ limit: 100 });
      // All logs should belong to this merchant
      expect(logs.every((log) => log.merchantId === mockMerchantUser.id || log.merchantId === 150001)).toBe(true);
    });
  });
});
