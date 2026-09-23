import type {
  SendMerchantWhatsAppInput,
  WhatsAppProviderConfig,
} from "../channels/whatsapp/types";
import { sendMerchantWhatsApp } from "../channels/whatsapp/service";
import { getPool } from "../db/connection";
import { databaseTimeEpoch } from "../db/time";
import { currentInboundExecution } from "../messaging/inbound-context";
import { salesDiscountMessage } from "./sales-offer-evidence";
import {
  beginSalesOfferDispatch,
  currentOffer,
  sameOfferTerms,
  withSalesOfferAuthority,
  type SalesOfferIdentity,
  type SalesOfferShare,
} from "./sales-offer-authority";
import { reconcileSalesOffer } from "./sales-offer-reconciliation";

export type SalesOfferTransportGuard = {
  attemptId: string;
  conversationId: number;
  sourceMessageId: number;
};
export const salesOfferKey = (merchantId: number, attemptId: string) =>
  `sales_offer:${merchantId}:${attemptId}`;

/** Recheck after account lookup and durable outbox insertion, immediately before provider I/O. */
export async function canDispatchSalesOffer(
  input: SendMerchantWhatsAppInput,
  config: WhatsAppProviderConfig
) {
  const g = input.salesOfferGuard;
  if (
    !g ||
    !/^[a-f0-9-]{36}$/.test(g.attemptId) ||
    input.retryFailed ||
    input.idempotencyKey !== salesOfferKey(input.merchantId, g.attemptId) ||
    input.kind !== "text"
  )
    return false;
  const identity = {
    merchantId: input.merchantId,
    conversationId: g.conversationId,
    incomingMessageId: g.sourceMessageId,
    customerPhone: input.to,
  };
  try {
    return await withSalesOfferAuthority(
      identity,
      async ({ connection, phone }) => {
        const [rows] = await connection.execute<any[]>(
          `SELECT * FROM sales_offer_attempts WHERE id=? AND merchant_id=?
        AND conversation_id=? AND source_message_id=? AND kind='share' FOR UPDATE`,
          [g.attemptId, input.merchantId, g.conversationId, g.sourceMessageId]
        );
        const r = rows[0];
        if (
          !r ||
          r.state !== "dispatching" ||
          r.customer_phone !== phone ||
          r.instance_id !== input.instanceRecordId ||
          r.provider !== config.provider ||
          r.provider_account !== config.instanceId ||
          r.dispatch_text !== input.text
        )
          return false;
        const stored =
          typeof r.evidence === "string" ? JSON.parse(r.evidence) : r.evidence;
        const offer = await currentOffer(
          connection,
          identity,
          phone,
          r.discount_code_id
        );
        if (
          !offer ||
          !sameOfferTerms(offer, stored) ||
          salesDiscountMessage(stored) !== input.text
        )
          return false;
        const [accounts] = await connection.execute<any[]>(
          `SELECT id FROM whatsapp_instances WHERE id=? AND merchant_id=?
        AND provider=? AND instance_id=? AND status='active' FOR UPDATE`,
          [r.instance_id, input.merchantId, r.provider, r.provider_account]
        );
        // Acquiring the account row can wait too. Recheck the SQL clock after the last lock.
        const [clock] = await connection.execute<any[]>(
          "SELECT UTC_TIMESTAMP(3) AS checked_at"
        );
        const now = databaseTimeEpoch(clock[0]?.checked_at),
          age = now - databaseTimeEpoch(r.dispatch_started_at);
        return (
          accounts.length === 1 &&
          Number.isFinite(age) &&
          age >= 0 &&
          age < 120_000 &&
        (offer.expiresAt === undefined || databaseTimeEpoch(offer.expiresAt) > now)
        );
      }
    );
  } catch {
    return false;
  }
}

/** A void callback is never delivery evidence; all offers use the tracked channel directly. */
export async function dispatchSalesOffer(
  input: SalesOfferIdentity,
  share: SalesOfferShare,
  instanceRecordId?: number
) {
  if (!(await beginSalesOfferDispatch(input, share, instanceRecordId))) return;
  const pool = await getPool();
  if (!pool) throw new Error("Sales offer storage unavailable");
  try {
    await currentInboundExecution()?.assertOwned();
    const [rows] = await pool.execute<any[]>(
      "SELECT instance_id FROM sales_offer_attempts WHERE id=? AND merchant_id=?",
      [share.id, input.merchantId]
    );
    if (!rows[0]?.instance_id)
      throw new Error("Sales offer account unavailable");
    await sendMerchantWhatsApp({
      merchantId: input.merchantId,
      instanceRecordId: rows[0].instance_id,
      idempotencyKey: salesOfferKey(input.merchantId, share.id),
      kind: "text",
      to: share.phone,
      text: share.text,
      salesOfferGuard: {
        attemptId: share.id,
        conversationId: input.conversationId,
        sourceMessageId: input.incomingMessageId,
      },
    });
    const proof = await reconcileSalesOffer(input, share.id);
    if (!proof.accepted)
      throw new Error("Sales offer delivery requires review");
  } catch (error) {
    // Never overwrite a successful reconciliation or release the hourly reservation.
    await pool
      .execute(
        `UPDATE sales_offer_attempts SET state='unknown',updated_at=UTC_TIMESTAMP(3)
      WHERE id=? AND merchant_id=? AND state='dispatching'`,
        [share.id, input.merchantId]
      )
      .catch(() => {});
    throw error;
  }
}
