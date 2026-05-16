/**
 * Coaching Engine — Sari's Self-Improvement Protocol
 * 
 * Micro-training via WhatsApp (Duolingo-style):
 * - 1-2 questions max per interaction (not 5!)
 * - Priority Engine triggers only when needed
 * - 3-layer knowledge: Temp → Approved → Proven
 * - #علم_ساري command for natural merchant training
 */

import * as db from '../db';
import { sendMessageWithCredentials } from '../whatsapp';
import {
  createCoachingSession,
  getActiveSession,
  getCurrentQuestion,
  recordVerdict,
  advanceSession,
  completeSession,
  getReviewCandidates,
  getLastSessionDate,
  expireStaleSessions,
  type CoachingSession,
  type CoachingQuestion,
} from '../db/coaching';
import { captureSignal } from '../db/learning';
import { cacheSuccessfulResponse } from './rag-engine';
import { sanitizeDNAText } from './learning-engine';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const MAX_QUESTIONS_PER_SESSION = 2; // Micro-training — Duolingo style
const MIN_HOURS_BETWEEN_SESSIONS = 24;
const SESSION_TIMEOUT_HOURS = 2;
const MIN_CANDIDATES_TO_TRIGGER = 3; // Need 3+ unreviewed Q&As before triggering

// Confirmation keywords (Arabic/English)
const CONFIRM_KEYWORDS = ['صح', 'صحيح', 'تمام', 'ممتاز', 'اي', 'نعم', 'صحيحة', 'yes', 'correct', 'ok', '👍', '✅'];
const SKIP_KEYWORDS = ['تخطى', 'تخطي', 'skip', 'لا', 'تجاوز'];

// ═══════════════════════════════════════════════════════════════
// #علم_ساري — Natural WhatsApp Training Command
// ═══════════════════════════════════════════════════════════════

/**
 * Detect and handle the #علم_ساري command from merchant.
 * Format: "#علم_ساري إذا سأل العميل عن X قل له Y"
 * Returns true if command was detected and handled.
 */
export async function handleTeachCommand(
  merchantId: number,
  messageText: string
): Promise<{ handled: boolean; response?: string }> {
  const teachPattern = /^#علم[_\s]?ساري\s+(.+)/s;
  const match = messageText.trim().match(teachPattern);
  if (!match) return { handled: false };

  const instruction = match[1].trim();
  if (instruction.length < 10) {
    return { handled: true, response: 'التعليمة قصيرة جداً 😅 حاول تكتب مثلاً:\n#علم_ساري إذا سأل العميل عن الضمان قل له الضمان سنتين شامل' };
  }

  // Parse "إذا سأل عن X قل/رد Y" pattern
  const ifPattern = /(?:إذا|لو|لما)\s+(?:سأل|يسأل|سألك?)\s+(?:العميل\s+)?(?:عن\s+)?(.+?)(?:\s+(?:قل|رد|قول|جاوب)\s+(?:له\s+)?(.+))/s;
  const parsed = instruction.match(ifPattern);

  let question: string;
  let answer: string;

  if (parsed) {
    question = parsed[1].trim();
    answer = parsed[2].trim();
  } else {
    // Free-form instruction — store as general knowledge
    question = instruction.substring(0, 200);
    answer = instruction;
  }

  // Sanitize against prompt injection
  const safeAnswer = sanitizeDNAText(answer).substring(0, 2000);
  const safeQuestion = sanitizeDNAText(question).substring(0, 500);

  // Store in RAG cache as merchant-approved knowledge (high confidence)
  try {
    await cacheSuccessfulResponse(merchantId, safeQuestion, safeAnswer);
  } catch { /* cache is optional */ }

  // Record as merchant_correction signal (weight 3.0 — highest)
  await captureSignal({
    merchantId,
    conversationId: 0,
    signalType: 'merchant_correction',
    signalWeight: 3.0,
    customerMessage: safeQuestion,
    merchantCorrection: safeAnswer,
    contextSummary: 'تعليم مباشر من التاجر عبر #علم_ساري',
  });

  console.log(`[Coaching] 📝 #علم_ساري: merchant ${merchantId} taught: "${safeQuestion.substring(0, 50)}..."`);

  return {
    handled: true,
    response: `تعلمتها! ✅\n\n📝 *السؤال:* "${safeQuestion.substring(0, 100)}"\n💬 *الجواب:* "${safeAnswer.substring(0, 100)}"\n\nمن الحين إذا سأل عميل نفس السؤال بعطيه هالجواب 🧠`,
  };
}

