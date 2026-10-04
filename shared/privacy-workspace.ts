import { z } from 'zod';
const id = z.number().int().positive(),
  date = z.string().datetime().nullable();
export const privacyRequestTypes = [
  'access',
  'correction',
  'objection',
  'export',
  'deletion',
  'withdraw_consent',
] as const;
export const privacyRequestStates = [
  'pending',
  'processing',
  'completed',
  'rejected',
  'requires_review',
  'failed',
] as const;
export const privacyWorkspace = z
  .object({
    actorId: id,
    scope: z.literal('account'),
    marketingConsent: z.boolean().nullable(),
    marketingStatus: z.enum(['default', 'saved', 'invalid']),
    canVerifyPassword: z.boolean(),
    responseDays: z.number().int().positive(),
    graceHours: z.number().int().positive(),
    ownedStores: z
      .array(
        z
          .object({ id, name: z.string().max(500), shared: z.boolean() })
          .strict()
      )
      .max(50),
    hasMoreStores: z.boolean(),
    isAdmin: z.boolean(),
    requests: z
      .array(
        z
          .object({
            id,
            requestType: z.enum(privacyRequestTypes).nullable(),
            status: z.enum(privacyRequestStates).nullable(),
            requestedAt: date,
            dueAt: date,
            completedAt: date,
            rejectionReason: z.string().max(500).nullable(),
          })
          .strict()
      )
      .max(20),
  })
  .strict();
export type PrivacyWorkspace = z.infer<typeof privacyWorkspace>;
