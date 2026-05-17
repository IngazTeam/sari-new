/**
 * RAG Engine — Retrieval-Augmented Generation
 * 
 * Transforms Sari from "paste raw text" to "intelligent semantic search":
 * 1. embedSection() — Convert knowledge sections to vectors (text-embedding-3-small)
 * 2. searchRelevantSections() — Find most relevant sections for a question
 * 3. findCachedResponse() — Smart semantic cache (92% threshold)
 * 4. cacheResponse() — Save successful responses for reuse
 * 
 * Cost: ~$0.02 per million tokens (embeddings are extremely cheap)
 */

import { ENV } from '../_core/env';
import {
  getBotSections,
  getBotSectionsWithEmbedding,
  getValidCachedResponses,
  recordCacheHit,
  cacheResponse as dbCacheResponse,
  updateSection,
  type KnowledgeSection,
  type CachedResponse,
} from '../db/knowledge';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const CACHE_SIMILARITY_THRESHOLD = 0.92;  // 92% match → use cached response
const OPENAI_API_URL = 'https://api.openai.com/v1';

// ═══════════════════════════════════════════════════════════════
// 1. Embedding Generation
// ═══════════════════════════════════════════════════════════════

/**
 * Generate embedding vector for a text string.
 * Uses text-embedding-3-small ($0.02/M tokens — extremely cheap).
 */
