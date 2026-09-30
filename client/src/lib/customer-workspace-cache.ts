import { z } from "zod";
import { customerKeyInput } from "@shared/customer-workspace";
import {
  customerAnnotationWrite,
  customerTags,
} from "@shared/customer-annotations";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
const draft = z
  .object({
    note: z.string().max(2000),
    newTag: z.string().max(40).optional(),
    tags: z
      .object({
        values: customerTags,
        baseline: customerTags,
        revision: z.number().int().nonnegative().safe(),
      })
      .strict()
      .optional(),
  })
  .strict();
const entry = z
  .object({
    savedAt: z.number().finite(),
    draft,
    attempt: customerAnnotationWrite.optional(),
  })
  .strict();
export type CustomerDraft = z.infer<typeof draft>;
export type CustomerCache = Omit<z.infer<typeof entry>, "savedAt">;
const prefix = "sary:customer-draft:v1:";
function storageKey(scope: string, key: string) {
  if (!/^\d+:\d+:customers$/.test(scope)) throw Error("Invalid customer scope");
  return prefix + scope + ":" + encodeURIComponent(customerKeyInput.parse(key));
}
function checked(raw: unknown, key: string) {
  const value = entry.parse(raw);
  if (value.attempt && value.attempt.key !== key)
    throw Error("Customer attempt mismatch");
  if (
    value.attempt?.kind === "note" &&
    value.draft.note.trim() !== value.attempt.content
  )
    throw Error("Customer note attempt mismatch");
  if (
    value.attempt?.kind === "tags" &&
    (!value.draft.tags ||
      value.draft.tags.revision !== value.attempt.expectedRevision ||
      JSON.stringify(value.draft.tags.values) !==
        JSON.stringify(value.attempt.tags))
  )
    throw Error("Customer tag attempt mismatch");
  return value;
}
export function readCustomerCache(scope: string, key: string): CustomerCache {
  const name = storageKey(scope, key),
    raw = sessionStorage.getItem(name);
  if (!raw) return { draft: { note: "" } };
  if (raw.length > 16000) throw Error("Invalid customer cache");
  const value = checked(JSON.parse(raw), key);
  if (
    !value.attempt &&
    (value.savedAt > Date.now() || Date.now() - value.savedAt > 86400000)
  ) {
    sessionStorage.removeItem(name);
    return { draft: { note: "" } };
  }
  return { draft: value.draft, attempt: value.attempt };
}
export function saveCustomerCache(
  scope: string,
  key: string,
  value: CustomerCache,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const raw = JSON.stringify(checked({ ...value, savedAt: Date.now() }, key));
  if (raw.length > 16000) throw Error("Invalid customer cache");
  const name = storageKey(scope, key);
  sessionStorage.setItem(name, raw);
  if (sessionStorage.getItem(name) !== raw)
    throw Error("Customer cache unavailable");
}
export function clearCustomerCache(scope: string, key: string, epoch: number) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const name = storageKey(scope, key);
  sessionStorage.removeItem(name);
  if (sessionStorage.getItem(name) !== null)
    throw Error("Customer cache cleanup unavailable");
}
export function customerKeyFromPath(pathname: string) {
  const prefix = "/merchant/customers/";
  if (!pathname.startsWith(prefix)) return null;
  try {
    return customerKeyInput.parse(
      decodeURIComponent(pathname.slice(prefix.length))
    );
  } catch {
    return null;
  }
}
