import { z } from "zod";
import {
  orderStatusWrite,
  manualOrderStatuses,
} from "@shared/order-status-review";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
export const orderStatusDraft = z
  .object({
    id: z.number().int().positive().safe(),
    status: z.enum(manualOrderStatuses),
    trackingNumber: z.string().max(101),
    reason: z.string().max(501),
    notify: z.boolean(),
  })
  .strict();
export type OrderStatusDraft = z.infer<typeof orderStatusDraft>;
const entry = z
  .object({
    savedAt: z.number().finite(),
    draft: orderStatusDraft.optional(),
    attempt: orderStatusWrite.optional(),
  })
  .strict();
export type OrderStatusCache = Omit<z.infer<typeof entry>, "savedAt">;
function key(scope: string) {
  if (!/^\d+:\d+:orders$/.test(scope)) throw Error("Invalid order scope");
  return "sary:order-status:v1:" + scope;
}
export function readOrderStatusCache(scope: string): OrderStatusCache {
  const raw = sessionStorage.getItem(key(scope));
  if (!raw) return {};
  if (raw.length > 16000) throw Error("Invalid order cache");
  const value = entry.parse(JSON.parse(raw));
  if (
    !value.attempt &&
    (value.savedAt > Date.now() || Date.now() - value.savedAt > 86400000)
  ) {
    sessionStorage.removeItem(key(scope));
    return {};
  }
  if (
    value.attempt &&
    value.draft &&
    value.attempt.intent.id !== value.draft.id
  )
    throw Error("Order cache mismatch");
  return { draft: value.draft, attempt: value.attempt };
}
export function saveOrderStatusCache(
  scope: string,
  value: OrderStatusCache,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const checked = entry.parse({ ...value, savedAt: Date.now() });
  if (
    checked.attempt &&
    checked.draft &&
    checked.attempt.intent.id !== checked.draft.id
  )
    throw Error("Order cache mismatch");
  const raw = JSON.stringify(checked);
  if (raw.length > 16000) throw Error("Invalid order cache");
  sessionStorage.setItem(key(scope), raw);
  if (sessionStorage.getItem(key(scope)) !== raw)
    throw Error("Order cache unavailable");
}
export function clearOrderStatusCache(scope: string, epoch: number) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  sessionStorage.removeItem(key(scope));
  if (sessionStorage.getItem(key(scope)) !== null)
    throw Error("Order cache cleanup unavailable");
}
