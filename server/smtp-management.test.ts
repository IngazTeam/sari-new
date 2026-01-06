import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { db } from "./db";
import type { User } from "../drizzle/schema";

// Mock admin user
const mockAdminUser: User = {
  id: 999999,
  email: "admin@test.com",
  password: "hashed",
  role: "admin",
  name: "Test Admin",
  createdAt: new Date(),
  updatedAt: new Date(),
};

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

describe("SMTP Email Management", () => {
  describe("Admin Access Control", () => {
    it("should allow admin to get SMTP settings", async () => {
      const caller = appRouter.createCaller(createTestContext(mockAdminUser));
      const result = await caller.smtp.getSettings();
      // Should not throw error
      expect(result).toBeDefined();
    });

    it("should deny non-admin access to SMTP settings", async () => {
      const caller = appRouter.createCaller(createTestContext(mockMerchantUser));
      await expect(caller.smtp.getSettings()).rejects.toThrow("Admin access required");
    });

    it("should allow admin to update SMTP settings", async () => {
      const caller = appRouter.createCaller(createTestContext(mockAdminUser));
      const result = await caller.smtp.updateSettings({
        host: "smtp.test.com",
        port: 587,
        username: "test@test.com",
        password: "testpassword",
        fromEmail: "noreply@test.com",
        fromName: "Test Sender",
      });
      expect(result.success).toBe(true);
    });

    it("should deny non-admin to update SMTP settings", async () => {
      const caller = appRouter.createCaller(createTestContext(mockMerchantUser));
      await expect(
        caller.smtp.updateSettings({
          host: "smtp.test.com",
          port: 587,
          username: "test@test.com",
          password: "testpassword",
          fromEmail: "noreply@test.com",
          fromName: "Test Sender",
        })
      ).rejects.toThrow("Admin access required");
    });
  });

  describe("SMTP Settings Management", () => {
    it("should encrypt password when saving settings", async () => {
      const caller = appRouter.createCaller(createTestContext(mockAdminUser));
      await caller.smtp.updateSettings({
        host: "smtp.test.com",
        port: 587,
        username: "test@test.com",
        password: "mySecretPassword123",
        fromEmail: "noreply@test.com",
        fromName: "Test Sender",
      });

      // Get settings and verify password is not returned
      const settings = await caller.smtp.getSettings();
      expect(settings?.password).toBeUndefined();
    });

    it("should update settings without changing password if not provided", async () => {
      const caller = appRouter.createCaller(createTestContext(mockAdminUser));
      
      // First set with password
      await caller.smtp.updateSettings({
        host: "smtp.test.com",
        port: 587,
        username: "test@test.com",
        password: "password123",
        fromEmail: "noreply@test.com",
        fromName: "Test Sender",
      });

      // Update without password
      await caller.smtp.updateSettings({
        host: "smtp.updated.com",
        port: 465,
        username: "updated@test.com",
        fromEmail: "noreply@updated.com",
        fromName: "Updated Sender",
      });

      const settings = await caller.smtp.getSettings();
      expect(settings?.host).toBe("smtp.updated.com");
      expect(settings?.port).toBe(465);
    });
  });

  describe("Email Logs", () => {
    it("should allow admin to get email logs", async () => {
      const caller = appRouter.createCaller(createTestContext(mockAdminUser));
      const logs = await caller.smtp.getEmailLogs({ limit: 10 });
      expect(Array.isArray(logs)).toBe(true);
    });

    it("should deny non-admin access to email logs", async () => {
      const caller = appRouter.createCaller(createTestContext(mockMerchantUser));
      await expect(caller.smtp.getEmailLogs({ limit: 10 })).rejects.toThrow(
        "Admin access required"
      );
    });

    it("should allow admin to get email stats", async () => {
      const caller = appRouter.createCaller(createTestContext(mockAdminUser));
      const stats = await caller.smtp.getStats();
      expect(stats).toHaveProperty("totalEmails");
      expect(stats).toHaveProperty("sentEmails");
      expect(stats).toHaveProperty("failedEmails");
      expect(stats).toHaveProperty("pendingEmails");
    });
  });

  describe("Test Email Sending", () => {
    it("should validate email format when testing connection", async () => {
      const caller = appRouter.createCaller(createTestContext(mockAdminUser));
      await expect(
        caller.smtp.testConnection({ email: "invalid-email" })
      ).rejects.toThrow();
    });

    it("should create log entry when sending test email", async () => {
      const caller = appRouter.createCaller(createTestContext(mockAdminUser));
      
      // This will fail because SMTP is not configured, but should create log
      try {
        await caller.smtp.testConnection({ email: "test@example.com" });
      } catch (error) {
        // Expected to fail
      }

      const logs = await caller.smtp.getEmailLogs({ limit: 1 });
      expect(logs.length).toBeGreaterThan(0);
    });
  });
});
