/**
 * Profile Enrichment Engine — AI-Powered Customer Intelligence
 * 
 * After every 5th message in a conversation, GPT-4o-mini analyzes the
 * conversation and automatically enriches the customer profile with:
 * - Preferences (price-conscious, quality-focused, urgent buyer)
 * - Pain points (complaints, concerns, friction)
 * - Sentiment trajectory
 * - Last objection type
 * - Interest tags (product categories they discussed)
 * - Buying stage (exploring → comparing → ready → purchased)
 * 
 * Cost: ~$0.002 per enrichment cycle (gpt-4o-mini + JSON mode)
 * Trigger: Every 5 messages (fire-and-forget, non-blocking)
 */

import { callGPT4, type ChatMessage } from './openai';
import { updateProfile, type CustomerProfile, type CustomerTier } from '../db/customer-intelligence';
import { getMessagesByConversationId } from '../db';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ProfileEnrichment {
  preferences: {
    priceConscious?: boolean;
    qualityFocused?: boolean;
    urgentBuyer?: boolean;
    fastDelivery?: boolean;
    brandConscious?: boolean;
  };
  painPoints: string[];
  sentimentAvg: 'positive' | 'neutral' | 'negative' | 'frustrated';
  lastObjection: 'price' | 'delivery' | 'quality' | 'trust' | null;
  interestTags: string[];
  buyingStage: 'exploring' | 'comparing' | 'ready' | 'purchased' | 'returning';
  customerTierSuggestion: CustomerTier;
}

// ═══════════════════════════════════════════════════════════════
// Sanitization — Prevent GPT output from poisoning customer data
// ═══════════════════════════════════════════════════════════════

const POISON_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi,
  /\b(system|assistant|user)\s*:/gi,
  /you\s+are\s+now\s+/gi,
  /forget\s+(everything|all|your)/gi,
  /override\s+(system|all|your)/gi,
  /act\s+as\s+(a|an)?/gi,
  /تصرف\s*(كـ|ك)/gi,
  /تجاهل\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد)/gi,
];

function sanitizeEnrichmentText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let safe = text.normalize('NFKC');
  for (const pattern of POISON_PATTERNS) {
    safe = safe.replace(pattern, '[filtered]');
  }
  return safe.substring(0, 200).trim();
}

function sanitizeStringArray(arr: any[], maxItems: number = 5): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(item => typeof item === 'string' && item.length > 0)
    .slice(0, maxItems)
    .map(item => sanitizeEnrichmentText(item));
}

// ═══════════════════════════════════════════════════════════════
// Core: Enrich Customer Profile via GPT-4o-mini
// ═══════════════════════════════════════════════════════════════

const ENRICHMENT_MODEL = 'gpt-4o-mini';

/**
 * Analyze recent conversation and enrich customer profile.
 * Called every 5th message — fire-and-forget, non-blocking.
 */
