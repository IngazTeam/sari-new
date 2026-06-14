/**
 * Merchant Mode — Intelligent merchant-facing chat handler
 * 
 * When a message comes from a phone in the escalation chain,
 * it is NEVER treated as a customer message. Instead:
 * 
 * 1. Escalation replies → coached before delivery to customer
 * 2. Training commands → handled by coaching engine
 * 3. Reports/stats → quick merchant dashboard via WhatsApp
 * 4. General questions → Sari responds as merchant assistant
 */

import { callGPT4, type ChatMessage } from './openai';
import type { CustomerProfile } from '../db/customer-intelligence';

// ═══════════════════════════════════════════════════════════════
// Intent Detection — What does the merchant want?
// ═══════════════════════════════════════════════════════════════

type MerchantIntent = 
  | 'escalation_reply'      // replying to a customer escalation
  | 'report'                // wants stats/reports
  | 'teach'                 // teaching Sari new info
  | 'question'              // asking about the business
  | 'directive_stop'        // "لا ترد" — stop responding to a customer
  | 'directive_search'      // "ابحث عن" — search products/knowledge
  | 'directive_reply'       // "قول للعميل" — send specific text to customer
  | 'directive_resume'      // "استأنف" — resume auto-replies
  | 'chat';                 // general conversation

const REPORT_KEYWORDS = [
  'تقرير', 'إحصائيات', 'احصائيات', 'كم طلب', 'كم عميل', 'كم محادثة',
  'المبيعات', 'الأداء', 'ملخص', 'أرقام', 'كم ربحنا', 'كم بعنا',
  'الطلبات اليوم', 'طلبات اليوم', 'مبيعات اليوم', 'أداء اليوم',
];

const TEACH_KEYWORDS = [
  '#علم', 'تعلم', 'علم ساري', 'ساري تعلم', 'أضف معلومة', 'حفظ معلومة',
  'Q:', 'A:', 'سؤال:', 'جواب:',
];

// ── Merchant Directive Patterns ──
const STOP_PATTERNS = [
  /^لا\s*تر[دّ]/i, /^لاترد/i, /^وقف\s*الرد/i, /^أوقف\s*الرد/i, /^اوقف\s*الرد/i,
  /^سكّت/i, /^سكت/i, /^صامت/i, /^لا\s*ترسل/i, /^لاترسل/i,
];
const SEARCH_PATTERNS = [
  /^ابحث\s+(عن|في)/i, /^بحث\s+(عن|في)/i, /^دور\s+(على|عن)/i,
  /^ابحث$/i, /^وش\s+عندنا/i, /^شيك\s+(على|عن)/i,
];
const REPLY_CUSTOMER_PATTERNS = [
  /^(قول|قولي|قل)\s+(لل?عميل|له)/i, /^(أرسل|ارسل)\s+(لل?عميل|له)/i,
  /^(أجب|اجب)\s+(ال?عميل|عليه)/i, /^(رد|ردي)\s+(على\s+ال?عميل|عليه)/i,
  /^(بلّغ|بلغ)\s+(ال?عميل|ه)/i,
];
const RESUME_PATTERNS = [
  /^استأنف/i, /^استانف/i, /^ارجع\s*ر[دّ]/i, /^ارجع\s*شغّل/i,
  /^شغّل\s*(ساري|الرد|البوت)/i, /^شغل\s*(ساري|الرد|البوت)/i,
  /^فعّل\s*(الرد|ساري|البوت)/i, /^فعل\s*(الرد|ساري|البوت)/i,
];

const GREETING_PATTERNS = [
  /^(مرحبا|مرحبًا|مرحباً|السلام عليكم|السلام|هلا|هلا والله|أهلاً|أهلا|هاي|صباح الخير|مساء الخير|يا هلا|هلو|مساء النور|صباح النور|الو|ألو|حياك|حياكم)/i,
];

// Track last merchant greeting to avoid spamming (per merchantId)
const _lastMerchantGreeting = new Map<number, number>();
const GREETING_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

function detectMerchantIntentFast(message: string, hasActiveEscalation: boolean, quotedText: string): MerchantIntent | null {
  const trimmed = message.trim();

  // ── FAST PATH: Exact regex matches (no API cost) ──
  if (STOP_PATTERNS.some(p => p.test(trimmed))) return 'directive_stop';
  if (SEARCH_PATTERNS.some(p => p.test(trimmed))) return 'directive_search';
  if (REPLY_CUSTOMER_PATTERNS.some(p => p.test(trimmed))) return 'directive_reply';
  if (RESUME_PATTERNS.some(p => p.test(trimmed))) return 'directive_resume';

  // ── Escalation reply ──
  const isReplyToAlert = quotedText.includes('تنبيه من ساري')
    || quotedText.includes('تنبيه — سؤال عميل')
    || quotedText.includes('تصعيد عاجل')
    || quotedText.includes('تصعيد أخير')
    || quotedText.includes('سؤال عميل')
    || quotedText.includes('العميل ينتظر')
    || quotedText.includes('سيوصله للعميل');
  
  const replyIntentPhrases = ['قول له', 'قوله', 'جاوبه', 'ابلغه', 'أبلغه', 'بلغه', 'وصله', 'وصل له', 'رد عليه', 'ردي عليه', 'طمنه', 'اعطي العميل', 'أعطي العميل', 'اعطه', 'أعطه'];
  const hasReplyIntent = replyIntentPhrases.some(p => message.includes(p));

  if (isReplyToAlert || hasReplyIntent) {
    return 'escalation_reply';
  }
  
  // If there's an active escalation AND the message looks like a short direct answer
  if (hasActiveEscalation && !quotedText) {
    const isQuestion = /^(كيف|ليش|ليه|وين|متى|هل|وش|ايش|إيش|ممكن|أبغى|ابغى|أبي|ابي|عندي|عندكم)\b/.test(trimmed);
    const isGreeting = /^(مرحبا|السلام|هلا|أهلاً|هاي|صباح|مساء)\b/.test(trimmed);
    const isLongMessage = trimmed.length > 100;
    if (!isQuestion && !isGreeting && !isLongMessage) {
      return 'escalation_reply';
    }
  }

  // Check for teach commands
  if (TEACH_KEYWORDS.some(k => message.includes(k))) {
    return 'teach';
  }

  // Check for report requests
  if (REPORT_KEYWORDS.some(k => message.includes(k))) {
    return 'report';
  }

  // No fast match — return null to trigger AI classification
  return null;
}

