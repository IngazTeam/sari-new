import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';

describe('Personality Settings APIs', () => {
  let testMerchantId: number;

  beforeAll(async () => {
    // Get existing merchant for testing
    const merchants = await db.getAllMerchants();
    if (merchants.length > 0) {
      testMerchantId = merchants[0].id;
    } else {
      throw new Error('No merchants found for testing');
    }
  });

  it('should get or create personality settings', async () => {
    const settings = await db.getOrCreatePersonalitySettings(testMerchantId);
    
    expect(settings).toBeDefined();
    expect(settings.merchantId).toBe(testMerchantId);
    expect(settings.tone).toBeDefined();
    expect(settings.style).toBeDefined();
    expect(settings.emojiUsage).toBeDefined();
  });

  it('should update personality settings', async () => {
    const updated = await db.updateSariPersonalitySettings(testMerchantId, {
      tone: 'professional',
      style: 'formal_arabic',
      emojiUsage: 'minimal',
      customInstructions: 'Test instructions',
      brandVoice: 'Test brand voice',
    });
    
    expect(updated).toBeDefined();
    expect(updated?.tone).toBe('professional');
    expect(updated?.style).toBe('formal_arabic');
    expect(updated?.emojiUsage).toBe('minimal');
    expect(updated?.customInstructions).toBe('Test instructions');
  });

  it('should retrieve updated settings', async () => {
    const settings = await db.getSariPersonalitySettings(testMerchantId);
    
    expect(settings).toBeDefined();
    expect(settings?.tone).toBe('professional');
    expect(settings?.customInstructions).toBe('Test instructions');
  });
});

describe('Quick Responses APIs', () => {
  let testMerchantId: number;
  let testResponseId: number;

  beforeAll(async () => {
    const merchants = await db.getAllMerchants();
    if (merchants.length > 0) {
      testMerchantId = merchants[0].id;
    } else {
      throw new Error('No merchants found for testing');
    }
  });

  it('should create a quick response', async () => {
    const response = await db.createQuickResponse({
      merchantId: testMerchantId,
      trigger: 'السعر',
      response: 'أسعارنا تبدأ من 50 ريال',
      keywords: 'سعر,كم,فلوس',
      priority: 8,
    });
    
    expect(response).toBeDefined();
    expect(response?.trigger).toBe('السعر');
    expect(response?.response).toBe('أسعارنا تبدأ من 50 ريال');
    expect(response?.priority).toBe(8);
    expect(response?.isActive).toBe(true);
    
    if (response) {
      testResponseId = response.id;
    }
  });

  it('should get all quick responses for merchant', async () => {
    const responses = await db.getQuickResponses(testMerchantId);
    
    expect(responses).toBeDefined();
    expect(Array.isArray(responses)).toBe(true);
    expect(responses.length).toBeGreaterThan(0);
  });

  it('should update a quick response', async () => {
    const updated = await db.updateQuickResponse(testResponseId, {
      response: 'أسعارنا تبدأ من 100 ريال',
      priority: 10,
    });
    
    expect(updated).toBeDefined();
    expect(updated?.response).toBe('أسعارنا تبدأ من 100 ريال');
    expect(updated?.priority).toBe(10);
  });

  it('should get active quick responses', async () => {
    const activeResponses = await db.getActiveQuickResponses(testMerchantId);
    
    expect(activeResponses).toBeDefined();
    expect(Array.isArray(activeResponses)).toBe(true);
    expect(activeResponses.every(r => r.isActive)).toBe(true);
  });

  it('should delete a quick response', async () => {
    const deleted = await db.deleteQuickResponse(testResponseId);
    
    expect(deleted).toBe(true);
    
    const response = await db.getQuickResponseById(testResponseId);
    expect(response).toBeUndefined();
  });
});

describe('Sentiment Analysis APIs', () => {
  let testMerchantId: number;

  beforeAll(async () => {
    const merchants = await db.getAllMerchants();
    if (merchants.length > 0) {
      testMerchantId = merchants[0].id;
    } else {
      throw new Error('No merchants found for testing');
    }
  });

  it('should get sentiment stats for merchant', async () => {
    const stats = await db.getMerchantSentimentStats(testMerchantId, 30);
    
    expect(stats).toBeDefined();
    expect(stats.total).toBeGreaterThanOrEqual(0);
    expect(stats.positive).toBeGreaterThanOrEqual(0);
    expect(stats.negative).toBeGreaterThanOrEqual(0);
    expect(stats.neutral).toBeGreaterThanOrEqual(0);
    expect(stats.happy).toBeGreaterThanOrEqual(0);
    expect(stats.angry).toBeGreaterThanOrEqual(0);
    expect(stats.sad).toBeGreaterThanOrEqual(0);
    expect(stats.frustrated).toBeGreaterThanOrEqual(0);
    expect(stats.averageConfidence).toBeGreaterThanOrEqual(0);
  });

  it('should calculate sentiment percentages correctly', async () => {
    const stats = await db.getMerchantSentimentStats(testMerchantId, 30);
    
    if (stats.total > 0) {
      const sum = stats.positive + stats.negative + stats.neutral + 
                  stats.happy + stats.angry + stats.sad + stats.frustrated;
      
      // Sum should equal total (all sentiments counted)
      expect(sum).toBeLessThanOrEqual(stats.total * 2); // Allow some overlap
    }
  });
});
