import { describe, it, expect, beforeAll } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';
import bcrypt from 'bcryptjs';

describe('Auth Login System', () => {
  let testUserId: number;
  const testEmail = 'test-login@example.com';
  const testPassword = 'testPassword123';
  let hashedPassword: string;

  // Mock request and response objects for testing
  const mockReq = {
    protocol: 'https',
    hostname: 'localhost',
    headers: {
      'x-forwarded-proto': 'https',
    },
  } as any;

  const mockRes = {
    cookie: () => {},
    setHeader: () => {},
    getHeader: () => undefined,
  } as any;

  beforeAll(async () => {
    // Create a test user with hashed password
    hashedPassword = await bcrypt.hash(testPassword, 10);
    const openId = `test_login_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const user = await db.createUser({
      openId,
      name: 'Test Login User',
      email: testEmail,
      password: hashedPassword,
      loginMethod: 'email',
      role: 'user',
      emailVerified: true, // Set as verified
    });

    if (!user) {
      throw new Error('Failed to create test user');
    }

    testUserId = user.id;
  });

  it('should login successfully with correct credentials', async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: mockReq,
      res: mockRes,
    });

    const result = await caller.auth.login({
      email: testEmail,
      password: testPassword,
      rememberMe: false,
    });

    expect(result.success).toBe(true);
    expect(result.user.email).toBe(testEmail);
    expect(result.token).toBeDefined();
  });

  it('should login with rememberMe option', async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: mockReq,
      res: mockRes,
    });

    const result = await caller.auth.login({
      email: testEmail,
      password: testPassword,
      rememberMe: true,
    });

    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();
  });

  it('should fail with non-existent email', async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: mockReq,
      res: mockRes,
    });

    await expect(
      caller.auth.login({
        email: 'nonexistent@example.com',
        password: testPassword,
        rememberMe: false,
      })
    ).rejects.toThrow('البريد الإلكتروني غير مسجل في النظام');
  });

  it('should fail with incorrect password', async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: mockReq,
      res: mockRes,
    });

    await expect(
      caller.auth.login({
        email: testEmail,
        password: 'wrongPassword',
        rememberMe: false,
      })
    ).rejects.toThrow('كلمة المرور غير صحيحة');
  });

  // Note: emailVerified field is not in the schema, so this test is skipped

  it('should fail for OAuth users without password', async () => {
    // Create an OAuth user (no password)
    const oauthEmail = 'oauth@example.com';
    const openId = `test_oauth_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    await db.createUser({
      openId,
      name: 'OAuth User',
      email: oauthEmail,
      password: null, // No password for OAuth users
      loginMethod: 'oauth',
      role: 'user',
      emailVerified: true,
    });

    const caller = appRouter.createCaller({
      user: null,
      req: mockReq,
      res: mockRes,
    });

    await expect(
      caller.auth.login({
        email: oauthEmail,
        password: 'anyPassword',
        rememberMe: false,
      })
    ).rejects.toThrow('هذا الحساب مسجل عبر OAuth');
  });

  it('should update lastSignedIn on successful login', async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: mockReq,
      res: mockRes,
    });

    const beforeLogin = new Date();
    
    await caller.auth.login({
      email: testEmail,
      password: testPassword,
      rememberMe: false,
    });

    const user = await db.getUserByEmail(testEmail);
    expect(user).toBeDefined();
    expect(user!.lastSignedIn).toBeDefined();
    
    if (user!.lastSignedIn) {
      const lastSignedIn = new Date(user!.lastSignedIn);
      expect(lastSignedIn.getTime()).toBeGreaterThanOrEqual(beforeLogin.getTime());
    }
  });
});
