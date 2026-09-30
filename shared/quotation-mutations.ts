import { z } from "zod";
import { quotationMinor, quotationStatuses } from "./quotation-workspace";
const id = z.number().int().positive();
const money = (maximum: number) =>
  z
    .number()
    .finite()
    .nonnegative()
    .max(maximum)
    .refine(v => quotationMinor(v) !== null, "Use at most two decimal places");
export const quotationDraftInput = z
  .object({
    requestId: z.string().uuid(),
    customerName: z.string().trim().min(1).max(255).optional(),
    customerPhone: z
      .string()
      .trim()
      .min(8)
      .max(16)
      .regex(/^\+?[0-9]{8,15}$/)
      .optional(),
    items: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(500),
            description: z.string().trim().max(1000).optional(),
            quantity: z
              .number()
              .finite()
              .min(1)
              .max(99999)
              .refine(
                v => /^\d+(?:\.\d{1,3})?$/.test(String(v)),
                "Use at most three decimal places"
              ),
            unitPrice: money(99999999.99),
          })
          .strict()
      )
      .min(1)
      .max(50),
    taxBasisPoints: z.number().int().min(0).max(10000).default(1500),
    currency: z.enum(["SAR", "USD"]).default("SAR"),
    validDays: z.number().int().min(1).max(365).default(7),
    conversationId: id.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    try {
      calculateQuotation(v.items, v.taxBasisPoints);
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Quotation amount exceeds the supported limit",
      });
    }
  });
export type QuotationDraft = z.infer<typeof quotationDraftInput>;
export const quotationChangeInput = z
  .object({
    requestId: z.string().uuid(),
    id,
    expectedRevision: id,
    expectedStatus: z.enum(quotationStatuses),
    status: z.enum([
      "draft",
      "sent",
      "viewed",
      "accepted",
      "rejected",
      "expired",
    ]),
  })
  .strict();
export const quotationTargetInput = z
  .object({
    requestId: z.string().uuid(),
    period: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
    expectedRevision: id.nullable(),
    amount: money(9999999999.99),
  })
  .strict();
export const quotationReceiptInput = z
  .object({ requestId: z.string().uuid() })
  .strict();
export type QuotationReceipt = {
  merchantId: number;
  requestId: string;
  kind: "create" | "status" | "target";
  recordId: number;
  revision: number;
  changed: boolean;
  committedAt: string;
};
export function calculateQuotation(
  items: Array<{
    quantity: number;
    unitPrice: number;
    name: string;
    description?: string;
  }>,
  taxBasisPoints: number
) {
  const limit = BigInt(9999999999);
  if (
    !Number.isInteger(taxBasisPoints) ||
    taxBasisPoints < 0 ||
    taxBasisPoints > 10000
  )
    throw Error("Invalid tax");
  let subtotal = BigInt(0);
  const calculated = items.map(item => {
    const price = quotationMinor(item.unitPrice),
      quantityText = String(item.quantity);
    if (
      price === null ||
      !/^\d+(?:\.\d{1,3})?$/.test(quantityText) ||
      item.quantity < 1 ||
      item.quantity > 99999
    )
      throw Error("Invalid item");
    const [whole, decimal = ""] = quantityText.split(".");
    const quantity = BigInt(whole) * BigInt(1000) + BigInt(decimal.padEnd(3, "0"));
    const total = (BigInt(price) * quantity + BigInt(500)) / BigInt(1000);
    subtotal += total;
    if (subtotal > limit) throw Error("Quotation limit exceeded");
    return { ...item, total: Number(total) / 100 };
  });
  const tax = (subtotal * BigInt(taxBasisPoints) + BigInt(5000)) / BigInt(10000),
    total = subtotal + tax;
  if (total > limit) throw Error("Quotation limit exceeded");
  return {
    items: calculated,
    subtotalMinor: Number(subtotal),
    taxMinor: Number(tax),
    totalMinor: Number(total),
  };
}
