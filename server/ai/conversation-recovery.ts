/**
 * Conversation Recovery — Proactive Follow-up for Silent Customers
 * 
 * Detects when a customer goes silent after showing interest,
 * and triggers a single follow-up message at the right time.
 * 
 * Types:
 * - Silent Hesitator: said "بفكر" and disappeared → 2-3 hours
 * - Cart Abandoner: opened link but didn't pay → 1 hour  
 * - Ghost: stopped mid-conversation → 24 hours
 * - Post-Inquiry: asked but didn't buy → 48 hours
 * 
 * RULE: One recovery message only. Never spam.
 */

import type { CustomerIntent } from './session-context';
import { getSession } from './session-context';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type RecoveryType = 'silent_hesitator' | 'cart_abandoner' | 'ghost' | 'post_inquiry';

export interface RecoveryCandidate {
  merchantId: number;
  conversationId: number;
  customerPhone: string;
  customerName?: string;
  recoveryType: RecoveryType;
  lastIntent: CustomerIntent;
  lastMessage: string;
  silentSinceMs: number;       // How long since last message
  recoveryDelayMs: number;     // When to send recovery
  recoveryPrompt: string;      // Suggested recovery message context
}

// ═══════════════════════════════════════════════════════════════
// Recovery Timing Configuration
// ═══════════════════════════════════════════════════════════════

const RECOVERY_DELAYS: Record<RecoveryType, number> = {
  silent_hesitator: 2.5 * 60 * 60 * 1000,  // 2.5 hours
  cart_abandoner:   1 * 60 * 60 * 1000,     // 1 hour
  ghost:            24 * 60 * 60 * 1000,    // 24 hours
  post_inquiry:     48 * 60 * 60 * 1000,    // 48 hours
};

// ═══════════════════════════════════════════════════════════════
// Recovery Detection
// ═══════════════════════════════════════════════════════════════

/**
 * Determine recovery type based on last intent and context.
 */
export function detectRecoveryType(
  lastIntent: CustomerIntent,
  lastMessage: string,
  hasAbandonedCart: boolean,
): RecoveryType | null {
  // Cart abandoner takes priority
  if (hasAbandonedCart) return 'cart_abandoner';
  
  // Hesitating customer who went silent
  if (lastIntent === 'hesitating') return 'silent_hesitator';
  
  // Was inquiring or comparing but didn't convert
  if (lastIntent === 'inquiring' || lastIntent === 'comparing') return 'post_inquiry';
  
  // Was in any active state but stopped
  if (lastIntent === 'objecting') return 'silent_hesitator';
  
  // Generic ghost (was browsing and stopped)
  if (lastIntent === 'browsing') return 'ghost';
  
  // Don't recover post_purchase or ready_to_buy (they already converted)
  return null;
}

/**
 * Build a recovery prompt context for the follow-up message.
 * This gets injected into GPT to generate a natural recovery message.
 */
export function buildRecoveryPrompt(type: RecoveryType, lastIntent: CustomerIntent, context?: string): string {
  const base = `## 🔄 رسالة متابعة — عميل صامت\nهذه رسالة متابعة لعميل توقف عن الرد. يجب أن تكون:\n- طبيعية وغير ضاغطة\n- قصيرة (سطر أو سطرين)\n- تحتوي قيمة (معلومة أو عرض)\n- ⛔ رسالة واحدة فقط — لا تتابع مرة أخرى\n`;

  switch (type) {
    case 'silent_hesitator':
      return base + `\nنوع المتابعة: عميل متردد\nالعميل كان مهتماً لكن قال "بفكر" أو ما شابه.\nاقترح خطوة بدون التزام (حجز مبدئي، تجربة مجانية).\nمثال: "أهلاً مرة ثانية 😊 لسا المقعد متوفر — تحب أحجز لك بدون التزام؟"\n`;
    
    case 'cart_abandoner':
      return base + `\nنوع المتابعة: سلة متروكة\nالعميل بدأ بالشراء لكن ما أكمل.\nذكّره بالمنتج وسهّل الخطوة.\nمثال: "لاحظت ما كملت التسجيل — تحتاج مساعدة في شي؟ 🙌"\n`;
    
    case 'ghost':
      return base + `\nنوع المتابعة: عميل اختفى\nالعميل توقف فجأة وسط المحادثة.\nأعد ربط الحوار بسلاسة.\nمثال: "أهلاً! كنا نناقش... هل لقيت اللي تدور عليه؟ 😊"\n`;
    
    case 'post_inquiry':
      return base + `\nنوع المتابعة: استفسار بدون شراء\nالعميل سأل عن منتج/خدمة لكن ما اشترى.\nاعرض معلومة إضافية أو عرض.\nمثال: "بالمناسبة عندنا عرض جديد على... تبي التفاصيل؟ 🔥"\n`;
  }
}

/**
 * Check if it's appropriate to send recovery (timing + day rules).
 */
export function isRecoveryAppropriate(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun, 5=Fri

  // Don't send recovery late at night
  if (hour >= 22 || hour < 8) return false;
  
  // Don't send on Friday morning
  if (day === 5 && hour < 14) return false;
  
  return true;
}

/**
 * Get the delay for a specific recovery type.
 */
export function getRecoveryDelay(type: RecoveryType): number {
  return RECOVERY_DELAYS[type];
}
