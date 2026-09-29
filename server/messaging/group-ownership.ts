import { checkoutTransaction } from "../ai/checkout-agreements";
import { transitionOwnershipInTransaction } from "../ai/conversation-handoff";
import { destroySession } from "../ai/session-context";
import { currentInboundExecution } from "./inbound-context";
import { readGroupContext } from "./group-context";

/** Explicit timed holds may expire; a manual/permanent hold never gains a timer. */
export async function resumeExpiredGroupOwnership() {
  const e = currentInboundExecution();
  if (!e) throw Error("Owned group source required");
  const result = await checkoutTransaction(async c => {
    await c.execute("SELECT id FROM merchants WHERE id=? FOR UPDATE", [
      e.merchantId,
    ]);
    const current = await readGroupContext(c, true);
    if (
      !current.authority.humanOwned ||
      !current.timedExpired ||
      !current.conversationId
    )
      return null;
    const transition = await transitionOwnershipInTransaction(
      c,
      current.conversationId,
      { humanTakeover: 0 },
      {
        merchantId: e.merchantId,
        expectedVersion: current.authority.version,
        reason: "expired",
      }
    );
    return transition.changed ? current.conversationId : null;
  });
  if (result) destroySession(e.merchantId, result);
  return result !== null;
}
