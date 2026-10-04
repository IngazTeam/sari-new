import { z } from 'zod';
export const teamInviteEmail = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform(value => value.toLowerCase());
export const teamRoles = [
  'owner',
  'manager',
  'sales_supervisor',
  'viewer',
] as const;
export const teamWorkspaceSchema = z
  .object({
    actorId: z.number().int().positive(),
    merchantId: z.number().int().positive(),
    actorRole: z.enum(teamRoles),
    canManageOwners: z.boolean(),
    members: z
      .array(
        z
          .object({
            id: z.number().int().positive().nullable(),
            userId: z.number().int().positive(),
            role: z.enum(teamRoles).nullable(),
            userName: z.string().max(500).nullable(),
            userEmail: z.string().max(320).nullable(),
            isActive: z.literal(1),
            accountActive: z.boolean(),
            legacy: z.boolean(),
            acceptedAt: z.string().datetime().nullable(),
          })
          .strict()
      )
      .max(500),
    hasMoreMembers: z.boolean(),
    invitations: z
      .array(
        z
          .object({
            id: z.number().int().positive(),
            email: z.string().max(320),
            role: z.enum(teamRoles).nullable(),
            status: z.enum(['pending', 'expired']),
            expiresAt: z.string().datetime().nullable(),
            createdAt: z.string().datetime().nullable(),
          })
          .strict()
      )
      .max(100),
    hasMoreInvitations: z.boolean(),
    counts: z
      .object({
        members: z.number().int().nonnegative(),
        owners: z.number().int().nonnegative(),
        pending: z.number().int().nonnegative(),
        expired: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type TeamWorkspace = z.infer<typeof teamWorkspaceSchema>;
