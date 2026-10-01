import { z } from "zod";
import { knowledgeRemovalReview } from "@shared/knowledge-source-removal";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";

// A reviewed summary and opaque request identity only; approval is never restored.
export const removalAttempt = z
  .object({ requestId: z.string().uuid(), review: knowledgeRemovalReview })
  .strict();
export type RemovalAttempt = z.infer<typeof removalAttempt>;
const prefix = "sary:knowledge-removal:v1:";
export function removalIdentity(key: string) {
  const match = /^(\d+):(\d+):knowledge-removal$/.exec(key);
  if (!match) throw Error("Invalid removal workspace");
  return { actorId: Number(match[1]), merchantId: Number(match[2]) };
}
function scoped(key: string, raw: unknown) {
  const value = removalAttempt.parse(raw),
    identity = removalIdentity(key);
  if (
    value.review.actorId !== identity.actorId ||
    value.review.merchantId !== identity.merchantId
  )
    throw Error("Wrong removal workspace");
  return value;
}
export function readRemovalAttempt(key: string): RemovalAttempt | null {
  const raw = sessionStorage.getItem(prefix + key);
  return raw ? scoped(key, JSON.parse(raw)) : null;
}
export function rememberRemovalAttempt(
  key: string,
  raw: RemovalAttempt,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const value = scoped(key, raw),
    prior = readRemovalAttempt(key);
  if (prior && JSON.stringify(prior) !== JSON.stringify(value))
    throw Error("Resolve previous removal first");
  const text = JSON.stringify(value);
  sessionStorage.setItem(prefix + key, text);
  if (sessionStorage.getItem(prefix + key) !== text)
    throw Error("Removal reference unavailable");
}
export function forgetRemovalAttempt(
  key: string,
  requestId: string,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch()) return;
  if (readRemovalAttempt(key)?.requestId === requestId)
    sessionStorage.removeItem(prefix + key);
}
