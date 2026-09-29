import { findCoachingReview, commitCoachingReview } from "./coaching-store";
import { understandCoachingReply } from "./coaching-understanding";

export type CoachingReplyResult = {
  handled: boolean;
  response?: string;
  nextSessionId?: number;
};
export async function handleContextualCoachingReply(
  merchantId: number,
  text: string,
  quotedMessageId?: string
): Promise<CoachingReplyResult> {
  // A short word is not a reference to a pending question. WhatsApp Reply supplies an owned receipt.
  if (!quotedMessageId) return { handled: false };
  try {
    const review = await findCoachingReview(merchantId, text, quotedMessageId);
    if (!review) return { handled: false };
    if (review.question.merchant_verdict)
      return {
        handled: true,
        response: "سبق تسجيل مراجعة هذا السؤال. لم أغيّرها أو أعد حفظ التصحيح.",
        ...(review.question.session_status === "active"
          ? { nextSessionId: Number(review.question.session_id) }
          : {}),
      };
    if (
      !["active", "expired"].includes(review.question.session_status) ||
      !Number(review.question.recent_session) ||
      Number(review.question.question_order) !==
        Number(review.question.current_question_index) + 1
    ) {
      return {
        handled: true,
        response:
          "سؤال التدريب هذا لم يعد قابلًا للمراجعة في الجلسة الحالية. لم أحفظ تغييرًا؛ استخدم السؤال الحالي أو راجع المعرفة من اللوحة.",
      };
    }
    const decision = await understandCoachingReply(merchantId, {
      basisHash: review.basisHash,
      context: review.context,
      reply: text,
    });
    if (["unrelated", "clarify"].includes(decision.verdict))
      return {
        handled: true,
        response:
          "لم أسجل حكمًا على الرد. وضّح مراجعتك لهذا السؤال بالرد على رسالته: هل الرد صحيح، وما التصحيح الكامل إن لزم؟ ولطلب موضوع آخر أرسل رسالة مستقلة.",
      };
    const saved = await commitCoachingReview(review, decision);
    const response =
      saved.verdict === "corrected"
        ? "حفظت تصحيحك كاملًا للمراجعة في المعرفة؛ لن يستخدمه ساري مع العملاء قبل اعتماده."
        : saved.verdict === "correct"
          ? "سجلت تأكيدك لصحة هذا الرد."
          : "تم تجاوز سؤال المراجعة دون إضافة معلومة.";
    return {
      handled: true,
      response:
        response + (saved.completed ? "\nاكتملت مراجعة أسئلة هذه الجلسة." : ""),
      ...(!saved.completed ? { nextSessionId: saved.sessionId } : {}),
    };
  } catch {
    console.warn("[Coaching] Review result not confirmed");
    return {
      handled: true,
      response:
        "تعذر تأكيد مراجعة سؤال التدريب الآن. لم أؤكد حفظ تغيير؛ راجع المعرفة والجلسة قبل إعادة المحاولة.",
    };
  }
}
