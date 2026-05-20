/**
 * Response Validator — The Quality Gate
 * 
 * GPT-4o-mini validates every response BEFORE it reaches the customer.
 * Catches common failures that slip through even the best prompts:
 * 
 * 1. Did the bot actually answer the customer's question?
 * 2. Did it mention the price when the customer asked for it?
 * 3. Did it start with a preamble/marketing fluff? (violates Rule #0)
 * 4. Did it hallucinate a product not in the catalog?
 * 5. Is the CTA appropriate for the customer's stage?
 * 6. Did it repeat itself from a previous message?
 * 
 * Cost: ~$0.001 per validation (gpt-4o-mini, ~200 tokens)
 * Latency: ~300-500ms additional
 * 
 * IMPORTANT: Validation is NON-BLOCKING on failure — if the validator
 * itself crashes, the original response is sent as-is.
 */

import { callGPT4, type ChatMessage } from './openai';
import type { CustomerIntent } from './session-context';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ValidationResult {
  passed: boolean;
  violations: ValidationViolation[];
  correctedResponse?: string;   // Only present if passed === false
  validationTimeMs: number;
}

export interface ValidationViolation {
  rule: ValidationRule;
  severity: 'critical' | 'warning';
  description: string;
}

export type ValidationRule =
  | 'unanswered_question'     // Customer asked X, bot didn't answer
  | 'missing_price'           // Customer asked price, bot didn't include it
  | 'preamble_detected'       // Bot started with marketing fluff (Rule #0)
  | 'hallucinated_product'    // Bot mentioned a product not in catalog
  | 'inappropriate_cta'       // CTA doesn't match customer stage
  | 'self_repetition'         // Bot repeated itself from previous message
  | 'contact_leak'            // Bot shared phone/email (Rule #6)
  | 'empty_response'          // Bot gave a non-answer ("أنا هنا لمساعدتك")
  | 'too_long';               // Response exceeds reasonable WhatsApp length

// ═══════════════════════════════════════════════════════════════
// Fast Pre-Check (keyword-based, no GPT call)
// ═══════════════════════════════════════════════════════════════

/**
 * Quick keyword-based checks BEFORE calling GPT-4o-mini.
 * Catches obvious violations without any API cost.
 * Returns violations array (empty = no issues found).
 */
function fastPreCheck(
  response: string,
  customerMessage: string,
  lastBotMessage?: string,
): ValidationViolation[] {
  const violations: ValidationViolation[] = [];
  const resp = response.trim();
  const msg = customerMessage.toLowerCase();

  // 1. Contact leak — phone numbers, emails
  const phonePattern = /(?:\+?\d{1,3}[-.\s]?)?\d{7,12}/;
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  if (phonePattern.test(resp) || emailPattern.test(resp)) {
    violations.push({
      rule: 'contact_leak',
      severity: 'critical',
      description: 'الرد يحتوي على رقم هاتف أو إيميل — ممنوع مشاركة معلومات التواصل',
    });
  }

  // 2. Empty/non-answer responses
  const emptyPatterns = [
    /^(أنا هنا لمساعدتك|إذا عندك أي استفسار|لا تتردد|أنا موجود)[.!]*$/,
    /^(هل تحتاج شيء آخر|كيف أقدر أساعدك)[؟?]*$/,
  ];
  if (emptyPatterns.some(p => p.test(resp))) {
    violations.push({
      rule: 'empty_response',
      severity: 'critical',
      description: 'الرد فارغ — لا يحتوي على إجابة فعلية',
    });
  }

  // 3. Preamble detection — starts with marketing fluff
  const preamblePatterns = [
    /^(حلو|رائع|ممتاز|عظيم)[!.]?\s*(هذ[اي]|ال)/,
    /^(من الدورات|من المنتجات|من الخدمات)\s*(المهمة|المميزة|الرائعة)/,
    /^(عندنا مجموعة|لدينا مجموعة|نقدم لك)\s*(مميزة|رائعة|متنوعة)/,
  ];
  if (preamblePatterns.some(p => p.test(resp))) {
    violations.push({
      rule: 'preamble_detected',
      severity: 'warning',
      description: 'الرد يبدأ بديباجة تسويقية — يجب أن يبدأ بالإجابة المباشرة',
    });
  }

  // 4. Missing price — customer asked about price but response has none
  const priceAsked = /كم|سعر|أسعار|بكم|price|cost|كم سعر/.test(msg);
  const priceInResponse = /\d+\s*(ريال|ر\.س|SAR|دينار|درهم|\$|USD)/i.test(resp) || /\d{2,}/.test(resp);
  const admitsNoPrice = /خلني أتأكد|ما عندي|أتحقق/.test(resp);
  if (priceAsked && !priceInResponse && !admitsNoPrice && resp.length > 30) {
    violations.push({
      rule: 'missing_price',
      severity: 'critical',
      description: 'العميل سأل عن السعر لكن الرد لم يذكر أي سعر',
    });
  }

  // 5. Too long for WhatsApp (>1000 chars for non-catalog queries)
  const isCatalogQuery = /دورات|منتجات|عندكم|المتوفرة|كتالوج|قائمة/.test(msg);
  if (!isCatalogQuery && resp.length > 1000) {
    violations.push({
      rule: 'too_long',
      severity: 'warning',
      description: `الرد طويل جداً (${resp.length} حرف) — يجب أن يكون مختصر للواتساب`,
    });
  }

  // 6. Self-repetition — same response as last bot message
  if (lastBotMessage && lastBotMessage.trim().length > 30) {
    const similarity = calculateTextSimilarity(resp, lastBotMessage.trim());
    if (similarity > 0.85) {
      violations.push({
        rule: 'self_repetition',
        severity: 'critical',
        description: 'الرد مكرر — نفس رد الرسالة السابقة تقريباً',
      });
    }
  }

  return violations;
}