/**
 * AI Intent Classifier — understands natural language merchant directives.
 * Called ONLY when regex fast-path returns null (saves API costs).
 * 
 * Examples it handles that regex can't:
 * - "خلاص لا ترد عليه" → directive_stop
 * - "ما ابي ترد على هالعميل" → directive_stop
 * - "دور لي على كريم مرطب" → directive_search
 * - "وش عندنا للشعر الجاف؟" → directive_search
 * - "أبي ترسل للعميل إن الطلب جاهز" → directive_reply
 * - "رجّع البوت يشتغل" → directive_resume
 */
async function classifyIntentWithAI(message: string): Promise<MerchantIntent> {
  try {
    const response = await callGPT4([
      {
        role: 'system',
        content: `أنت مصنّف نوايا. حلل رسالة التاجر وأرجع نوع واحد فقط من هذه القائمة:

- directive_stop → التاجر يريد إيقاف الرد التلقائي على عميل (مثل: "لا ترد عليه", "خلاص ما ابي ترد", "وقف الردود", "سكّت البوت")
- directive_search → التاجر يريد بحث في المنتجات أو المعلومات (مثل: "وش عندنا عن كذا", "دور لي على كريم", "شيك على المخزون")
- directive_reply → التاجر يريد إرسال رسالة محددة للعميل (مثل: "أبي ترسل له إن الطلب جاهز", "بلّغه يتواصل بكرة")
- directive_resume → التاجر يريد إعادة تشغيل البوت (مثل: "رجّع ساري", "شغّل الردود", "ارجع رد عادي")
- chat → أي شي ثاني (سؤال عام, دردشة, استفسار عن المتجر)

أرجع الكلمة فقط بدون أي شرح.`
      },
      { role: 'user', content: message.substring(0, 200) }
    ], {
      model: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 20,
      noRetry: true,
    });

    const intent = response.trim().toLowerCase().replace(/[^a-z_]/g, '');
    const validIntents: MerchantIntent[] = ['directive_stop', 'directive_search', 'directive_reply', 'directive_resume', 'chat'];
    if (validIntents.includes(intent as MerchantIntent)) {
      console.log(`[MerchantMode] 🧠 AI classified: "${message.substring(0, 40)}..." → ${intent}`);
      return intent as MerchantIntent;
    }
    return 'chat';
  } catch (err: any) {
    console.warn(`[MerchantMode] AI classification failed: ${err.message} — defaulting to chat`);
    return 'chat';
  }
}

/** Combined intent detection: fast regex → AI fallback */
async function detectMerchantIntent(message: string, hasActiveEscalation: boolean, quotedText: string): Promise<MerchantIntent> {
  // Layer 1: Fast regex (0ms, no API cost)
  const fastResult = detectMerchantIntentFast(message, hasActiveEscalation, quotedText);
  if (fastResult) return fastResult;

  // Layer 2: AI classification (only for unmatched messages, ~200ms)
  return classifyIntentWithAI(message);
}

// ═══════════════════════════════════════════════════════════════
// Escalation Reply Coach — Analyze reply before sending
// ═══════════════════════════════════════════════════════════════

// In-memory store for pending coached replies (merchant must confirm)
const _pendingReplies = new Map<number, {
  originalReply: string;
  suggestedReply: string;
  customerPhone: string;
  customerName: string;
  escalationId: number;
  expiresAt: number;
}>();

// Post-confirmation cooldown — prevents loop when merchant sends "موافق" and it gets re-processed
const _confirmationCooldown = new Map<number, number>();

// Cleanup expired pending replies and cooldowns every 10 minutes
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(_pendingReplies.entries());
  for (let i = 0; i < entries.length; i++) {
    const [key, val] = entries[i];
    if (now > val.expiresAt) _pendingReplies.delete(key);
  }
  // Cleanup expired cooldowns
  for (const [key, ts] of Array.from(_confirmationCooldown.entries())) {
    if (now - ts > 30_000) _confirmationCooldown.delete(key);
  }
}, 10 * 60 * 1000);

