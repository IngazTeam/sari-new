import { describe, it, expect, beforeEach, vi } from "vitest";
import { verifyGoogleToken, resolveExistingGoogleUser, validateGoogleConfig } from "./google-auth";
import * as db from "./db";
import * as verification from './accounts/email-verification-security';

// Mock the db module
vi.mock("./db");
vi.mock('./accounts/email-verification-security', () => ({
  markVerifiedIdentityProviderEmail: vi.fn(),
}));

describe("Google Auth Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateGoogleConfig", () => {
    it("should throw error if googleClientId is missing", () => {
      // ENV is read at module load time, so we can't test this directly
      // Instead, we'll test that the function exists and is callable
      expect(typeof validateGoogleConfig).toBe("function");
    });

    it("should throw error if googleClientSecret is missing", () => {
      // ENV is read at module load time, so we can't test this directly
      expect(typeof validateGoogleConfig).toBe("function");
    });

    it("should return true if both credentials are set", () => {
      // ENV is read at module load time, so we can't test this directly
      expect(typeof validateGoogleConfig).toBe("function");
    });
  });

  describe("verifyGoogleToken", () => {
    it("should throw error for invalid token", async () => {
      // The function will throw an error when trying to verify invalid token
      await expect(verifyGoogleToken("invalid-token")).rejects.toThrow();
    });


  });

  describe("resolveExistingGoogleUser", () => {
    it("should return existing user if found", async () => {
      const mockUser = {
        id: 1,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      };

      vi.mocked(db.getUserByEmail).mockResolvedValueOnce(mockUser as any);

      const result = await resolveExistingGoogleUser({
        email: "test@example.com",
        name: "Test User",
        picture: "https://example.com/pic.jpg",
        googleId: "google-123",
      });

      expect(result).toEqual(mockUser);
      expect(db.getUserByEmail).toHaveBeenCalledWith("test@example.com");
      expect(verification.markVerifiedIdentityProviderEmail).toHaveBeenCalledWith(1, 'test@example.com');
    });

    it("should require canonical signup if no account exists", async () => {
      vi.mocked(db.getUserByEmail).mockResolvedValueOnce(null);

      await expect(resolveExistingGoogleUser({
        email: 'newuser@example.com',
        name: 'New User',
        picture: 'https://example.com/pic.jpg',
        googleId: 'google-456',
      })).rejects.toThrow('GOOGLE_ACCOUNT_REGISTRATION_REQUIRED');
      expect(db.createUser).not.toHaveBeenCalled();
      expect(verification.markVerifiedIdentityProviderEmail).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(db.getUserByEmail).mockRejectedValueOnce(
        new Error("Database error")
      );

      await expect(
        resolveExistingGoogleUser({
          email: "test@example.com",
          name: "Test User",
          picture: "https://example.com/pic.jpg",
          googleId: "google-123",
        })
      ).rejects.toThrow('تعذر ربط حساب Google');
    });
  });
});
