import { z } from "zod";
const message = z.string().trim().min(1).max(2000);
export const personaPreviewHistory = z
  .array(
    z
      .object({
        role: z.enum(["user", "assistant"]),
        content: z
          .string()
          .min(1)
          .max(5000)
          .refine(text => !!text.trim() && !text.includes("\u0000")),
      })
      .strict()
  )
  .max(20)
  .refine(
    history =>
      history.reduce((length, item) => length + item.content.length, 0) <= 16000
  );
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
      history: personaPreviewHistory.default([]),
      historyTruncated: z.boolean().default(false),
      currentAgentId: z
        .number()
        .int()
        .positive()
        .max(2147483647)
        .nullable()
        .optional(),
    })
    .strict(),
]);
export type PersonaPreviewInput = z.infer<typeof personaPreviewInput>;
export class PersonaPreviewUnavailable extends Error {}
export interface PreviewPersona {
  id: number;
  name: string;
  role: string;
  department: string | null;
  personalityPrompt: string;
  tone: string;
}
export type PreviewPersonaSelection = {
  id: number;
  name: string;
  role: string;
  isActive: boolean;
  reason: "manual" | "context" | "current" | "default" | "order";
};

/** Keep complete messages, with the same bounds as the server contract. */
export function appendPersonaPreviewHistory(
  history: z.infer<typeof personaPreviewHistory>,
  message: string,
  response: string
) {
  const next: z.infer<typeof personaPreviewHistory> = [
    ...history,
    { role: "user", content: message },
    { role: "assistant", content: response },
  ];
  while (
    next.length > 20 ||
    next.reduce((length, item) => length + item.content.length, 0) > 16000
  )
    next.shift();
  // Do not begin the next context with a detached assistant answer.
  if (next[0]?.role === "assistant") next.shift();
  return next;
}
