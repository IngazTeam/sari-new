import type { PoolConnection } from "mysql2/promise";
import type { CheckoutIdentity } from "./checkout-agreements";
import { normalizeCustomerText } from "./customer-decision";

export const isBookingAmendmentRequest = (message: string) => {
  const text = normalizeCustomerText(message);
  return (
    /(?:حجز|موعد|\bbooking\b|\bappointment\b)/.test(text) &&
    /(?:عدل|تعديل|غير|تغيير|اجل|تاجيل|قدم|تقديم|\bchange\b|\breschedul\w*\b|\bmove\b)/.test(
      text
    )
  );
};
const newBooking = (text: string) =>
  /(?:حجز\s*جديد|موعد\s*جديد|\bnew (?:booking|appointment)\b)/.test(
    normalizeCustomerText(text)
  );
export const amendmentClarification = (id: number) =>
  `حدد التاريخ والوقت والموظف المطلوب تعديلهم للحجز #${id}. سيبقى الموعد الحالي محفوظًا حتى موافقتك على ملخص التعديل. [BT-${id}]`;
const delivered = (job: any) =>
  ["pending", "processing", "completed", "failed"].includes(job?.state);

/** Only owned persisted messages and delivered server replies resolve the target; never model output. */
export async function resolveBookingAmendment(
  c: Pick<PoolConnection, "execute">,
  input: CheckoutIdentity,
  message: string
): Promise<{ requested: boolean; target: any | null }> {
  const explicit = isBookingAmendmentRequest(message);
  if (newBooking(message) && !explicit)
    return { requested: false, target: null };
  const [jobs] = await c.execute<any[]>(
    "SELECT reply_text,state FROM ai_interaction_jobs WHERE merchant_id=? AND conversation_id=? AND incoming_message_id<? ORDER BY incoming_message_id DESC LIMIT 1",
    [input.merchantId, input.conversationId, input.incomingMessageId]
  );
  let targetId: number | null = null;
  if (explicit) {
    const ids = Array.from(
      message.matchAll(
        /(?:#|(?:حجز|موعد|booking|appointment)\s*(?:رقم\s*)?)([0-9٠-٩]+)/gi
      )
    ).map(m =>
      Number(m[1].replace(/[٠-٩]/g, x => String("٠١٢٣٤٥٦٧٨٩".indexOf(x))))
    );
    if (new Set(ids).size > 1) return { requested: true, target: null };
    targetId = ids[0] ?? null;
  } else if (delivered(jobs[0])) {
    const text = String(jobs[0].reply_text || "");
    const id = Number(text.match(/\[BT-(\d+)\]$/)?.[1]);
    if (
      Number.isSafeInteger(id) &&
      id > 0 &&
      text === amendmentClarification(id)
    )
      targetId = id;
    else {
      const [quotes] = await c.execute<any[]>(
        "SELECT target_booking_id,offer_text,state FROM conversation_booking_agreements WHERE merchant_id=? AND conversation_id=? AND customer_phone=? ORDER BY id DESC LIMIT 1",
        [input.merchantId, input.conversationId, input.customerPhone]
      );
      if (quotes[0]?.state === "proposed" && quotes[0].offer_text === text)
        targetId = quotes[0].target_booking_id;
    }
  }
  if (!explicit && !targetId) return { requested: false, target: null };
  const [rows] = await c.execute<any[]>(
    `SELECT b.* FROM bookings b JOIN conversation_booking_agreements a ON a.id=b.customer_agreement_id
    AND a.merchant_id=b.merchant_id AND a.booking_reference=b.id AND a.customer_phone=b.customer_phone AND a.state='accepted'
    WHERE b.merchant_id=? AND b.customer_phone=? AND a.conversation_id=? AND b.status IN ('pending','confirmed')
    AND (? IS NULL OR b.id=?) ORDER BY b.id LIMIT 2`,
    [
      input.merchantId,
      input.customerPhone,
      input.conversationId,
      targetId,
      targetId,
    ]
  );
  return { requested: true, target: rows.length === 1 ? rows[0] : null };
}
