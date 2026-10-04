import { z } from "zod";
const id = z.number().int().positive().max(2147483647),
  hash = z.string().regex(/^[a-f0-9]{64}$/);
export const pushSubscriptionInput = z
  .object({
    endpoint: z.string().min(1).max(4096),
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
    userAgent: z.string().max(500).optional(),
    reviewed: z.literal(true),
  })
  .strict();
export const pushDeviceInput = z
  .object({ deviceHash: hash.nullable() })
  .strict();
export const pushUnsubscribeInput = z
  .object({ deviceHash: hash, reviewed: z.literal(true) })
  .strict();
export const pushTestInput = z
  .object({
    deviceHash: hash,
    requestId: z.string().uuid(),
    reviewed: z.literal(true),
    language: z.enum(["ar", "en"]),
  })
  .strict();
export const pushTestResult = z
  .object({
    actorId: id,
    merchantId: id,
    requestId: z.string().uuid(),
    state: z.enum(["accepted", "rejected", "unknown", "blocked"]),
  })
  .strict();
export const pushWorkspace = z
  .object({
    actorId: id,
    merchantId: id,
    canManage: z.boolean(),
    publicKey: z.string().nullable(),
    deviceHash: hash.nullable(),
    deviceEnabled: z.boolean(),
    checkedAt: z.string().datetime(),
    counts: z
      .object({
        total: z.number().int().nonnegative(),
        accepted: z.number().int().nonnegative(),
        rejected: z.number().int().nonnegative(),
        unconfirmed: z.number().int().nonnegative(),
      })
      .strict(),
    logs: z
      .array(
        z
          .object({
            id,
            title: z.string().max(255),
            body: z.string().max(1000),
            state: z.enum([
              "accepted",
              "rejected",
              "unknown",
              "blocked",
              "legacy",
            ]),
            createdAt: z.string().datetime().nullable(),
          })
          .strict()
      )
      .max(20),
  })
  .strict();
export type PushWorkspace = z.infer<typeof pushWorkspace>;
