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

const GREETING_PATTERNS = [
  /^(مرحبا|مرحبًا|مرحباً|السلام عليكم|السلام|هلا|هلا والله|أهلاً|أهلا|هاي|صباح الخير|مساء الخير|يا هلا|هلو|مساء النور|صباح النور|الو|ألو|حياك|حياكم)/i,
];

// Track last merchant greeting to avoid spamming (per merchantId)
const _lastMerchantGreeting = new Map<number, number>();
const GREETING_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

function detectMerchantIntent(message: string, hasActiveEscalation: boolean, quotedText: string): MerchantIntent {
  // Check for escalation reply first
  const isReplyToAlert = quotedText.includes('تنبيه من ساري')  // legacy format (backward compat)
    || quotedText.includes('تنبيه — سؤال عميل')  // new format
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
  // (not a question or general chat), treat it as an escalation reply.
  // This prevents merchant's own questions from being misrouted as customer answers.
  if (hasActiveEscalation && !quotedText) {
    const isQuestion = /^(كيف|ليش|ليه|وين|متى|هل|وش|ايش|إيش|ممكن|أبغى|ابغى|أبي|ابي|عندي|عندكم)\b/.test(message.trim());
    const isGreeting = /^(مرحبا|السلام|هلا|أهلاً|هاي|صباح|مساء)\b/.test(message.trim());
    const isLongMessage = message.trim().length > 100;
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

  // Default to general chat (merchant assistant mode)
  return 'chat';
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

  // Detect intent
  let hasActiveEscalation = false;
  try {
    const { getActiveEscalationForMerchant } = await import('../db/learning');
    const activeEsc = await getActiveEscalationForMerchant(params.merchantId);
    if (activeEsc) hasActiveEscalation = true;
  } catch { /* non-blocking */ }

  const intent = detectMerchantIntent(params.message, hasActiveEscalation, params.quotedText);
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

كيف أقدر أخدمك اليوم؟ 🙏`;
    
    await sendMessageWithCredentials(
      params.instanceId, params.token, params.apiUrl,
      params.merchantPhone, adminGreeting
    );
    console.log(`[MerchantMode] 👋 Admin greeting sent to merchant ${params.merchantId}`);
    return { action: 'admin_greeting' };
  }

  switch (intent) {
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
  
  const customerReply = `أهلاً مجدداً! 😊 حصلت لك الجواب:\n\n${replyText.substring(0, 2000)}\n\nهل فيه شي ثاني أقدر أساعدك فيه؟ 🙏`;
  
  await sendMessageWithCredentials(
    params.instanceId, params.token, params.apiUrl,
    customerPhone, customerReply
  );
  
  console.log(`[MerchantMode] ✅ Reply delivered to customer ***${customerPhone.slice(-4)}`);
}
