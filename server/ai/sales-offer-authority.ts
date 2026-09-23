import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "../db/connection";
import { databaseTimeEpoch } from "../db/time";
import { normalizeCampaignPhone } from "../automation/campaign-guard";
import {
  assertCheckoutIdentity,
  checkoutTransaction,
  type CheckoutIdentity,
} from "./checkout-agreements";
import {
  asksAboutDiscount,
  selectSalesDiscounts,
  salesDiscountMessage,
  type SalesDiscountEvidence,
} from "./sales-offer-evidence";
import { isSalesRefusal } from "./customer-decision";

export type SalesOfferIdentity = CheckoutIdentity;
export function privateSalesPhone(phone: string): string | null {
  return typeof phone === "string" && /^[+\d][\d ()-]*(?:@c\.us)?$/.test(phone)
    ? normalizeCampaignPhone(phone)
    : null;
}
type Authority = {
  connection: PoolConnection;
  phone: string;
  source: string;
  now: number;
  issueLimited: boolean;
  shareLimited: boolean;
};

/** Lock the source conversation, then the canonical customer's limit across all conversations/workers.
 * No network calls inside this transaction. Missing schema/storage fails closed; no runtime DDL.
 */
export async function withSalesOfferAuthority<T>(
  input: SalesOfferIdentity,
  run: (authority: Authority) => Promise<T>
): Promise<T> {
  const phone = privateSalesPhone(input.customerPhone);
  if (
    !phone ||
    ![input.merchantId, input.conversationId, input.incomingMessageId].every(
      n => Number.isSafeInteger(n) && n > 0
    )
  ) {
    throw new Error("Sales offer identity invalid");
  }
  return checkoutTransaction(async connection => {
    const [conversations] = await connection.execute<any[]>(
      "SELECT customerPhone FROM conversations WHERE merchantId=? AND id=? FOR UPDATE",
      [input.merchantId, input.conversationId]
    );
    if (privateSalesPhone(conversations[0]?.customerPhone) !== phone)
      throw new Error("Sales offer customer mismatch");
    const source = await assertCheckoutIdentity(connection, {
      ...input,
      customerPhone: conversations[0].customerPhone,
    });
    if (!asksAboutDiscount(source.content) || isSalesRefusal(source.content))
      throw new Error("Sales offer source does not request an incentive");
    await connection.execute(
      `INSERT INTO sales_offer_limits (merchant_id,customer_phone) VALUES (?,?)
      ON DUPLICATE KEY UPDATE merchant_id=VALUES(merchant_id)`,
      [input.merchantId, phone]
    );
    const [limits] = await connection.execute<any[]>(
      `SELECT
      last_issued_at > TIMESTAMPADD(HOUR,-24,UTC_TIMESTAMP(3)) AS issue_limited,
      last_share_at > TIMESTAMPADD(HOUR,-1,UTC_TIMESTAMP(3)) AS share_limited,
      UTC_TIMESTAMP(3) AS checked_at FROM sales_offer_limits WHERE merchant_id=? AND customer_phone=? FOR UPDATE`,
      [input.merchantId, phone]
    );
    const now = databaseTimeEpoch(limits[0].checked_at);
    if (!Number.isFinite(now)) throw new Error("Sales offer clock unavailable");
    return run({
      connection,
      phone,
      source: source.content,
      now,
      issueLimited: Boolean(limits[0].issue_limited),
      shareLimited: Boolean(limits[0].share_limited),
    });
  });
}

export async function hasSalesOfferAttempt(
  connection: PoolConnection,
  input: SalesOfferIdentity,
  kind: "issue" | "share"
) {
  const [rows] = await connection.execute<any[]>(
    "SELECT id FROM sales_offer_attempts WHERE merchant_id=? AND source_message_id=? AND kind=?",
    [input.merchantId, input.incomingMessageId, kind]
  );
  return rows.length > 0;
}
export async function recordSalesOfferAttempt(
  connection: PoolConnection,
  input: SalesOfferIdentity,
  phone: string,
  kind: "issue" | "share",
  offer: SalesDiscountEvidence
) {
  const id = randomUUID();
  await connection.execute(
    `INSERT INTO sales_offer_attempts
    (id,merchant_id,conversation_id,source_message_id,customer_phone,kind,state,discount_code_id,evidence)
    VALUES (?,?,?,?,?,?,?, ?,?)`,
    [
      id,
      input.merchantId,
      input.conversationId,
      input.incomingMessageId,
      phone,
      kind,
      kind === "issue" ? "issued" : "reserved",
      offer.id,
      JSON.stringify(offer),
    ]
  );
  // This timestamp survives coupon/message/conversation deletion and is committed with the attempt.
  const column = kind === "issue" ? "last_issued_at" : "last_share_at";
  await connection.execute(
    `UPDATE sales_offer_limits SET ${column}=UTC_TIMESTAMP(3) WHERE merchant_id=? AND customer_phone=?`,
    [input.merchantId, phone]
  );
  return id;
}
async function currentOffer(
  connection: PoolConnection,
  input: SalesOfferIdentity,
  phone: string,
  id: number
) {
  const [rows] = await connection.execute<any[]>(
    `SELECT *, customer_phone AS customerPhone FROM discount_codes
    WHERE merchantId=? AND id=? FOR UPDATE`,
    [input.merchantId, id]
  );
  // Coupon row acquisition can wait behind an update/redemption. Check time after that wait.
  const [clock] = await connection.execute<any[]>(
    "SELECT UTC_TIMESTAMP(3) AS checked_at"
  );
  const now = databaseTimeEpoch(clock[0]?.checked_at);
  if (!Number.isFinite(now)) throw new Error("Sales offer clock unavailable");
  return selectSalesDiscounts(rows, {
    merchantId: input.merchantId,
    customerPhone: phone,
    now,
  })[0];
}
function sameTerms(a: SalesDiscountEvidence, b: SalesDiscountEvidence) {
  return [
    "id",
    "merchantId",
    "code",
    "type",
    "value",
    "minOrderAmount",
    "expiresAt",
  ].every(key => a[key as keyof typeof a] === b[key as keyof typeof b]);
}
export type SalesOfferShare = {
  id: string;
  phone: string;
  offer: SalesDiscountEvidence;
  text: string;
};
export async function reserveSalesOfferShare(
  input: SalesOfferIdentity,
  expected: SalesDiscountEvidence
): Promise<SalesOfferShare | null> {
  return withSalesOfferAuthority(
    input,
    async ({ connection, phone, shareLimited }) => {
      if (
        shareLimited ||
        (await hasSalesOfferAttempt(connection, input, "share"))
      )
        return null;
      const offer = await currentOffer(connection, input, phone, expected.id);
      if (!offer || !sameTerms(offer, expected)) return null;
      const id = await recordSalesOfferAttempt(
        connection,
        input,
        phone,
        "share",
        offer
      );
      return { id, phone, offer, text: salesDiscountMessage(offer) };
    }
  );
}

