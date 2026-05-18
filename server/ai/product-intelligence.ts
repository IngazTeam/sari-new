/**
 * Product Intelligence System
 * Smart product search and recommendations
 */

import { callGPT4 } from './openai';
import { getProductsByMerchantId } from '../db';

/**
 * Search products using AI-powered semantic search
 */
export async function searchProducts(params: {
  merchantId: number;
  query: string;
  limit?: number;
}): Promise<Array<any>> {
  try {
    // Get all products
    const allProducts = await getProductsByMerchantId(params.merchantId);
    
    if (allProducts.length === 0) {
      return [];
    }

    // Simple keyword search for now (can be enhanced with embeddings later)
    const query = params.query.toLowerCase();
    const keywords = query.split(/\s+/).filter(k => k.length > 2);

    // Score products based on keyword matches
    const scoredProducts = allProducts.map(product => {
      let score = 0;
      const searchText = `${product.name} ${product.description || ''} ${product.category || ''}`.toLowerCase();

      // Exact match in name (highest score)
      if (product.name.toLowerCase().includes(query)) {
        score += 10;
      }

      // Keyword matches
      keywords.forEach(keyword => {
        if (searchText.includes(keyword)) {
          score += 1;
        }
      });

      // Category match
      if (product.category && query.includes(product.category.toLowerCase())) {
        score += 5;
      }

      return { ...product, score };
    });

    // Filter and sort by score
    const results = scoredProducts
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, params.limit || 10);

    // If no results, use AI to find similar products
    if (results.length === 0 && allProducts.length > 0) {
      return await aiAssistedSearch(allProducts, query, params.limit || 10);
    }

    return results;
  } catch (error) {
    console.error('Error searching products:', error);
    return [];
  }
}

/**
 * AI-assisted search when keyword search fails
 */
async function aiAssistedSearch(
  products: Array<any>,
  query: string,
  limit: number
): Promise<Array<any>> {
  try {
    const productList = products.map((p, i) => 
      `${i + 1}. ${p.name} - ${p.description || 'لا يوجد وصف'} - ${p.price} ريال`
    ).join('\n');

    const prompt = `لديك قائمة منتجات:

${productList}

العميل يبحث عن: "${query}"

أعطني أرقام المنتجات الأكثر صلة (حتى ${limit} منتجات) بصيغة JSON:
{"product_indices": [1, 3, 5]}

إذا لم تجد أي منتج مناسب، أرجع: {"product_indices": []}`;

    const response = await callGPT4([
      { role: 'system', content: 'أنت خبير في مطابقة احتياجات العملاء مع المنتجات. أجب بصيغة JSON فقط.' },
      { role: 'user', content: prompt },
    ], {
      temperature: 0.3,
      maxTokens: 200,
    });

    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(cleaned);
    
    const indices = result.product_indices || [];
    return indices
      .map((idx: number) => products[idx - 1])
      .filter((p: any) => p !== undefined)
      .slice(0, limit);
  } catch (error) {
    console.error('Error in AI-assisted search:', error);
    return [];
  }
}

/**
 * Suggest products based on conversation context
 */
