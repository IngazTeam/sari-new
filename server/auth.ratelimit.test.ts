import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';
import { passwordResetAttempts } from '../drizzle/schema';

describe.skipIf(!process.env.DATABASE_URL)('Password Reset Rate Limiting (database integration)', () => {
  const testEmail = 'ratelimit-test@example.com';

  // Clean up ALL attempts before running tests
  beforeAll(async () => {
    const dbInstance = await db.getDb();
    if (dbInstance) {
      // Delete all password reset attempts to start fresh
      await dbInstance.delete(passwordResetAttempts);
    }
  });

  it('should allow first password reset attempt', async () => {
    const result = await db.canRequestReset(testEmail);
    
    expect(result.allowed).toBe(true);
    expect(result.attemptsCount).toBe(0);
    expect(result.remainingTime).toBeUndefined();
  });

  it('should track password reset attempts', async () => {
    // Clean up first
    const dbInstance = await db.getDb();
    if (dbInstance) {
      await dbInstance.delete(passwordResetAttempts);
    }
    
    // Track first attempt
    await db.trackResetAttempt({ email: testEmail });
    
    const result = await db.canRequestReset(testEmail);
    
    expect(result.allowed).toBe(true);
    expect(result.attemptsCount).toBe(1);
  });

  it('should allow up to 3 attempts', async () => {
    // Clean up first
    const dbInstance = await db.getDb();
    if (dbInstance) {
      await dbInstance.delete(passwordResetAttempts);
    }
    
    // Track 2 attempts
    await db.trackResetAttempt({ email: testEmail });
    await db.trackResetAttempt({ email: testEmail });
    
    const result = await db.canRequestReset(testEmail);
    
    expect(result.allowed).toBe(true);
    expect(result.attemptsCount).toBe(2);
  });

  it('should block after 3 attempts', async () => {
    // Clean up first
    const dbInstance = await db.getDb();
    if (dbInstance) {
      await dbInstance.delete(passwordResetAttempts);
    }
    
    // Track 3 attempts
    await db.trackResetAttempt({ email: testEmail });
    await db.trackResetAttempt({ email: testEmail });
    await db.trackResetAttempt({ email: testEmail });
    
    const result = await db.canRequestReset(testEmail);
    
    expect(result.allowed).toBe(false);
    expect(result.attemptsCount).toBe(3);
    expect(result.remainingTime).toBeGreaterThan(0);
    expect(result.remainingTime).toBeLessThanOrEqual(600); // 10 minutes = 600 seconds
  });

  it('should return correct remaining time', async () => {
    // Clean up first
    const dbInstance = await db.getDb();
    if (dbInstance) {
      await dbInstance.delete(passwordResetAttempts);
    }
    
    // Track 3 attempts
    await db.trackResetAttempt({ email: testEmail });
    await db.trackResetAttempt({ email: testEmail });
    await db.trackResetAttempt({ email: testEmail });
    
    const result = await db.canRequestReset(testEmail);
    
    expect(result.allowed).toBe(false);
    expect(result.remainingTime).toBeDefined();
    
    // Remaining time should be close to 10 minutes (600 seconds)
    // Allow some margin for test execution time
    expect(result.remainingTime!).toBeGreaterThan(590);
    expect(result.remainingTime!).toBeLessThanOrEqual(600);
  });

  it('should retrieve reset attempts for email', async () => {
    // Clean up first
    const dbInstance = await db.getDb();
    if (dbInstance) {
      await dbInstance.delete(passwordResetAttempts);
    }
    
    // Track 2 attempts
    await db.trackResetAttempt({ email: testEmail });
    await db.trackResetAttempt({ email: testEmail });
    
    const attempts = await db.getResetAttempts(testEmail, 10);
    
    expect(attempts).toHaveLength(2);
    expect(attempts[0].email).not.toBe(testEmail);
    expect(attempts[0].email).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should only count attempts within time window', async () => {
    // Clean up first
    const dbInstance = await db.getDb();
    if (dbInstance) {
      await dbInstance.delete(passwordResetAttempts);
    }
    
    // This test verifies that old attempts are not counted
    // In a real scenario, we would need to mock time or wait
    // For now, we test with a very short time window
    
    await db.trackResetAttempt({ email: testEmail });
    
    // Get attempts from last 0 minutes (should return empty)
    const recentAttempts = await db.getResetAttempts(testEmail, 0);
    expect(recentAttempts).toHaveLength(0);
    
    // Get attempts from last 10 minutes (should return 1)
    const allAttempts = await db.getResetAttempts(testEmail, 10);
    expect(allAttempts).toHaveLength(1);
  });

  it('should clear old attempts', async () => {
    // Clean up first
    const dbInstance = await db.getDb();
    if (dbInstance) {
      await dbInstance.delete(passwordResetAttempts);
    }
    
    // Track an attempt
    await db.trackResetAttempt({ email: testEmail });
    
    // Verify it exists
    let attempts = await db.getResetAttempts(testEmail, 10);
    expect(attempts).toHaveLength(1);
    
    // Clear old attempts (this will only clear attempts older than 1 hour)
    await db.clearOldAttempts();
    
    // Recent attempts should still exist
    attempts = await db.getResetAttempts(testEmail, 10);
    expect(attempts).toHaveLength(1);
  });

  it('should handle different emails independently', async () => {
    const email1 = 'user1@example.com';
    const email2 = 'user2@example.com';
    
    // Clean up first
    const dbInstance = await db.getDb();
    if (dbInstance) {
      await dbInstance.delete(passwordResetAttempts);
    }
    
    // Track 3 attempts for email1
    await db.trackResetAttempt({ email: email1 });
    await db.trackResetAttempt({ email: email1 });
    await db.trackResetAttempt({ email: email1 });
    
    // Track 1 attempt for email2
    await db.trackResetAttempt({ email: email2 });
    
    const result1 = await db.canRequestReset(email1);
    const result2 = await db.canRequestReset(email2);
    
    // email1 should be blocked
    expect(result1.allowed).toBe(false);
    expect(result1.attemptsCount).toBe(3);
    
    // email2 should be allowed
    expect(result2.allowed).toBe(true);
    expect(result2.attemptsCount).toBe(1);
  });

  it('should store IP address when provided', async () => {
    // Clean up first
    const dbInstance = await db.getDb();
    if (dbInstance) {
      await dbInstance.delete(passwordResetAttempts);
    }
    
    const ipAddress = '192.168.1.100';
    
    await db.trackResetAttempt({ 
      email: testEmail, 
      ipAddress 
    });
    
    const attempts = await db.getResetAttempts(testEmail, 10);
    
    expect(attempts).toHaveLength(1);
    expect(attempts[0].ipAddress).not.toBe(ipAddress);
    expect(attempts[0].ipAddress).toMatch(/^[a-f0-9]{45}$/);
  });
});