/** Exactly one caller can begin transport. No lease expiry or automatic retry for a possibly sent attempt. */
export async function beginSalesOfferDispatch(
  input: SalesOfferIdentity,
  share: SalesOfferShare
): Promise<boolean> {
  try {
    return await withSalesOfferAuthority(
      input,
      async ({ connection, phone }) => {
        const [rows] = await connection.execute<any[]>(
          `SELECT * FROM sales_offer_attempts WHERE id=? AND merchant_id=?
        AND source_message_id=? AND conversation_id=? AND kind='share' FOR UPDATE`,
          [
            share.id,
            input.merchantId,
            input.incomingMessageId,
            input.conversationId,
          ]
        );
        const attempt = rows[0];
        if (
          !attempt ||
          attempt.state !== "reserved" ||
          attempt.customer_phone !== phone ||
          share.phone !== phone
        )
          return false;
        const stored: SalesDiscountEvidence =
          typeof attempt.evidence === "string"
            ? JSON.parse(attempt.evidence)
            : attempt.evidence;
        const offer = await currentOffer(
          connection,
          input,
          phone,
          attempt.discount_code_id
        );
        if (
          !offer ||
          !Number.isFinite(databaseTimeEpoch(attempt.created_at)) ||
          databaseTimeEpoch(attempt.created_at) >
            databaseTimeEpoch(offer.checkedAt) ||
          databaseTimeEpoch(offer.checkedAt) -
            databaseTimeEpoch(attempt.created_at) >=
            120_000 ||
          !sameTerms(offer, stored) ||
          !sameTerms(stored, share.offer) ||
          share.text !== salesDiscountMessage(stored)
        ) {
          await connection.execute(
            "UPDATE sales_offer_attempts SET state='cancelled',updated_at=UTC_TIMESTAMP(3) WHERE id=?",
            [share.id]
          );
          return false;
        }
        await connection.execute(
          "UPDATE sales_offer_attempts SET state='dispatching',updated_at=UTC_TIMESTAMP(3) WHERE id=?",
          [share.id]
        );
        // Retain a full hour from dispatch start as well as consuming the slot at reservation.
        await connection.execute(
          "UPDATE sales_offer_limits SET last_share_at=UTC_TIMESTAMP(3) WHERE merchant_id=? AND customer_phone=?",
          [input.merchantId, phone]
        );
        return true;
      }
    );
  } catch (error) {
    // Known not to have started this transport; keep the hourly slot and never retry this source.
    const pool = await getPool();
    await pool?.execute(
      `UPDATE sales_offer_attempts SET state='cancelled',updated_at=UTC_TIMESTAMP(3)
      WHERE id=? AND merchant_id=? AND conversation_id=? AND source_message_id=? AND kind='share' AND state='reserved'`,
      [
        share.id,
        input.merchantId,
        input.conversationId,
        input.incomingMessageId,
      ]
    );
    throw error;
  }
}
export async function finishSalesOfferDispatch(
  input: SalesOfferIdentity,
  id: string,
  state: "accepted" | "unknown"
) {
  const pool = await getPool();
  if (!pool) throw new Error("Sales offer storage unavailable");
  const [result] = await pool.execute<any>(
    `UPDATE sales_offer_attempts SET state=?,updated_at=UTC_TIMESTAMP(3)
    WHERE id=? AND merchant_id=? AND source_message_id=? AND conversation_id=? AND kind='share' AND state='dispatching'`,
    [state, id, input.merchantId, input.incomingMessageId, input.conversationId]
  );
  if (result.affectedRows !== 1)
    throw new Error("Sales offer dispatch result requires review");
}
