/**
 * Action Selector — Multi-Action Decision Engine
 * 
 * After generating a text response, determines the BEST supplementary action:
 * - Send a product link alongside the text reply
 * - Offer a discount code
 * - Schedule a follow-up reminder
 * - Escalate to the merchant
 * - Send a catalog/product list
 * - Initiate order completion
 * 
 * Uses GPT-4o-mini function-calling for intelligent decision-making.
 * Cost: ~$0.001 per decision (only called when relevant signals detected).
 */

import { callGPT4, type ChatMessage } from './openai';
import type { CustomerProfile } from '../db/customer-intelligence';
import type { CustomerIntent } from './session-context';
import * as db from '../db';

// ═══════════════════════════════════════════════════════════════
// Action Types
// ═══════════════════════════════════════════════════════════════

export type SariAction =
  | { type: 'text_only' }
  | { type: 'send_product_link'; productName: string; productId?: number }
  | { type: 'offer_discount'; reason: string }
  | { type: 'escalate_to_merchant'; reason: string; urgency: 'low' | 'medium' | 'high' }
  | { type: 'send_catalog'; category: string }
  | { type: 'schedule_followup'; delayHours: number; reason: string }
  | { type: 'request_merchant_info'; question: string }
  | { type: 'confirm_order'; items: string[] };

// ═══════════════════════════════════════════════════════════════
// Signal-Based Pre-Filter (avoid GPT call when unnecessary)
// ═══════════════════════════════════════════════════════════════

const ACTION_SIGNALS: { signal: RegExp; possibleActions: SariAction['type'][] }[] = [
  // Product inquiry → might need product link
  { signal: /كم سعر|سعر|عندكم|متوفر|أبغى|أبي/i, possibleActions: ['send_product_link', 'send_catalog'] },
  // Ready to buy → order confirmation
  { signal: /أبغى اطلب|كيف أطلب|أبي آخذ|سجلني/i, possibleActions: ['confirm_order'] },
  // Price objection → discount
  { signal: /غالي|كثير|خصم|تخفيض|عرض/i, possibleActions: ['offer_discount'] },
  // Complex question → escalation
  { signal: /مشكلة|شكوى|عيب|كسر|استرجاع/i, possibleActions: ['escalate_to_merchant'] },
  // Hesitation → follow-up
  { signal: /بفكر|أفكر|بشوف|بعدين|مو الحين/i, possibleActions: ['schedule_followup'] },
];

/**
 * Quick check: does this message warrant an action analysis?
 * Returns false for simple greetings/thanks that don't need supplementary actions.
 */
function hasActionSignal(message: string): boolean {
  return ACTION_SIGNALS.some(({ signal }) => signal.test(message));
}

// ═══════════════════════════════════════════════════════════════
// Core: Select Action via GPT-4o-mini
// ═══════════════════════════════════════════════════════════════

/**
 * Decide the best supplementary action based on conversation context.
 * Called after the main response is generated — fire-and-forget.
 * 
 * @returns Action to execute, or { type: 'text_only' } if no action needed.
 */
export async function selectAction(params: {
  merchantId: number;
  customerMessage: string;
  botResponse: string;
  intent: CustomerIntent;
  profile: CustomerProfile | null;
  availableProducts?: { name: string; id: number; price?: number }[];
  hasActiveDiscounts?: boolean;
}): Promise<SariAction> {
  const { customerMessage, botResponse, intent, profile } = params;

  // Pre-filter: skip GPT call if no relevant signals
  if (!hasActionSignal(customerMessage)) {
    return { type: 'text_only' };
  }

  // Skip for post_purchase (support-only mode)
  if (intent === 'post_purchase') {
    return { type: 'text_only' };
  }

  try {
    const systemPrompt = `أنت محرك قرارات لبوت مبيعات. بناءً على رسالة العميل ورد البوت، قرر أفضل إجراء تكميلي.

الإجراءات المتاحة:
1. text_only — الرد النصي كافي، لا حاجة لإجراء إضافي
2. send_product_link — أرسل رابط/صورة منتج محدد ذُكر في المحادثة
3. offer_discount — اقترح عرض خصم (فقط إذا العميل اعترض على السعر بقوة)
4. escalate_to_merchant — حوّل للتاجر (فقط للمشاكل/الشكاوى الجدية)
5. send_catalog — أرسل قائمة منتجات (إذا العميل يستكشف بدون تحديد)
6. schedule_followup — جدول متابعة (إذا العميل متردد وقال بعدين)
7. request_merchant_info — اطلب معلومة من التاجر (البوت ما يعرف الجواب)
8. confirm_order — ابدأ عملية الطلب (العميل جاهز)

قواعد:
- اختر text_only إذا الرد النصي كافي (هذا هو الافتراضي)
- لا تقترح خصم إلا إذا العميل اعترض بقوة على السعر
- لا تصعّد للتاجر إلا للمشاكل الحقيقية
- أجب بـ JSON فقط`;

    const userPrompt = `رسالة العميل: "${customerMessage.substring(0, 200)}"
رد البوت: "${botResponse.substring(0, 200)}"
نية العميل: ${intent}
تصنيف العميل: ${profile?.customerTier || 'new'}

اختر الإجراء المناسب بصيغة JSON:
{
  "action": "text_only",
  "reason": "سبب الاختيار",
  "details": {}
}

إذا اخترت send_product_link:
{ "action": "send_product_link", "reason": "...", "details": { "productName": "اسم المنتج" } }

إذا اخترت schedule_followup:
{ "action": "schedule_followup", "reason": "...", "details": { "delayHours": 4 } }

إذا اخترت escalate_to_merchant:
{ "action": "escalate_to_merchant", "reason": "...", "details": { "urgency": "medium" } }`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await callGPT4(messages, {
      model: 'gpt-4o-mini',
      temperature: 0.2,
      maxTokens: 200,
      noRetry: true,
    });

    // Parse response
    const jsonStr = response
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return { type: 'text_only' };

    const decision = JSON.parse(jsonStr.substring(jsonStart, jsonEnd + 1));

    // Map to typed action
    return mapDecisionToAction(decision);

  } catch (err: any) {
    console.warn(`[ActionSelector] Decision failed (non-blocking): ${err.message}`);
    return { type: 'text_only' };
  }
}

