import { describe, it, expect, beforeAll } from 'vitest';
import { generateAIResponse } from '../ai';
import * as db from '../db';

describe('Enhanced AI System - Products & Orders Understanding', () => {
  let testMerchantId: number;
  let testCustomerPhone: string;
  let testOrderId: number;

  beforeAll(async () => {
    // إنشاء تاجر تجريبي
    const merchant = await db.createMerchant({
      userId: 1,
      businessName: 'متجر الإلكترونيات',
      phone: '+966501234567',
      status: 'active',
      autoReplyEnabled: true,
    });
    testMerchantId = merchant!.id;
    testCustomerPhone = '+966509876543';

    // إنشاء منتجات تجريبية
    await db.createProduct({
      merchantId: testMerchantId,
      name: 'آيفون 15 برو',
      description: 'أحدث إصدار من آيفون مع معالج A17 Pro',
      price: 4999,
      stock: 10,
      category: 'جوالات',
    });

    await db.createProduct({
      merchantId: testMerchantId,
      name: 'سماعات إيربودز برو',
      description: 'سماعات لاسلكية مع إلغاء ضوضاء',
      price: 899,
      stock: 25,
      category: 'إكسسوارات',
    });

    // إنشاء طلب تجريبي
    const items = JSON.stringify([
      { productId: 1, name: 'آيفون 15 برو', quantity: 1, price: 4999 }
    ]);
    
    testOrderId = await db.createOrder({
      merchantId: testMerchantId,
      customerPhone: testCustomerPhone,
      customerName: 'أحمد محمد',
      items,
      totalAmount: 4999,
      status: 'shipped',
      trackingNumber: 'TR123456789',
    });
  });

  describe('Product Understanding', () => {
    it('should understand product inquiry and provide details', async () => {
      const response = await generateAIResponse(
        testMerchantId,
        'عندكم آيفون 15 برو؟'
      );

      expect(response).toBeTruthy();
      expect(response.toLowerCase()).toMatch(/آيفون|iphone/i);
      expect(response).toMatch(/4999|4,999/);
      console.log('Product Inquiry Response:', response);
    });

    it('should handle product comparison requests', async () => {
      const response = await generateAIResponse(
        testMerchantId,
        'وش الفرق بين آيفون والسماعات؟'
      );

      expect(response).toBeTruthy();
      expect(response.length).toBeGreaterThan(50);
      console.log('Product Comparison Response:', response);
    });

    it('should provide price information accurately', async () => {
      const response = await generateAIResponse(
        testMerchantId,
        'كم سعر السماعات؟'
      );

      expect(response).toBeTruthy();
      expect(response).toMatch(/899|سماعات/i);
      console.log('Price Inquiry Response:', response);
    });

    it('should handle stock availability questions', async () => {
      const response = await generateAIResponse(
        testMerchantId,
        'متوفر عندكم آيفون؟'
      );

      expect(response).toBeTruthy();
      expect(response.toLowerCase()).toMatch(/متوفر|نعم|أكيد/);
      console.log('Stock Availability Response:', response);
    });
  });

  describe('Order Understanding', () => {
    it('should understand order tracking requests with customer phone', async () => {
      const response = await generateAIResponse(
        testMerchantId,
        'وين طلبي؟',
        [],
        testCustomerPhone
      );

      expect(response).toBeTruthy();
      expect(response.toLowerCase()).toMatch(/طلب|شحن|توصيل/);
      console.log('Order Tracking Response:', response);
    });

    it('should provide order status information', async () => {
      const response = await generateAIResponse(
        testMerchantId,
        `وش حالة طلب رقم ${testOrderId}؟`,
        [],
        testCustomerPhone
      );

      expect(response).toBeTruthy();
      expect(response.length).toBeGreaterThan(20);
      console.log('Order Status Response:', response);
    });

    it('should handle tracking number requests', async () => {
      const response = await generateAIResponse(
        testMerchantId,
        'أعطني رقم التتبع',
        [],
        testCustomerPhone
      );

      expect(response).toBeTruthy();
      console.log('Tracking Number Response:', response);
    });

    it('should understand order history requests', async () => {
      const response = await generateAIResponse(
        testMerchantId,
        'وش طلباتي السابقة؟',
        [],
        testCustomerPhone
      );

      expect(response).toBeTruthy();
      expect(response.toLowerCase()).toMatch(/طلب/);
      console.log('Order History Response:', response);
    });
  });

  describe('Context Awareness', () => {
    it('should maintain conversation context', async () => {
      const conversationHistory = [
        { role: 'user' as const, content: 'عندكم آيفون؟' },
        { role: 'assistant' as const, content: 'نعم عندنا آيفون 15 برو بسعر 4999 ريال' }
      ];

      const response = await generateAIResponse(
        testMerchantId,
        'كم الضمان عليه؟',
        conversationHistory
      );

      expect(response).toBeTruthy();
      expect(response.length).toBeGreaterThan(20);
      console.log('Context Awareness Response:', response);
    });

    it('should handle follow-up questions about products', async () => {
      const conversationHistory = [
        { role: 'user' as const, content: 'أبي سماعات' },
        { role: 'assistant' as const, content: 'عندنا سماعات إيربودز برو بسعر 899 ريال' }
      ];

      const response = await generateAIResponse(
        testMerchantId,
        'وش مميزاتها؟',
        conversationHistory
      );

      expect(response).toBeTruthy();
      console.log('Follow-up Question Response:', response);
    });
  });

  describe('Purchase Intent', () => {
    it('should understand purchase requests', async () => {
      const response = await generateAIResponse(
        testMerchantId,
        'أبي أشتري آيفون 15 برو'
      );

      expect(response).toBeTruthy();
      expect(response.toLowerCase()).toMatch(/طلب|شراء|تأكيد/);
      console.log('Purchase Intent Response:', response);
    });

    it('should handle quantity questions', async () => {
      const response = await generateAIResponse(
        testMerchantId,
        'أبي 2 سماعات'
      );

      expect(response).toBeTruthy();
      console.log('Quantity Request Response:', response);
    });
  });

  describe('Customer Service', () => {
    it('should handle greetings professionally', async () => {
      const response = await generateAIResponse(
        testMerchantId,
        'السلام عليكم'
      );

      expect(response).toBeTruthy();
      expect(response.toLowerCase()).toMatch(/وعليكم|أهلا|مرحبا/);
      console.log('Greeting Response:', response);
    });

    it('should handle complaints with empathy', async () => {
      const response = await generateAIResponse(
        testMerchantId,
        'المنتج اللي وصلني فيه مشكلة',
        [],
        testCustomerPhone
      );

      expect(response).toBeTruthy();
      expect(response.toLowerCase()).toMatch(/آسف|مشكلة|نساعد/);
      console.log('Complaint Response:', response);
    });

    it('should provide helpful responses for unclear requests', async () => {
      const response = await generateAIResponse(
        testMerchantId,
        'أبي شي حلو'
      );

      expect(response).toBeTruthy();
      expect(response.length).toBeGreaterThan(30);
      console.log('Unclear Request Response:', response);
    });
  });
});
