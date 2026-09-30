import { z } from "zod";
import {
  productFileAdviceInput,
  productFileAdviceReceipt,
} from "@shared/product-file-advice";
import { importOptionsSchema } from "./product-import-workspace";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
const prefix = "sary:product-file-advice:v1:";
const reference = z
  .object({
    requestId: z.string().uuid(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    fileName: z.string().min(1).max(255),
    intent: z.enum(["auto", "products", "services"]),
    language: z.enum(["ar", "en"]),
    options: importOptionsSchema,
  })
  .strict();
export type FileAdviceReference = z.infer<typeof reference>;
function key(scope: string) {
  if (!/^[1-9]\d*:[1-9]\d*:product-import$/.test(scope))
    throw Error("Invalid advice scope");
  return prefix + scope;
}
export function readAdviceReference(scope: string) {
  const raw = sessionStorage.getItem(key(scope));
  if (!raw) return null;
  if (raw.length > 100000) throw Error("Invalid advice reference");
  return reference.parse(JSON.parse(raw));
}
export function saveAdviceReference(
  scope: string,
  value: FileAdviceReference,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const raw = JSON.stringify(reference.parse(value));
  sessionStorage.setItem(key(scope), raw);
  if (sessionStorage.getItem(key(scope)) !== raw)
    throw Error("Advice recovery unavailable");
}
export function clearAdviceReference(scope: string, epoch: number) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  sessionStorage.removeItem(key(scope));
  if (sessionStorage.getItem(key(scope)) !== null)
    throw Error("Advice cleanup unavailable");
}
export async function fingerprintAdviceInput(raw: unknown) {
  const bytes = new TextEncoder().encode(
      JSON.stringify(productFileAdviceInput.parse(raw))
    ),
    digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b =>
    b.toString(16).padStart(2, "0")
  ).join("");
}
export function checkedAdviceReceipt(
  raw: unknown,
  scope: string,
  requestId: string
) {
  const r = productFileAdviceReceipt.parse(raw),
    [actor, merchant] = scope.split(":").map(Number);
  if (
    r.actorId !== actor ||
    r.merchantId !== merchant ||
    r.requestId !== requestId
  )
    throw Error("Advice receipt mismatch");
  return r;
}
