/**
 * Fast Sentiment — Zero-cost keyword-based sentiment detection
 * 
 * Used in FAST PATH (messages 2-20) instead of GPT sentiment call.
 * Detects: angry, frustrated, happy, positive, negative, sad, neutral.
 * 
 * v2: Mixed Signal Detection — detects conflicting signals like
 * "حلو بس خلني أفكر" (positive + hesitation = close to buying!)
 * 
 * Cost: 0 tokens, ~0ms latency.
 */

import type { SentimentType } from './sentiment-analysis';

// ═══════════════════════════════════════════════════════════════
// Mixed Signal Detection
// ═══════════════════════════════════════════════════════════════

export interface SentimentWithSignals {
  primary: SentimentType;
  secondary: SentimentType | null;
  mixedSignal: boolean;
  /** If mixed signal: what does it mean for sales? */
  salesHint: 'close_to_buying' | 'needs_reassurance' | 'losing_interest' | null;
}

/**
 * Detect sentiment with mixed signal awareness.
 * Returns compound sentiment for smarter strategy selection.
 * 
 * Examples:
 * - "حلو بس بفكر" → primary: neutral, secondary: positive, salesHint: 'close_to_buying'
 * - "والله حبيته بس غالي" → primary: negative, secondary: positive, salesHint: 'needs_reassurance'
 * - "ماشي... يلا بعدين" → primary: neutral, secondary: negative, salesHint: 'losing_interest'
 */
export function detectSentimentWithSignals(message: string): SentimentWithSignals {
  const msg = message.toLowerCase();
  const primary = detectSentimentFast(msg);

  // ── Mixed Signal Detection ──
  // Check if message contains BOTH positive AND hesitation/negative signals
  const hasPositive = POSITIVE_SIGNALS.some(s => msg.includes(s));
  const hasHesitation = HESITATION_SIGNALS.some(s => msg.includes(s));
  const hasNegative = NEGATIVE_ALL_SIGNALS.some(s => msg.includes(s));
  const hasBut = /بس\s|لكن|غير إن/.test(msg);

  // Pattern: "positive + but + hesitation" → close to buying
  if (hasPositive && hasHesitation && hasBut) {
    return {
      primary: 'neutral', // Override: treat as neutral (not negative)
      secondary: 'positive',
      mixedSignal: true,
      salesHint: 'close_to_buying',
    };
  }

  // Pattern: "positive + but + price objection" → needs reassurance
  if (hasPositive && hasNegative && hasBut) {
    return {
      primary,
      secondary: 'positive',
      mixedSignal: true,
      salesHint: 'needs_reassurance',
    };
  }

  // Pattern: "neutral/dismissive + hesitation" → losing interest
  if (!hasPositive && hasHesitation && /ماشي|يلا|خلاص|أوك/.test(msg)) {
    return {
      primary,
      secondary: 'negative',
      mixedSignal: true,
      salesHint: 'losing_interest',
    };
  }

  // No mixed signal
  return {
    primary,
    secondary: null,
    mixedSignal: false,
    salesHint: null,
  };
}

// ═══════════════════════════════════════════════════════════════
// Signal Keyword Lists
// ═══════════════════════════════════════════════════════════════

const POSITIVE_SIGNALS = [
  'حلو', 'جميل', 'رائع', 'ممتاز', 'عجبني', 'حبيت', 'حبيته',
  'والله حلو', 'يعجبني', 'مرتب', 'شكل حلو', 'يجنن', 'مرة حلو',
  'أحسنت', 'يسلمو', 'مشكور', 'nice', 'love', 'great',
];

const HESITATION_SIGNALS = [
  'بفكر', 'أفكر', 'بشوف', 'أشوف', 'مو متأكد', 'ما أدري',
  'محتار', 'أرجع لك', 'بعدين', 'مو الحين', 'الحين مشغول',
  'بكلمك', 'أرد عليك', 'بتواصل', 'let me think', 'not sure',
];

const NEGATIVE_ALL_SIGNALS = [
  'غالي', 'كثير', 'مرتفع', 'أرخص', 'مشكلة', 'خطأ', 'عطل',
  'ما يشتغل', 'مو زين', 'ما عجبني', 'سيء', 'بعيد', 'يأخذ وقت',
];

// ═══════════════════════════════════════════════════════════════
// Original Fast Sentiment (backward-compatible)
// ═══════════════════════════════════════════════════════════════

/**
 * Detect sentiment from message text using keyword matching.
 * No GPT call — pure keyword-based analysis.
 * 
 * Priority order: angry > frustrated > sad > happy > positive > negative > neutral
 */
export function detectSentimentFast(message: string): SentimentType {
  const msg = message.toLowerCase();

  // ── Angry (highest priority — needs immediate empathy) ──
  const angrySignals = [
    'غاضب', 'زعلان', 'مستاء', 'غلط', 'فاشل', 'سيء', 'ما يصلح',
    'احتيال', 'نصب', 'كذب', 'خدعتوني', 'نصابين', 'حرامية',
    'ما أبيكم', 'ما أبغاكم', 'خلاص بلغ', 'بشتكي', 'angry',
    'أسوأ', 'أبشع', 'قرف', 'وقاحة', 'ما عندكم ذمة',
  ];
  if (angrySignals.some(s => msg.includes(s))) return 'angry';

  // ── Frustrated (repeated issues) ──
  const frustratedSignals = [
    'مرة ثانية', 'مرة تالتة', 'كل مرة', 'دايماً', 'ما في فايدة',
    'تعبت', 'مليت', 'ما ترد', 'ما رديتوا', 'تأخرتوا', 'وين الرد',
    'frustrated', 'ما تنحل', 'من زمان', 'يوم وأنا', 'أيام وأنا',
    'كم مرة أقول', 'ما تسمعون', 'ما تفهمون',
  ];
  if (frustratedSignals.some(s => msg.includes(s))) return 'frustrated';

  // ── Sad (disappointment) ──
  const sadSignals = [
    'حزين', 'خيبة', 'مكسور', 'متضايق', 'محبط', 'خيبة أمل',
    'sad', 'disappointed', 'زعل',
  ];
  if (sadSignals.some(s => msg.includes(s))) return 'sad';

  // ── Happy (customer satisfaction) ──
  const happySignals = [
    'شكراً', 'شكرا', 'ممتاز', 'رائع', 'جميل', 'حلو', 'مبسوط',
    'سعيد', 'الله يعطيك العافية', 'يعطيك العافية', 'ماشاء الله',
    'ما شاء الله', 'thanks', 'thank you', 'amazing', 'great',
    'أحسنت', 'perfect', 'مشكور', 'يسلمو',
  ];
  if (happySignals.some(s => msg.includes(s))) return 'happy';

  // ── Positive ──
  const positiveSignals = [
    'جيد', 'أحسن', 'أفضل', 'يعجبني', 'حبيت', 'عجبني',
    'حلوين', 'ذوق', 'nice', 'good', 'love',
  ];
  if (positiveSignals.some(s => msg.includes(s))) return 'positive';

  // ── Negative ──
  const negativeSignals = [
    'مشكلة', 'خطأ', 'عطل', 'ما يشتغل', 'ما اشتغل',
    'مو زين', 'ما عجبني', 'ما يعجبني', 'ما حبيت', 'سيئ',
    'bad', 'problem', 'issue', 'broken',
  ];
  if (negativeSignals.some(s => msg.includes(s))) return 'negative';

  // ── Default: neutral ──
  return 'neutral';
}
