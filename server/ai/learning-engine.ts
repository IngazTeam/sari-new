/**
 * Learning Engine — Continuous Learning for Sari Bot
 * 
 * The bot matures like a real sales employee:
 * 1. captureConversationSignals() — Detect behavioral signals from messages
 * 2. analyzePatterns() — GPT-4o-mini finds patterns in accumulated signals
 * 3. evolveDNA() — Update behavioral DNA based on discoveries
 * 4. buildDNAPrompt() — Convert DNA into system prompt injection
 * 
 * Trigger: Every 50 new signals → automatic pattern analysis
 * Cost: ~$0.01 per analysis cycle (gpt-4o-mini)
 */

import { callGPT4, type ChatMessage } from './openai';
import {
  captureSignal,
  getUnanalyzedSignals,
  markSignalsAnalyzed,
  countUnanalyzedSignals,
  getActiveDNA,
  getDNAGeneration,
  upsertDNA,
  type SignalType,
  type DNADimension,
  type LearningSignal,
  type BehavioralDNA,
} from '../db/learning';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const ANALYSIS_THRESHOLD = 50;      // Analyze every 50 new signals
const AUTO_APPLY_CONFIDENCE = 0.80; // Auto-apply DNA with ≥80% confidence
const ANALYSIS_MODEL = 'gpt-4o-mini';
const MAX_INSIGHT_LENGTH = 500;      // PEN-LEARN-03: Cap insight length

/** PEN-LEARN-02: Valid DNA dimensions — reject anything else from GPT */
const VALID_DIMENSIONS: DNADimension[] = [
  'greeting_style', 'objection_handling', 'closing_technique',
  'tone_preference', 'product_emphasis', 'upsell_timing',
  'knowledge_gaps', 'pain_points', 'winning_patterns', 'losing_patterns',
];

/**
 * PEN-LEARN-01: Sanitize DNA insight text before prompt injection.
 * Customer messages can contain prompt injection that flows through:
 * customer message → signal → GPT analysis → DNA insight → system prompt
 */
function sanitizeDNAText(text: string): string {
  if (!text) return '';
  return text
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
    .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
    .replace(/you\s+are\s+now\s+/gi, '[filtered] ')
    .replace(/forget\s+(everything|all|your)/gi, '[filtered]')
    .replace(/new\s+instructions?\s*:/gi, '[filtered]:')
    .replace(/override\s+(system|all|your)/gi, '[filtered]')
    .replace(/act\s+as\s+(a|an)?/gi, '[filtered]')
    .replace(/pretend\s+(to\s+be|you\s+are)/gi, '[filtered]')
    .replace(/تصرف\s*(كـ|ك)/gi, '[filtered]')
    .replace(/تجاهل\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد)/gi, '[filtered]')
    .replace(/انس[َى]?\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد)/gi, '[filtered]')
    .substring(0, MAX_INSIGHT_LENGTH);
}

// ═══════════════════════════════════════════════════════════════
// 1. Signal Detection — What did the customer's response mean?
// ═══════════════════════════════════════════════════════════════

/** Signal detection patterns — checked against customer messages */
const SIGNAL_PATTERNS: { type: SignalType; patterns: RegExp[]; weight: number }[] = [
  {
    type: 'positive_feedback',
    patterns: [
      /شكر/i, /تسلم/i, /ممتاز/i, /حلو/i, /رائع/i, /جميل/i, /مشكور/i,
      /يعطي[كه] العافي[ةه]/i, /الله يعافي/i, /thanks/i, /thank you/i,
      /great/i, /awesome/i, /perfect/i, /تمام/i, /ماشاءالله/i, /ماشالله/i,
    ],
    weight: 1.0,
  },
  {
    type: 'escalation_requested',
    patterns: [
      /أبغى أكلم/i, /ابغى اكلم/i, /أبي أكلم/i, /كلم[ني]?\s*(شخص|مسؤول|مدير|بشري)/i,
      /وصل[ني]?\s*(ب|مع)/i, /حول[ني]?\s*(ل|على)/i, /talk to.*human/i,
      /real person/i, /مسؤول/i, /مدير/i, /أحد يرد/i, /خلني أكلم/i,
    ],
    weight: 1.5,
  },
  {
    type: 'price_objection',
    patterns: [
      /غالي/i, /غالية/i, /كثير/i, /مبالغ/i, /رخ[صّ]/i, /أرخص/i, /خصم/i,
      /تخفيض/i, /عرض/i, /سعر.*عالي/i, /expensive/i, /too much/i,
      /discount/i, /cheaper/i, /ما عندكم عروض/i,
    ],
    weight: 1.0,
  },
  {
    type: 'question_repeated',
    patterns: [
      /قلت لك/i, /سألتك/i, /مرة ثانية/i, /ما فهمت/i, /مافهمت/i,
      /أعيد/i, /مره ثانيه/i, /ما رديت/i, /مارديت/i, /ما جاوبت/i,
      /repeat/i, /again/i, /didn't answer/i, /ما فيه رد/i,
    ],
    weight: 1.2,
  },
  {
    type: 'knowledge_gap',
    patterns: [], // Detected differently — when bot says "ما عندي معلومات"
    weight: 1.3,
  },
];