// ═══════════════════════════════════════════════════════════════
// Priority Engine — Should we trigger coaching?
// ═══════════════════════════════════════════════════════════════

/**
 * Smart trigger — only starts a session when there's real value.
 * NOT time-based. Checks: uncertainty, patterns, gaps, opportunities.
 */
export async function shouldTriggerCoaching(merchantId: number): Promise<boolean> {
  try {
    // Gate 1: Cooldown — at least 24 hours since last session
    const lastSession = await getLastSessionDate(merchantId);
    if (lastSession) {
      const hoursSinceLast = (Date.now() - lastSession.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < MIN_HOURS_BETWEEN_SESSIONS) return false;
    }

    // Gate 2: Business hours (8 AM - 9 PM)
    const hour = new Date().getHours();
    if (hour < 8 || hour >= 21) return false;

    // Gate 3: No active session already running
    const active = await getActiveSession(merchantId);
    if (active) return false;

    // Gate 4: Enough unreviewed content (3+ candidates)
    const candidates = await getReviewCandidates(merchantId, MIN_CANDIDATES_TO_TRIGGER);
    if (candidates.length < MIN_CANDIDATES_TO_TRIGGER) return false;

    // Gate 5: Merchant has WhatsApp escalation phones configured
    const merchant = await db.getMerchantById(merchantId);
    if (!merchant) return false;
    const hasPhone = (merchant as any).escalationPhones || (merchant as any).emergencyPhone || merchant.phone;
    if (!hasPhone) return false;

    return true;
  } catch (err: any) {
    console.error('[Coaching] shouldTriggerCoaching failed:', err.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// Start Session — Send first micro-training question
// ═══════════════════════════════════════════════════════════════

export async function startCoachingSession(merchantId: number): Promise<number | null> {
  try {
    const candidates = await getReviewCandidates(merchantId, MAX_QUESTIONS_PER_SESSION);
    if (candidates.length === 0) return null;

    // Create session
    const sessionId = await createCoachingSession(merchantId, candidates);
    if (!sessionId) return null;

    // Send first question via WhatsApp
    await sendCoachingQuestion(merchantId, sessionId, 0, candidates.length);

    console.log(`[Coaching] 🎓 Session started: merchant=${merchantId}, questions=${candidates.length}`);
    return sessionId;
  } catch (err: any) {
    console.error('[Coaching] startCoachingSession failed:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Send Question — WhatsApp message to merchant
// ═══════════════════════════════════════════════════════════════

async function sendCoachingQuestion(
  merchantId: number,
  sessionId: number,
  questionIndex: number,
  totalQuestions: number
): Promise<void> {
  const question = await getCurrentQuestion(sessionId, questionIndex);
  if (!question) return;

  // Get merchant's phone
  const targetPhone = await getMerchantCoachingPhone(merchantId);
  if (!targetPhone) return;

  const instances = await db.getWhatsAppInstancesByMerchantId(merchantId);
  const activeInstance = instances.find((i: any) => i.status === 'active');
  if (!activeInstance) return;

  const intro = questionIndex === 0
    ? `🧠 *جلسة تطوير سريعة من ساري*\n\nعندي ${totalQuestions} ${totalQuestions === 1 ? 'سؤال' : 'سؤالين'} بس — ما ياخذ دقيقة 😊\n\n`
    : '';

  const q = question.customerQuestion?.substring(0, 200) || '';
  const a = question.botResponse?.substring(0, 200) || '';

  const message = `${intro}📝 *سؤال ${questionIndex + 1} من ${totalQuestions}:*\n\n👤 العميل سأل: "${q}"\n🤖 رديت: "${a}"\n\n✅ رد بـ *صح* إذا ردي صحيح\n✏️ أو اكتب *الجواب الأصح*\n⏭ أو *تخطى*`;

  try {
    await sendMessageWithCredentials(
      (activeInstance as any).instanceId,
      (activeInstance as any).token,
      (activeInstance as any).apiUrl || 'https://api.green-api.com',
      targetPhone,
      message
    );
  } catch (err: any) {
    console.error(`[Coaching] Failed to send question:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// Handle Reply — Process merchant's response
// ═══════════════════════════════════════════════════════════════

/**
 * Handle merchant's reply to a coaching question.
 * Returns { handled: true } if this was a coaching reply.
 */
export async function handleCoachingReply(
  merchantId: number,
  replyText: string
): Promise<{ handled: boolean; response?: string }> {
  try {
    const session = await getActiveSession(merchantId);
    if (!session) return { handled: false };

    const currentQ = await getCurrentQuestion(
      session.id,
      (session as any).current_question_index ?? session.currentQuestionIndex ?? 0
    );
    if (!currentQ) {
      // No more questions — complete
      await completeSession(session.id);
      return { handled: false };
    }

    const textLower = replyText.trim().toLowerCase();
    const totalQ = (session as any).total_questions ?? session.totalQuestions ?? 0;

    let verdict: 'correct' | 'corrected' | 'skipped';
    let correction: string | undefined;
    let replyMsg: string;

    if (CONFIRM_KEYWORDS.some(k => textLower === k || textLower === k + '!')) {
      // ✅ Correct — bot was right
      verdict = 'correct';
      replyMsg = '✅ ممتاز!';

      // Signal: coaching_confirmed (weight 1.5)
      captureSignal({
        merchantId,
        conversationId: currentQ.conversationId || 0,
        signalType: 'positive_feedback',
        signalWeight: 1.5,
        botMessage: currentQ.botResponse?.substring(0, 500),
        customerMessage: currentQ.customerQuestion?.substring(0, 500),
        contextSummary: 'التاجر أكد صحة الرد في جلسة التدريب',
      }).catch(() => {});

    } else if (SKIP_KEYWORDS.some(k => textLower === k)) {
      // ⏭ Skip
      verdict = 'skipped';
      replyMsg = '⏭ تم التخطي';

    } else {
      // ✏️ Correction — merchant provided better answer
      verdict = 'corrected';
      correction = sanitizeDNAText(replyText).substring(0, 2000);
      replyMsg = '📝 شكراً على التصحيح! سجلتها';

      // Cache the correction (Merchant Approved Knowledge — tier 2)
      const safeCorrection = correction.replace(/https?:\/\/[^\s]+/g, '[رابط]');
      cacheSuccessfulResponse(
        merchantId,
        currentQ.customerQuestion || '',
        safeCorrection
      ).catch(() => {});

      // Signal: merchant_correction (weight 3.0 — highest)
      captureSignal({
        merchantId,
        conversationId: currentQ.conversationId || 0,
        signalType: 'merchant_correction',
        signalWeight: 3.0,
        botMessage: currentQ.botResponse?.substring(0, 500),
        customerMessage: currentQ.customerQuestion?.substring(0, 500),
        merchantCorrection: safeCorrection.substring(0, 500),
        contextSummary: 'تصحيح مباشر من التاجر في جلسة التدريب',
      }).catch(() => {});
    }

    // Record verdict
    const qId = (currentQ as any).id ?? currentQ.id;
    await recordVerdict(qId, merchantId, verdict, correction);

    // Advance to next question
    const newIndex = await advanceSession(session.id, verdict);

    if (newIndex >= totalQ) {
      // Session complete — send summary
      await completeSession(session.id);

      const correctCount = ((session as any).correct_count ?? session.correctCount ?? 0) + (verdict === 'correct' ? 1 : 0);
      const correctedCount = ((session as any).corrected_count ?? session.correctedCount ?? 0) + (verdict === 'corrected' ? 1 : 0);

      const summaryMsg = `${replyMsg}\n\n🎉 *تم!* راجعنا ${totalQ} ${totalQ <= 2 ? 'سؤال' : 'أسئلة'}:\n✅ ${correctCount} صحيحة\n✏️ ${correctedCount} تم تصحيحها\n\nساري تطور! 🧠 شكراً على وقتك 🙏`;

      // Send summary via WhatsApp
      const targetPhone = await getMerchantCoachingPhone(merchantId);
      if (targetPhone) {
        const instances = await db.getWhatsAppInstancesByMerchantId(merchantId);
        const inst = instances.find((i: any) => i.status === 'active');
        if (inst) {
          sendMessageWithCredentials(
            (inst as any).instanceId, (inst as any).token,
            (inst as any).apiUrl || 'https://api.green-api.com',
            targetPhone, summaryMsg
          ).catch(() => {});
        }
      }

      return { handled: true };
    }

    // Send next question
    await sendNextQuestion(merchantId, session.id, newIndex, totalQ, replyMsg);
    return { handled: true };

  } catch (err: any) {
    console.error('[Coaching] handleCoachingReply failed:', err.message);
    return { handled: false };
  }
}

async function sendNextQuestion(
  merchantId: number,
  sessionId: number,
  questionIndex: number,
  totalQuestions: number,
  previousFeedback: string
): Promise<void> {
  const question = await getCurrentQuestion(sessionId, questionIndex);
  if (!question) return;

  const targetPhone = await getMerchantCoachingPhone(merchantId);
  if (!targetPhone) return;

  const instances = await db.getWhatsAppInstancesByMerchantId(merchantId);
  const inst = instances.find((i: any) => i.status === 'active');
  if (!inst) return;

  const q = question.customerQuestion?.substring(0, 200) || '';
  const a = question.botResponse?.substring(0, 200) || '';

  const message = `${previousFeedback}\n\n📝 *سؤال ${questionIndex + 1} من ${totalQuestions}:*\n\n👤 العميل سأل: "${q}"\n🤖 رديت: "${a}"\n\n✅ *صح*  |  ✏️ *اكتب الأصح*  |  ⏭ *تخطى*`;

  try {
    await sendMessageWithCredentials(
      (inst as any).instanceId, (inst as any).token,
      (inst as any).apiUrl || 'https://api.green-api.com',
      targetPhone, message
    );
  } catch (err: any) {
    console.error(`[Coaching] Failed to send next question:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// Helper: Get merchant's coaching phone
// ═══════════════════════════════════════════════════════════════

async function getMerchantCoachingPhone(merchantId: number): Promise<string | null> {
  const merchant = await db.getMerchantById(merchantId);
  if (!merchant) return null;

  // Use first escalation phone, or legacy emergency phone, or main phone
  try {
    const raw = (merchant as any).escalationPhones;
    if (raw) {
      const chain = JSON.parse(raw);
      if (Array.isArray(chain) && chain.length > 0 && chain[0].phone) {
        return chain[0].phone;
      }
    }
  } catch { /* ignore */ }

  return (merchant as any).emergencyPhone || merchant.phone || null;
}

// ═══════════════════════════════════════════════════════════════
// Background: Process expired sessions
// ═══════════════════════════════════════════════════════════════

export async function processCoachingMaintenance(): Promise<void> {
  try {
    const expired = await expireStaleSessions();
    if (expired > 0) {
      console.log(`[Coaching] ⏰ Expired ${expired} stale session(s)`);
    }
  } catch (err: any) {
    console.error('[Coaching] Maintenance failed:', err.message);
  }
}