async function coachEscalationReply(params: {
  merchantId: number;
  merchantPhone: string;
  message: string;
  instanceId: string;
  token: string;
  apiUrl: string;
}): Promise<{ action: string }> {
  const { sendMessageWithCredentials } = await import('../whatsapp');

  // Check if merchant is confirming a pending reply
  const pending = _pendingReplies.get(params.merchantId);
  if (pending && Date.now() < pending.expiresAt) {
    const msgLower = params.message.trim();
    
    if (msgLower === 'موافق' || msgLower === '1' || msgLower === 'نعم') {
      // Send the AI-suggested reply to customer
      _pendingReplies.delete(params.merchantId);
      await deliverToCustomer(params, pending.customerPhone, pending.suggestedReply);
      await sendMessageWithCredentials(
        params.instanceId, params.token, params.apiUrl,
        params.merchantPhone,
        `✅ تم إرسال الرد المحسّن للعميل بنجاح! 🎯`
      );
      // Cache Q&A for future learning
      try {
        const { cacheSuccessfulResponse } = await import('./rag-engine');
        const { getActiveEscalationForMerchant } = await import('../db/learning');
        const esc = await getActiveEscalationForMerchant(params.merchantId);
        if (esc) {
          await cacheSuccessfulResponse(params.merchantId, (esc as any).question || '', pending.suggestedReply);
          const { resolveEscalation } = await import('../db/learning');
          await resolveEscalation({ merchantId: params.merchantId, customerPhone: '', merchantAnswer: pending.suggestedReply });
        }
      } catch { /* non-blocking */ }
      _confirmationCooldown.set(params.merchantId, Date.now());
      return { action: 'escalation_coached_reply_sent' };
    }
    
    if (msgLower === 'أرسل' || msgLower === 'ارسل' || msgLower === '2') {
      // Send the merchant's original reply as-is
      _pendingReplies.delete(params.merchantId);
      await deliverToCustomer(params, pending.customerPhone, pending.originalReply);
      await sendMessageWithCredentials(
        params.instanceId, params.token, params.apiUrl,
        params.merchantPhone,
        `✅ تم إرسال ردك الأصلي للعميل!`
      );
      // Cache and resolve
      try {
        const { cacheSuccessfulResponse } = await import('./rag-engine');
        const { resolveEscalation } = await import('../db/learning');
        const { getActiveEscalationForMerchant } = await import('../db/learning');
        const esc = await getActiveEscalationForMerchant(params.merchantId);
        if (esc) {
          await cacheSuccessfulResponse(params.merchantId, (esc as any).question || '', pending.originalReply);
          await resolveEscalation({ merchantId: params.merchantId, customerPhone: '', merchantAnswer: pending.originalReply });
        }
      } catch { /* non-blocking */ }
      _confirmationCooldown.set(params.merchantId, Date.now());
      return { action: 'escalation_original_reply_sent' };
    }
    
    // Merchant typed something else — treat as a revised reply, re-coach
    _pendingReplies.delete(params.merchantId);
  }

  // Get active escalation details
  const { getActiveEscalationForMerchant } = await import('../db/learning');
  const escalation = await getActiveEscalationForMerchant(params.merchantId);
  
  if (!escalation) {
    // No active escalation — this might be a general message
    return { action: 'no_active_escalation' };
  }

  const esc = escalation as any;
  const customerPhone = esc.customer_phone || esc.customerPhone;
  const customerName = esc.customer_name || esc.customerName || 'العميل';
  const customerQuestion = esc.question || '';

  // Get customer profile for intelligent coaching
  let profileContext = '';
  try {
    const { getOrCreateProfile, buildProfileContext } = await import('../db/customer-intelligence');
    const profile = await getOrCreateProfile(params.merchantId, customerPhone, customerName);
    if (profile) {
      profileContext = buildCustomerBrief(profile);
    }
  } catch { /* non-blocking */ }

  // Ask GPT to coach the merchant's reply
  try {
    const coachPrompt: ChatMessage[] = [
      {
        role: 'system',
        content: `أنت مستشار مبيعات ذكي تساعد التاجر على الرد بأفضل طريقة.

مهمتك:
1. حلّل رد التاجر مقابل سؤال العميل وبيانات تحليل العميل
2. إذا الرد ممتاز → أكّد وأثنِ عليه
3. إذا يمكن تحسينه → اقترح رد أفضل مع شرح السبب

قواعد الرد:
- اللهجة السعودية الودية
- ابدأ بملخص تحليل العميل (سطرين كحد أقصى)
- قيّم الرد بصراحة ولطف
- إذا اقترحت تحسين، اكتب الرد المقترح كاملاً
- لا تزيد عن 10 أسطر`
      },
      {
        role: 'user',
        content: `📊 *تحليل العميل:*
${profileContext || 'عميل جديد — لا توجد بيانات سابقة'}

❓ *سؤال العميل:* "${customerQuestion.substring(0, 300)}"

💬 *رد التاجر:* "${params.message.substring(0, 500)}"

قيّم رد التاجر وقدم اقتراحك:`
      }
    ];

    const coaching = await callGPT4(coachPrompt, {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 400,
      noRetry: true,
    });

    // Build the coaching message to merchant
    const coachMessage = `🧠 *تحليل المساعد الذكي قبل الإرسال:*

${coaching.trim()}

━━━━━━━━━━━━━━━
✅ أرسل *"موافق"* — لإرسال الرد المحسّن
📤 أرسل *"أرسل"* — لإرسال ردك الأصلي كما هو
✏️ أو اكتب رد جديد — والمساعد يراجعه لك`;

    // Store pending reply for confirmation
    _pendingReplies.set(params.merchantId, {
      originalReply: params.message,
      suggestedReply: extractSuggestedReply(coaching, params.message),
      customerPhone,
      customerName,
      escalationId: esc.id,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 min expiry
    });

    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone,
      coachMessage
    );

    return { action: 'escalation_coaching_sent' };
  } catch (err: any) {
    // Coaching failed — send the reply directly
    console.warn('[MerchantMode] Coaching failed, sending directly:', err.message);
    await deliverToCustomer(params, customerPhone, params.message);
    
    try {
      const { resolveEscalation } = await import('../db/learning');
      await resolveEscalation({ merchantId: params.merchantId, customerPhone: '', merchantAnswer: params.message });
    } catch { /* non-blocking */ }

    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone,
      `✅ تم توصيل ردك للعميل مباشرة (تعذر تشغيل المستشار)`
    );
    return { action: 'escalation_direct_send' };
  }
}

// ═══════════════════════════════════════════════════════════════
// Merchant Report — Comprehensive daily stats via WhatsApp
// ═══════════════════════════════════════════════════════════════

