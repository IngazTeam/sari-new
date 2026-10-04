import { z } from "zod";
import { PAYMENT_LINK_ID_PATTERN } from "./subscription-payment-status";
const id = z.number().int().positive().max(2147483647),
  count = z.number().int().nonnegative().safe(),
  money = z.number().int().nonnegative().max(2147483647).nullable(),
  time = z.string().datetime().nullable();
export const paymentLinkAvailabilityStates = [
  "available",
  "disabled",
  "expired",
  "exhausted",
  "invalid",
] as const;
export const paymentLinksInput = z
  .object({
    search: z.string().trim().max(100).default(""),
    availability: z
      .enum(["all", ...paymentLinkAvailabilityStates])
      .default("all"),
    page: z.number().int().min(1).max(10000).default(1),
    pageSize: z.union([z.literal(25), z.literal(50)]).default(25),
  })
  .strict();
export const paymentLinkDetailInput = z.object({ id }).strict();
const related = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("unavailable") }).strict(),
  z.object({ kind: z.literal("order"), id }).strict(),
  z.object({ kind: z.literal("booking"), id }).strict(),
]);
export const paymentLinkRecord = z
  .object({
    id,
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    linkId: z.string().regex(PAYMENT_LINK_ID_PATTERN).nullable(),
    title: z.string().max(255).nullable(),
    description: z.string().max(10000).nullable(),
    amountMinor: money,
    currency: z.enum(["SAR", "USD"]).nullable(),
    fixedAmount: z.boolean().nullable(),
    minAmountMinor: money,
    maxAmountMinor: money,
    storedStatus: z
      .enum(["active", "expired", "disabled", "completed"])
      .nullable(),
    enabled: z.boolean().nullable(),
    availability: z.enum(paymentLinkAvailabilityStates),
    usageCount: count.nullable(),
    maxUsageCount: id.nullable(),
    expiresAt: time,
    createdAt: time,
    updatedAt: time,
    publicUrl: z.string().url().max(2000).nullable(),
    related,
    totalCollectedMinor: money,
    successfulPayments: count.nullable(),
    failedPayments: count.nullable(),
    warnings: z
      .array(
        z.enum([
          "identity",
          "text",
          "amount",
          "currency",
          "configuration",
          "counters",
          "timestamps",
          "target",
          "url",
        ])
      )
      .max(9),
  })
  .strict()
  .superRefine((v, c) => {
    const issue = () =>
      c.addIssue({ code: "custom", message: "inconsistent_link_evidence" });
    if (new Set(v.warnings).size !== v.warnings.length) issue();
    if ((v.related.kind === "unavailable") !== v.warnings.includes("target"))
      issue();
    if ((v.linkId === null) !== v.warnings.includes("identity")) issue();
    if ((v.amountMinor === null) !== v.warnings.includes("amount")) issue();
    if ((v.currency === null) !== v.warnings.includes("currency")) issue();
    if (
      (v.publicUrl !== null) !==
      (v.linkId !== null && v.related.kind !== "unavailable")
    )
      issue();
    if (v.enabled === false && v.availability !== "disabled") issue();
    if (v.enabled === null && v.availability !== "invalid") issue();
    if (v.enabled === true) {
      const terminal = {
        disabled: "disabled",
        expired: "expired",
        completed: "exhausted",
      } as const;
      if (v.storedStatus === null && v.availability !== "invalid") issue();
      if (
        v.storedStatus &&
        v.storedStatus !== "active" &&
        v.availability !== terminal[v.storedStatus]
      )
        issue();
    }
    if (v.publicUrl) {
      const u = new URL(v.publicUrl);
      if (
        !["https:", "http:"].includes(u.protocol) ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        u.pathname !== `/pay/${v.linkId}` ||
        v.related.kind === "unavailable" ||
        v.linkId === null
      )
        issue();
    }
    if (
      v.availability === "available" &&
      (v.enabled !== true ||
        v.storedStatus !== "active" ||
        v.usageCount === null ||
        (v.maxUsageCount !== null && v.usageCount >= v.maxUsageCount))
    )
      issue();
  });
export const paymentLinksTotals = z
  .object({
    total: count,
    states: z
      .object({
        available: count,
        disabled: count,
        expired: count,
        exhausted: count,
        invalid: count,
      })
      .strict(),
  })
  .strict()
  .refine(
    v => Object.values(v.states).reduce((a, b) => a + b, 0) === v.total,
    "inconsistent_link_totals"
  );
