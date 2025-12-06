import { describe, it, expect } from 'vitest';
import { appRouter } from './routers';

describe('WhatsApp Connection Requests', () => {
  const merchantCaller = appRouter.createCaller({
    user: { id: 1, openId: 'test-merchant', name: 'Test Merchant', email: 'merchant@test.com', role: 'user', createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), loginMethod: 'test' },
  });

  const adminCaller = appRouter.createCaller({
    user: { id: 999, openId: 'test-admin', name: 'Test Admin', email: 'admin@test.com', role: 'admin', createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), loginMethod: 'test' },
  });

  describe('Request Connection', () => {
    it('should allow merchant to request WhatsApp connection', async () => {
      const result = await merchantCaller.whatsapp.requestConnection({
        countryCode: '+966',
        phoneNumber: '501234567',
      });

      expect(result.success).toBe(true);
      expect(result.request).toBeDefined();
      expect(result.request.fullNumber).toBe('+966501234567');
      expect(result.request.status).toBe('pending');
    });

    it('should prevent duplicate pending requests', async () => {
      await expect(
        merchantCaller.whatsapp.requestConnection({
          countryCode: '+966',
          phoneNumber: '509876543',
        })
      ).rejects.toThrow('You already have a pending request');
    });

    it('should get current request status', async () => {
      const status = await merchantCaller.whatsapp.getRequestStatus();

      expect(status).toBeDefined();
      expect(status.status).toBe('pending');
    });
  });

  describe('Admin Operations', () => {
    let requestId: number;

    it('should allow admin to list all requests', async () => {
      const requests = await adminCaller.whatsapp.listRequests({});

      expect(Array.isArray(requests)).toBe(true);
      expect(requests.length).toBeGreaterThan(0);
      
      // Save request ID for next tests
      requestId = requests[0].id;
    });

    it('should allow admin to list pending requests', async () => {
      const requests = await adminCaller.whatsapp.listRequests({ status: 'pending' });

      expect(Array.isArray(requests)).toBe(true);
      expect(requests.every((r: any) => r.status === 'pending')).toBe(true);
    });

    it('should allow admin to approve request', async () => {
      const requests = await adminCaller.whatsapp.listRequests({ status: 'pending' });
      if (requests.length === 0) {
        // Skip if no pending requests
        return;
      }

      const result = await adminCaller.whatsapp.approveRequest({ requestId: requests[0].id });
      expect(result.success).toBe(true);
    });


  });

  describe('Permissions', () => {
    it('should prevent non-admin from listing requests', async () => {
      await expect(
        merchantCaller.whatsapp.listRequests({})
      ).rejects.toThrow();
    });

    it('should prevent non-admin from approving requests', async () => {
      await expect(
        merchantCaller.whatsapp.approveRequest({ requestId: 1 })
      ).rejects.toThrow();
    });

    it('should prevent non-admin from rejecting requests', async () => {
      await expect(
        merchantCaller.whatsapp.rejectRequest({ requestId: 1, reason: 'test' })
      ).rejects.toThrow();
    });
  });
});
