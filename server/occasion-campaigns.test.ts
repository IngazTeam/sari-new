/**
 * Occasion Campaigns System Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';
import {
  detectCurrentOccasion,
  generateOccasionDiscount,
  generateOccasionMessage,
  getUpcomingOccasions,
} from './automation/occasion-campaigns';

describe('Occasion Campaigns System', () => {
  let testMerchantId: number;

  beforeAll(async () => {
    // Create test merchant
    const merchant = await db.createMerchant({
      userId: 999,
      businessName: 'Test Store for Occasions',
      phoneNumber: '+966500000999',
      status: 'active',
      autoReplyEnabled: true,
    });
    testMerchantId = merchant!.id;
  });

  describe('detectCurrentOccasion', () => {
    it('should detect occasion or return null', () => {
      const occasion = detectCurrentOccasion();
      
      // Occasion may or may not be detected depending on current date
      if (occasion) {
        expect(occasion).toHaveProperty('type');
        expect(occasion).toHaveProperty('name');
        expect(occasion).toHaveProperty('discountPercent');
        expect(occasion.discountPercent).toBeGreaterThan(0);
      } else {
        expect(occasion).toBeNull();
      }
    });
  });

  describe('generateOccasionDiscount', () => {
    it('should create a discount code for Ramadan', async () => {
      const code = await generateOccasionDiscount(testMerchantId, 'ramadan', 20);

      expect(code).toBeDefined();
      expect(code).toMatch(/^RAMADAN\d{8}$/);

      // Verify discount code exists in database
      const discount = await db.getDiscountCodeByCode(testMerchantId, code);
      expect(discount).toBeDefined();
      expect(discount?.type).toBe('percentage');
      expect(discount?.value).toBe(20);
      expect(discount?.maxUses).toBe(100);
    });

    it('should create a discount code for National Day', async () => {
      const code = await generateOccasionDiscount(testMerchantId, 'national_day', 23);

      expect(code).toBeDefined();
      expect(code).toMatch(/^NATIONAL\d{8}$/);

      const discount = await db.getDiscountCodeByCode(testMerchantId, code);
      expect(discount).toBeDefined();
      expect(discount?.value).toBe(23);
    });

    it('should create a discount code for Eid Fitr', async () => {
      const code = await generateOccasionDiscount(testMerchantId, 'eid_fitr', 25);

      expect(code).toBeDefined();
      expect(code).toMatch(/^EIDFITR\d{8}$/);

      const discount = await db.getDiscountCodeByCode(testMerchantId, code);
      expect(discount).toBeDefined();
      expect(discount?.value).toBe(25);
    });
  });

  describe('generateOccasionMessage', () => {
    it('should generate message with customer name', () => {
      const message = generateOccasionMessage(
        'رمضان المبارك',
        'أحمد',
        'RAMADAN20241234',
        20,
        'متجر الإلكترونيات'
      );

      expect(message).toContain('مرحباً أحمد!');
      expect(message).toContain('رمضان المبارك');
      expect(message).toContain('RAMADAN20241234');
      expect(message).toContain('20%');
      expect(message).toContain('متجر الإلكترونيات');
    });

    it('should generate message without customer name', () => {
      const message = generateOccasionMessage(
        'اليوم الوطني السعودي',
        null,
        'NATIONAL20241234',
        23,
        'متجر الهدايا'
      );

      expect(message).toContain('مرحباً!');
      expect(message).toContain('اليوم الوطني السعودي');
      expect(message).toContain('NATIONAL20241234');
      expect(message).toContain('23%');
      expect(message).toContain('متجر الهدايا');
    });
  });

  describe('getUpcomingOccasions', () => {
    it('should return upcoming occasions within 30 days', () => {
      const upcoming = getUpcomingOccasions();

      expect(Array.isArray(upcoming)).toBe(true);

      // Each occasion should have required properties
      upcoming.forEach((occasion) => {
        expect(occasion).toHaveProperty('type');
        expect(occasion).toHaveProperty('name');
        expect(occasion).toHaveProperty('date');
        expect(occasion).toHaveProperty('daysUntil');
        expect(occasion.daysUntil).toBeGreaterThanOrEqual(0);
        expect(occasion.daysUntil).toBeLessThanOrEqual(30);
      });

      // Should be sorted by daysUntil
      for (let i = 1; i < upcoming.length; i++) {
        expect(upcoming[i].daysUntil).toBeGreaterThanOrEqual(upcoming[i - 1].daysUntil);
      }
    });
  });

  describe('Database Functions', () => {
    it('should create and retrieve occasion campaign', async () => {
      const campaign = await db.createOccasionCampaign({
        merchantId: testMerchantId,
        occasionType: 'ramadan',
        year: 2024,
        enabled: true,
        discountPercentage: 20,
        status: 'pending',
      });

      expect(campaign).toBeDefined();
      expect(campaign?.occasionType).toBe('ramadan');
      expect(campaign?.year).toBe(2024);

      const retrieved = await db.getOccasionCampaignById(campaign!.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(campaign?.id);
    });

    it('should get occasion campaigns by merchant', async () => {
      const campaigns = await db.getOccasionCampaignsByMerchantId(testMerchantId);
      expect(campaigns).toBeDefined();
      expect(Array.isArray(campaigns)).toBe(true);
      expect(campaigns.length).toBeGreaterThan(0);
    });

    it('should get occasion campaign by type and year', async () => {
      const campaign = await db.getOccasionCampaignByTypeAndYear(
        testMerchantId,
        'ramadan',
        2024
      );

      expect(campaign).toBeDefined();
      expect(campaign?.occasionType).toBe('ramadan');
      expect(campaign?.year).toBe(2024);
    });

    it('should update occasion campaign', async () => {
      const campaign = await db.createOccasionCampaign({
        merchantId: testMerchantId,
        occasionType: 'eid_fitr',
        year: 2024,
        enabled: true,
        discountPercentage: 25,
        status: 'pending',
      });

      await db.updateOccasionCampaign(campaign!.id, {
        enabled: false,
        discountCode: 'EIDFITR20241234',
      });

      const updated = await db.getOccasionCampaignById(campaign!.id);
      expect(updated?.enabled).toBe(false);
      expect(updated?.discountCode).toBe('EIDFITR20241234');
    });

    it('should mark occasion campaign as sent', async () => {
      const campaign = await db.createOccasionCampaign({
        merchantId: testMerchantId,
        occasionType: 'national_day',
        year: 2024,
        enabled: true,
        discountPercentage: 23,
        status: 'pending',
      });

      await db.markOccasionCampaignSent(campaign!.id, 150);

      const updated = await db.getOccasionCampaignById(campaign!.id);
      expect(updated?.status).toBe('sent');
      expect(updated?.recipientCount).toBe(150);
      expect(updated?.sentAt).toBeDefined();
    });

    it('should get occasion campaigns statistics', async () => {
      const stats = await db.getOccasionCampaignsStats(testMerchantId);

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('totalCampaigns');
      expect(stats).toHaveProperty('sentCampaigns');
      expect(stats).toHaveProperty('totalRecipients');
      expect(stats.totalCampaigns).toBeGreaterThan(0);
    });
  });
});
