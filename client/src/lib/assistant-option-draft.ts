import { z } from "zod";
import {
  assistantLanguages,
  takeoverDraftSchema,
} from "@shared/assistant-options";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";

const common = {
  version: z.literal(1),
  scope: z.string(),
  updatedAt: z.number().finite(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  submitted: z.boolean(),
};
const language = z.object({ language: z.enum(assistantLanguages) }).strict();
const takeover = z
  .object({
    takeoverTimeoutMinutes: z.number().finite().nullable(),
    takeoverCommandsEnabled: z.boolean(),
  })
  .strict();
const schema = z.discriminatedUnion("kind", [
  z
    .object({
      ...common,
      kind: z.literal("language"),
      base: language,
      form: language,
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("takeover"),
      base: takeoverDraftSchema,
      form: takeover,
    })
    .strict(),
]);
export type AssistantOptionDraft = z.infer<typeof schema>;
export type AssistantOptionDraftRead =
  | { state: "ready"; value: AssistantOptionDraft; persisted: boolean }
  | { state: "missing" | "invalid" | "expired" | "unavailable" };
const prefix = "sary:assistant-option-draft:v1:";
const memory = new Map<
  string,
  { value: AssistantOptionDraft; epoch: number; persisted: boolean }
>();
const scopeMatches = (scope: string, kind: string) =>
  new RegExp(
    `^[1-9]\\d*:[1-9]\\d*:${kind === "language" ? "assistant-language" : "human-takeover"}$`
  ).test(scope);

export function readAssistantOptionDraft(
  scope: string,
  kind: "language" | "takeover",
  now = Date.now()
): AssistantOptionDraftRead {
  if (!scopeMatches(scope, kind)) return { state: "invalid" };
  const cached = memory.get(scope);
  if (cached && cached.epoch !== knowledgeCacheEpoch()) memory.delete(scope);
  let value: unknown,
    persisted = true;
  if (cached?.epoch === knowledgeCacheEpoch()) {
    value = cached.value;
    persisted = cached.persisted;
  } else {
    try {
      const raw = sessionStorage.getItem(prefix + scope);
      if (!raw) return { state: "missing" };
      try {
        value = JSON.parse(raw);
      } catch {
        return { state: "invalid" };
      }
    } catch {
      return { state: "unavailable" };
    }
  }
  const parsed = schema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.scope !== scope ||
    parsed.data.kind !== kind ||
    parsed.data.updatedAt > now + 60000
  )
    return { state: "invalid" };
  if (now - parsed.data.updatedAt >= 86400000) return { state: "expired" };
  return { state: "ready", value: structuredClone(parsed.data), persisted };
}

export function writeAssistantOptionDraft(
  scope: string,
  kind: "language" | "takeover",
  input: { base: unknown; form: unknown; revision: string; submitted: boolean },
  epoch: number,
  now = Date.now()
) {
  if (epoch !== knowledgeCacheEpoch() || !scopeMatches(scope, kind))
    return false;
  // An empty numeric field is NaN in the editor. Keep it empty across reloads.
  const parsed = schema.safeParse(
    JSON.parse(
      JSON.stringify({ ...input, kind, version: 1, scope, updatedAt: now })
    )
  );
  if (!parsed.success) return false;
  const serialized = JSON.stringify(parsed.data);
  let persisted = false;
  try {
    sessionStorage.setItem(prefix + scope, serialized);
    persisted = sessionStorage.getItem(prefix + scope) === serialized;
  } catch {
    /* Keep the local draft in memory. */
  }
  memory.set(scope, { value: structuredClone(parsed.data), epoch, persisted });
  return persisted;
}

export function discardAssistantOptionDraft(
  scope: string,
  epoch = knowledgeCacheEpoch()
) {
  if (epoch !== knowledgeCacheEpoch()) return false;
  memory.delete(scope);
  try {
    sessionStorage.removeItem(prefix + scope);
    return sessionStorage.getItem(prefix + scope) === null;
  } catch {
    return false;
  }
}

export function restoreAssistantOptionForm(value: AssistantOptionDraft) {
  return value.kind === "language"
    ? value.form
    : {
        ...value.form,
        takeoverTimeoutMinutes: value.form.takeoverTimeoutMinutes ?? NaN,
      };
}
