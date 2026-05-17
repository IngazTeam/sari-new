/**
 * Timing Intelligence — When to Sell and When to Stay Silent
 * 
 * Gulf-specific timing rules for AI sales behavior:
 * - Late night: soft replies only
 * - Friday morning: don't push
 * - Friday afternoon: golden hour
 * - Post-salary (1-5th): comfortable to buy premium
 * - End of month: focus on value, not price
 * - Ramadan: respectful, calm tone
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type TimingContext = 
  | 'late_night'          // After 10pm — soft replies
  | 'early_morning'       // Before 8am — minimal
  | 'friday_morning'      // Friday before 2pm — don't push
  | 'friday_golden_hour'  // Friday 4-10pm — highest engagement
  | 'post_salary'         // 1st-5th of month — comfortable
  | 'end_of_month'        // 25th+ — budget conscious
  | 'business_hours'      // 8am-10pm normal days
  | 'weekend_evening';    // Thu/Fri evening — relaxed browsing

export interface TimingAdvice {
  context: TimingContext;
  label: string;              // Arabic description
  recoveryAllowed: boolean;   // Can we send follow-up?
  recommendedTone: string;    // Tone adjustment
  salesPressure: 'none' | 'low' | 'medium' | 'high';
}

// ═══════════════════════════════════════════════════════════════
// Timing Detection
// ═══════════════════════════════════════════════════════════════

/**
 * Detect current timing context with Gulf-aware rules.
 */
export function detectTimingContext(): TimingAdvice {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();      // 0=Sun, 5=Fri, 6=Sat
  const dateOfMonth = now.getDate();

  // Late night (10pm-7am)
  if (hour >= 22 || hour < 7) {
    return {
      context: 'late_night',
      label: 'وقت متأخر — رد خفيف وقصير',
      recoveryAllowed: false,
      recommendedTone: 'هادي وقصير',
      salesPressure: 'none',
    };
  }

  // Early morning (7-8am)
  if (hour < 8) {
    return {
      context: 'early_morning',
      label: 'صباح مبكر — رد مختصر',
      recoveryAllowed: false,
      recommendedTone: 'ودي ومختصر',
      salesPressure: 'low',
    };
  }

  // Friday morning (before 2pm)
  if (day === 5 && hour < 14) {
    return {
      context: 'friday_morning',
      label: 'جمعة صباح — لا تضغط',
      recoveryAllowed: false,
      recommendedTone: 'محترم وهادي',
      salesPressure: 'none',
    };
  }

  // Friday golden hour (4pm-10pm)
  if (day === 5 && hour >= 16) {
    return {
      context: 'friday_golden_hour',
      label: 'جمعة بعد العصر — وقت ذهبي للبيع',
      recoveryAllowed: true,
      recommendedTone: 'نشيط وودي',
      salesPressure: 'high',
    };
  }

  // Weekend evenings (Thu/Sat evening)
  if ((day === 4 || day === 6) && hour >= 18) {
    return {
      context: 'weekend_evening',
      label: 'مساء عطلة — الناس تتصفح',
      recoveryAllowed: true,
      recommendedTone: 'مرح وجذاب',
      salesPressure: 'medium',
    };
  }

  // Post-salary (1st-5th)
  if (dateOfMonth <= 5) {
    return {
      context: 'post_salary',
      label: 'بداية الشهر — العميل مرتاح مالياً',
      recoveryAllowed: true,
      recommendedTone: 'واثق',
      salesPressure: 'high',
    };
  }

  // End of month (25th+)
  if (dateOfMonth >= 25) {
    return {
      context: 'end_of_month',
      label: 'نهاية الشهر — ركز على القيمة',
      recoveryAllowed: true,
      recommendedTone: 'متفهم ومحترم',
      salesPressure: 'medium',
    };
  }

  // Default: business hours
  return {
    context: 'business_hours',
    label: 'ساعات عمل عادية',
    recoveryAllowed: true,
    recommendedTone: 'طبيعي',
    salesPressure: 'medium',
  };
}

/**
 * Check if now is a good time to send a recovery message.
 */
export function canSendRecovery(): boolean {
  const advice = detectTimingContext();
  return advice.recoveryAllowed;
}

/**
 * Get a timing hint for the Mission Block.
 */
export function getTimingHint(): string | undefined {
  const advice = detectTimingContext();
  if (advice.context === 'business_hours') return undefined; // No special hint needed
  return advice.label;
}
