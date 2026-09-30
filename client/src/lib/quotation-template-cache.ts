import { z } from "zod";
import {
  templateDigest,
  templateWriteInput,
} from "@shared/quotation-templates";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
export const templateForm = z
  .object({
    name: z.string().max(256),
    headerImageUrl: z.string().max(501),
    footerText: z.string().max(5001),
    termsText: z.string().max(5001),
    isDefault: z.boolean(),
  })
  .strict();
export type TemplateForm = z.infer<typeof templateForm>;
export const blankTemplateForm = (): TemplateForm => ({
  name: "",
  headerImageUrl: "",
  footerText: "",
  termsText: "",
  isDefault: false,
});
export const templateDraft = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), form: templateForm }).strict(),
  z
    .object({
      mode: z.literal("update"),
      id: z.number().int().positive(),
      digest: templateDigest,
      form: templateForm,
    })
    .strict(),
]);
export type TemplateDraft = z.infer<typeof templateDraft>;
const entry = z
  .object({
    savedAt: z.number().finite(),
    draft: templateDraft.optional(),
    attempt: templateWriteInput.optional(),
  })
  .strict();
export type TemplateCache = Omit<z.infer<typeof entry>, "savedAt">;
const prefix = "sary:quotation-template:v1:";
function key(scope: string) {
  if (!/^\d+:\d+:quotation-templates$/.test(scope))
    throw Error("Invalid template scope");
  return prefix + scope;
}
export function readTemplateCache(scope: string): TemplateCache {
  const raw = sessionStorage.getItem(key(scope));
  if (!raw) return {};
  if (raw.length > 100000) throw Error("Invalid template cache");
  const parsed = entry.parse(JSON.parse(raw));
  // An uncertain server write must remain recoverable; never expire it into a new create request.
  if (
    !parsed.attempt &&
    (parsed.savedAt > Date.now() || Date.now() - parsed.savedAt > 86400000)
  ) {
    sessionStorage.removeItem(key(scope));
    return {};
  }
  return { draft: parsed.draft, attempt: parsed.attempt };
}
export function saveTemplateCache(
  scope: string,
  value: TemplateCache,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const raw = JSON.stringify(entry.parse({ ...value, savedAt: Date.now() }));
  sessionStorage.setItem(key(scope), raw);
  if (sessionStorage.getItem(key(scope)) !== raw)
    throw Error("Template draft unavailable");
}
export function clearTemplateCache(scope: string, epoch: number) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  sessionStorage.removeItem(key(scope));
  if (sessionStorage.getItem(key(scope)) !== null)
    throw Error("Template cleanup unavailable");
}