async function sendMerchantReport(params: {
  merchantId: number;
  merchantPhone: string;
  instanceId: string;
  token: string;
  apiUrl: string;
}): Promise<void> {
  const { sendMessageWithCredentials } = await import('../whatsapp');
  
  try {
    const { getPool } = await import('../db');
    const pool = await getPool();
    if (!pool) throw new Error('DB not available');
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString().slice(0, 19).replace('T', ' ');
    
    // ── 1. Core metrics ──
    const [convRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM conversations WHERE merchantId = ? AND updatedAt >= ?`,
      [params.merchantId, todayStr]
    ) as any;
    
    const [msgRows] = await pool.execute(
      `SELECT COUNT(*) as cnt FROM messages m JOIN conversations c ON m.conversationId = c.id WHERE c.merchantId = ? AND m.createdAt >= ?`,
      [params.merchantId, todayStr]
    ) as any;

    const [orderRows] = await pool.execute(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(totalAmount), 0) as total FROM orders WHERE merchantId = ? AND createdAt >= ?`,
      [params.merchantId, todayStr]
    ) as any;

    const conversations = Number(convRows?.[0]?.cnt || 0);
    const messages = Number(msgRows?.[0]?.cnt || 0);
    const orders = Number(orderRows?.[0]?.cnt || 0);
    const revenue = Number(orderRows?.[0]?.total || 0);
    const conversionRate = conversations > 0 ? ((orders / conversations) * 100).toFixed(1) : '0';

    // ── 2. Unique customers today ──
    let uniqueCustomers = 0;
    try {
      const [custRows] = await pool.execute(
        `SELECT COUNT(DISTINCT customerPhone) as cnt FROM conversations WHERE merchantId = ? AND updatedAt >= ?`,
        [params.merchantId, todayStr]
      ) as any;
      uniqueCustomers = Number(custRows?.[0]?.cnt || 0);
    } catch { /* non-blocking */ }

    // ── 3. Top products (by order count, last 7 days) ──
    let topProductsText = '';
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
      const [prodRows] = await pool.execute(
        `SELECT p.name, COUNT(oi.id) as cnt 
         FROM order_items oi 
         JOIN products p ON oi.productId = p.id 
         JOIN orders o ON oi.orderId = o.id
         WHERE o.merchantId = ? AND o.createdAt >= ?
         GROUP BY p.id, p.name ORDER BY cnt DESC LIMIT 3`,
        [params.merchantId, weekAgo]
      ) as any;
      if (prodRows?.length > 0) {
        const medals = ['🥇', '🥈', '🥉'];
        topProductsText = '\n🏆 *أكثر المنتجات طلباً (آخر 7 أيام):*\n' +
          prodRows.map((r: any, i: number) => `${medals[i] || '•'} ${r.name} (${r.cnt} طلب)`).join('\n');
      }
    } catch { /* table might not exist — non-blocking */ }

    // ── 4. Active escalations ──
    let escalationText = '';
    try {
      const [escRows] = await pool.execute(
        `SELECT COUNT(*) as pending FROM sari_escalation_queue WHERE merchant_id = ? AND status IN ('pending', 'notified')`,
        [params.merchantId]
      ) as any;
      const pending = Number(escRows?.[0]?.pending || 0);
      if (pending > 0) {
        escalationText = `\n⚠️ *تصعيدات معلقة:* ${pending} استفسار بانتظار ردك`;
      } else {
        escalationText = '\n✅ لا توجد تصعيدات معلقة';
      }
    } catch { /* table might not exist */ }

    // ── 5. Coaching/Learning stats ──
    let coachingText = '';
    try {
      const { getCoachingStats } = await import('../db/coaching');
      const stats = await getCoachingStats(params.merchantId);
      if (stats.totalSessions > 0) {
        const accuracy = (stats.correctRate * 100).toFixed(0);
        coachingText = `\n🧠 *ذكاء البوت:*\n` +
          `• جلسات التدريب: ${stats.totalSessions}\n` +
          `• الردود المراجعة: ${stats.totalReviewed}\n` +
          `• نسبة الدقة: ${accuracy}%`;
      }
    } catch { /* non-blocking */ }

    // ── 6. Knowledge base size ──
    let knowledgeText = '';
    try {
      const [cacheRows] = await pool.execute(
        `SELECT COUNT(*) as cnt FROM sari_response_cache WHERE merchant_id = ? AND is_valid = 1`,
        [params.merchantId]
      ) as any;
      const [signalRows] = await pool.execute(
        `SELECT COUNT(*) as cnt FROM sari_learning_signals WHERE merchant_id = ? AND signal_type = 'merchant_correction'`,
        [params.merchantId]
      ) as any;
      const cachedResponses = Number(cacheRows?.[0]?.cnt || 0);
      const teachCount = Number(signalRows?.[0]?.cnt || 0);
      if (cachedResponses > 0 || teachCount > 0) {
        knowledgeText = `\n📚 *قاعدة المعرفة:*\n` +
          `• ردود محفوظة: ${cachedResponses}\n` +
          `• تعليمات المدير: ${teachCount}`;
      }
    } catch { /* non-blocking */ }

    // ── Build the final report ──
    const timeStr = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date().toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' });

    const report = `📊 *تقرير مدير النظام — ${dateStr}*

━━━━━━━━━━━━━━━
📈 *الأداء اليومي:*
💬 المحادثات: *${conversations}*
👥 عملاء فريدين: *${uniqueCustomers}*
📩 الرسائل: *${messages}*
🛍️ الطلبات: *${orders}*
💰 الإيرادات: *${revenue.toLocaleString('ar-SA')} ر.س*
📊 نسبة التحويل: *${conversionRate}%*
${topProductsText}
━━━━━━━━━━━━━━━
📋 *حالة النظام:*${escalationText}${coachingText}${knowledgeText}

━━━━━━━━━━━━━━━
⏰ آخر تحديث: ${timeStr}
💡 _اكتب \"تقرير\" في أي وقت لتقرير جديد_`;

    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone, report
    );
  } catch (err: any) {
    console.error('[MerchantMode] Report failed:', err.message);
    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone,
      '⚠️ تعذر إنشاء التقرير حالياً. حاول مرة ثانية.'
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Merchant Chat — Sari as merchant assistant (not customer bot)
// ═══════════════════════════════════════════════════════════════

async function handleMerchantQuestion(params: {
  merchantId: number;
  merchantPhone: string;
  message: string;
  instanceId: string;
  token: string;
  apiUrl: string;
}): Promise<void> {
  const { sendMessageWithCredentials } = await import('../whatsapp');

  try {
    // ── Load tenant knowledge (RAG + web + docs + products) ──
    const { buildEnhancedContextPrompt } = await import('./sari-personality');
    const { getMerchantById } = await import('../db');
    
    const merchant = await getMerchantById(params.merchantId);
    const merchantName = merchant?.businessName || 'المتجر';
    
    const tenantContext = await buildEnhancedContextPrompt({
      merchantName,
      merchantId: params.merchantId,
      customerMessage: params.message, // used for RAG semantic search
    });

    const merchantAssistantPrompt: ChatMessage[] = [
      {
        role: 'system',
        content: `أنت المساعد الذكي الخاص بـ "${merchantName}". الشخص الذي يتحدث معك الآن هو *مدير النظام* (صاحب المتجر) وليس عميل.

🔑 هوية المحادثة:
- أنت تتحدث مع مدير النظام/صاحب المتجر — وليس عميل
- خاطبه دائماً كمدير: "يا غالي" أو "يا مدير" — لا تقل "يا بطل" أبداً
- لا تتصرف كبائع أو موظف خدمة عملاء — أنت مستشاره الشخصي وأداته الذكية

أنت تساعد مدير النظام في:
- الإجابة على أسئلته عن متجره وأدائه ومنتجاته وخدماته
- تقديم نصائح لتحسين المبيعات بناءً على بيانات متجره
- شرح كيفية استخدام ميزات لوحة التحكم
- الإجابة باستخدام قاعدة المعرفة الخاصة بمتجره (مرفقة أدناه)

🚫 قاعدة صارمة: لا تذكر اسم "ساري" أو "Sari" أبداً. أنت "المساعد الذكي" فقط.
🚫 لا تختلق معلومات عن المتجر — استخدم فقط البيانات المرفقة أدناه.
🚫 لا تعامل مدير النظام كعميل أبداً — لا ترحب به كعميل ولا تعرض عليه المنتجات للشراء.

قواعد:
- اللهجة السعودية الودية
- ردود مختصرة ومباشرة (3-5 أسطر)
- لا تتصرف كبائع — أنت مستشار مدير النظام الشخصي

تنسيق الرسائل:
- ابدأ بـ *عنوان عريض* يلخص الجواب
- إذا فيه خطوات → رقّمها (1️⃣ 2️⃣ 3️⃣) كل خطوة في سطر مستقل
- استخدم أيقونات: 📌 معلومة، ✅ تأكيد، 💡 نصيحة، ⚙️ إعدادات
- اترك سطر فاضي بين كل قسم — ممنوع فقرة طويلة بدون تنسيق

${tenantContext}`
      },
      {
        role: 'user',
        content: params.message.substring(0, 500)
      }
    ];

    const response = await callGPT4(merchantAssistantPrompt, {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 300,
    });

    // Apply sanitizer to merchant chat responses too
    const { sanitizeIdentity } = await import('./response-validator');
    const cleanResponse = sanitizeIdentity(response.trim(), merchantName);

    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone, cleanResponse
    );
  } catch (err: any) {
    console.error('[MerchantMode] Chat failed:', err.message);
    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone,
      'عذراً يا غالي، واجهت مشكلة تقنية. حاول مرة ثانية 🙏'
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Merchant Directives — "لا ترد" / "ابحث" / "قول للعميل" / "استأنف"
// ═══════════════════════════════════════════════════════════════

// In-memory pending stop confirmations (merchant must confirm before silencing)
const _pendingStopConfirmations = new Map<number, {
  customerPhone: string;
  customerName: string;
  expiresAt: number;
}>();

// Cleanup expired confirmations every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of Array.from(_pendingStopConfirmations.entries())) {
    if (now > val.expiresAt) _pendingStopConfirmations.delete(key);
  }
}, 10 * 60 * 1000);