/** Bot response patterns that indicate a knowledge gap */
const BOT_GAP_PATTERNS = [
  /ما عندي معلومات/i, /ما أقدر أفيدك/i, /ما أعرف/i, /مو متأكد/i,
  /تواصل.*مباشر/i, /اتواصل.*مباشرة/i, /I don't have.*info/i,
  /أعتذر.*ما أقدر/i, /للأسف.*ما عندي/i,
];

/**
 * Detect signals from a customer message after bot response.
 * Called after every bot response — fire-and-forget.
 */
export async function captureConversationSignals(params: {
  merchantId: number;
  conversationId: number;
  customerMessage: string;
  botResponse: string;
  contextSummary?: string;
}): Promise<void> {
  try {
    const { merchantId, conversationId, customerMessage, botResponse } = params;
    const msgLower = customerMessage.toLowerCase();

    // Check customer message for signals
    for (const pattern of SIGNAL_PATTERNS) {
      if (pattern.patterns.length === 0) continue;
      if (pattern.patterns.some(p => p.test(msgLower))) {
        await captureSignal({
          merchantId,
          conversationId,
          signalType: pattern.type,
          signalWeight: pattern.weight,
          botMessage: botResponse.substring(0, 500),
          customerMessage: customerMessage.substring(0, 500),
          contextSummary: params.contextSummary,
        });
        // Don't break — a message can trigger multiple signals
      }
    }

    // Check bot response for knowledge gaps
    if (BOT_GAP_PATTERNS.some(p => p.test(botResponse))) {
      await captureSignal({
        merchantId,
        conversationId,
        signalType: 'knowledge_gap',
        signalWeight: 1.3,
        botMessage: botResponse.substring(0, 500),
        customerMessage: customerMessage.substring(0, 500),
        contextSummary: params.contextSummary,
      });
    }

    // Check if analysis should be triggered
    const unanalyzedCount = await countUnanalyzedSignals(merchantId);
    if (unanalyzedCount >= ANALYSIS_THRESHOLD) {
      // Fire-and-forget — don't block the response
      triggerPatternAnalysis(merchantId).catch(err =>
        console.warn('[Learning] Background analysis failed:', err.message)
      );
    }
  } catch (err: any) {
    // Non-blocking — learning failures should never break the bot
    console.warn('[Learning] Signal capture failed:', err.message);
  }
}

/**
 * Capture a merchant correction signal.
 * Called when merchant sends a message during human takeover.
 */
export async function captureMerchantCorrection(params: {
  merchantId: number;
  conversationId: number;
  lastBotMessage: string;
  merchantMessage: string;
}): Promise<void> {
  try {
    await captureSignal({
      merchantId: params.merchantId,
      conversationId: params.conversationId,
      signalType: 'merchant_correction',
      signalWeight: 2.0, // High weight — direct merchant feedback
      botMessage: params.lastBotMessage.substring(0, 500),
      merchantCorrection: params.merchantMessage.substring(0, 500),
      contextSummary: 'التاجر تدخل وصحح رد البوت',
    });
  } catch (err: any) {
    console.warn('[Learning] Merchant correction capture failed:', err.message);
  }
}

/**
 * Capture conversation outcome signal.
 * Called at end of conversation (customer left or long conversation).
 */
