import {
  paymentLinksInput,
  paymentLinkCreateInput,
  paymentLinkRequestInput,
} from "@shared/payment-links-workspace";
import { majorToMinor } from "@shared/product-money";
export type LinkDraft = {
  title: string;
  description: string;
  amount: string;
  maxUses: string;
  expiry: string;
  reviewed: boolean;
};
export const emptyLinkDraft = (): LinkDraft => ({
  title: "",
  description: "",
  amount: "",
  maxUses: "",
  expiry: "",
  reviewed: false,
});
export const normalizeLinkNumber = (value: string) =>
  value
    .trim()
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .replace(/٫/g, ".");
export function linkDraftInput(draft: LinkDraft, requestId: string) {
  let amountMinor: number | undefined;
  const amount = normalizeLinkNumber(draft.amount),
    max = normalizeLinkNumber(draft.maxUses);
  if (/^\d+(\.\d{1,2})?$/.test(amount)) {
    try {
      amountMinor = majorToMinor(amount);
    } catch {
      /* field validation below */
    }
  }
  return paymentLinkCreateInput.safeParse({
    requestId,
    reviewed: draft.reviewed,
    title: draft.title,
    description: draft.description,
    amountMinor,
    currency: "SAR",
    maxUsageCount: max === "" ? null : /^\d+$/.test(max) ? Number(max) : NaN,
    expiresAt: draft.expiry ? draft.expiry + "T23:59:59.000Z" : null,
  });
}
export function readPaymentLinksSearch(search: string) {
  const p = new URLSearchParams(search);
  return paymentLinksInput.safeParse({
    search: p.get("search") ?? "",
    availability: p.get("availability") ?? "all",
    page: p.has("page") ? Number(p.get("page")) : 1,
    pageSize: p.has("pageSize") ? Number(p.get("pageSize")) : 25,
  });
}
export function paymentLinksHref(
  input: unknown,
  view?: { link: number } | { create: true }
) {
  const d = paymentLinksInput.parse(input),
    p = new URLSearchParams();
  if (d.search) p.set("search", d.search);
  if (d.availability !== "all") p.set("availability", d.availability);
  if (d.page > 1) p.set("page", String(d.page));
  if (d.pageSize !== 25) p.set("pageSize", String(d.pageSize));
  if (view && "link" in view) p.set("link", String(view.link));
  if (view && "create" in view) p.set("create", "1");
  return "/merchant/payment-links" + (p.size ? "?" + p : "");
}
type RequestStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const paymentLinkRequestKey = (actorId: number, merchantId: number) =>
  `sari:payment-link-request:v1:${actorId}:${merchantId}`;
export function pendingPaymentLinkRequest(
  storage: RequestStorage,
  actorId: number,
  merchantId: number
) {
  const value = storage.getItem(paymentLinkRequestKey(actorId, merchantId));
  if (value === null) return null;
  return paymentLinkRequestInput.parse({ requestId: value }).requestId;
}
export function rememberPaymentLinkRequest(
  storage: RequestStorage,
  actorId: number,
  merchantId: number,
  requestId: string
) {
  paymentLinkRequestInput.parse({ requestId });
  const existing = pendingPaymentLinkRequest(storage, actorId, merchantId);
  if (existing && existing !== requestId) throw Error("pending_request");
  storage.setItem(paymentLinkRequestKey(actorId, merchantId), requestId);
  if (pendingPaymentLinkRequest(storage, actorId, merchantId) !== requestId)
    throw Error("storage_unavailable");
}
export function clearPaymentLinkRequest(
  storage: RequestStorage,
  actorId: number,
  merchantId: number,
  requestId: string
) {
  if (pendingPaymentLinkRequest(storage, actorId, merchantId) !== requestId)
    throw Error("request_changed");
  storage.removeItem(paymentLinkRequestKey(actorId, merchantId));
  if (pendingPaymentLinkRequest(storage, actorId, merchantId) !== null)
    throw Error("storage_unavailable");
}