/** Directive: "لا ترد" — Stop responding to the most recent customer */
async function handleDirectiveStop(params: {
  merchantId: number;
  merchantPhone: string;
  message: string;
  instanceId: string;
  token: string;
  apiUrl: string;
}): Promise<{ action: string }> {
  const { sendMessageWithCredentials } = await import('../whatsapp');

  // Check if merchant is confirming a pending stop
  const pending = _pendingStopConfirmations.get(params.merchantId);
  if (pending && Date.now() < pending.expiresAt) {
    const trimmed = params.message.trim();
    if (['نعم', 'اي', 'أي', 'ايوه', 'أيوه', 'تمام', 'اكيد', 'أكيد', 'موافق', '1'].includes(trimmed)) {
      _pendingStopConfirmations.delete(params.merchantId);

      // Activate permanent takeover on this customer's conversation
      try {
        const { getConversationsByMerchantId, updateConversation } = await import('../db');
        const convs = await getConversationsByMerchantId(params.merchantId);
        const conv = convs.find(c => c.customerPhone === pending.customerPhone);
        if (conv) {
          await updateConversation(conv.id, {
            humanTakeover: 1,
            humanTakeoverAt: new Date(),
            humanExpiresAt: null, // permanent until "استأنف"
          } as any);
        }
      } catch { /* non-blocking */ }

      await sendMessageWithCredentials(
        params.instanceId, params.token, params.apiUrl,
        params.merchantPhone,
        `✅ تم إيقاف الرد التلقائي على العميل *${pending.customerName}* (***${pending.customerPhone.slice(-4)})\n\n💡 لإعادة التفعيل، أرسل: *استأنف*`
      );
      console.log(`[Directive] 🛑 Stop confirmed — Sari silenced for customer ***${pending.customerPhone.slice(-4)}`);
      return { action: 'directive_stop_confirmed' };
    } else {
      _pendingStopConfirmations.delete(params.merchantId);
      await sendMessageWithCredentials(
        params.instanceId, params.token, params.apiUrl,
        params.merchantPhone,
        `❌ تم إلغاء طلب إيقاف الرد. ساري مستمر بالرد عادي.`
      );
      return { action: 'directive_stop_cancelled' };
    }
  }

  // Find the most recent active conversation
  try {
    const { getConversationsByMerchantId } = await import('../db');
    const convs = await getConversationsByMerchantId(params.merchantId, { limit: 1 });
    const lastConv = convs[0];
    if (lastConv) {
      _pendingStopConfirmations.set(params.merchantId, {
        customerPhone: lastConv.customerPhone,
        customerName: lastConv.customerName || 'عميل',
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 min to confirm
      });

      await sendMessageWithCredentials(
        params.instanceId, params.token, params.apiUrl,
        params.merchantPhone,
        `⚠️ *تأكيد إيقاف الرد*\n\nهل تبي أوقف الرد التلقائي على العميل:\n👤 *${lastConv.customerName || 'عميل'}* (***${lastConv.customerPhone.slice(-4)})\n\n✅ أرسل *"نعم"* للتأكيد\n❌ أو أي رسالة ثانية للإلغاء`
      );
      return { action: 'directive_stop_pending' };
    }
  } catch { /* fallback */ }

  await sendMessageWithCredentials(
    params.instanceId, params.token, params.apiUrl,
    params.merchantPhone,
    '⚠️ ما لقيت محادثة نشطة لإيقاف الرد عليها.'
  );
  return { action: 'directive_stop_no_conv' };
}

