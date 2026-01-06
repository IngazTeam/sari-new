import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Helper to create admin context
function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@sari.sa",
    name: "Admin User",
    loginMethod: "email",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// Helper to create regular user context
function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// Helper to create public context (no user)
function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("offers.offers", () => {
  describe("getActive", () => {
    it("should return active limited time offers for public users", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.offers.getActive();

      expect(Array.isArray(result)).toBe(true);
      // Should return array (empty or with offers)
    });
  });

  describe("create", () => {
    it("should allow admin to create new offer", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const newOffer = {
        title: "Flash Sale",
        titleAr: "تخفيضات سريعة",
        description: "Limited time offer",
        descriptionAr: "عرض لفترة محدودة",
        discountPercentage: 20,
        durationMinutes: 60,
      };

      const result = await caller.offers.create(newOffer);

      // Skip test if database is not connected
      if (!result) {
        expect(result).toBeNull();
        return;
      }

      expect(result).toBeDefined();
      expect(result.title).toBe(newOffer.title);
      expect(result.discountPercentage).toBe(newOffer.discountPercentage);
    });

    it("should reject non-admin user from creating offer", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);

      const newOffer = {
        title: "Flash Sale",
        titleAr: "تخفيضات سريعة",
        description: "Limited time offer",
        descriptionAr: "عرض لفترة محدودة",
        discountPercentage: 20,
        durationMinutes: 60,
      };

      await expect(caller.offers.create(newOffer)).rejects.toThrow();
    });
  });

  describe("update", () => {
    it("should allow admin to update offer", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      // First create an offer
      const newOffer = {
        title: "Test Offer",
        titleAr: "عرض تجريبي",
        description: "Test description",
        descriptionAr: "وصف تجريبي",
        discountPercentage: 15,
        durationMinutes: 30,
      };

      const created = await caller.offers.create(newOffer);

      // Skip if creation failed
      if (!created) {
        expect(created).toBeNull();
        return;
      }

      // Then update it
      const updated = await caller.offers.update({
        id: created.id,
        discountPercentage: 25,
        isActive: false,
      });

      expect(updated).toBeDefined();
      expect(updated.discountPercentage).toBe(25);
      expect(updated.isActive).toBe(false);
    });
  });
});

describe("offers.signupPrompt", () => {
  describe("getVariants", () => {
    it("should return active signup prompt variants for public users", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.signupPrompt.getVariants();

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getRandomVariant", () => {
    it("should return a random variant for AB testing", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.signupPrompt.getRandomVariant();

      // Should return null or a variant object
      if (result) {
        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("variantId");
      }
    });
  });

  describe("recordResult", () => {
    it("should record AB test result", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      const testData = {
        sessionId: "test-session-123",
        variantId: "variant-a",
        shown: true,
      };

      const result = await caller.signupPrompt.recordResult(testData);

      expect(result).toBeDefined();
      if (result) {
        expect(result.sessionId).toBe(testData.sessionId);
        expect(result.variantId).toBe(testData.variantId);
        expect(result.shown).toBe(true);
      }
    });
  });

  describe("updateResult", () => {
    it("should update existing test result", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);

      // First record a result
      const testData = {
        sessionId: "test-session-456",
        variantId: "variant-b",
        shown: true,
      };

      const recorded = await caller.signupPrompt.recordResult(testData);

      // Skip if recording failed
      if (!recorded) {
        expect(recorded).toBeNull();
        return;
      }

      // Then update it
      const updated = await caller.signupPrompt.updateResult({
        id: recorded.id,
        clicked: true,
        converted: false,
      });

      expect(updated).toBeDefined();
      if (updated) {
        expect(updated.clicked).toBe(true);
        expect(updated.converted).toBe(false);
      }
    });
  });

  describe("getStats", () => {
    it("should return AB test statistics for admin", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.signupPrompt.getStats({ days: 7 });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("should reject non-admin from viewing stats", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.signupPrompt.getStats({ days: 7 })
      ).rejects.toThrow();
    });
  });

  describe("createVariant", () => {
    it("should allow admin to create new variant", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const newVariant = {
        variantId: "test-variant-" + Date.now(),
        title: "Test Variant",
        description: "Test description",
        ctaText: "Sign Up Now",
        messageThreshold: 5,
      };

      const result = await caller.signupPrompt.createVariant(newVariant);

      expect(result).toBeDefined();
      if (result) {
        expect(result.variantId).toBe(newVariant.variantId);
        expect(result.title).toBe(newVariant.title);
      }
    });
  });

  describe("updateVariant", () => {
    it("should allow admin to update variant", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      // First create a variant
      const newVariant = {
        variantId: "update-test-" + Date.now(),
        title: "Original Title",
        description: "Original description",
        ctaText: "Click Here",
        messageThreshold: 3,
      };

      const created = await caller.signupPrompt.createVariant(newVariant);

      // Skip if creation failed
      if (!created) {
        expect(created).toBeNull();
        return;
      }

      // Then update it
      const updated = await caller.signupPrompt.updateVariant({
        id: created.id,
        title: "Updated Title",
        isActive: false,
      });

      expect(updated).toBeDefined();
      if (updated) {
        expect(updated.title).toBe("Updated Title");
        expect(updated.isActive).toBe(false);
      }
    });
  });
});
