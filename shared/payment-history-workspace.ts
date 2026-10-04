import { z } from "zod";
const id = z.number().int().positive().max(2147483647);
const count = z.number().int().nonnegative().safe();
const time = z.string().datetime().nullable();
export const paymentHistoryStatuses = [
  "pending",
  "authorized",
  "captured",
  "failed",
  "cancelled",
  "refunded",
  "unknown",
] as const;
export const paymentHistoryStatus = z.enum(paymentHistoryStatuses);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(v => {
    const date = new Date(v + "T00:00:00Z");
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === v &&
      v >= "1970-01-01" &&
      v <= "9998-12-31"
    );
  });
export const paymentHistoryInput = z
  .object({
    search: z.string().trim().max(100).default(""),
    status: z.enum(["all", ...paymentHistoryStatuses]).default("all"),
    from: day.optional(),
    to: day.optional(),
    page: z.number().int().min(1).max(10000).default(1),
    pageSize: z.union([z.literal(25), z.literal(50)]).default(25),
  })
  .strict()
  .refine(v => !v.from || !v.to || v.from <= v.to, {
    path: ["to"],
    message: "invalid_range",
  });
export const paymentHistoryDetailInput = z.object({ id }).strict();
const warnings = z
  .array(
    z.enum([
      "amount",
      "currency",
      "status",
      "createdAt",
      "target",
      "customer",
      "reference",
      "timestamps",
    ])
  )
  .max(8);
const paymentHistoryItemFields = z
  .object({
    id,
    amountMinor: z.number().int().nonnegative().max(2147483647).nullable(),
    currency: z.enum(["SAR", "USD"]).nullable(),
    status: paymentHistoryStatus,
    customerName: z.string().max(255).nullable(),
    customerPhone: z.string().max(50).nullable(),
    chargeId: z.string().max(255).nullable(),
    paymentMethod: z.string().max(50).nullable(),
    createdAt: time,
    warnings,
  })
  .strict();
function validateItem(
  v: z.infer<typeof paymentHistoryItemFields>,
  c: z.RefinementCtx
) {
  const required = {
    amount: v.amountMinor === null,
    currency: v.currency === null,
    status: v.status === "unknown",
    createdAt: v.createdAt === null,
    customer: v.customerPhone === null,
  };
  if (
    new Set(v.warnings).size !== v.warnings.length ||
    Object.entries(required).some(
      ([key, missing]) =>
        missing !== v.warnings.includes(key as (typeof v.warnings)[number])
    )
  )
    c.addIssue({ code: "custom", message: "inconsistent_item" });
}
export const paymentHistoryItem =
  paymentHistoryItemFields.superRefine(validateItem);
const counts = z
  .object({
    pending: count,
    authorized: count,
    captured: count,
    failed: count,
    cancelled: count,
    refunded: count,
    unknown: count,
  })
  .strict();
export const paymentHistoryTotals = z
  .object({
    total: count,
    states: counts,
    excludedAmounts: count,
    currencies: z
      .array(
        z
          .object({
            currency: z.enum(["SAR", "USD"]),
            records: count,
            totalMinor: count,
            capturedMinor: count,
            authorizedMinor: count,
            refundedMinor: count,
          })
          .strict()
      )
      .max(2),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      Object.values(v.states).reduce((a, b) => a + b, 0) !== v.total ||
      v.excludedAmounts > v.total ||
      v.currencies.some(
        x =>
          x.capturedMinor + x.authorizedMinor + x.refundedMinor >
            x.totalMinor ||
          (x.records === 0 && x.totalMinor !== 0)
      ) ||
      new Set(v.currencies.map(x => x.currency)).size !== v.currencies.length ||
      v.currencies.reduce((n, x) => n + x.records, 0) + v.excludedAmounts !==
        v.total
    )
      c.addIssue({ code: "custom", message: "inconsistent_totals" });
  });
export const paymentHistoryWorkspace = z
  .object({
    actorId: id,
    merchantId: id,
    canView: z.boolean(),
    state: z.enum(["ready", "restricted"]),
    filters: paymentHistoryInput,
    checkedAt: z.string().datetime(),
    totals: paymentHistoryTotals.nullable(),
    items: z.array(paymentHistoryItem).max(50),
    hasNext: z.boolean(),
    source: z.literal("local_payment_records"),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.canView !== (v.state === "ready") ||
      (v.canView
        ? !v.totals
        : v.totals !== null || v.items.length > 0 || v.hasNext) ||
      v.items.length > v.filters.pageSize ||
      new Set(v.items.map(x => x.id)).size !== v.items.length ||
      (v.totals &&
        (v.hasNext !== v.filters.page * v.filters.pageSize < v.totals.total ||
          v.items.length !==
            Math.min(
              v.filters.pageSize,
              Math.max(
                0,
                v.totals.total - (v.filters.page - 1) * v.filters.pageSize
              )
            )))
    )
      c.addIssue({ code: "custom", message: "inconsistent_workspace" });
  });
export const paymentHistoryDetail = z
  .object({
    actorId: id,
    merchantId: id,
    canView: z.boolean(),
    state: z.enum(["found", "missing", "restricted"]),
    checkedAt: z.string().datetime(),
    payment: paymentHistoryItemFields
      .extend({
        customerEmail: z.string().max(255).nullable(),
        description: z.string().max(5000).nullable(),
        related: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("order"), id }).strict(),
          z.object({ kind: z.literal("booking"), id }).strict(),
          z.object({ kind: z.literal("none") }).strict(),
          z.object({ kind: z.literal("unavailable") }).strict(),
        ]),
        authorizedAt: time,
        capturedAt: time,
        failedAt: time,
        refundedAt: time,
        expiresAt: time,
        updatedAt: time,
        hasRecordedError: z.boolean(),
      })
      .strict()
      .superRefine((v, c) => {
        validateItem(v, c);
        if (
          (v.related.kind === "unavailable") !==
          v.warnings.includes("target")
        )
          c.addIssue({ code: "custom", message: "inconsistent_target" });
      })
      .nullable(),
    source: z.literal("local_payment_records"),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.canView !== (v.state !== "restricted") ||
      (v.state === "found") !== (v.payment !== null)
    )
      c.addIssue({ code: "custom", message: "inconsistent_detail" });
  });
export type PaymentHistoryWorkspace = z.infer<typeof paymentHistoryWorkspace>;
export type PaymentHistoryDetail = z.infer<typeof paymentHistoryDetail>;