export async function generateEmbedding(text: string): Promise<Float32Array | null> {
  try {
    const { getOpenAiApiKey } = await import('../db_ai_settings');
    const apiKey = await getOpenAiApiKey() || ENV.openaiApiKey;

    if (!apiKey) {
      console.warn('[RAG] No OpenAI API key configured');
      return null;
    }

    // Truncate to avoid token limits (8191 tokens max for this model)
    const truncatedText = text.substring(0, 30000);

    const response = await fetch(`${OPENAI_API_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: truncatedText,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[RAG] Embedding API error:', error.error?.message);
      return null;
    }

    const data = await response.json();
    const vector = data.data?.[0]?.embedding;
    
    if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
      console.error('[RAG] Invalid embedding response');
      return null;
    }

    return new Float32Array(vector);
  } catch (e: any) {
    console.error('[RAG] generateEmbedding failed:', e.message);
    return null;
  }
}

/**
 * Convert Float32Array to Buffer for MySQL BLOB storage
 */
export function embeddingToBuffer(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer);
}

/**
 * Convert Buffer from MySQL BLOB back to Float32Array
 */
export function bufferToEmbedding(buffer: Buffer): Float32Array {
  // MySQL BLOB buffers have unaligned byteOffset — copy to ensure 4-byte alignment
  const aligned = Buffer.from(buffer);
  return new Float32Array(aligned.buffer, aligned.byteOffset, aligned.length / 4);
}

// ═══════════════════════════════════════════════════════════════
// 2. Section Embedding
// ═══════════════════════════════════════════════════════════════

/**
 * Generate and store embedding for a knowledge section.
 * Embeds: title + summary + content (weighted).
 */
export async function embedSection(section: KnowledgeSection, merchantId: number): Promise<boolean> {
  // Build rich text for embedding (title is weighted by repetition)
  const title = section.title || (section as any).title || '';
  const summary = section.summary || (section as any).summary || '';
  const content = section.content || (section as any).content || '';
  
  const textForEmbedding = `${title}\n${title}\n${summary}\n${content}`;
  
  const embedding = await generateEmbedding(textForEmbedding);
  if (!embedding) return false;

  await updateSection(section.id, merchantId, {
    embedding: embeddingToBuffer(embedding),
  });

  return true;
}

/**
 * Batch embed all sections that don't have embeddings yet.
 */
export async function embedAllSections(merchantId: number): Promise<number> {
  const sections = await getBotSectionsWithEmbedding(merchantId);
  let embedded = 0;

  for (const section of sections) {
    if (!section.embedding && !(section as any).embedding) {
      const success = await embedSection(section, merchantId);
      if (success) embedded++;
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }
  }

  console.log(`[RAG] Embedded ${embedded}/${sections.length} sections for merchant ${merchantId}`);
  return embedded;
}

// ═══════════════════════════════════════════════════════════════
// 3. Semantic Search — Find Relevant Sections
// ═══════════════════════════════════════════════════════════════

/**
 * Search for the most relevant knowledge sections for a given question.
 * 1. Embed the question
 * 2. Calculate cosine similarity with all section embeddings
 * 3. Return top N most relevant sections
 */
export async function searchRelevantSections(
  merchantId: number,
  question: string,
  limit: number = 5
): Promise<{ section: KnowledgeSection; similarity: number }[]> {
  // Step 1: Embed the question
  const questionEmbedding = await generateEmbedding(question);
  if (!questionEmbedding) {
    // Fallback: return all bot sections with high similarity so they pass the 0.3 threshold
    console.log(`[RAG] Embedding failed for question — injecting all ${(await getBotSections(merchantId)).length} sections as fallback`);
    const sections = await getBotSections(merchantId);
    return sections.slice(0, limit).map(s => ({ section: s, similarity: 1.0 }));
  }

  // Step 2: Get all sections WITH embeddings (for cosine similarity)
  const sections = await getBotSectionsWithEmbedding(merchantId);
  
  // Step 3: Calculate similarities
  const scored = sections
    .map(section => {
      const sectionEmbedding = section.embedding || (section as any).embedding;
      if (!sectionEmbedding) return { section, similarity: 0.5 };  // No embedding = neutral score

      const embedding = bufferToEmbedding(
        sectionEmbedding instanceof Buffer ? sectionEmbedding : Buffer.from(sectionEmbedding)
      );
      const similarity = cosineSimilarity(questionEmbedding, embedding);
      return { section, similarity };
    })
    .sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════
// 4. Response Cache — Smart Semantic Caching
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a similar question has been answered before.
 * Uses semantic similarity (not keyword matching) for accuracy.
 * Threshold: 92% match → return cached response.
 */
export async function findCachedResponse(
  merchantId: number,
  question: string
): Promise<{ response: string; cacheId: number; similarity: number } | null> {
  const questionEmbedding = await generateEmbedding(question);
  if (!questionEmbedding) return null;

  const cachedResponses = await getValidCachedResponses(merchantId);
  if (cachedResponses.length === 0) return null;

  let bestMatch: { response: string; cacheId: number; similarity: number } | null = null;
  let bestSimilarity = 0;

  for (const cached of cachedResponses) {
    const cachedEmbedding = cached.questionEmbedding || (cached as any).question_embedding;
    if (!cachedEmbedding) continue;

    const embedding = bufferToEmbedding(
      cachedEmbedding instanceof Buffer ? cachedEmbedding : Buffer.from(cachedEmbedding)
    );
    const similarity = cosineSimilarity(questionEmbedding, embedding);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = {
        response: cached.responseText || (cached as any).response_text,
        cacheId: cached.id,
        similarity,
      };
    }
  }

  // Only return if similarity exceeds threshold
  if (bestMatch && bestSimilarity >= CACHE_SIMILARITY_THRESHOLD) {
    // Record the cache hit
    await recordCacheHit(bestMatch.cacheId);
    console.log(`[RAG] Cache HIT: ${bestSimilarity.toFixed(3)} similarity (threshold: ${CACHE_SIMILARITY_THRESHOLD})`);
    return bestMatch;
  }

  return null;
}

/**
 * Save a successful response to cache for future reuse.
 * SEC-V4-02 FIX: 4-layer defense against cache poisoning
 */
export async function cacheSuccessfulResponse(
  merchantId: number,
  question: string,
  response: string
): Promise<void> {
  try {
    // Defense 1: Minimum length — skip trivially short responses
    if (response.trim().length < 30) return;

    // Defense 2: Suspicious content filter — block prompt injection artifacts
    const poisonPatterns = [
      /تجاهل\s*(كل|جميع)/i,
      /ignore\s*(all|previous|above)/i,
      /forget\s*(everything|instructions)/i,
      /system\s*prompt/i,
      /\[INST\]/i,
      /\[\/INST\]/i,
    ];
    if (poisonPatterns.some(p => p.test(question) || p.test(response))) {
      console.warn(`[RAG] ⚠️ Cache poisoning blocked for merchant ${merchantId}`);
      return;
    }

    // Defense 3: Per-merchant cache cap (max 500 entries)
    const pool = await (await import('../db')).getPool();
    if (pool) {
      const [countRows] = await pool.execute(
        `SELECT COUNT(*) as cnt FROM sari_response_cache WHERE merchant_id = ? AND is_valid = 1`,
        [merchantId]
      );
      if (Number((countRows as any[])[0]?.cnt) >= 500) {
        // Evict oldest unused — keep cache fresh
        await pool.execute(
          `UPDATE sari_response_cache SET is_valid = 0 
           WHERE merchant_id = ? AND is_valid = 1 
           ORDER BY last_used_at ASC LIMIT 50`,
          [merchantId]
        );
      }

      // Defense 4: TTL — invalidate entries not used in 30 days
      await pool.execute(
        `UPDATE sari_response_cache SET is_valid = 0 
         WHERE merchant_id = ? AND is_valid = 1 
         AND last_used_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        [merchantId]
      );
    }

    const questionEmbedding = await generateEmbedding(question);
    const embeddingBuffer = questionEmbedding ? embeddingToBuffer(questionEmbedding) : undefined;
    
    await dbCacheResponse(merchantId, question, response, embeddingBuffer);
    console.log(`[RAG] Cached response for: "${question.substring(0, 50)}..."`);
  } catch (e: any) {
    // Non-blocking: caching failures shouldn't break the response flow
    console.error('[RAG] Cache save failed:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. Build RAG Context for Bot
// ═══════════════════════════════════════════════════════════════

/**
 * Build optimized context for the bot using RAG.
 * Instead of injecting ALL knowledge, injects only the most relevant sections.
 * 
 * Returns structured context separated by inject_as:
 * - facts: Hard facts about the business (products, policies, contact)
 * - behaviors: How the bot should behave (selling tips, USPs to emphasize)
 * - productContext: Relevant product details matched from the merchant's catalog
 */
export async function buildRAGContext(
  merchantId: number,
  question: string
): Promise<{ facts: string; behaviors: string; sectionsUsed: number; productContext: string }> {
  const results = await searchRelevantSections(merchantId, question, 7);

  const facts: string[] = [];
  const behaviors: string[] = [];

  for (const { section, similarity } of results) {
    // Skip very low relevance sections
    if (similarity < 0.3) continue;

    const injectAs = section.injectAs || (section as any).inject_as || 'fact';
    const title = section.title || (section as any).title || '';
    const content = section.content || (section as any).content || '';

    if (injectAs === 'behavior') {
      behaviors.push(content);
    } else if (injectAs === 'fact') {
      facts.push(`[${title}]: ${content}`);
    }
    // inject_as === 'none' → skip (merchant-only data)
  }

  // Product-aware context: search merchant's products when relevant
  let productContext = '';
  try {
    productContext = await buildProductContext(merchantId, question);
  } catch { /* product search is supplementary */ }

  return {
    facts: facts.join('\n\n'),
    behaviors: behaviors.join('\n'),
    sectionsUsed: results.filter(r => r.similarity >= 0.3).length,
    productContext,
  };
}

// ═══════════════════════════════════════════════════════════════
// 6. Product-Aware Context — Match products from catalog
// ═══════════════════════════════════════════════════════════════

/** Patterns that indicate the customer is asking about products */
const PRODUCT_INQUIRY_PATTERNS = [
  /كم سعر/i, /كم السعر/i, /عندكم/i, /متوفر/i, /أبغى/i, /أبي/i,
  /هل يوجد/i, /فيه/i, /أسعار/i, /how much/i, /price/i, /available/i,
  /منتج/i, /product/i,
];

/**
 * Search merchant's product catalog and build context when the
 * customer is asking about specific products.
 */
async function buildProductContext(merchantId: number, question: string): Promise<string> {
  // Only search products if the question has product-inquiry signals
  if (!PRODUCT_INQUIRY_PATTERNS.some(p => p.test(question))) return '';

  const { getPool } = await import('../db');
  const pool = await getPool();
  if (!pool) return '';

  // Search products by name/description keyword match
  const keywords = question
    .replace(/[؟?!.,،]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 5); // Max 5 keywords

  if (keywords.length === 0) return '';

  // Escape LIKE wildcards to prevent broad matching attacks
  const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');

  const likeClauses = keywords.map(() => `(p.name LIKE ? OR p.description LIKE ?)`).join(' OR ');
  const likeParams = keywords.flatMap(k => { const ek = escapeLike(k); return [`%${ek}%`, `%${ek}%`]; });

  try {
    const [rows] = await pool.execute(
      `SELECT p.name, p.price, p.description, p.category
       FROM products p
       WHERE p.merchant_id = ? AND p.is_active = 1
       AND (${likeClauses})
       ORDER BY p.total_views DESC
       LIMIT 5`,
      [merchantId, ...likeParams]
    );

    const products = rows as any[];
    if (products.length === 0) return '';

    const lines = products.map(p => {
      const price = p.price ? ` — ${p.price} ر.س` : '';
      const desc = p.description ? ` (${p.description.substring(0, 80)})` : '';
      return `• ${p.name}${price}${desc}`;
    });

    return `\n## 🛍️ منتجات مطابقة من الكتالوج:\n${lines.join('\n')}\n📌 توجيه: اذكر المنتجات أعلاه إذا كانت ذات صلة بسؤال العميل. لا تخترع منتجات غير موجودة.\n`;
  } catch {
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════
// Math: Cosine Similarity
// ═══════════════════════════════════════════════════════════════

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator > 0 ? dotProduct / denominator : 0;
}
