import { z } from "zod";
import { checkoutAttemptSchema } from "@shared/subscription-checkout-attempt";

const id = z.number().int().positive().max(2147483647);
export const checkoutCheckpointSchema = z
  .object({
    version: z.literal(1),
    actorId: id,
    merchantId: id,
    checkoutAttemptId: z.string().uuid(),
    planId: id,
    cycle: z.enum(["monthly", "yearly"]),
    savedAt: z.string().datetime(),
  })
  .strict();
export type CheckoutCheckpoint = z.infer<typeof checkoutCheckpointSchema>;
export type CheckoutIntent = Pick<
  CheckoutCheckpoint,
  "actorId" | "merchantId" | "planId" | "cycle"
>;
export type CheckpointRead =
  | { kind: "empty" }
  | { kind: "blocked" }
  | { kind: "saved"; checkpoint: CheckoutCheckpoint };
type StorageAccess = () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const checkoutCheckpointKey = (actorId: number, merchantId: number) =>
  `sari.subscription-checkout.v1:${id.parse(actorId)}:${id.parse(merchantId)}`;
const storage: StorageAccess = () => window.localStorage;
export function readCheckoutCheckpoint(
  actorId: number,
  merchantId: number,
  access = storage
): CheckpointRead {
  try {
    const raw = access().getItem(checkoutCheckpointKey(actorId, merchantId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 600) return { kind: "blocked" };
    const p = checkoutCheckpointSchema.safeParse(JSON.parse(raw));
    return p.success &&
      p.data.actorId === actorId &&
      p.data.merchantId === merchantId
      ? { kind: "saved", checkpoint: p.data }
      : { kind: "blocked" };
  } catch {
    return { kind: "blocked" };
  }
}
export function scopedCheckoutAttempt(
  value: unknown,
  checkpoint: CheckoutCheckpoint
) {
  const p = checkoutAttemptSchema.safeParse(value);
  return p.success &&
    p.data.actorId === checkpoint.actorId &&
    p.data.merchantId === checkpoint.merchantId &&
    p.data.checkoutAttemptId === checkpoint.checkoutAttemptId
    ? p.data
    : null;
}
export async function withCheckoutLock<T>(
  actorId: number,
  merchantId: number,
  action: () => Promise<T>
): Promise<T> {
  if (!navigator.locks?.request) throw Error("checkout_storage:unavailable");
  return navigator.locks.request(
    checkoutCheckpointKey(actorId, merchantId),
    action
  );
}
/** Called under the browser lock. Never replace an unresolved attempt or age it out. */
export function prepareCheckoutCheckpoint(
  intent: CheckoutIntent,
  expectedAttempt: string | null,
  access = storage
) {
  const current = readCheckoutCheckpoint(
    intent.actorId,
    intent.merchantId,
    access
  );
  if (current.kind === "blocked") throw Error("checkout_storage:unavailable");
  if (current.kind === "saved") {
    const p = current.checkpoint;
    return {
      checkpoint: p,
      canSend:
        expectedAttempt === p.checkoutAttemptId &&
        p.planId === intent.planId &&
        p.cycle === intent.cycle,
    };
  }
  if (expectedAttempt !== null) throw Error("checkout_storage:changed");
  const checkpoint = checkoutCheckpointSchema.parse({
    ...intent,
    version: 1,
    checkoutAttemptId: window.crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  });
  const key = checkoutCheckpointKey(intent.actorId, intent.merchantId);
  try {
    access().setItem(key, JSON.stringify(checkpoint));
    const verified = readCheckoutCheckpoint(
      intent.actorId,
      intent.merchantId,
      access
    );
    if (
      verified.kind !== "saved" ||
      JSON.stringify(verified.checkpoint) !== JSON.stringify(checkpoint)
    )
      throw Error();
  } catch {
    throw Error("checkout_storage:unavailable");
  }
  return { checkpoint, canSend: true };
}
/** Only an explicit UI action with a final, scoped server record may clear it. */
export function clearResolvedCheckout(
  checkpoint: CheckoutCheckpoint,
  value: unknown,
  access = storage
) {
  const attempt = scopedCheckoutAttempt(value, checkpoint);
  if (!attempt || !["completed", "failed", "refunded"].includes(attempt.state))
    throw Error("checkout_storage:unresolved");
  const saved = readCheckoutCheckpoint(
    checkpoint.actorId,
    checkpoint.merchantId,
    access
  );
  if (
    saved.kind !== "saved" ||
    saved.checkpoint.checkoutAttemptId !== checkpoint.checkoutAttemptId
  )
    throw Error("checkout_storage:changed");
  const key = checkoutCheckpointKey(checkpoint.actorId, checkpoint.merchantId);
  access().removeItem(key);
  if (access().getItem(key) !== null)
    throw Error("checkout_storage:unavailable");
}