/** Directive: "ابحث عن X" — Search products and knowledge base */
async function handleDirectiveSearch(params: {
  merchantId: number;
  merchantPhone: string;
  message: string;
  instanceId: string;
  token: string;
  apiUrl: string;
}): Promise<{ action: string }> {
  const { sendMessageWithCredentials } = await import('../whatsapp');

  // Extract search query from message
  const searchQuery = params.message.trim()
    .replace(/^(ابحث|بحث|دور|شيك)\s*(عن|في|على)?\s*/i, '')
    .replace(/^وش\s+عندنا\s*/i, '')
    .trim();

  if (!searchQuery || searchQuery.length < 2) {
    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone,
      '❓ اكتب "ابحث عن [المنتج أو المعلومة]"\n\nمثلاً:\n• ابحث عن كريم مرطب\n• ابحث في المنتجات عن شنطة\n• ابحث عن سياسة الاسترجاع'
    );
    return { action: 'directive_search_empty' };
  }

  try {
    // Search products
    const { getPool } = await import('../db');
    const pool = await getPool();
    let productResults = '';
    if (pool) {
      const [products] = await pool.execute(
        `SELECT name, price, stock, description FROM products 
         WHERE merchantId = ? AND isActive = 1 
         AND (name LIKE ? OR description LIKE ? OR nameAr LIKE ?)
         LIMIT 5`,
        [params.merchantId, `%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`]
      ) as any;
      if (products?.length > 0) {
        productResults = '\n🛍️ *المنتجات:*\n' + products.map((p: any, i: number) =>
          `${i + 1}. *${p.name}* — ${p.price} ر.س${p.stock != null ? ` (المخزون: ${p.stock})` : ''}`
        ).join('\n');
      }
    }

    // Search RAG/knowledge base
    let ragResults = '';
    try {
      if (pool) {
        const [cachedRows] = await pool.execute(
          `SELECT question, answer FROM sari_response_cache 
           WHERE merchant_id = ? AND is_valid = 1 
           AND (question LIKE ? OR answer LIKE ?)
           ORDER BY hit_count DESC LIMIT 3`,
          [params.merchantId, `%${searchQuery}%`, `%${searchQuery}%`]
        ) as any;
        if (cachedRows?.length > 0) {
          ragResults = '\n\n📚 *قاعدة المعرفة:*\n' + cachedRows.map((c: any, i: number) =>
            `${i + 1}. ❓ ${(c.question || '').substring(0, 80)}\n   💡 ${(c.answer || '').substring(0, 120)}`
          ).join('\n\n');
        }
      }
    } catch { /* RAG is optional */ }

    const response = productResults || ragResults
      ? `🔍 *نتائج البحث عن "${searchQuery}":*${productResults}${ragResults}\n\n💡 هذه النتائج لك فقط — ما تُرسل للعميل.`
      : `🔍 ما لقيت نتائج لـ "${searchQuery}".\n\n💡 جرب كلمات مختلفة أو أضف المعلومة بـ: علم: ${searchQuery}`;

    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone, response
    );
    return { action: 'directive_search_done' };
  } catch (err: any) {
    console.error('[Directive] Search failed:', err.message);
    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone,
      '⚠️ تعذر البحث حالياً. حاول مرة ثانية.'
    );
    return { action: 'directive_search_error' };
  }
}

/** Directive: "قول للعميل X" — Send specific text to the most recent customer */
async function handleDirectiveReply(params: {
  merchantId: number;
  merchantPhone: string;
  message: string;
  instanceId: string;
  token: string;
  apiUrl: string;
}): Promise<{ action: string }> {
  const { sendMessageWithCredentials } = await import('../whatsapp');

  // Extract the reply text
  const replyText = params.message.trim()
    .replace(/^(قول|قولي|قل|أرسل|ارسل|أجب|اجب|رد|ردي|بلّغ|بلغ)\s+(لل?عميل|له|ال?عميل|عليه|ه)\s*/i, '')
    .replace(/^(على\s+ال?عميل|عليه)\s*/i, '')
    .trim();

  if (!replyText || replyText.length < 2) {
    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone,
      '❓ اكتب النص اللي تبي أرسله:\n\nمثلاً: *قول للعميل الطلب جاهز ويوصلك خلال ساعة*'
    );
    return { action: 'directive_reply_empty' };
  }

  try {
    // Find the most recent active conversation
    const { getConversationsByMerchantId, updateConversation, createMessage } = await import('../db');
    const convs = await getConversationsByMerchantId(params.merchantId, { limit: 1 });
    const lastConv = convs[0];

    if (!lastConv) {
      await sendMessageWithCredentials(
        params.instanceId, params.token, params.apiUrl,
        params.merchantPhone,
        '⚠️ ما لقيت محادثة نشطة لإرسال الرد.'
      );
      return { action: 'directive_reply_no_conv' };
    }

    // Send to customer
    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      lastConv.customerPhone, replyText
    );

    // Save message in DB
    await createMessage({
      conversationId: lastConv.id,
      direction: 'outgoing',
      messageType: 'text',
      content: replyText,
      externalId: null,
    });

    // Activate takeover so bot doesn't reply on top
    const { TAKEOVER_DURATION_MS } = await import('./takeover-constants');
    await updateConversation(lastConv.id, {
      humanTakeover: 1,
      humanTakeoverAt: new Date(),
      humanExpiresAt: new Date(Date.now() + TAKEOVER_DURATION_MS),
    } as any);

    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone,
      `✅ تم إرسال ردك للعميل *${lastConv.customerName || 'عميل'}* (***${lastConv.customerPhone.slice(-4)})`
    );

    console.log(`[Directive] 📤 Reply sent to customer ***${lastConv.customerPhone.slice(-4)} via merchant directive`);
    return { action: 'directive_reply_sent' };
  } catch (err: any) {
    console.error('[Directive] Reply failed:', err.message);
    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone,
      '⚠️ تعذر إرسال الرد للعميل. حاول مرة ثانية.'
    );
    return { action: 'directive_reply_error' };
  }
}

