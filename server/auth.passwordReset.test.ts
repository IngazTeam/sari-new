import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';
import bcrypt from 'bcryptjs';

describe('Password Reset System', () => {
  let testUserId: number;
  let testUserEmail: string;
  let resetToken: string;

  beforeAll(async () => {
    // Create a test user for password reset
    testUserEmail = `reset_test_${Date.now()}@test.com`;
    const hashedPassword = await bcrypt.hash('oldpassword123', 10);
    
    const user = await db.createUser({
      openId: `reset_test_${Date.now()}`,
      name: 'Reset Test User',
      email: testUserEmail,
      password: hashedPassword,
      loginMethod: 'email',
      role: 'user',
    });

    if (!user) throw new Error('Failed to create test user');
    testUserId = user.id;
  });

  it('should create a password reset token', async () => {
    resetToken = `test_token_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    const token = await db.createPasswordResetToken({
      userId: testUserId,
      email: testUserEmail,
      token: resetToken,
      expiresAt,
    });

    expect(token).toBeDefined();
    expect(token?.userId).toBe(testUserId);
    expect(token?.email).toBe(testUserEmail);
    expect(token?.token).toBe(resetToken);
    expect(token?.used).toBe(false);
  });

  it('should retrieve reset token by token string', async () => {
    const token = await db.getPasswordResetTokenByToken(resetToken);

    expect(token).toBeDefined();
    expect(token?.userId).toBe(testUserId);
    expect(token?.email).toBe(testUserEmail);
  });

  it('should validate a valid reset token', async () => {
    const validation = await db.validatePasswordResetToken(resetToken);

    expect(validation.valid).toBe(true);
    expect(validation.token).toBeDefined();
    expect(validation.token?.userId).toBe(testUserId);
  });

  it('should reject an invalid token', async () => {
    const validation = await db.validatePasswordResetToken('invalid_token_12345');

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('invalid_token');
  });

  it('should reject an expired token', async () => {
    // Create an expired token
    const expiredToken = `expired_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const expiredDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

    await db.createPasswordResetToken({
      userId: testUserId,
      email: testUserEmail,
      token: expiredToken,
      expiresAt: expiredDate,
    });

    const validation = await db.validatePasswordResetToken(expiredToken);

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('token_expired');
  });

  it('should mark token as used', async () => {
    const token = await db.getPasswordResetTokenByToken(resetToken);
    expect(token).toBeDefined();

    await db.markPasswordResetTokenAsUsed(token!.id);

    const updatedToken = await db.getPasswordResetTokenByToken(resetToken);
    expect(updatedToken?.used).toBe(true);
    expect(updatedToken?.usedAt).toBeDefined();
  });

  it('should reject a used token', async () => {
    const validation = await db.validatePasswordResetToken(resetToken);

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('token_already_used');
  });

  it('should update user password', async () => {
    const newPassword = 'newpassword456';
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await db.updateUser(testUserId, { password: hashedNewPassword });

    const user = await db.getUserById(testUserId);
    expect(user).toBeDefined();
    expect(user?.password).toBeDefined();

    // Verify new password works
    const isValid = await bcrypt.compare(newPassword, user!.password!);
    expect(isValid).toBe(true);

    // Verify old password doesn't work
    const isOldValid = await bcrypt.compare('oldpassword123', user!.password!);
    expect(isOldValid).toBe(false);
  });

  it('should delete all reset tokens for a user', async () => {
    // Create multiple tokens
    const token1 = `cleanup_1_${Date.now()}`;
    const token2 = `cleanup_2_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.createPasswordResetToken({
      userId: testUserId,
      email: testUserEmail,
      token: token1,
      expiresAt,
    });

    await db.createPasswordResetToken({
      userId: testUserId,
      email: testUserEmail,
      token: token2,
      expiresAt,
    });

    // Delete all tokens for user
    await db.deletePasswordResetTokensByUserId(testUserId);

    // Verify tokens are deleted
    const deletedToken1 = await db.getPasswordResetTokenByToken(token1);
    const deletedToken2 = await db.getPasswordResetTokenByToken(token2);

    expect(deletedToken1).toBeUndefined();
    expect(deletedToken2).toBeUndefined();
  });

  it('should delete expired tokens', async () => {
    // Create an expired token
    const expiredToken = `cleanup_expired_${Date.now()}`;
    const expiredDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

    await db.createPasswordResetToken({
      userId: testUserId,
      email: testUserEmail,
      token: expiredToken,
      expiresAt: expiredDate,
    });

    // Delete expired tokens
    await db.deleteExpiredPasswordResetTokens();

    // Verify expired token is deleted
    const deletedToken = await db.getPasswordResetTokenByToken(expiredToken);
    expect(deletedToken).toBeUndefined();
  });
});