export async function suggestProducts(params: {
  merchantId: number;
  conversationContext: string;
  customerHistory?: Array<any>;
  limit?: number;
}): Promise<{
  products: Array<any>;
  reasoning: string;
}> {
  try {
    const allProducts = await getProductsByMerchantId(params.merchantId);
    
    if (allProducts.length === 0) {
      return {
        products: [],
        reasoning: 'لا توجد منتجات متاحة حالياً',
      };
    }

    // Build product list for AI
    const productList = allProducts.map((p, i) => 
      `${i + 1}. ${p.name} - ${p.price} ريال${p.category ? ` (${p.category})` : ''}`
    ).join('\n');

    // Build customer history context
    let historyContext = '';
    if (params.customerHistory && params.customerHistory.length > 0) {
      historyContext = '\n\n## مشتريات العميل السابقة:\n' + 
        params.customerHistory.map(h => `- ${h.productName || h.name}`).join('\n');
    }

    const prompt = `## سياق المحادثة:
${params.conversationContext}
${historyContext}

## المنتجات المتاحة:
${productList}

## المهمة:
اقترح أفضل ${params.limit || 3} منتجات للعميل بناءً على السياق.

أجب بصيغة JSON:
{
  "product_indices": [1, 3, 5],
  "reasoning": "السبب الذي يجعل هذه المنتجات مناسبة"
}`;

    const response = await callGPT4([
      { role: 'system', content: 'أنت خبير في اقتراح المنتجات المناسبة للعملاء. أجب بصيغة JSON فقط.' },
      { role: 'user', content: prompt },
    ], {
      temperature: 0.5,
      maxTokens: 300,
    });

    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(cleaned);
    
    const indices = result.product_indices || [];
    const suggestedProducts = indices
      .map((idx: number) => allProducts[idx - 1])
      .filter((p: any) => p !== undefined)
      .slice(0, params.limit || 3);

    return {
      products: suggestedProducts,
      reasoning: result.reasoning || 'منتجات مقترحة بناءً على احتياجاتك',
    };
  } catch (error) {
    console.error('Error suggesting products:', error);
    
    // Fallback: return random products
    const limit = params.limit || 3;
    const allProducts = await getProductsByMerchantId(params.merchantId);
    const randomProducts = allProducts
      .sort(() => Math.random() - 0.5)
      .slice(0, limit);

    return {
      products: randomProducts,
      reasoning: 'منتجات مميزة قد تعجبك',
    };
  }
}

/**
 * Format products for display in WhatsApp message
 */
export function formatProductsForWhatsApp(products: Array<any>): string {
  if (products.length === 0) {
    return 'للأسف ما لقيت منتجات مناسبة حالياً 😔';
  }

  let message = '🛍️ *المنتجات المتاحة:*\n\n';

  products.forEach((product, index) => {
    message += `*${index + 1}. ${product.name}*\n`;
    
    if (product.description) {
      message += `   ${product.description}\n`;
    }
    
    message += `   💰 السعر: *${product.price} ريال*\n`;
    
    if (product.stock !== undefined && product.stock !== null) {
      if (product.stock > 0) {
        message += `   ✅ متوفر (${product.stock} قطعة)\n`;
      } else {
        message += `   ❌ غير متوفر حالياً\n`;
      }
    }
    
    message += '\n';
  });

  message += '_للطلب، أرسل رقم المنتج أو اسمه_ 📝';

  return message;
}

/**
 * Extract product selection from customer message
 */
export async function extractProductSelection(params: {
  message: string;
  availableProducts: Array<any>;
}): Promise<{
  selectedProduct: any | null;
  confidence: number;
}> {
  try {
    const productList = params.availableProducts.map((p, i) => 
      `${i + 1}. ${p.name}`
    ).join('\n');

    const prompt = `المنتجات المتاحة:
${productList}

رسالة العميل: "${params.message}"

هل العميل يختار منتج معين؟ أجب بصيغة JSON:
{
  "product_index": 1,
  "confidence": 0.9
}

إذا لم يكن واضحاً، ضع product_index: null`;

    const response = await callGPT4([
      { role: 'system', content: 'أنت محلل ذكي لاختيارات العملاء. أجب بصيغة JSON فقط.' },
      { role: 'user', content: prompt },
    ], {
      temperature: 0.2,
      maxTokens: 100,
    });

    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(cleaned);
    
    if (result.product_index && result.product_index > 0) {
      const product = params.availableProducts[result.product_index - 1];
      return {
        selectedProduct: product || null,
        confidence: result.confidence || 0.5,
      };
    }

    return {
      selectedProduct: null,
      confidence: 0,
    };
  } catch (error) {
    console.error('Error extracting product selection:', error);
    return {
      selectedProduct: null,
      confidence: 0,
    };
  }
}
