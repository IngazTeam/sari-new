import { z } from "zod";
const id = z.number().int().positive().max(2147483647),
  count = z.number().int().nonnegative().safe(),
  revision = z.string().regex(/^[a-f0-9]{64}$/);
export function safeAccountNotificationLink(raw: unknown): string | null {
  if (
    typeof raw !== "string" ||
    raw.length > 500 ||
    raw !== raw.trim() ||
    /[\u0000-\u0020\u007f\\]/.test(raw) ||
    !raw.startsWith("/merchant")
  )
    return null;
  try {
    const u = new URL(raw, "https://sari.invalid");
    return u.origin === "https://sari.invalid" &&
      /^\/merchant(?:\/[a-z0-9_-]+)*\/?$/.test(u.pathname) &&
      !u.hash
      ? u.pathname + u.search
      : null;
  } catch {
    return null;
  }
}
export const accountNotificationStates = ["unread", "read", "unknown"] as const;
export const accountNotificationsInput = z
  .object({
    search: z.string().trim().max(100).default(""),
    state: z.enum(["all", ...accountNotificationStates]).default("all"),
    page: z.number().int().min(1).max(10000).default(1),
    pageSize: z.union([z.literal(25), z.literal(50)]).default(25),
  })
  .strict();
export const accountNotificationRecord = z
  .object({
    id,
    revision,
    type: z.enum(["info", "success", "warning", "error"]).nullable(),
    title: z.string().max(255).nullable(),
    message: z.string().max(65535).nullable(),
    link: z
      .string()
      .max(500)
      .nullable()
      .refine(v => v === null || safeAccountNotificationLink(v) === v),
    linkUnavailable: z.boolean(),
    state: z.enum(accountNotificationStates),
    createdAt: z.string().datetime().nullable(),
  })
  .strict()
  .refine(
    v => !v.linkUnavailable || v.link === null,
    "inconsistent_notification_link"
  );
export const accountNotificationsMarkAll = z
  .object({ throughId: id.nullable(), unreadCount: count, revision })
  .strict()
  .refine(v => v.throughId !== null || v.unreadCount === 0);
export const accountNotificationsWorkspace = z
  .object({
    actorId: id,
    scope: z.literal("account"),
    source: z.literal("local_notifications"),
    checkedAt: z.string().datetime(),
    filters: accountNotificationsInput,
    totals: z
      .object({ total: count, unread: count, read: count, unknown: count })
      .strict(),
    markAll: accountNotificationsMarkAll,
    items: z.array(accountNotificationRecord).max(50),
    hasNext: z.boolean(),
  })
  .strict()
  .superRefine((v, c) => {
    const fail = () =>
      c.addIssue({
        code: "custom",
        message: "inconsistent_notification_workspace",
      });
    if (
      v.totals.total !== v.totals.read + v.totals.unread + v.totals.unknown ||
      v.items.length !==
        Math.min(
          v.filters.pageSize,
          Math.max(
            0,
            v.totals.total - (v.filters.page - 1) * v.filters.pageSize
          )
        ) ||
      v.hasNext !== v.filters.page * v.filters.pageSize < v.totals.total ||
      new Set(v.items.map(i => i.id)).size !== v.items.length ||
      v.totals.unread > v.markAll.unreadCount
    )
      fail();
    for (const state of accountNotificationStates) {
      if (
        v.items.filter(i => i.state === state).length > v.totals[state] ||
        (v.filters.state !== "all" &&
          v.filters.state !== state &&
          v.totals[state] !== 0)
      )
        fail();
    }
  });
export const accountNotificationDetailInput = z.object({ id }).strict();
export const accountNotificationDetail = z
  .object({
    actorId: id,
    id,
    scope: z.literal("account"),
    state: z.enum(["found", "missing"]),
    record: accountNotificationRecord.nullable(),
  })
  .strict()
  .refine(
    v =>
      (v.state === "found") === (v.record !== null) &&
      (!v.record || v.record.id === v.id)
  );
export const accountNotificationAction = z
  .object({
    id,
    expectedRevision: revision,
    action: z.enum(["read", "delete"]),
    reviewed: z.literal(true),
  })
  .strict();
export const accountNotificationActionResult = z
  .object({
    outcome: z.enum(["read", "already_read", "deleted"]),
    detail: accountNotificationDetail,
  })
  .strict()
  .refine(v =>
    v.outcome === "deleted"
      ? v.detail.state === "missing"
      : v.detail.record?.state === "read"
  );
export const accountNotificationsReadAllInput = z
  .object({
    throughId: id,
    unreadCount: count.min(1),
    expectedRevision: revision,
    reviewed: z.literal(true),
  })
  .strict();
export const accountNotificationsReadAllResult = z
  .object({
    actorId: id,
    scope: z.literal("account"),
    throughId: id,
    changed: count,
    remainingUnread: count,
  })
  .strict();
export type AccountNotificationRecord = z.infer<
  typeof accountNotificationRecord
>;