/**
 * Simple word-overlap similarity (Jaccard index).
 * Good enough for detecting near-duplicate responses.
 */
function calculateTextSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }
  return intersection / Math.max(wordsA.size, wordsB.size);
}

// ═══════════════════════════════════════════════════════════════
// GPT-4o-mini Validation (deep check)
// ═══════════════════════════════════════════════════════════════

const VALIDATOR_MODEL = 'gpt-4o-mini';

/**
 * Validate a bot response using GPT-4o-mini.
 * 
 * Called AFTER the main response is generated, BEFORE sending to customer.
 * If validation fails, returns a corrected response.
 * 
 * @param response - The bot's generated response
 * @param customerMessage - The customer's message
 * @param intent - Detected customer intent
 * @param productNames - List of actual product names (to detect hallucinations)
 * @param lastBotMessage - Previous bot message (to detect repetition)
 * @returns ValidationResult with pass/fail and optional corrected response
 */
export async function validateResponse(params: {
  response: string;
  customerMessage: string;
  intent: CustomerIntent;
  productNames?: string[];
  lastBotMessage?: string;
  maxResponseLength?: number;
}): Promise<ValidationResult> {
  const startTime = Date.now();
  const { response, customerMessage, intent, productNames, lastBotMessage } = params;

  // ── Phase 1: Fast pre-check (0ms, no API) ──
  const fastViolations = fastPreCheck(response, customerMessage, lastBotMessage);

  // If critical violation found in fast check, skip GPT and return immediately
  const hasCritical = fastViolations.some(v => v.severity === 'critical');
  if (hasCritical) {
    // Build correction prompt for critical violations
    try {
      const corrected = await generateCorrectedResponse({
        response,
        customerMessage,
        violations: fastViolations,
        intent,
        productNames,
      });

      return {
        passed: false,
        violations: fastViolations,
        correctedResponse: corrected,
        validationTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      // If correction fails, send original — never block the response
      console.warn('[Validator] Correction failed, sending original:', (err as Error).message);
      return {
        passed: true, // Pass to avoid blocking
        violations: fastViolations,
        validationTimeMs: Date.now() - startTime,
      };
    }
  }

  // ── Phase 2: GPT-4o-mini deep check ──
  // Only for non-trivial responses (greetings/short replies skip this)
  if (response.length < 30 || /^(وعليكم السلام|أهلاً|حياك|مرحبا|تمام)/.test(response)) {
    return {
      passed: true,
      violations: fastViolations,
      validationTimeMs: Date.now() - startTime,
    };
  }

  try {
    const gptViolations = await gptDeepCheck({
      response,
      customerMessage,
      intent,
      productNames,
    });

    const allViolations = [...fastViolations, ...gptViolations];
    const hasGptCritical = gptViolations.some(v => v.severity === 'critical');

    if (hasGptCritical) {
      const corrected = await generateCorrectedResponse({
        response,
        customerMessage,
        violations: allViolations,
        intent,
        productNames,
      });

      return {
        passed: false,
        violations: allViolations,
        correctedResponse: corrected,
        validationTimeMs: Date.now() - startTime,
      };
    }

    return {
      passed: allViolations.length === 0,
      violations: allViolations,
      validationTimeMs: Date.now() - startTime,
    };

  } catch (err) {
    // GPT check failed — send original response (non-blocking)
    console.warn('[Validator] GPT deep check failed, passing response:', (err as Error).message);
    return {
      passed: true,
      violations: fastViolations,
      validationTimeMs: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// GPT Deep Check — Semantic validation
// ═══════════════════════════════════════════════════════════════

async function gptDeepCheck(params: {
  response: string;
  customerMessage: string;
  intent: CustomerIntent;
  productNames?: string[];
}): Promise<ValidationViolation[]> {
  const { response, customerMessage, intent, productNames } = params;

  const productList = productNames && productNames.length > 0
    ? `\nالمنتجات الحقيقية: ${productNames.slice(0, 20).join('، ')}`
    : '';

  const systemPrompt = `أنت مراقب جودة لبوت مبيعات عبر الواتساب. افحص الرد وقل هل يحتوي على أخطاء.

أجب بـ JSON فقط:
{
  "violations": [
    {"rule": "اسم_القاعدة", "severity": "critical|warning", "description": "شرح"}
  ]
}

القواعد:
1. "unanswered_question" (critical): العميل سأل سؤال محدد والرد لم يجب عليه
2. "preamble_detected" (warning): الرد يبدأ بمقدمة تسويقية فارغة بدل الإجابة المباشرة
3. "hallucinated_product" (critical): الرد ذكر منتج غير موجود في قائمة المنتجات${productList ? ' الحقيقية' : ''}
4. "inappropriate_cta" (warning): الـ CTA غير مناسب لحالة العميل (${intent})

إذا الرد سليم، أرجع: {"violations": []}`;

  const userPrompt = `رسالة العميل: "${customerMessage.substring(0, 200)}"
حالة العميل: ${intent}
${productList}

رد البوت:
"${response.substring(0, 500)}"

افحص وأرجع JSON:`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const result = await callGPT4(messages, {
    model: VALIDATOR_MODEL,
    temperature: 0.1,  // Low creativity — we want precise analysis
    maxTokens: 200,
    noRetry: true,     // Don't waste retries on validation
  });

  // Parse response
  const jsonStr = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const jsonStart = jsonStr.indexOf('{');
  const jsonEnd = jsonStr.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) return [];

  const parsed = JSON.parse(jsonStr.substring(jsonStart, jsonEnd + 1));
  
  if (!Array.isArray(parsed.violations)) return [];

  // Validate and normalize violations
  const validRules: Set<string> = new Set([
    'unanswered_question', 'missing_price', 'preamble_detected',
    'hallucinated_product', 'inappropriate_cta', 'self_repetition',
    'contact_leak', 'empty_response', 'too_long',
  ]);

  return parsed.violations
    .filter((v: any) => validRules.has(v.rule) && (v.severity === 'critical' || v.severity === 'warning'))
    .map((v: any) => ({
      rule: v.rule as ValidationRule,
      severity: v.severity as 'critical' | 'warning',
      description: typeof v.description === 'string' ? v.description.substring(0, 200) : '',
    }));
}

// ═══════════════════════════════════════════════════════════════
// Response Correction — Fix violations
// ═══════════════════════════════════════════════════════════════

async function generateCorrectedResponse(params: {
  response: string;
  customerMessage: string;
  violations: ValidationViolation[];
  intent: CustomerIntent;
  productNames?: string[];
}): Promise<string> {
  const { response, customerMessage, violations, intent, productNames } = params;

  const violationList = violations
    .map(v => `- ${v.description}`)
    .join('\n');

  const productContext = productNames && productNames.length > 0
    ? `\nالمنتجات المتوفرة: ${productNames.slice(0, 15).join('، ')}`
    : '';

  const systemPrompt = `أنت مصحح ردود لبوت مبيعات عبر الواتساب. أعد كتابة الرد بحيث تصلح المشاكل المذكورة.

قواعد التصحيح:
1. ابدأ بالإجابة المباشرة — لا مقدمات ولا ديباجات
2. اذكر السعر إذا سأل العميل عنه
3. لا تذكر منتجات غير موجودة في القائمة
4. لا تشارك أرقام هواتف أو إيميلات
5. اجعل الرد قصير ومباشر (150-250 حرف)
6. إذا ما عرفت الإجابة: "خلني أتأكد من المعلومة وأرد عليك 📝"
7. حالة العميل: ${intent} — اختر CTA مناسب

أعد الرد المصحح فقط — بدون شرح.`;

  const userPrompt = `رسالة العميل: "${customerMessage.substring(0, 200)}"
${productContext}

الرد الأصلي (فيه مشاكل):
"${response.substring(0, 400)}"

المشاكل المكتشفة:
${violationList}

الرد المصحح:`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const corrected = await callGPT4(messages, {
    model: VALIDATOR_MODEL,
    temperature: 0.5,
    maxTokens: 300,
    noRetry: true,
  });

  // Basic sanity: if corrected response is too short or suspicious, return original
  if (!corrected || corrected.trim().length < 10) {
    return response;
  }

  return corrected.trim();
}

// ═══════════════════════════════════════════════════════════════
// Exports — Stats for monitoring
// ═══════════════════════════════════════════════════════════════

// In-memory counters for monitoring (reset on server restart)
const _stats = {
  totalChecked: 0,
  totalPassed: 0,
  totalFailed: 0,
  totalCorrected: 0,
  avgValidationTimeMs: 0,
  _totalTimeMs: 0,
};

/**
 * Record validation result for stats tracking.
 */
export function recordValidation(result: ValidationResult): void {
  _stats.totalChecked++;
  if (result.passed) {
    _stats.totalPassed++;
  } else {
    _stats.totalFailed++;
    if (result.correctedResponse) _stats.totalCorrected++;
  }
  _stats._totalTimeMs += result.validationTimeMs;
  _stats.avgValidationTimeMs = Math.round(_stats._totalTimeMs / _stats.totalChecked);
}

/**
 * Get validation stats (for dashboard/debugging).
 */
export function getValidationStats(): typeof _stats {
  return { ..._stats };
}