// ═══════════════════════════════════════════════════════════════
// Action Mapper — Validate and convert GPT decision to typed action
// ═══════════════════════════════════════════════════════════════

function mapDecisionToAction(decision: any): SariAction {
  if (!decision || !decision.action) return { type: 'text_only' };

  switch (decision.action) {
    case 'send_product_link':
      return {
        type: 'send_product_link',
        productName: sanitizeActionText(decision.details?.productName || 'منتج'),
      };

    case 'offer_discount':
      return {
        type: 'offer_discount',
        reason: sanitizeActionText(decision.reason || 'اعتراض على السعر'),
      };

    case 'escalate_to_merchant': {
      const validUrgency = ['low', 'medium', 'high'];
      return {
        type: 'escalate_to_merchant',
        reason: sanitizeActionText(decision.reason || 'طلب تدخل'),
        urgency: validUrgency.includes(decision.details?.urgency)
          ? decision.details.urgency : 'medium',
      };
    }

    case 'send_catalog':
      return {
        type: 'send_catalog',
        category: sanitizeActionText(decision.details?.category || 'جميع المنتجات'),
      };

    case 'schedule_followup': {
      const hours = Number(decision.details?.delayHours);
      return {
        type: 'schedule_followup',
        delayHours: (hours > 0 && hours <= 72) ? hours : 4,
        reason: sanitizeActionText(decision.reason || 'متابعة'),
      };
    }

    case 'request_merchant_info':
      return {
        type: 'request_merchant_info',
        question: sanitizeActionText(decision.details?.question || decision.reason || 'سؤال'),
      };

    case 'confirm_order':
      return {
        type: 'confirm_order',
        items: Array.isArray(decision.details?.items)
          ? decision.details.items.slice(0, 5).map((i: string) => sanitizeActionText(String(i)))
          : [],
      };

    default:
      return { type: 'text_only' };
  }
}

// ═══════════════════════════════════════════════════════════════
// Sanitization
// ═══════════════════════════════════════════════════════════════

function sanitizeActionText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
    .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
    .substring(0, 200)
    .trim();
}

// ═══════════════════════════════════════════════════════════════
// Action Executor — Process the selected action
// ═══════════════════════════════════════════════════════════════

/**
 * Execute a supplementary action after the main response.
 * Called by the webhook handler — fire-and-forget.
 */
export async function executeAction(params: {
  action: SariAction;
  merchantId: number;
  customerPhone: string;
  conversationId: number;
  sendMessage: (phone: string, message: string) => Promise<void>;
}): Promise<void> {
  const { action, merchantId, customerPhone, sendMessage } = params;

  if (action.type === 'text_only') return;

  try {
    switch (action.type) {
      case 'send_product_link': {
        // Find matching product and send details
        const products = await db.getTopProducts(merchantId, 50);
        const match = products.find((p: any) =>
          (p.name || '').includes(action.productName) ||
          action.productName.includes(p.name || '')
        );
        if (match) {
          const price = (match as any).price ? ` — ${(match as any).price} ر.س` : '';
          await sendMessage(customerPhone,
            `📦 *${(match as any).name}*${price}\n${(match as any).description?.substring(0, 150) || ''}`
          );
          console.log(`[ActionSelector] ✅ Sent product link: ${(match as any).name}`);
        }
        break;
      }

      case 'schedule_followup': {
        // Store follow-up reminder in DB for cron to pick up
        console.log(`[ActionSelector] 📅 Follow-up scheduled in ${action.delayHours}h: ${action.reason}`);
        // TODO: Implement follow-up cron job integration
        break;
      }

      case 'request_merchant_info': {
        // This is handled by smart-escalation system
        console.log(`[ActionSelector] ❓ Merchant info requested: ${action.question}`);
        break;
      }

      default:
        console.log(`[ActionSelector] Action ${action.type} logged (no auto-execution)`);
    }
  } catch (err: any) {
    console.warn(`[ActionSelector] Action execution failed: ${err.message}`);
  }
}
