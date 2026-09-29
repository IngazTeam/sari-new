import { z } from "zod";

export const assistantLanguages = [
  "ar",
  "en",
  "fr",
  "tr",
  "es",
  "it",
  "both",
] as const;
export const takeoverDraftSchema = z
  .object({
    takeoverTimeoutMinutes: z.number().int().min(5).max(120),
    takeoverCommandsEnabled: z.boolean(),
  })
  .strict();
export type TakeoverDraft = z.infer<typeof takeoverDraftSchema>;
export function takeoverDraft(value: Record<string, unknown>): TakeoverDraft {
  return {
    takeoverTimeoutMinutes: Number(value.takeoverTimeoutMinutes ?? 15),
    takeoverCommandsEnabled:
      value.takeoverCommandsEnabled == null
        ? true
        : Boolean(value.takeoverCommandsEnabled),
  };
}
const expectedRevision = z.string().regex(/^[a-f0-9]{64}$/);
export const assistantOptionInput = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("takeover"),
      expectedRevision,
      draft: takeoverDraftSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("language"),
      expectedRevision,
      language: z.enum(assistantLanguages),
    })
    .strict(),
]);

export function takeoverExpiry(expiresAt: string | Date | null, now: number) {
  if (!expiresAt) return { state: "manual" as const, minutes: null };
  // MySQL string-mode timestamps are UTC but omit the zone. Normalize to ISO
  // before parsing so Safari and a merchant's local zone give the same countdown.
  const normalized =
    typeof expiresAt === "string" &&
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(expiresAt)
      ? expiresAt.replace(" ", "T") + "Z"
      : expiresAt;
  const expires = new Date(normalized).getTime();
  if (!Number.isFinite(expires))
    return { state: "unknown" as const, minutes: null };
  return expires <= now
    ? { state: "waiting" as const, minutes: 0 }
    : { state: "timed" as const, minutes: Math.ceil((expires - now) / 60000) };
}
