import { z } from "zod";

/** Accept old comma lists and JSON arrays without allowing empty catch-all terms. */
export function quickResponseKeywords(
  value: string | null | undefined
): string[] {
  if (!value?.trim()) return [];
  let items: unknown[];
  try {
    const parsed = JSON.parse(value);
    items = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "string"
        ? [parsed]
        : typeof parsed === "number" || typeof parsed === "boolean"
          ? [value]
          : [];
  } catch {
    items = value.split(/[,،\n]/);
  }
  return Array.from(
    new Set(
      items
        .filter((item): item is string => typeof item === "string")
        .map(item => item.trim())
        .filter(Boolean)
    )
  );
}
export const quickResponseDraftSchema = z
  .object({
    trigger: z.string().trim().min(1).max(255),
    response: z.string().trim().min(1).max(2000),
    keywords: z.string().max(2000).default(""),
    priority: z.number().int().min(0).max(10).default(5),
    isActive: z.boolean().default(true),
  })
  .strict();
export type QuickResponseDraft = z.infer<typeof quickResponseDraftSchema>;
// Zod defaults inside a partial object may still materialize omitted values.
// Toggle requests must never reset priority, keywords or activation by omission.
export const quickResponsePatchSchema = quickResponseDraftSchema
  .partial()
  .extend({
    keywords: z.string().max(2000).optional(),
    priority: z.number().int().min(0).max(10).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export function quickResponseDraft(
  row: Record<string, any>
): QuickResponseDraft {
  return {
    trigger: row.trigger,
    response: row.response,
    keywords: quickResponseKeywords(row.keywords).join("، "),
    priority: row.priority ?? 5,
    isActive: Boolean(row.isActive),
  };
}
export const quickResponseRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
type Matchable = {
  id: number;
  trigger: string;
  keywords: string | null;
  priority: number;
  useCount: number;
  isActive: number | boolean;
};
/** Runtime and local match previews share ordering and matching; no model or send. */
export function matchQuickResponse<T extends Matchable>(
  rows: T[],
  message: string
): T | null {
  const text = message.trim().toLowerCase();
  if (!text) return null;
  const candidates = rows
    .filter(row => Boolean(row.isActive))
    .sort(
      (a, b) =>
        b.priority - a.priority || b.useCount - a.useCount || a.id - b.id
    );
  return (
    candidates.find(row => row.trigger.trim().toLowerCase() === text) ??
    candidates.find(row =>
      quickResponseKeywords(row.keywords).some(keyword =>
        text.includes(keyword.toLowerCase())
      )
    ) ??
    null
  );
}
