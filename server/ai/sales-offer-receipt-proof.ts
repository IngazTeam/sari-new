import { createHash } from "node:crypto";
import { privateSalesPhone } from "./sales-offer-authority";
import { salesDiscountMessage } from "./sales-offer-evidence";

const parse = (v: any) => {
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return null;
  }
};
export type SalesOfferDeliveryState =
  | "missing"
  | "invalid"
  | "failed"
  | "sent"
  | "delivered"
  | "read"
  | "pending";
export type SalesOfferReviewOutcome =
  | "recorded"
  | "accepted_unprojected"
  | "failed"
  | "unresolved";

/** Shared by the worker, merchant preview and atomic review. A status alone never proves acceptance. */
export function inspectSalesOfferReceipt(r: any, d: any) {
  const request = parse(d?.request_json),
    g = request?.salesOfferGuard,
    stored = parse(r.evidence);
  let textMatches = false;
  try {
    textMatches = Boolean(
      stored && salesDiscountMessage(stored) === r.dispatch_text
    );
  } catch {
    /* corrupt evidence */
  }
  const valid = Boolean(
    d &&
    d.merchant_id === r.merchant_id &&
    r.dispatch_started_at &&
    ["dispatching", "unknown", "accepted"].includes(r.state) &&
    r.instance_id &&
    d.instance_id === r.instance_id &&
    d.provider === r.provider &&
    d.account === r.provider_account &&
    d.account_provider === r.provider &&
    d.account_merchant === r.merchant_id &&
    [
      "green_api",
      "meta_cloud",
      ...(process.env.NODE_ENV === "test" ? ["mock"] : []),
    ].includes(d.provider) &&
    d.direction === "outgoing" &&
    request?.kind === "text" &&
    textMatches &&
    request?.text === r.dispatch_text &&
    privateSalesPhone(request?.to) === r.customer_phone &&
    g?.attemptId === r.id &&
    g?.conversationId === r.conversation_id &&
    g?.sourceMessageId === r.source_message_id
  );
  const receipt =
    typeof d?.provider_message_id === "string" &&
    /^[^\s<>\x00-\x1f]{1,255}$/.test(d.provider_message_id)
      ? d.provider_message_id
      : null;
  const accepted = Boolean(
    valid &&
    receipt &&
    (["sent", "delivered", "read"].includes(d.status) ||
      (r.state === "accepted" && r.provider_message_id === receipt))
  );
  const deliveryState: SalesOfferDeliveryState = !d
    ? "missing"
    : !valid
      ? "invalid"
      : d.status === "failed"
        ? "failed"
        : accepted && ["sent", "delivered", "read"].includes(d.status)
          ? d.status
          : "pending";
  return { valid, receipt, accepted, deliveryState };
}

export function salesOfferProjectionConflict(r: any, messages: any[]) {
  return messages.some(
    m =>
      m.direction !== "outgoing" ||
      m.content !== r.dispatch_text ||
      m.sender_type !== "assistant"
  );
}

/** Excludes worker housekeeping, includes all evidence shown and any conflicting history. */
export function salesOfferEvidenceHash(
  r: any,
  d: any,
  phone: string,
  source: any,
  messages: any[]
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        r.id,
        r.merchant_id,
        r.conversation_id,
        r.source_message_id,
        r.customer_phone,
        r.discount_code_id,
        parse(r.evidence),
        r.state,
        r.instance_id,
        r.provider,
        r.provider_account,
        r.dispatch_text,
        r.dispatch_started_at,
        r.provider_message_id,
        r.created_at,
        phone,
        d?.id ?? null,
        d?.merchant_id ?? null,
        d?.instance_id ?? null,
        d?.provider ?? null,
        d?.direction ?? null,
        d?.status ?? null,
        d?.provider_message_id ?? null,
        d?.error_code ?? null,
        d?.account ?? null,
        d?.account_provider ?? null,
        d?.account_merchant ?? null,
        parse(d?.request_json),
        source
          ? {
              id: source.id,
              direction: source.direction,
              content: source.content,
            }
          : null,
        messages.map(m => ({
          id: m.id,
          direction: m.direction,
          content: m.content,
          sender_type: m.sender_type,
        })),
      ])
    )
    .digest("hex");
}
