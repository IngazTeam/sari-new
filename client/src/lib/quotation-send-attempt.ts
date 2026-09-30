import { z } from "zod";
import { quotationReviewInput } from "@shared/quotation-review";
import { quotationDeliveryInput } from "@shared/quotation-delivery";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
const entry = z
  .object({
    savedAt: z.number().finite(),
    review: quotationReviewInput.optional(),
    delivery: quotationDeliveryInput.omit({ confirmed: true }).optional(),
  })
  .strict();
export type QuotationSendAttempt = Omit<z.infer<typeof entry>, "savedAt">;
const prefix = "sary:quotation-send:v1:";
function storageKey(scope: string, quotationId: number) {
  if (
    !/^\d+:\d+:sales-hub$/.test(scope) ||
    !Number.isSafeInteger(quotationId) ||
    quotationId < 1
  )
    throw Error("Invalid quotation scope");
  return prefix + scope + ":" + quotationId;
}
export function readQuotationSendAttempt(
  scope: string,
  quotationId: number
): QuotationSendAttempt {
  const raw = sessionStorage.getItem(storageKey(scope, quotationId));
  if (!raw) return {};
  const value = entry.parse(JSON.parse(raw));
  if (value.savedAt > Date.now() || Date.now() - value.savedAt > 86400000)
    return {};
  if (value.review && value.review.quotationId !== quotationId)
    throw Error("Quotation scope changed");
  return { review: value.review, delivery: value.delivery };
}
/** Only opaque request IDs, selection IDs and a digest. No phone, PDF, terms or approval consent. */
export function rememberQuotationSendAttempt(
  scope: string,
  quotationId: number,
  value: QuotationSendAttempt,
  epoch: number
) {
  if (knowledgeCacheEpoch() !== epoch) throw Error("Session changed");
  const key = storageKey(scope, quotationId),
    serialized = JSON.stringify(entry.parse({ ...value, savedAt: Date.now() }));
  sessionStorage.setItem(key, serialized);
  if (sessionStorage.getItem(key) !== serialized)
    throw Error("Attempt could not be retained");
}
