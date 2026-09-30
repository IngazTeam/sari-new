import { z } from "zod";
import {
  quotationDraftInput,
  quotationChangeInput,
  quotationTargetInput,
} from "@shared/quotation-mutations";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
import { quotationMinor } from "@shared/quotation-workspace";
const text = z.string().max(1200);
export const quotationFormSchema = z
  .object({
    customerName: text,
    customerPhone: text,
    currency: z.enum(["SAR", "USD"]),
    tax: text,
    validDays: text,
    items: z
      .array(
        z
          .object({
            name: text,
            description: text,
            quantity: text,
            unitPrice: text,
          })
          .strict()
      )
      .min(1)
      .max(50),
  })
  .strict();
export type QuotationForm = z.infer<typeof quotationFormSchema>;
export const blankQuotationForm = (): QuotationForm => ({
  customerName: "",
  customerPhone: "",
  currency: "SAR",
  tax: "15",
  validDays: "7",
  items: [{ name: "", description: "", quantity: "1", unitPrice: "0" }],
});
const attempt = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), input: quotationDraftInput }).strict(),
  z.object({ kind: z.literal("status"), input: quotationChangeInput }).strict(),
  z.object({ kind: z.literal("target"), input: quotationTargetInput }).strict(),
]);
export type QuotationActionAttempt = z.infer<typeof attempt>;
const entry = z
  .object({
    savedAt: z.number().finite(),
    form: quotationFormSchema.optional(),
    attempt: attempt.optional(),
  })
  .strict();
export type QuotationEditorCache = Omit<z.infer<typeof entry>, "savedAt">;
const prefix = "sary:quotation-editor:v1:";
function key(scope: string) {
  if (!/^\d+:\d+:sales-hub$/.test(scope))
    throw Error("Invalid quotation scope");
  return prefix + scope;
}
export function readQuotationEditorCache(scope: string): QuotationEditorCache {
  const raw = sessionStorage.getItem(key(scope));
  if (!raw) return {};
  if (raw.length > 200000) throw Error("Invalid quotation cache");
  const parsed = entry.parse(JSON.parse(raw));
  if (parsed.savedAt > Date.now() || Date.now() - parsed.savedAt > 86400000) {
    sessionStorage.removeItem(key(scope));
    return {};
  }
  return { form: parsed.form, attempt: parsed.attempt };
}
/** Local working draft, isolated per actor/merchant, expires in 24 hours and cleared at logout. */
export function saveQuotationEditorCache(
  scope: string,
  value: QuotationEditorCache,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const serialized = JSON.stringify(
    entry.parse({ ...value, savedAt: Date.now() })
  );
  sessionStorage.setItem(key(scope), serialized);
  if (sessionStorage.getItem(key(scope)) !== serialized)
    throw Error("Quotation draft unavailable");
}
export function clearQuotationEditorCache(scope: string, epoch: number) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  sessionStorage.removeItem(key(scope));
}
export function quotationFormInput(form: QuotationForm, requestId: string) {
  const numeric = (v: string) =>
    /^(?:\d+\.?\d*|\.\d+)$/.test(v.trim()) ? Number(v) : NaN;
  return quotationDraftInput.safeParse({
    requestId,
    customerName: form.customerName.trim() || undefined,
    customerPhone: form.customerPhone.trim() || undefined,
    currency: form.currency,
    taxBasisPoints: quotationMinor(form.tax.trim()) ?? NaN,
    validDays: numeric(form.validDays),
    items: form.items.map(i => ({
      name: i.name,
      description: i.description,
      quantity: numeric(i.quantity),
      unitPrice: numeric(i.unitPrice),
    })),
  });
}
