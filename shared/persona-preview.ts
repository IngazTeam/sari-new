import { z } from "zod";
const message = z.string().trim().min(1).max(2000);
export const personaPreviewInput = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("manual"),
      agentId: z.number().int().positive().max(2147483647),
      message,
    })
    .strict(),
  z
    .object({
      mode: z.literal("automatic"),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      message,
    })
    .strict(),
]);
export type PersonaPreviewInput = z.infer<typeof personaPreviewInput>;
export interface PreviewPersona {
  id: number;
  name: string;
  role: string;
  department: string | null;
  personalityPrompt: string;
  tone: string;
}