export async function captureOutcomeSignal(params: {
  merchantId: number;
  conversationId: number;
  messageCount: number;
  wasEscalated: boolean;
}): Promise<void> {
  try {
    if (params.messageCount >= 5 && !params.wasEscalated) {
      await captureSignal({
        merchantId: params.merchantId,
        conversationId: params.conversationId,
        signalType: 'long_conversation',
        signalWeight: 0.8,
        contextSummary: `محادثة ناجحة: ${params.messageCount} رسائل`,
      });
    } else if (params.messageCount <= 2 && !params.wasEscalated) {
      await captureSignal({
        merchantId: params.merchantId,
        conversationId: params.conversationId,
        signalType: 'quick_resolution',
        signalWeight: 0.6,
        contextSummary: `حل سريع: ${params.messageCount} رسائل`,
      });
    }
  } catch (err: any) {
    console.warn('[Learning] Outcome capture failed:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. Pattern Analysis — Find patterns in accumulated signals
// ═══════════════════════════════════════════════════════════════

/** In-progress analysis lock (prevent parallel analyses per merchant) */
const _analysisInProgress = new Set<number>();

/**
 * Analyze accumulated signals and extract patterns.
 * Triggered automatically every 50 signals.
 */
export async function triggerPatternAnalysis(merchantId: number): Promise<void> {
  // Prevent concurrent analyses for the same merchant
  if (_analysisInProgress.has(merchantId)) return;
  _analysisInProgress.add(merchantId);

  try {
    console.log(`[Learning] 🔬 Starting pattern analysis for merchant ${merchantId}`);

    // Get unanalyzed signals
    const signals = await getUnanalyzedSignals(merchantId, 100);
    if (signals.length < 10) {
      console.log(`[Learning] Only ${signals.length} signals — skipping analysis`);
      return;
    }

    // Get current DNA for context
    const currentDNA = await getActiveDNA(merchantId);
    const currentGeneration = await getDNAGeneration(merchantId);

    // Group signals by type for the analysis prompt
    const signalGroups = groupSignalsByType(signals);

    // Build analysis prompt
    const systemPrompt = `أنت محلل سلوك مبيعات خبير. مهمتك تحليل إشارات سلوكية من محادثات بوت مبيعات واستخراج أنماط قابلة للتطبيق.

لكل نمط مكتشف:
- حدد البُعد (dimension): أحد القيم التالية: greeting_style, objection_handling, closing_technique, tone_preference, product_emphasis, upsell_timing, knowledge_gaps, pain_points, winning_patterns, losing_patterns
- اكتب الاكتشاف (insight): جملة عملية واضحة يمكن للبوت تطبيقها
- حدد نسبة الثقة (confidence): 0.50-0.99 بناءً على قوة الأدلة
- اكتب الدليل (evidence): جملة تشرح لماذا هذا الاكتشاف صحيح

قواعد مهمة:
1. الاكتشافات يجب أن تكون **عملية ومحددة** — ليست نصائح عامة
2. لا تخترع أنماط من إشارة واحدة — تحتاج 3+ إشارات متشابهة
3. إذا وجدت فجوات معرفية، حددها بوضوح
4. أجب بـ JSON فقط`;

    const currentDNAText = currentDNA.length > 0
      ? currentDNA.map(d => `- ${d.dimension}: ${d.insight} (ثقة: ${d.confidence})`).join('\n')
      : 'لا يوجد حمض نووي سابق — هذا أول تحليل';

    const userPrompt = `الحمض النووي الحالي (الجيل ${currentGeneration}):
${currentDNAText}

الإشارات الجديدة (${signals.length} إشارة):
${formatSignalsForPrompt(signalGroups)}

استخرج تحديثات الحمض النووي بصيغة JSON:
{
  "updates": [
    {
      "dimension": "greeting_style",
      "insight": "الاكتشاف العملي هنا",
      "confidence": 0.75,
      "evidence": "بناءً على X إشارات..."
    }
  ],
  "knowledge_gaps": ["فجوة 1", "فجوة 2"],
  "merchant_alerts": ["تنبيه للتاجر 1"]
}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await callGPT4(messages, {
      model: ANALYSIS_MODEL,
      temperature: 0.3,
      maxTokens: 2000,
    });

    // Parse response
    const jsonStr = response
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      console.error('[Learning] Failed to parse analysis response');
      return;
    }

    const analysis = JSON.parse(jsonStr.substring(jsonStart, jsonEnd + 1));
    const newGeneration = currentGeneration + 1;

    // Apply updates to DNA
    if (analysis.updates && Array.isArray(analysis.updates)) {
      for (const update of analysis.updates) {
        if (!update.dimension || !update.insight) continue;

        // PEN-LEARN-02: Validate dimension against whitelist
        if (!VALID_DIMENSIONS.includes(update.dimension as DNADimension)) {
          console.warn(`[Learning] ⚠️ Invalid dimension rejected: ${update.dimension}`);
          continue;
        }

        const confidence = Math.min(0.99, Math.max(0.50, update.confidence || 0.60));
        const autoApply = confidence >= AUTO_APPLY_CONFIDENCE;

        // PEN-LEARN-01+03: Sanitize and cap insight before storage
        const safeInsight = sanitizeDNAText(update.insight);

        await upsertDNA({
          merchantId,
          generation: newGeneration,
          dimension: update.dimension as DNADimension,
          insight: safeInsight,
          evidenceCount: 1,
          confidence,
          autoApplied: autoApply,
        });

        console.log(`[Learning] DNA ${autoApply ? '✅ auto-applied' : '⏳ pending review'}: ${update.dimension} (${confidence})`);
      }
    }

    // Save knowledge gaps as a DNA dimension
    if (analysis.knowledge_gaps?.length > 0) {
      // PEN-LEARN-01: Sanitize each gap entry
      const safeGaps = analysis.knowledge_gaps
        .slice(0, 10) // Max 10 gaps
        .map((g: string) => sanitizeDNAText(String(g)).substring(0, 200));

      await upsertDNA({
        merchantId,
        generation: newGeneration,
        dimension: 'knowledge_gaps',
        insight: safeGaps.join('\n• '),
        evidenceCount: safeGaps.length,
        confidence: 0.90,
        autoApplied: true,
      });
    }

    // Mark signals as analyzed
    const signalIds = signals.map(s => s.id);
    await markSignalsAnalyzed(merchantId, signalIds);

    console.log(`[Learning] 🧬 Evolution complete: Generation ${newGeneration}, ${analysis.updates?.length || 0} updates, ${signals.length} signals analyzed`);

    // === Learning Milestone Notifications ===
    try {
      const milestones: Record<number, string> = {
        1: '🧒 ساري بدأ يتعلم! أول أنماط مبيعات مكتشفة من محادثاتك — شاهد التفاصيل في لوحة التحكم',
        3: '📚 ساري ينمو! تعلم 3 أنماط جديدة عن أسلوب عملائك في الشراء',
        5: '💪 ساري أصبح محترف! يفهم أسلوب عملائك بثقة عالية ويطبق ما تعلمه تلقائياً',
        10: '🏆 ساري خبير مبيعات! الجيل 10 — أتقن كل أبعاد البيع الذكي لعملائك',
      };

      const milestoneMessage = milestones[newGeneration];
      if (milestoneMessage) {
        const { sendNotification } = await import('../_core/notificationService');
        await sendNotification({
          merchantId,
          type: 'custom',
          title: `🧬 ساري تطور — الجيل ${newGeneration}`,
          body: milestoneMessage,
          url: '/merchant/sari-brain',
          metadata: { type: 'learning_milestone', generation: newGeneration },
        });
        console.log(`[Learning] 🎉 Milestone notification sent: Generation ${newGeneration}`);
      }
    } catch { /* milestone notifications are non-blocking */ }

    // === Daily Knowledge Gap Digest (if gaps found) ===
    try {
      const { sendKnowledgeGapDigest } = await import('./smart-escalation');
      sendKnowledgeGapDigest(merchantId).catch(() => {});
    } catch { /* non-blocking */ }
  } catch (err: any) {
    console.error('[Learning] Pattern analysis failed:', err.message);
  } finally {
    _analysisInProgress.delete(merchantId);
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. Build DNA Prompt — Convert DNA to System Prompt Injection
// ═══════════════════════════════════════════════════════════════

/**
 * Build a prompt section from the merchant's behavioral DNA.
 * This gets injected into the system prompt alongside RAG context.
 * Only includes high-confidence, auto-applied DNA.
 */
export async function buildDNAPrompt(merchantId: number): Promise<string> {
  const dna = await getActiveDNA(merchantId);
  if (dna.length === 0) return '';

  // Only inject auto-applied DNA or high-confidence DNA
  const applicableDNA = dna.filter(d =>
    (d as any).auto_applied || (d as any).confidence >= AUTO_APPLY_CONFIDENCE
  );

  if (applicableDNA.length === 0) return '';

  const generation = await getDNAGeneration(merchantId);

  let prompt = `\n\n## 🧬 ذكاء مبيعات مُتعلَّم (الجيل ${generation}) — تعلمته من محادثات سابقة مع عملاء هذا التاجر:\n`;

  // Group by category for readability
  const behavioral = applicableDNA.filter(d =>
    ['greeting_style', 'tone_preference', 'closing_technique', 'objection_handling', 'upsell_timing'].includes(d.dimension)
  );

  const knowledge = applicableDNA.filter(d =>
    ['product_emphasis', 'winning_patterns', 'losing_patterns'].includes(d.dimension)
  );

  const gaps = applicableDNA.filter(d => d.dimension === 'knowledge_gaps');
  const pains = applicableDNA.filter(d => d.dimension === 'pain_points');

  if (behavioral.length > 0) {
    prompt += `\n### أسلوب البيع المثالي لعملاء هذا التاجر:\n`;
    for (const dnaItem of behavioral) {
      const label = DNA_LABELS[dnaItem.dimension] || dnaItem.dimension;
      // PEN-LEARN-01: Sanitize before injection into system prompt
      prompt += `- **${label}**: ${sanitizeDNAText(dnaItem.insight)}\n`;
    }
  }

  if (knowledge.length > 0) {
    prompt += `\n### أنماط مُكتشفة:\n`;
    for (const dnaItem of knowledge) {
      const label = DNA_LABELS[dnaItem.dimension] || dnaItem.dimension;
      prompt += `- **${label}**: ${sanitizeDNAText(dnaItem.insight)}\n`;
    }
  }

  if (pains.length > 0) {
    prompt += `\n### تجنب هذه النقاط — تُزعج عملاء هذا التاجر:\n`;
    for (const dnaItem of pains) {
      prompt += `- ${sanitizeDNAText(dnaItem.insight)}\n`;
    }
  }

  if (gaps.length > 0) {
    prompt += `\n### ⚠️ فجوات معرفية — إذا سُئلت عنها اعتذر بلطف واقترح التواصل المباشر:\n`;
    for (const dnaItem of gaps) {
      prompt += `- ${sanitizeDNAText(dnaItem.insight)}\n`;
    }
  }

  prompt += `\n⚠️ طبّق هذه الاكتشافات بطبيعية — لا تذكرها للعميل صراحةً.\n`;

  return prompt;
}

/** Human-readable labels for DNA dimensions */
const DNA_LABELS: Record<string, string> = {
  greeting_style: 'أسلوب الترحيب',
  objection_handling: 'معالجة الاعتراضات',
  closing_technique: 'إغلاق البيع',
  tone_preference: 'اللهجة المفضلة',
  product_emphasis: 'المنتجات الأهم',
  upsell_timing: 'توقيت البيع الإضافي',
  knowledge_gaps: 'فجوات معرفية',
  pain_points: 'نقاط الألم',
  winning_patterns: 'أنماط ناجحة',
  losing_patterns: 'أنماط فاشلة',
};

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function groupSignalsByType(
  signals: LearningSignal[]
): Record<string, LearningSignal[]> {
  const groups: Record<string, LearningSignal[]> = {};
  for (const signal of signals) {
    const type = (signal as any).signal_type || signal.signalType;
    if (!groups[type]) groups[type] = [];
    groups[type].push(signal);
  }
  return groups;
}

function formatSignalsForPrompt(
  groups: Record<string, LearningSignal[]>
): string {
  const SIGNAL_LABELS: Record<string, string> = {
    positive_feedback: 'ردود إيجابية من العملاء',
    purchase_completed: 'عمليات شراء مكتملة',
    question_repeated: 'أسئلة مكررة (البوت لم يفهم)',
    customer_left: 'العميل غادر بدون رد',
    escalation_requested: 'طلبات تحويل لبشري',
    price_objection: 'اعتراضات على السعر',
    knowledge_gap: 'فجوات معرفية',
    merchant_correction: 'تصحيحات من التاجر',
    long_conversation: 'محادثات ناجحة طويلة',
    quick_resolution: 'حلول سريعة',
  };

  const lines: string[] = [];

  for (const [type, signals] of Object.entries(groups)) {
    const label = SIGNAL_LABELS[type] || type;
    lines.push(`\n### ${label} (${signals.length}×):`);

    // Show up to 5 examples per type
    for (const signal of signals.slice(0, 5)) {
      const bot = (signal as any).bot_message || signal.botMessage || '';
      const customer = (signal as any).customer_message || signal.customerMessage || '';
      const correction = (signal as any).merchant_correction || signal.merchantCorrection || '';

      if (bot) lines.push(`  البوت: "${bot.substring(0, 150)}"`);
      if (customer) lines.push(`  العميل: "${customer.substring(0, 150)}"`);
      if (correction) lines.push(`  تصحيح التاجر: "${correction.substring(0, 150)}"`);
      lines.push('  ---');
    }
  }

  return lines.join('\n');
}