export async function enrichCustomerProfile(params: {
  merchantId: number;
  customerPhone: string;
  conversationId: number;
  currentProfile: CustomerProfile | null;
}): Promise<void> {
  try {
    const { merchantId, customerPhone, conversationId, currentProfile } = params;

    // Load recent messages
    const messages = await getMessagesByConversationId(conversationId);
    if (messages.length < 3) return; // Not enough data to analyze

    // Take last 15 messages for analysis
    const recentMessages = messages.slice(-15);

    // Build conversation transcript for GPT
    const transcript = recentMessages
      .map(msg => {
        const role = msg.direction === 'incoming' ? 'العميل' : 'ساري';
        const content = (msg.content || '').substring(0, 200);
        return `${role}: ${content}`;
      })
      .join('\n');

    // Build current profile context
    const profileContext = currentProfile
      ? `
التصنيف الحالي: ${currentProfile.customerTier}
عدد المحادثات: ${currentProfile.totalConversations}
المشتريات: ${currentProfile.purchaseHistory?.length || 0}
نقاط ألم سابقة: ${currentProfile.painPoints?.join('، ') || 'لا يوجد'}
آخر اعتراض: ${currentProfile.lastObjection || 'لا يوجد'}`
      : 'عميل جديد — لا يوجد ملف سابق';

    const systemPrompt = `أنت محلل سلوك عملاء خبير. حلل هذه المحادثة بين عميل وبوت مبيعات واستخرج تحليلاً مُهيكلاً.

أجب بـ JSON فقط بهذا الشكل بالضبط:
{
  "preferences": {
    "priceConscious": true/false,
    "qualityFocused": true/false,
    "urgentBuyer": true/false,
    "fastDelivery": true/false,
    "brandConscious": true/false
  },
  "painPoints": ["نقطة ألم 1", "نقطة ألم 2"],
  "sentimentAvg": "positive" أو "neutral" أو "negative" أو "frustrated",
  "lastObjection": "price" أو "delivery" أو "quality" أو "trust" أو null,
  "interestTags": ["تاج 1", "تاج 2"],
  "buyingStage": "exploring" أو "comparing" أو "ready" أو "purchased" أو "returning",
  "customerTierSuggestion": "new" أو "returning" أو "loyal" أو "vip" أو "at_risk"
}

قواعد:
1. painPoints: مشاكل أو شكاوى ذكرها العميل فعلاً — لا تخترع
2. interestTags: المنتجات/الخدمات التي سأل عنها — 3 تاقات كحد أقصى
3. buyingStage: بناءً على نية العميل الواضحة في المحادثة
4. لا تترك أي حقل فارغ — استخدم القيم الافتراضية إذا لم تجد بيانات`;

    const userPrompt = `الملف الحالي للعميل:
${profileContext}

المحادثة الأخيرة (${recentMessages.length} رسالة):
${transcript}

حلل واستخرج JSON:`;

    const gptMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await callGPT4(gptMessages, {
      model: ENRICHMENT_MODEL,
      temperature: 0.2,
      maxTokens: 500,
      noRetry: true, // Non-critical — don't waste retries
    });

    // Parse response
    const jsonStr = response
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      console.warn('[ProfileEnrich] Failed to parse GPT response');
      return;
    }

    const enrichment: ProfileEnrichment = JSON.parse(jsonStr.substring(jsonStart, jsonEnd + 1));

    // ── Validate and sanitize before writing to DB ──
    const validSentiments = ['positive', 'neutral', 'negative', 'frustrated'];
    const validObjections = ['price', 'delivery', 'quality', 'trust', null];
    const validStages = ['exploring', 'comparing', 'ready', 'purchased', 'returning'];
    const validTiers: CustomerTier[] = ['new', 'returning', 'loyal', 'vip', 'at_risk'];

    const safeSentiment = validSentiments.includes(enrichment.sentimentAvg)
      ? enrichment.sentimentAvg : 'neutral';
    const safeObjection = validObjections.includes(enrichment.lastObjection)
      ? enrichment.lastObjection : null;
    const safePainPoints = sanitizeStringArray(enrichment.painPoints, 5);
    const safeInterestTags = sanitizeStringArray(enrichment.interestTags, 5);

    // Build preferences safely
    const safePreferences: Record<string, any> = {};
    if (enrichment.preferences && typeof enrichment.preferences === 'object') {
      for (const key of ['priceConscious', 'qualityFocused', 'urgentBuyer', 'fastDelivery', 'brandConscious']) {
        if (typeof (enrichment.preferences as any)[key] === 'boolean') {
          safePreferences[key] = (enrichment.preferences as any)[key];
        }
      }
    }

    // Merge with existing data (don't overwrite — accumulate)
    const existingPainPoints = currentProfile?.painPoints || [];
    const mergedPainPoints = Array.from(new Set(existingPainPoints.concat(safePainPoints))).slice(-10);

    const existingPrefs = currentProfile?.preferences || {};
    const mergedPrefs = { ...existingPrefs, ...safePreferences };

    // Also store interestTags and buyingStage inside preferences (using existing schema)
    if (safeInterestTags.length > 0) {
      mergedPrefs.interestTags = safeInterestTags;
    }
    if (validStages.includes(enrichment.buyingStage)) {
      mergedPrefs.buyingStage = enrichment.buyingStage;
    }

    // Write to DB
    await updateProfile(merchantId, customerPhone, {
      preferences: mergedPrefs,
      painPoints: mergedPainPoints,
      sentimentAvg: safeSentiment,
      lastObjection: safeObjection,
      customerTier: validTiers.includes(enrichment.customerTierSuggestion)
        ? enrichment.customerTierSuggestion
        : (currentProfile?.customerTier || 'new'),
    });

    console.log(`[ProfileEnrich] ✅ Profile enriched for ***${customerPhone.slice(-4)}: ` +
      `sentiment=${safeSentiment}, stage=${enrichment.buyingStage}, ` +
      `painPoints=${mergedPainPoints.length}, tags=${safeInterestTags.join(',')}`);

  } catch (err: any) {
    // Non-blocking — enrichment failures should NEVER break the chat
    console.warn(`[ProfileEnrich] Failed (non-blocking): ${err.message}`);
  }
}
