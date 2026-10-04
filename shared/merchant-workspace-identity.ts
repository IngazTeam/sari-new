import { z } from "zod";
export const merchantWorkspaceIdentity = z
  .object({
    id: z.number().int().positive().max(2147483647),
    actorId: z.number().int().positive().max(2147483647),
  })
  .strict();
