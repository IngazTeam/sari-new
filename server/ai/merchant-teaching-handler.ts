import {
  currentInboundExecution,
  type InboundExecution,
} from "../messaging/inbound-context";
import { readTeachingSource } from "../knowledge/whatsapp-teaching-source";
import {
  findTeachingReceipt,
  saveContextualMerchantTeaching,
  TeachingLimitError,
  type TeachingReceipt,
} from "../knowledge/whatsapp-teaching";
import { understandMerchantTeaching } from "./merchant-teaching-understanding";

type Result = { handled: boolean; response?: string };
const outcomes = new WeakMap<InboundExecution, Map<string, Promise<Result>>>();
const unavailable: Result = {
  handled: true,
  response:
    "تعذر التحقق من معنى الرسالة أو حفظ التعليم الآن. لم يتم تأكيد اعتماد معلومة جديدة؛ راجع صفحة المعرفة قبل إعادة المحاولة.",
};

function acknowledge(saved: TeachingReceipt): Result {
  if (saved.replayed)
    return {
      handled: true,
      response: saved.approved
        ? "هذه التعليمة مسجلة بالفعل في سجل المعرفة. احتفظت بالمراجعة الحالية دون إضافة نسخة أو تغييرها."
        : "سبق تسجيل هذه التعليمة ثم تغيّرت حالتها أو حُذفت. لم أُعد اعتمادها؛ راجعها من صفحة المعرفة.",
    };
  return {
    handled: true,
    response: `تم حفظ المعلومة كاملة في معرفة النشاط مع شروطها واستثناءاتها.
سيستخدمها ساري عندما تناسب السؤال، مع الرجوع للكتالوج الحالي في السعر والتوفر. يمكنك تعديلها أو حذفها من صفحة المعرفة.
استخدمت ${saved.usedToday}/10 تعليمات خلال آخر 24 ساعة.`,
  };
}

async function processTeaching(
  merchantId: number,
  text: string
): Promise<Result> {
  try {
    const source = await readTeachingSource(merchantId, text);
    const previous = await findTeachingReceipt(source);
    if (previous) return acknowledge(previous);
    const decision = await understandMerchantTeaching(merchantId, text);
    if (
      decision.intent === "not_teaching" &&
      !decision.ambiguous &&
      decision.confidence >= 0.9
    )
      return { handled: false };
    if (decision.intent !== "teach")
      return {
        handled: true,
        response:
          "لم أحفظ معلومة جديدة. إذا كنت تريد تعليم ساري، اكتب المعلومة كاملة مع شروطها وحدد أنها للاستخدام العام مع العملاء؛ أما تصحيح حالة خاصة فراجعه من صفحة المعرفة.",
      };
    if (text.trim().length > 2000)
      return {
        handled: true,
        response:
          "المعلومة أطول من حد التعليم برسالة واحدة. أضفها كاملة من صفحة المعرفة؛ لم أختصرها أو أحفظ جزءًا منها.",
      };
    return acknowledge(await saveContextualMerchantTeaching(source, decision));
  } catch (error) {
    if (error instanceof TeachingLimitError)
      return {
        handled: true,
        response:
          "وصلت إلى 10 تعليمات خلال آخر 24 ساعة. لم تُحفظ هذه التعليمة؛ يمكنك مراجعة المعرفة من لوحة النشاط.",
      };
    // Never log the source text, phone, provider error, token, or model response.
    console.warn("[MerchantTeaching] Teaching result not confirmed");
    return unavailable;
  }
}

/** All authenticated merchant messages reach semantic admission, without a keyword gate.
 * Reuse the decision within this durable execution if a legacy dispatcher calls again. */
export function handleMerchantTeaching(
  merchantId: number,
  text: string
): Promise<Result> {
  const execution = currentInboundExecution();
  if (!execution || execution.merchantId !== merchantId)
    return Promise.resolve(unavailable);
  let cache = outcomes.get(execution);
  if (!cache) {
    cache = new Map();
    outcomes.set(execution, cache);
  }
  const key = JSON.stringify([merchantId, text]);
  let result = cache.get(key);
  if (!result) {
    result = processTeaching(merchantId, text);
    cache.set(key, result);
  }
  return result;
}
