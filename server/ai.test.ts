import { describe, it, expect, beforeAll } from 'vitest';
import { generateAIResponse } from './ai';
import * as db from './db';

describe('AI Auto-Reply System', () => {
  let testMerchantId: number;

  beforeAll(async () => {
    // Get test merchant
    const merchants = await db.getAllMerchants();
    if (merchants && merchants.length > 0) {
      testMerchantId = merchants[0].id;
    } else {
      throw new Error('No merchants found in database for testing');
    }
  });

  it('should generate a response in Saudi dialect', async () => {
    const customerMessage = 'السلام عليكم، عندكم منتجات؟';
    
    const response = await generateAIResponse(testMerchantId, customerMessage);
    
    expect(response).toBeTruthy();
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
    
    // Should respond in Arabic
    expect(/[\u0600-\u06FF]/.test(response)).toBe(true);
    
    console.log('AI Response:', response);
  }, 30000); // 30 second timeout for AI response

  it('should handle product inquiries', async () => {
    const customerMessage = 'كم سعر المنتج؟';
    
    const response = await generateAIResponse(testMerchantId, customerMessage);
    
    expect(response).toBeTruthy();
    expect(typeof response).toBe('string');
    
    console.log('Product Inquiry Response:', response);
  }, 30000);

  it('should handle greetings appropriately', async () => {
    const customerMessage = 'مرحبا';
    
    const response = await generateAIResponse(testMerchantId, customerMessage);
    
    expect(response).toBeTruthy();
    expect(typeof response).toBe('string');
    
    console.log('Greeting Response:', response);
  }, 30000);

  it('should maintain conversation context', async () => {
    const conversationHistory = [
      { role: 'user' as const, content: 'عندكم جوالات؟' },
      { role: 'assistant' as const, content: 'أهلاً وسهلاً! نعم عندنا جوالات متنوعة' }
    ];
    
    const customerMessage = 'كم سعرها؟';
    
    const response = await generateAIResponse(
      testMerchantId,
      customerMessage,
      conversationHistory
    );
    
    expect(response).toBeTruthy();
    expect(typeof response).toBe('string');
    
    console.log('Context-aware Response:', response);
  }, 30000);
});
