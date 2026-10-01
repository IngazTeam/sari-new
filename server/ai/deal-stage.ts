import { conversationUnderstandingIdentity } from "./conversation-understanding-context";

export const DEAL_STAGE_MAP: Record<string, string> = {
  browsing: "new",
  inquiring: "interested",
  comparing: "qualified",
  hesitating: "qualified",
  objecting: "qualified",
  ready_to_buy: "ready",
  returning: "returning",
};
export const STAGE_ORDER: Record<string, number> = {
  new: 0,
  interested: 1,
  qualified: 2,
  ready: 3,
  payment_link_sent: 4,
  purchased: 5,
  paid: 6,
  returning: 7,
  payment_failed: -1,
  lost: -2,
};
const validId = (id: number) => Number.isSafeInteger(id) && id > 0;

/** Model intent can progress interest, never certify payment or mutate a preview. */
export async function updateDealStage(
  conversationId: number,
  intent: string,
  merchantId: number,
  customerPhone?: string,
): Promise<void> {
  if (!validId(merchantId) || !validId(conversationId)) return;
  const identity = conversationUnderstandingIdentity();
  if (
    identity &&
    (identity.mode === "preview" ||
      identity.merchantId !== merchantId ||
      identity.conversationId !== conversationId)
  )
    return;
  if (intent === "declined") {
    if (!customerPhone || !identity) return;
    try {
      const { recordContextualSalesLoss } =
        await import("./contextual-sales-loss");
      await recordContextualSalesLoss({
        merchantId,
        conversationId,
        incomingMessageId: identity.incomingMessageId,
        customerPhone,
      });
    } catch {
      console.warn("[DealStage] Decline projection deferred");
    }
    return;
  }
  if (!Object.hasOwn(DEAL_STAGE_MAP, intent)) return;
  const stage = DEAL_STAGE_MAP[intent];
  try {
    const { getPool } = await import("../db");
    const pool = await getPool();
    if (!pool) return;
    const [result] = await pool.execute(
      "SELECT deal_stage FROM conversations WHERE id = ? AND merchantId = ? LIMIT 1",
      [conversationId, merchantId],
    );
    const row = (result as Array<{ deal_stage: string | null }>)[0];
    if (!row) return;
    const current = row.deal_stage ?? "new";
    if (["paid", "purchased"].includes(current)) return;
    if (
      (STAGE_ORDER[stage] ?? 0) > (STAGE_ORDER[current] ?? 0) ||
      stage === "returning"
    ) {
      await pool.execute(
        "UPDATE conversations SET deal_stage = ?,loss_reason=NULL,stalled_since=NULL WHERE id = ? AND merchantId = ? AND deal_stage <=> ?",
        [stage, conversationId, merchantId, row.deal_stage],
      );
    }
  } catch {
    console.warn("[DealStage] Update deferred");
  }
}
