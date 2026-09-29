import { readTeachingSource } from "../knowledge/whatsapp-teaching-source";
import {
  findTeachingReceipt,
  TeachingLimitError,
} from "../knowledge/whatsapp-teaching";
import {
  readTeachingDialogue,
  commitTeachingDialogue,
  findTeachingTurn,
} from "../knowledge/teaching-dialogue";
import { understandTeachingDialogue } from "./teaching-dialogue-understanding";
export async function handleTeachingDialogue(
  merchantId: number,
  text: string,
  onlyActive = false
): Promise<{ handled: boolean; response?: string }> {
  try {
    const source = await readTeachingSource(merchantId, text);
    const previous = await findTeachingTurn(source);
    if (previous) return previous;
    const legacy = await findTeachingReceipt(source);
    if (legacy)
      return {
        handled: true,
        response:
          "هذه التعليمة مسجلة بالفعل؛ لم أُعد اعتمادها أو تغيير المراجعة الحالية.",
      };
    const context = await readTeachingDialogue(source);
    if (onlyActive && !context.input.draft && !context.input.draftUnavailable)
      return { handled: false };
    const decision = await understandTeachingDialogue(
      merchantId,
      context.input
    );
    return await commitTeachingDialogue(context, decision);
  } catch (error) {
    if (error instanceof TeachingLimitError)
      return {
        handled: true,
        response:
          "وصلت إلى 10 تعليمات خلال آخر 24 ساعة. لم تُحفظ تعليمة جديدة؛ يمكنك مراجعة المعرفة من لوحة النشاط.",
      };
    console.warn("[TeachingDialogue] Analysis or persistence not confirmed");
    return {
      handled: true,
      response:
        "لم يتم تأكيد حفظ التعليم. راجع المسودة أو المعلومة من صفحة المعرفة قبل إعادة المحاولة؛ لم أفعّل سياسة جديدة.",
    };
  }
}
