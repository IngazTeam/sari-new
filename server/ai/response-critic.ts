/**
 * Response Critic — Layer 1: Generate-Critique-Fix
 * 
 * Reviews every GPT response against 7 quality criteria BEFORE sending.
 * Uses GPT-4o-mini for fast, cheap critique (~0.5s, ~$0.001/call).
 * If issues found, GPT-4o rewrites the response.
 * 
 * Criteria:
 * 1. Answered the specific question (متى→date, كم→price)
 * 2. Saudi dialect (no formal Arabic)
 * 3. No cross-selling (only answer what was asked)
 * 4. No marketing preamble
 * 5. Short and direct (2-4 lines)
 * 6. No contact info leaked
 * 7. Context-aware (didn't ignore previous questions)
 */

import { callGPT4 } from './openai';

// ════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════

export interface CritiqueResult {
  passed: boolean;
  failures: string[];
  suggestions: string;
  score: number; // 0-7
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ════════════════════════════════════════════════
// Critique Prompt
// ════════════════════════════════════════════════

const CRITIQUE_PROMPT = `أنت مراجع جودة لردود مبيعات واتساب. قيّم الرد التالي على 7 معايير:

1. **جاوب السؤال**: إذا سأل "متى" هل أعطاه تاريخ؟ إذا سأل "كم" هل أعطاه سعر؟ إذا سأل عن شي محدد هل جاوب عليه بالضبط؟
2. **لهجة سعودية**: هل استخدم "هل تود"، "إذا كنت"، "لدينا"، "يمكنك"، "أفهم وجهة نظرك"، "المتاحة تشمل"؟ هذي فصحى ممنوعة. المطلوب: "تبي"، "عندنا"، "تقدر"، "أبغى".
3. **بدون كروس سيلينج**: إذا العميل سأل عن منتج محدد، هل اقترح الرد منتجات أخرى ما سأل عنها؟
4. **بدون ديباجة**: هل بدأ بمدح عام ("هذي الدورة مهمة جداً في المجال")؟ أو كلام تسويقي فاضي ("استثمار في مستقبلك")؟
5. **قصير ومباشر**: هل الرد أطول من 4 أسطر بدون ضرورة؟
6. **بدون بيانات تواصل**: هل تسرب إيميل أو رقم هاتف أو رابط؟
7. **سياق المحادثة**: هل تجاهل سؤال سابق ما اتجاوب عليه؟

أجب بصيغة JSON فقط:
{
  "passed": true/false,
  "failures": ["رقم المعيار: وصف المشكلة"],
  "suggestions": "كيف يُصلح الرد",
  "score": 0-7
}`;

// ════════════════════════════════════════════════
// Core Functions
// ════════════════════════════════════════════════

/**
 * Critique a GPT response against quality checklist
 * Uses GPT-4o-mini for speed (~0.5s)
 */
export async function critiqueResponse(params: {
  response: string;
  customerMessage: string;
  conversationHistory: ChatMessage[];
}): Promise<CritiqueResult> {
  const { response, customerMessage, conversationHistory } = params;

  // Build context summary (last 3 messages for brevity)
  const recentHistory = conversationHistory.slice(-6)
    .map(m => `${m.role === 'user' ? 'عميل' : 'بوت'}: ${typeof m.content === 'string' ? m.content.substring(0, 100) : ''}`)
    .join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: CRITIQUE_PROMPT },
    { role: 'user', content: `## سياق المحادثة:
${recentHistory}

## رسالة العميل الأخيرة:
${customerMessage}

## الرد المراد تقييمه:
${response}

قيّم الرد بصيغة JSON:` },
  ];

  try {
    const raw = await callGPT4(messages, {
      temperature: 0.1,
      maxTokens: 300,
      model: 'gpt-4o-mini',
    });

    // Parse JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { passed: true, failures: [], suggestions: '', score: 7 };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      passed: parsed.passed ?? true,
      failures: Array.isArray(parsed.failures) ? parsed.failures : [],
      suggestions: parsed.suggestions || '',
      score: typeof parsed.score === 'number' ? parsed.score : 7,
    };
  } catch (err) {
    // Critic failure = pass-through (never block the response)
    console.warn('[Critic] Critique failed (pass-through):', (err as Error).message);
    return { passed: true, failures: [], suggestions: '', score: 7 };
  }
}

/**
 * Fix a response based on critique feedback
 * Uses GPT-4o for quality (same model as original response)
 */
export async function fixResponse(params: {
  originalResponse: string;
  critique: CritiqueResult;
  customerMessage: string;
  conversationHistory: ChatMessage[];
}): Promise<string> {
  const { originalResponse, critique, customerMessage, conversationHistory } = params;

  const recentHistory = conversationHistory.slice(-4)
    .map(m => `${m.role === 'user' ? 'عميل' : 'بوت'}: ${typeof m.content === 'string' ? m.content.substring(0, 100) : ''}`)
    .join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: `أنت موظف مبيعات سعودي محترف. أعد صياغة الرد التالي بناء على الملاحظات.

القواعد:
- لهجة سعودية فقط (تبي، عندنا، تقدر، أيوا)
- أجب على السؤال بالضبط — لا كلام زائد
- لا تقترح منتجات ما سأل عنها العميل
- لا ديباجة تسويقية — ابدأ بالإجابة مباشرة
- 2-4 أسطر كحد أقصى
- لا تشارك أي إيميل أو رقم هاتف

أرجع الرد المُصلح فقط — بدون تعليقات أو شرح.` },
    { role: 'user', content: `## المحادثة:
${recentHistory}

## رسالة العميل:
${customerMessage}

## الرد الأصلي:
${originalResponse}

## المشاكل:
${critique.failures.join('\n')}

## الاقتراح:
${critique.suggestions}

أعد صياغة الرد:` },
  ];

  try {
    const fixed = await callGPT4(messages, {
      temperature: 0.5,
      maxTokens: 400,
    });

    if (fixed && fixed.length > 10) {
      console.log(`[Critic] ✅ Response fixed (score: ${critique.score}/7 → rewritten)`);
      return fixed;
    }
  } catch (err) {
    console.warn('[Critic] Fix failed (using original):', (err as Error).message);
  }

  // Fallback: return original
  return originalResponse;
}

// ════════════════════════════════════════════════
// Telemetry
// ════════════════════════════════════════════════

let _critiqueStats = { total: 0, passed: 0, fixed: 0 };

export function recordCritique(result: CritiqueResult, wasFixed: boolean): void {
  _critiqueStats.total++;
  if (result.passed) _critiqueStats.passed++;
  if (wasFixed) _critiqueStats.fixed++;
}

export function getCritiqueStats() {
  return { ..._critiqueStats };
}

// Reset stats every hour
setInterval(() => {
  if (_critiqueStats.total > 0) {
    console.log(`[Critic] 📊 Hourly stats: ${_critiqueStats.total} total, ${_critiqueStats.passed} passed (${Math.round((_critiqueStats.passed / _critiqueStats.total) * 100)}%), ${_critiqueStats.fixed} fixed`);
  }
  _critiqueStats = { total: 0, passed: 0, fixed: 0 };
}, 3600_000);
