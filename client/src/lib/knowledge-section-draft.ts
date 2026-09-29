import { z } from "zod";
import { knowledgeSectionType } from "../../../shared/knowledge-plan";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
export const SECTION_DRAFT_PREFIX = "sary:section-draft:v1:";
const ageLimit = 24 * 60 * 60 * 1000;
const schema = z
  .object({
    version: z.literal(1),
    savedAt: z.number().int().positive(),
    id: z.number().int().positive().nullable(),
    title: z.string().max(500),
    content: z.string().max(50000),
    useInBot: z.boolean(),
    sectionType: knowledgeSectionType,
    parentId: z.number().int().positive().nullable(),
    requestId: z.string().uuid(),
    revision: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    phase: z.enum(["editing", "submitting", "uncertain"]),
  })
  .strict();
export type SectionDraftSnapshot = z.infer<typeof schema>;
function key(scope: string) {
  if (!/^[1-9]\d*:[1-9]\d*:sections$/.test(scope))
    throw Error("Invalid draft scope");
  return SECTION_DRAFT_PREFIX + scope;
}
export function readSectionDraft(scope: string): SectionDraftSnapshot | null {
  const name = key(scope),
    raw = sessionStorage.getItem(name);
  if (!raw) return null;
  try {
    if (raw.length > 310000) throw Error("Draft too large");
    const parsed = schema.parse(JSON.parse(raw));
    if (
      Date.now() - parsed.savedAt > ageLimit ||
      parsed.savedAt > Date.now() + 60000
    )
      throw Error("Expired draft");
    return parsed;
  } catch {
    sessionStorage.removeItem(name);
    return null;
  }
}
export function writeSectionDraft(
  scope: string,
  value: SectionDraftSnapshot,
  epoch: number
) {
  if (knowledgeCacheEpoch() !== epoch) throw Error("Session changed");
  const name = key(scope),
    text = JSON.stringify(schema.parse(value));
  sessionStorage.setItem(name, text);
  if (sessionStorage.getItem(name) !== text)
    throw Error("Draft storage unavailable");
}
export function forgetSectionDraft(scope: string) {
  sessionStorage.removeItem(key(scope));
}
