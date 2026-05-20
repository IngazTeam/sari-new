/**
 * Fast Sentiment — Zero-cost keyword-based sentiment detection
 * 
 * Used in FAST PATH (messages 2-20) instead of GPT sentiment call.
 * Detects: angry, frustrated, happy, positive, negative, sad, neutral.
 * 
 * Cost: 0 tokens, ~0ms latency.
 * Replaces the 'auto' placeholder that was ignoring sentiment changes mid-conversation.
 */

import type { SentimentType } from './sentiment-analysis';

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
    'أحسنت', 'تمام', 'perfect', 'مشكور', 'يسلمو',
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