/** Directive: "استأنف" — Resume auto-replies */
async function handleDirectiveResume(params: {
  merchantId: number;
  merchantPhone: string;
  message: string;
  instanceId: string;
  token: string;
  apiUrl: string;
}): Promise<{ action: string }> {
  const { sendMessageWithCredentials } = await import('../whatsapp');

  try {
    const { getConversationsByMerchantId, updateConversation, getMessagesByConversationId } = await import('../db');
    const convs = await getConversationsByMerchantId(params.merchantId);
    
    // Resume ALL conversations that have humanTakeover active
    let resumedCount = 0;
    for (const conv of convs) {
      if ((conv as any).humanTakeover) {
        // Build resume context for AI
        const messages = await getMessagesByConversationId(conv.id);
        const recentMsgs = messages.slice(-6);
        const contextSummary = recentMsgs.map(m => {
          const role = m.direction === 'incoming' ? 'العميل' : 'التاجر';
          const safeContent = (m.content || '[media]').substring(0, 300);
          return `${role}: ${safeContent}`;
        }).join('\n');

        await updateConversation(conv.id, {
          humanTakeover: 0,
          humanExpiresAt: null,
          agentHistory: JSON.stringify({
            resumeContext: contextSummary.substring(0, 2000),
            resumedAt: new Date().toISOString(),
            resumedBy: 'merchant_directive',
          }),
        } as any);
        resumedCount++;
      }
    }

    if (resumedCount > 0) {
      await sendMessageWithCredentials(
        params.instanceId, params.token, params.apiUrl,
        params.merchantPhone,
        `✅ تم تفعيل الرد التلقائي على *${resumedCount}* محادثة.\n\nساري يستأنف من حيث توقفت 🚀`
      );
      console.log(`[Directive] ▶️ Resumed ${resumedCount} conversation(s) for merchant ${params.merchantId}`);
    } else {
      await sendMessageWithCredentials(
        params.instanceId, params.token, params.apiUrl,
        params.merchantPhone,
        '✅ الرد التلقائي مفعّل أصلاً على كل المحادثات. كل شي تمام! 👍'
      );
    }
    return { action: 'directive_resume_done' };
  } catch (err: any) {
    console.error('[Directive] Resume failed:', err.message);
    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone,
      '⚠️ تعذر تفعيل الرد التلقائي. حاول مرة ثانية.'
    );
    return { action: 'directive_resume_error' };
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Handler — Entry point from webhook
// ═══════════════════════════════════════════════════════════════

export async function handleMerchantChat(params: {
  merchantId: number;
  merchantPhone: string;
  message: string;
  quotedText: string;
  instanceId: string;
  token: string;
  apiUrl: string;
}): Promise<{ action: string }> {
  console.log(`[MerchantMode] 🏪 Processing merchant message: "${params.message.substring(0, 50)}..."`);

  // ANTI-LOOP: Check if merchant just confirmed a coached reply — skip re-processing
  const cooldownTs = _confirmationCooldown.get(params.merchantId);
  if (cooldownTs && Date.now() - cooldownTs < 30_000) {
    const msg = params.message.trim();
    // If same confirmation word arrives again within 30s, ignore it (double-send)
    if (['موافق', 'موافقه', 'نعم', '1', 'أرسل', 'ارسل', '2'].includes(msg)) {
      console.log(`[MerchantMode] ⏭️ Cooldown active — ignoring duplicate confirmation: "${msg}"`);
      return { action: 'cooldown_skip' };
    }
  }

  // ── Check for pending "لا ترد" confirmation BEFORE intent detection ──
  // Merchant said "لا ترد" earlier → now responding with "نعم"/"لا" which wouldn't match STOP_PATTERNS
  const pendingStop = _pendingStopConfirmations.get(params.merchantId);
  if (pendingStop && Date.now() < pendingStop.expiresAt) {
    console.log(`[MerchantMode] 📋 Pending stop confirmation — routing to handleDirectiveStop`);
    return await handleDirectiveStop(params);
  }

  // Detect intent
  let hasActiveEscalation = false;
  try {
    const { getActiveEscalationForMerchant } = await import('../db/learning');
    const activeEsc = await getActiveEscalationForMerchant(params.merchantId);
    if (activeEsc) hasActiveEscalation = true;
  } catch { /* non-blocking */ }

  const intent = await detectMerchantIntent(params.message, hasActiveEscalation, params.quotedText);
  console.log(`[MerchantMode] Intent: ${intent} | ActiveEscalation: ${hasActiveEscalation}`);

  // ═══ Admin Greeting — Always welcome merchant as system admin ═══
  const isGreeting = GREETING_PATTERNS.some(p => p.test(params.message.trim()));
  const lastGreetingTs = _lastMerchantGreeting.get(params.merchantId) || 0;
  const shouldGreet = isGreeting && (Date.now() - lastGreetingTs > GREETING_COOLDOWN_MS);

  if (shouldGreet) {
    _lastMerchantGreeting.set(params.merchantId, Date.now());
    const { sendMessageWithCredentials } = await import('../whatsapp');
    const { getMerchantById } = await import('../db');
    const merchant = await getMerchantById(params.merchantId);
    const storeName = merchant?.businessName || 'متجرك';
    
    const adminGreeting = `👋 *أهلاً بك يا مدير النظام!*

أنا المساعد الذكي لـ *${storeName}* — تحت أمرك.

🎛️ أقدر أساعدك في:
• 📊 التقارير والإحصائيات — اكتب *"تقرير"*
• 🧠 تعليمي معلومات جديدة — اكتب مثلاً:
    _علم: إذا سأل عن الضمان قل له سنتين_
    _تعلم: الشحن مجاني فوق 200 ريال_
• 💬 الرد على استفسارات العملاء المصعّدة
• ❓ أي سؤال عن متجرك ومنتجاتك

🎯 *توجيهات سريعة:*
• 🛑 *"لا ترد"* — أوقف ردودي على عميل محدد
• 🔍 *"ابحث عن [X]"* — بحث في المنتجات وقاعدة المعرفة
• 📤 *"قول للعميل [نص]"* — أرسل رسالة للعميل من خلالي
• ▶️ *"استأنف"* — أعد تفعيل ردودي التلقائية

كيف أقدر أخدمك اليوم؟ 🙏`;
    
    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone, adminGreeting
    );
    console.log(`[MerchantMode] 👋 Admin greeting sent to merchant ${params.merchantId}`);
    return { action: 'admin_greeting' };
  }

  switch (intent) {
    case 'directive_stop': {
      return await handleDirectiveStop(params);
    }

    case 'directive_search': {
      return await handleDirectiveSearch(params);
    }

    case 'directive_reply': {
      return await handleDirectiveReply(params);
    }

    case 'directive_resume': {
      return await handleDirectiveResume(params);
    }

    case 'escalation_reply': {
      const result = await coachEscalationReply(params);
      return result;
    }

    case 'teach': {
      // Delegate to coaching engine (already handled in webhook, but as fallback)
      const { handleTeachCommand } = await import('./coaching-engine');
      const teachResult = await handleTeachCommand(params.merchantId, params.message);
      if (teachResult.handled && teachResult.response) {
        const { sendMessageWithCredentials } = await import('../whatsapp');
        await sendMessageWithCredentials(
          params.instanceId, params.token, params.apiUrl,
          params.merchantPhone, teachResult.response
        );
        return { action: 'teach_command' };
      }
      // If teach didn't work, fall through to chat
      await handleMerchantQuestion(params);
      return { action: 'merchant_chat' };
    }

    case 'report': {
      await sendMerchantReport(params);
      return { action: 'merchant_report' };
    }

    case 'question':
    case 'chat':
    default: {
      await handleMerchantQuestion(params);
      return { action: 'merchant_chat' };
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Build a brief customer analysis for the coaching prompt */
function buildCustomerBrief(profile: CustomerProfile): string {
  const lines: string[] = [];
  
  // Tier
  const tierLabels: Record<string, string> = {
    'new': '🆕 عميل جديد',
    'returning': '🔄 عميل عائد',
    'loyal': '⭐ عميل دائم',
    'vip': '👑 عميل VIP',
    'at_risk': '⚠️ عميل معرّض للخسارة',
  };
  lines.push(tierLabels[profile.customerTier] || '👤 عميل');

  // Spending
  if (profile.totalSpent > 0) {
    lines.push(`💰 إجمالي المشتريات: ${profile.totalSpent.toLocaleString('ar-SA')} ر.س`);
  }

  // Conversations
  if (profile.totalConversations > 0) {
    lines.push(`💬 عدد المحادثات: ${profile.totalConversations}`);
  }

  // Purchase history
  if (profile.purchaseHistory && profile.purchaseHistory.length > 0) {
    lines.push(`🛒 آخر المشتريات: ${profile.purchaseHistory.slice(0, 3).join('، ')}`);
  }

  // Pain points
  if (profile.painPoints && profile.painPoints.length > 0) {
    lines.push(`😤 نقاط ألم: ${profile.painPoints.slice(0, 2).join('، ')}`);
  }

  // Sentiment
  if (profile.sentimentAvg) {
    const sentimentMap: Record<string, string> = {
      'positive': '😊 إيجابي',
      'negative': '😤 سلبي',
      'neutral': '😐 محايد',
      'frustrated': '😡 محبط',
    };
    lines.push(`📊 المزاج: ${sentimentMap[profile.sentimentAvg] || profile.sentimentAvg}`);
  }

  // Last objection
  if (profile.lastObjection) {
    const objMap: Record<string, string> = {
      'price': '💲 اعتراض على السعر',
      'delivery': '🚚 اعتراض على التوصيل',
      'quality': '⚡ اعتراض على الجودة',
    };
    lines.push(objMap[profile.lastObjection] || `❗ اعتراض: ${profile.lastObjection}`);
  }

  // Preferences
  if (profile.preferences) {
    if (profile.preferences.priceConscious) lines.push('💡 حساس للسعر');
    if (profile.preferences.prefersQuality) lines.push('💎 يفضل الجودة');
  }

  return lines.join('\n');
}

/** Extract suggested reply from coaching text — or fall back to original */
function extractSuggestedReply(coaching: string, originalReply: string): string {
  // Normalize all fancy Unicode quotes to standard ASCII before matching
  const c = coaching
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
  
  // --- Pattern 1: Quoted text after "الرد المقترح" (with optional bold/colon/newlines) ---
  const quotedPatterns = [
    /\*?الرد المقترح\*?[:\s]*\n*[\s]*[""]([^""]+)[""]/,
    /\*?الرد الأفضل\*?[:\s]*\n*[\s]*[""]([^""]+)[""]/,
    /\*?أقترح\*?[:\s]*\n*[\s]*[""]([^""]+)[""]/,
    /\*?بدلاً من ذلك\*?[:\s]*\n*[\s]*[""]([^""]+)[""]/,
    /\*?الاقتراح\*?[:\s]*\n*[\s]*[""]([^""]+)[""]/,
  ];
  
  for (const p of quotedPatterns) {
    const match = c.match(p);
    if (match?.[1] && match[1].trim().length > 10) {
      console.log(`[extractSuggestedReply] ✅ Matched quoted pattern, len=${match[1].length}`);
      return match[1].trim();
    }
  }

  // --- Pattern 2: Text block between "الرد المقترح:" and the next section divider ---
  // Handles cases where GPT doesn't use quotes but has a clear section
  const sectionMatch = c.match(
    /\*?الرد المقترح\*?[:\s]*\n+([\s\S]+?)(?:\n\n|━|بهذا الرد|$)/
  );
  if (sectionMatch?.[1]) {
    // Strip leading/trailing quotes and whitespace
    let extracted = sectionMatch[1].trim()
      .replace(/^[""""*]+/, '')
      .replace(/[""""*]+$/, '')
      .trim();
    if (extracted.length > 10 && extracted !== originalReply) {
      console.log(`[extractSuggestedReply] ✅ Matched section pattern, len=${extracted.length}`);
      return extracted;
    }
  }

  // --- Pattern 3: Any long quoted text in the coaching (last resort) ---
  const anyQuote = c.match(/"([^"]{20,})"/);
  if (anyQuote?.[1] && anyQuote[1].trim() !== originalReply) {
    console.log(`[extractSuggestedReply] ✅ Matched any-quote pattern, len=${anyQuote[1].length}`);
    return anyQuote[1].trim();
  }
  
  // No explicit suggestion found — the original reply is probably fine
  console.log(`[extractSuggestedReply] ⚠️ No suggestion extracted, falling back to original`);
  return originalReply;
}

/** Deliver reply to customer with professional wrapping */
async function deliverToCustomer(params: {
  instanceId: string;
  token: string;
  apiUrl: string;
  merchantId: number;
}, customerPhone: string, replyText: string): Promise<void> {
  const { sendMessageWithCredentials } = await import('../whatsapp');
  
  // Forward merchant's reply transparently — NO bot credit claiming
  const customerReply = replyText.substring(0, 2000);
  
  await sendMessageWithCredentials(
    params.instanceId, params.token, params.apiUrl,
    customerPhone, customerReply
  );
  
  console.log(`[MerchantMode] ✅ Reply delivered to customer ***${customerPhone.slice(-4)}`);
}
