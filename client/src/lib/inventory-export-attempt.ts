import { z } from "zod";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
const scopeSchema = z.string().regex(/^[1-9]\d*:[1-9]\d*:data-sync$/);
const attemptSchema = z
  .object({
    scope: scopeSchema,
    attemptId: z.string().uuid(),
    spreadsheetId: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    startedAt: z.string().datetime(),
  })
  .strict();
export type InventoryExportAttempt = z.infer<typeof attemptSchema>;
const key = (scope: string) =>
  "sary:inventory-export:v1:" + scopeSchema.parse(scope);
const epochCheck = (epoch: number) => {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
};
export function readInventoryExportAttempt(
  scope: string
): InventoryExportAttempt | null {
  const raw = sessionStorage.getItem(key(scope));
  if (raw === null) return null;
  if (raw.length > 4096) throw Error("Invalid export reference");
  const attempt = attemptSchema.parse(JSON.parse(raw));
  if (attempt.scope !== scope) throw Error("Export reference scope mismatch");
  return attempt;
}
export function rememberInventoryExportAttempt(
  scope: string,
  raw: InventoryExportAttempt,
  epoch: number
) {
  epochCheck(epoch);
  const value = attemptSchema.parse(raw);
  if (value.scope !== scope || readInventoryExportAttempt(scope))
    throw Error("Unresolved export");
  const text = JSON.stringify(value);
  sessionStorage.setItem(key(scope), text);
  if (sessionStorage.getItem(key(scope)) !== text)
    throw Error("Export recovery unavailable");
  return value;
}
export function forgetInventoryExportAttempt(
  scope: string,
  attemptId: string,
  epoch: number
) {
  epochCheck(epoch);
  const attempt = readInventoryExportAttempt(scope);
  if (!attempt || attempt.attemptId !== attemptId)
    throw Error("Export reference changed");
  sessionStorage.removeItem(key(scope));
  if (sessionStorage.getItem(key(scope)) !== null)
    throw Error("Export recovery cleanup unavailable");
}
/** Explicit user acknowledgement after checking the destination, also repairs an unreadable local reference. */
export function acknowledgeInventoryExportAttempt(
  scope: string,
  epoch: number
) {
  epochCheck(epoch);
  sessionStorage.removeItem(key(scope));
  if (sessionStorage.getItem(key(scope)) !== null)
    throw Error("Export recovery cleanup unavailable");
}
