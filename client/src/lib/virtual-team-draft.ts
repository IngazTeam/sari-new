import { z } from "zod";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
import { virtualAgentTones } from "@shared/virtual-agent-form";
import {
  virtualTeamSaveInput,
  virtualTeamSaveDraft,
} from "@shared/virtual-team-save";

const draft = z
  .object({
    name: z.string().max(100000),
    role: z.string().max(100000),
    department: z.string().max(100000),
    personalityPrompt: z.string().max(100000),
    tone: z.enum(virtualAgentTones),
    avatarEmoji: z.string().max(1000),
    isDefault: z.boolean(),
    isActive: z.boolean(),
    triggerKeywords: z.array(z.string().max(2000)).max(1000),
    shiftStart: z.string().max(100),
    shiftEnd: z.string().max(100),
  })
  .strict();
const record = z
  .object({
    version: z.literal(1),
    scope: z.string(),
    updatedAt: z.number().finite(),
    editing: z.number().int().positive().nullable(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    base: draft,
    form: draft,
    keywords: z.string().max(100000),
    tab: z.enum(["identity", "routing"]),
    submitted: z.boolean(),
    attempt: virtualTeamSaveInput.optional(),
  })
  .strict()
  .refine(value => {
    if (!value.attempt) return true;
    const form = virtualTeamSaveDraft.safeParse(value.form);
    return (
      value.submitted &&
      value.keywords === "" &&
      form.success &&
      JSON.stringify(form.data) === JSON.stringify(value.attempt.draft) &&
      value.attempt.merchantId === Number(value.scope.split(":")[1]) &&
      value.attempt.editing === value.editing &&
      value.attempt.expectedRevision === value.revision
    );
  });
export type VirtualTeamDraft = z.infer<typeof record>;
export type VirtualTeamDraftRead =
  | { state: "ready"; value: VirtualTeamDraft; persisted: boolean }
  | { state: "missing" | "invalid" | "expired" | "unavailable" };
const prefix = "sary:virtual-team-draft:v1:",
  lifetime = 24 * 60 * 60 * 1000;
const memory = new Map<
  string,
  { value: VirtualTeamDraft; epoch: number; persisted: boolean }
>();
const validScope = (scope: string) =>
  /^[1-9]\d*:[1-9]\d*:virtual-team$/.test(scope);
export function readVirtualTeamDraft(
  scope: string,
  now = Date.now()
): VirtualTeamDraftRead {
  if (!validScope(scope)) return { state: "invalid" };
  const cached = memory.get(scope);
  if (cached && cached.epoch !== knowledgeCacheEpoch()) memory.delete(scope);
  let value: unknown,
    persisted = true;
  if (cached?.epoch === knowledgeCacheEpoch()) {
    value = cached.value;
    persisted = cached.persisted;
  } else {
    let raw: string | null;
    try {
      raw = sessionStorage.getItem(prefix + scope);
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
  const parsed = record.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.scope !== scope ||
    parsed.data.updatedAt > now + 60000
  )
    return { state: "invalid" };
  if (now - parsed.data.updatedAt >= lifetime) return { state: "expired" };
  return { state: "ready", value: structuredClone(parsed.data), persisted };
}
export function writeVirtualTeamDraft(
  scope: string,
  input: Omit<VirtualTeamDraft, "version" | "scope" | "updatedAt">,
  epoch: number,
  now = Date.now()
): boolean {
  if (epoch !== knowledgeCacheEpoch() || !validScope(scope)) return false;
  const value = { ...input, version: 1 as const, scope, updatedAt: now };
  const parsed = record.safeParse(value);
  if (!parsed.success) return false;
  const serialized = JSON.stringify(parsed.data);
  if (serialized.length > 500000) return false;
  let persisted = false;
  try {
    sessionStorage.setItem(prefix + scope, serialized);
    persisted = sessionStorage.getItem(prefix + scope) === serialized;
  } catch {
    /* Retain the full draft in memory while this page remains loaded. */
  }
  memory.set(scope, { value: structuredClone(parsed.data), epoch, persisted });
  return persisted;
}
export function discardVirtualTeamDraft(
  scope: string,
  epoch = knowledgeCacheEpoch()
) {
  if (epoch !== knowledgeCacheEpoch()) return false;
  memory.delete(scope);
  try {
    sessionStorage.removeItem(prefix + scope);
    return true;
  } catch {
    return false;
  }
}
