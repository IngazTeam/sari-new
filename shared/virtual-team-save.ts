import { z } from "zod";
import { parseAgentKeywords, virtualAgentTones } from "./virtual-agent-form";

const id = z.number().int().min(1).max(2147483647);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.union([
  z.literal(""),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
]);
export const virtualTeamSaveDraft = z
  .object({
    name: z.string().trim().min(1).max(100),
    role: z.string().trim().min(1).max(100),
    department: z.string().trim().max(100),
    personalityPrompt: z.string().trim().min(1).max(2000),
    tone: z.enum(virtualAgentTones),
    avatarEmoji: z.string().min(1).max(10),
    isDefault: z.boolean(),
    isActive: z.boolean(),
    triggerKeywords: z
      .array(z.string().trim().min(1).max(2000))
      .max(1000)
      .transform(parseAgentKeywords)
      .refine(value => JSON.stringify(value).length <= 2000),
    shiftStart: time,
    shiftEnd: time,
  })
  .strict()
  .refine(
    value =>
      Boolean(value.shiftStart) === Boolean(value.shiftEnd) &&
      (!value.shiftStart || value.shiftStart !== value.shiftEnd),
    { path: ["shiftStart"] }
  );

export const virtualTeamSaveReceiptInput = z
  .object({
    merchantId: id,
    requestId: z
      .string()
      .uuid()
      .transform(value => value.toLowerCase()),
  })
  .strict();
export const virtualTeamSaveInput = virtualTeamSaveReceiptInput
  .extend({
    editing: id.nullable(),
    expectedRevision: revision,
    draft: virtualTeamSaveDraft,
  })
  .strict();
export const virtualTeamSaveReceipt = virtualTeamSaveReceiptInput
  .extend({
    actorId: id,
    operation: z.enum(["create", "update"]),
    personaId: id,
    reviewedRevision: revision,
    revisionAfter: revision,
    savedAt: z.string().datetime(),
  })
  .strict();
export type VirtualTeamSaveInput = z.infer<typeof virtualTeamSaveInput>;
export type VirtualTeamSaveReceipt = z.infer<typeof virtualTeamSaveReceipt>;
