import { z } from "zod";
import type { AssistantSettingsDraft } from "@shared/assistant-settings-draft";

export type CachedAssistantDraft = {
  base: AssistantSettingsDraft;
  draft: AssistantSettingsDraft;
  revision: string;
  section: string;
  submitted?: boolean;
};
const text = z.string().max(100000);
const fields = z
  .object({
    autoReplyEnabled: z.boolean(),
    workingHoursEnabled: z.boolean(),
    workingHoursStart: text,
    workingHoursEnd: text,
    workingDays: text,
    welcomeMessage: text,
    outOfHoursMessage: text,
    responseDelay: z.number().finite().nullable(),
    maxResponseLength: z.number().finite().nullable(),
    tone: z.enum(["friendly", "professional", "casual", "enthusiastic"]),
    style: z.enum(["saudi_dialect", "formal_arabic", "english", "bilingual"]),
    emojiUsage: z.enum(["none", "minimal", "moderate", "frequent"]),
    personalityInstructions: text,
    brandVoice: text,
    language: z.enum(["ar", "en", "fr", "tr", "es", "it", "both"]),
    customInstructions: text.nullable(),
    groupMode: z.enum([
      "disabled",
      "mention_only",
      "keyword_only",
      "private_redirect",
    ]),
    groupKeywords: text,
    groupRedirectMessage: text,
  })
  .strict();
const schema = z
  .object({
    version: z.literal(1),
    scope: z.string(),
    updatedAt: z.number().finite(),
    value: z
      .object({
        base: fields,
        draft: fields,
        revision: z.string().regex(/^[a-f0-9]{64}$/),
        section: z.enum(["basics", "schedule", "groups", "sales", "preview"]),
        submitted: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();
type Stored = z.infer<typeof schema>;
export type AssistantDraftRead =
  | { state: "ready"; value: CachedAssistantDraft; persisted: boolean }
  | { state: "missing" | "unavailable" | "invalid" | "expired" };
const prefix = "sary:assistant-settings-draft:v1:";
const drafts = new Map<string, { record: Stored; persisted: boolean }>();
let epoch = 0;
export const assistantDraftEpoch = () => epoch;
const warnBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!Array.from(drafts.values()).some(draft => !draft.persisted)) return;
  event.preventDefault();
  event.returnValue = "";
};
export function assistantDraftKey(userId: number, merchantId: number) {
  return `${userId}:${merchantId}`;
}
const validKey = (key: string) => /^[1-9]\d*:[1-9]\d*$/.test(key);
const decode = (value: z.infer<typeof fields>): AssistantSettingsDraft => ({
  ...value,
  responseDelay: value.responseDelay ?? NaN,
  maxResponseLength: value.maxResponseLength ?? NaN,
});
export function readAssistantDraftStatus(
  key: string,
  now = Date.now()
): AssistantDraftRead {
  if (!validKey(key)) return { state: "invalid" };
  const cached = drafts.get(key);
  let value: unknown;
  if (cached) value = cached.record;
  else {
    let raw: string | null;
    try {
      raw = sessionStorage.getItem(prefix + key);
    } catch {
      return { state: "unavailable" };
    }
    if (!raw) return { state: "missing" };
    try {
      value = JSON.parse(raw);
    } catch {
      return { state: "invalid" };
    }
  }
  const parsed = schema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.scope !== key ||
    parsed.data.updatedAt > now + 60000
  )
    return { state: "invalid" };
  if (now - parsed.data.updatedAt >= 86400000) return { state: "expired" };
  const stored = parsed.data.value;
  return {
    state: "ready",
    value: {
      ...stored,
      base: decode(stored.base),
      draft: decode(stored.draft),
    },
    persisted: cached?.persisted ?? true,
  };
}
export function readAssistantDraft(key: string) {
  const read = readAssistantDraftStatus(key);
  return read.state === "ready" ? read.value : null;
}
export function cacheAssistantDraft(
  key: string,
  draft: CachedAssistantDraft,
  expectedEpoch = epoch,
  now = Date.now()
) {
  if (expectedEpoch !== epoch || !validKey(key)) return false;
  // Null preserves an empty numeric control; restore decodes it back to NaN.
  const parsed = schema.safeParse(
    JSON.parse(
      JSON.stringify({ version: 1, scope: key, updatedAt: now, value: draft })
    )
  );
  if (!parsed.success) return false;
  const serialized = JSON.stringify(parsed.data);
  if (serialized.length > 2000000) return false;
  let persisted = false;
  try {
    sessionStorage.setItem(prefix + key, serialized);
    persisted = sessionStorage.getItem(prefix + key) === serialized;
  } catch {
    /* Preserve this tab's in-memory copy. */
  }
  if (!drafts.size) window.addEventListener("beforeunload", warnBeforeUnload);
  drafts.set(key, { record: structuredClone(parsed.data), persisted });
  return persisted;
}
export function discardAssistantDraft(key: string, expectedEpoch = epoch) {
  if (expectedEpoch !== epoch) return false;
  drafts.delete(key);
  if (!drafts.size)
    window.removeEventListener("beforeunload", warnBeforeUnload);
  try {
    sessionStorage.removeItem(prefix + key);
    return sessionStorage.getItem(prefix + key) === null;
  } catch {
    return false;
  }
}
export function clearAssistantDrafts() {
  epoch++;
  drafts.clear();
  window.removeEventListener("beforeunload", warnBeforeUnload);
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, i) =>
      sessionStorage.key(i)
    );
    for (const key of keys)
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
  } catch {
    /* Storage can be inaccessible. Account scopes remain independent. */
  }
}
export function hasAssistantDrafts() {
  if (drafts.size) return true;
  try {
    return Array.from({ length: sessionStorage.length }, (_, i) =>
      sessionStorage.key(i)
    ).some(key => key?.startsWith(prefix));
  } catch {
    return false;
  }
}
