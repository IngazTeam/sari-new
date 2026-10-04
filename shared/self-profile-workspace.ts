import { z } from "zod";
export const selfProfileName = z.string().trim().min(2).max(120);
export const selfProfileEmail = z.string().email().max(320).nullable();
export const selfProfileWorkspace = z
  .object({
    actorId: z.number().int().positive().max(2147483647),
    name: selfProfileName.nullable(),
    email: selfProfileEmail,
    emailVerified: z.boolean().nullable(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.email === null && d.emailVerified !== null)
      ctx.addIssue({
        code: "custom",
        message: "Missing email cannot be verified",
      });
  });
export const selfProfileRename = z
  .object({
    name: selfProfileName,
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const selfProfileRenameResult = z
  .object({ changed: z.boolean(), workspace: selfProfileWorkspace })
  .strict();
export type SelfProfileWorkspace = z.infer<typeof selfProfileWorkspace>;
