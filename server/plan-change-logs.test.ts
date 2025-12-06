import { describe, it, expect, beforeAll } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';

describe('Plan Change Logs', () => {
  let testPlanId: number;
  let adminUserId: string;

  beforeAll(async () => {
    // Create a test plan
    const plan = await db.createPlan({
      name: 'TEST_LOG',
      nameAr: 'Test Plan for Logs',
      priceMonthly: 100,
      conversationLimit: 100,
      voiceMessageLimit: 50,
      features: JSON.stringify({ test: true }),
      isActive: true,
    });
    if (plan) {
      testPlanId = plan.id;
    }

    adminUserId = '1';
  });

  it('should create change log when updating plan price', async () => {
    const caller = appRouter.createCaller({
      user: {
        id: adminUserId,
        openId: 'admin-open-id',
        name: 'Admin User',
        email: 'admin@test.com',
        role: 'admin',
      },
    });

    // Update price
    await caller.plans.update({
      id: testPlanId,
      priceMonthly: 150,
    });

    // Check change log was created
    const logs = await db.getPlanChangeLogs(testPlanId);
    expect(logs.length).toBeGreaterThan(0);
    
    const priceLog = logs.find(log => log.fieldName === 'priceMonthly');
    expect(priceLog).toBeDefined();
    expect(priceLog?.oldValue).toBe('100');
    expect(priceLog?.newValue).toBe('150');
    expect(priceLog?.changedBy).toBe(parseInt(adminUserId));
  });

  it('should create change log when updating conversation limit', async () => {
    const caller = appRouter.createCaller({
      user: {
        id: adminUserId,
        openId: 'admin-open-id',
        name: 'Admin User',
        email: 'admin@test.com',
        role: 'admin',
      },
    });

    // Update conversation limit
    await caller.plans.update({
      id: testPlanId,
      conversationLimit: 200,
    });

    // Check change log was created
    const logs = await db.getPlanChangeLogs(testPlanId);
    const limitLog = logs.find(log => log.fieldName === 'conversationLimit');
    expect(limitLog).toBeDefined();
    expect(limitLog?.oldValue).toBe('100');
    expect(limitLog?.newValue).toBe('200');
  });

  it('should create multiple change logs when updating multiple fields', async () => {
    const caller = appRouter.createCaller({
      user: {
        id: adminUserId,
        openId: 'admin-open-id',
        name: 'Admin User',
        email: 'admin@test.com',
        role: 'admin',
      },
    });

    // Get logs count before update
    const logsBefore = await db.getPlanChangeLogs(testPlanId);
    const countBefore = logsBefore.length;

    // Update multiple fields
    await caller.plans.update({
      id: testPlanId,
      priceMonthly: 180,
      voiceMessageLimit: 100,
    });

    // Check multiple change logs were created
    const logsAfter = await db.getPlanChangeLogs(testPlanId);
    expect(logsAfter.length).toBeGreaterThan(countBefore);
    
    const recentLogs = logsAfter.slice(0, 2);
    const fieldNames = recentLogs.map(log => log.fieldName);
    expect(fieldNames).toContain('priceMonthly');
    expect(fieldNames).toContain('voiceMessageLimit');
  });

  it('should allow admin to get all change logs', async () => {
    const caller = appRouter.createCaller({
      user: {
        id: adminUserId,
        openId: 'admin-open-id',
        name: 'Admin User',
        email: 'admin@test.com',
        role: 'admin',
      },
    });

    const logs = await caller.plans.getChangeLogs({});
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
  });

  it('should allow admin to get change logs for specific plan', async () => {
    const caller = appRouter.createCaller({
      user: {
        id: adminUserId,
        openId: 'admin-open-id',
        name: 'Admin User',
        email: 'admin@test.com',
        role: 'admin',
      },
    });

    const logs = await caller.plans.getChangeLogs({ planId: testPlanId });
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.every(log => log.planId === testPlanId)).toBe(true);
  });

  it('should reject non-admin from getting change logs', async () => {
    const caller = appRouter.createCaller({
      user: {
        id: '2',
        openId: 'user-open-id',
        name: 'Regular User',
        email: 'user@test.com',
        role: 'user',
      },
    });

    await expect(
      caller.plans.getChangeLogs({})
    ).rejects.toThrow('Admin access required');
  });

  it('should not create change log when no fields are changed', async () => {
    const caller = appRouter.createCaller({
      user: {
        id: adminUserId,
        openId: 'admin-open-id',
        name: 'Admin User',
        email: 'admin@test.com',
        role: 'admin',
      },
    });

    // Get logs count before update
    const logsBefore = await db.getPlanChangeLogs(testPlanId);
    const countBefore = logsBefore.length;

    // Get current plan
    const currentPlan = await db.getPlanById(testPlanId);

    // Update with same values
    await caller.plans.update({
      id: testPlanId,
      priceMonthly: currentPlan?.priceMonthly,
    });

    // Check no new logs were created
    const logsAfter = await db.getPlanChangeLogs(testPlanId);
    expect(logsAfter.length).toBe(countBefore);
  });

  it('should log isActive status changes', async () => {
    const caller = appRouter.createCaller({
      user: {
        id: adminUserId,
        openId: 'admin-open-id',
        name: 'Admin User',
        email: 'admin@test.com',
        role: 'admin',
      },
    });

    // Deactivate plan
    await caller.plans.update({
      id: testPlanId,
      isActive: false,
    });

    // Check change log
    const logs = await db.getPlanChangeLogs(testPlanId);
    const statusLog = logs.find(log => log.fieldName === 'isActive');
    expect(statusLog).toBeDefined();
    expect(statusLog?.oldValue).toBe('true');
    expect(statusLog?.newValue).toBe('false');

    // Reactivate for cleanup
    await caller.plans.update({
      id: testPlanId,
      isActive: true,
    });
  });
});