const scope = {
  actorId: id,
  merchantId: id,
  canView: z.boolean(),
  canManage: z.boolean(),
  checkedAt: z.string().datetime(),
  source: z.literal("local_payment_links"),
};
export const paymentLinksWorkspace = z
  .object({
    ...scope,
    state: z.enum(["ready", "restricted"]),
    filters: paymentLinksInput,
    totals: paymentLinksTotals.nullable(),
    items: z.array(paymentLinkRecord).max(50),
    hasNext: z.boolean(),
  })
  .strict()
  .superRefine((v, c) => {
    const issue = () =>
      c.addIssue({ code: "custom", message: "inconsistent_links_workspace" });
    if (v.canManage && !v.canView) issue();
    if (!v.canView) {
      if (
        v.state !== "restricted" ||
        v.items.length ||
        v.totals !== null ||
        v.hasNext
      )
        issue();
      return;
    }
    if (v.state !== "ready" || !v.totals) {
      issue();
      return;
    }
    for (const state of paymentLinkAvailabilityStates) {
      if (
        v.items.filter(x => x.availability === state).length >
        v.totals.states[state]
      )
        issue();
      if (
        v.filters.availability !== "all" &&
        state !== v.filters.availability &&
        v.totals.states[state] !== 0
      )
        issue();
    }
    if (
      v.items.some(
        x =>
          x.availability === "available" &&
          x.expiresAt !== null &&
          Date.parse(x.expiresAt) <= Date.parse(v.checkedAt)
      )
    )
      issue();
    const expected = Math.min(
      v.filters.pageSize,
      Math.max(0, v.totals.total - (v.filters.page - 1) * v.filters.pageSize)
    );
    if (
      v.items.length !== expected ||
      v.hasNext !== v.filters.page * v.filters.pageSize < v.totals.total ||
      new Set(v.items.map(x => x.id)).size !== v.items.length
    )
      issue();
    if (
      v.filters.availability !== "all" &&
      v.items.some(x => x.availability !== v.filters.availability)
    )
      issue();
  });
export const paymentLinkDetail = z
  .object({
    ...scope,
    state: z.enum(["found", "missing", "restricted"]),
    link: paymentLinkRecord.nullable(),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.link?.availability === "available" &&
      v.link.expiresAt !== null &&
      Date.parse(v.link.expiresAt) <= Date.parse(v.checkedAt)
    )
      c.addIssue({ code: "custom", message: "expired_link_evidence" });
    if (
      (v.canManage && !v.canView) ||
      (!v.canView && (v.state !== "restricted" || v.link !== null)) ||
      (v.canView &&
        (v.state === "restricted" ||
          (v.state === "found") !== (v.link !== null)))
    )
      c.addIssue({ code: "custom", message: "inconsistent_link_detail" });
  });
export type PaymentLinkRecord = z.infer<typeof paymentLinkRecord>;

export const paymentLinkDisableInput = z
  .object({
    id,
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    reviewed: z.literal(true),
  })
  .strict();
export const paymentLinkDisableResult = z
  .object({
    outcome: z.enum(["disabled", "already_disabled"]),
    workspace: paymentLinkDetail,
  })
  .strict()
  .refine(
    v =>
      v.workspace.state === "found" &&
      v.workspace.canView &&
      v.workspace.canManage &&
      v.workspace.link?.enabled === false &&
      v.workspace.link.storedStatus === "disabled" &&
      v.workspace.link.availability === "disabled",
    "unverified_disable_result"
  );

const requestId = z
  .string()
  .regex(
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
  );
export const paymentLinkCreateInput = z
  .object({
    requestId,
    reviewed: z.literal(true),
    title: z.string().trim().min(2).max(255),
    description: z.string().trim().max(1000).default(""),
    amountMinor: z.number().int().min(100).max(100_000_000),
    currency: z.literal("SAR").default("SAR"),
    maxUsageCount: z
      .number()
      .int()
      .min(1)
      .max(100_000)
      .nullable()
      .default(null),
    expiresAt: z
      .string()
      .datetime()
      .refine(v => {
        const d = new Date(v);
        return (
          Number.isFinite(d.getTime()) &&
          d.toISOString() === v &&
          v.endsWith(".000Z") &&
          v <= "2037-12-31T23:59:59.999Z"
        );
      })
      .nullable()
      .default(null),
  })
  .strict();
export const paymentLinkRequestInput = z.object({ requestId }).strict();
export const paymentLinkCreateResult = z
  .object({
    outcome: z.enum(["created", "recovered"]),
    requestId,
    workspace: paymentLinkDetail,
  })
  .strict()
  .refine(
    v =>
      v.workspace.state === "found" &&
      v.workspace.canView &&
      v.workspace.canManage &&
      v.workspace.link?.linkId === `link_${v.requestId.replaceAll("-", "")}` &&
      v.workspace.link.related.kind === "none" &&
      (v.outcome === "recovered" ||
        (v.workspace.link.enabled === true &&
          v.workspace.link.storedStatus === "active" &&
          v.workspace.link.usageCount === 0 &&
          v.workspace.link.totalCollectedMinor === 0 &&
          v.workspace.link.successfulPayments === 0 &&
          v.workspace.link.failedPayments === 0)),
    "unverified_creation_result"
  );
export const paymentLinkRequestResult = z
  .object({
    requestId,
    outcome: z.enum(["found", "not_found", "unverified", "restricted"]),
    workspace: paymentLinkDetail,
  })
  .strict()
  .refine(
    v =>
      v.workspace.link === null ||
      (v.workspace.link.linkId === `link_${v.requestId.replaceAll("-", "")}` &&
        v.workspace.link.related.kind === "none"),
    "unverified_creation_recovery"
  )
  .refine(
    v =>
      v.workspace.state === "found"
        ? v.outcome === "found"
        : v.workspace.state === "restricted"
          ? v.outcome === "restricted"
          : ["not_found", "unverified"].includes(v.outcome),
    "inconsistent_request_outcome"
  );
