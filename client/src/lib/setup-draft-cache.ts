import { z } from "zod";
import { setupProgressInput } from "@shared/setup-progress";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";

export const setupDraftPayload = setupProgressInput.omit({
  expectedDigest: true,
});
export type SetupDraftPayload = z.infer<typeof setupDraftPayload>;
const entrySchema = z
  .object({
    actorId: z.number().int().positive(),
    merchantId: z.number().int().positive(),
    baseDigest: z.string().regex(/^[a-f0-9]{64}$/),
    savedAt: z.number().int().nonnegative(),
    payload: setupDraftPayload,
  })
  .strict();
export type SetupDraftEntry = z.infer<typeof entrySchema>;
const prefix = "sary:setup-draft:v1:";
function key(actorId: number, merchantId: number) {
  if (![actorId, merchantId].every(id => Number.isSafeInteger(id) && id > 0))
    throw Error("Invalid setup scope");
  return `${prefix}${actorId}:${merchantId}`;
}
function canonical(value: any): any {
  return Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map(k => [k, canonical(value[k])])
        )
      : value;
}
export const sameSetupDraft = (a: SetupDraftPayload, b: SetupDraftPayload) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export function readSetupDraft(
  actorId: number,
  merchantId: number
): SetupDraftEntry | null {
  const raw = sessionStorage.getItem(key(actorId, merchantId));
  if (!raw) return null;
  if (raw.length > 1_100_000) throw Error("Invalid setup draft");
  const entry = entrySchema.parse(JSON.parse(raw));
  if (entry.actorId !== actorId || entry.merchantId !== merchantId)
    throw Error("Invalid setup scope");
  return entry;
}
export function rememberSetupDraft(entry: SetupDraftEntry, epoch: number) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const raw = JSON.stringify(entrySchema.parse(entry)),
    name = key(entry.actorId, entry.merchantId);
  // A corrupt backup must not be silently replaced by a new empty draft.
  readSetupDraft(entry.actorId, entry.merchantId);
  if (raw.length > 1_100_000) throw Error("Invalid setup draft");
  sessionStorage.setItem(name, raw);
  if (sessionStorage.getItem(name) !== raw)
    throw Error("Setup draft unavailable");
}
export function forgetSetupDraft(
  actorId: number,
  merchantId: number,
  expected: SetupDraftPayload,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const entry = readSetupDraft(actorId, merchantId);
  if (entry && sameSetupDraft(entry.payload, expected))
    sessionStorage.removeItem(key(actorId, merchantId));
}
