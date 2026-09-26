import { z } from 'zod';
import { getPool } from '../db/connection';
import { assertSalesOrderFactSchema } from './sales-order-facts';
import { assertSalesPaymentFactSchema } from './sales-payment-facts';
import { readSalesOrderFact,SalesOrderEvidenceConflict } from './sales-order-fact-contract';
import { assertSalesOrderLinkSchema } from './sales-order-links';
import { readSalesOrderLink } from './sales-order-link-contract';
import { buildSalesOrderSettlement, inspectSalesOrderSettlementInput, SALES_ORDER_SETTLEMENT_LIMIT } from './sales-order-settlement-contract';

export class SalesOrderSettlementAccessDenied extends Error {}
export class SalesOrderSettlementNotReady extends Error {}

/** Read only: no source reconstruction, financial writes, attribution retry or external calls.
 * Source order/quote/payment deletion cannot replace or erase the frozen evidence identity.
 */
export async function inspectSalesOrderSettlement(actorUserId: number, value: z.infer<typeof inspectSalesOrderSettlementInput>) {
  if (!z.number().int().positive().safe().safeParse(actorUserId).success) throw new SalesOrderSettlementAccessDenied();
  const input = inspectSalesOrderSettlementInput.parse(value);
  const pool = await getPool(); if (!pool) throw Error('Order settlement unavailable');
  const c = await pool.getConnection(); let reusable = true;
  try {
    await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'); await c.beginTransaction();
    // Hold actor authority until the bounded read ends; a concurrent revocation must serialize.
    const [actors] = await c.execute<any[]>("SELECT id FROM users WHERE id=? AND role='admin' AND account_status='active' FOR SHARE", [actorUserId]);
    if (actors.length !== 1) throw new SalesOrderSettlementAccessDenied();
    await assertSalesOrderFactSchema(); await assertSalesPaymentFactSchema();
    const [merchants] = await c.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR SHARE', [input.merchantId]);
    if (merchants.length !== 1) throw new SalesOrderSettlementNotReady();
    const [orders] = await c.execute<any[]>('SELECT * FROM ai_sales_order_facts WHERE merchant_id=? AND id=? FOR SHARE', [input.merchantId,input.factId]);
    if (orders.length !== 1) throw new SalesOrderSettlementNotReady();
    const order = readSalesOrderFact(orders[0]);
    let linkRow:any,localOrderId=order.snapshot.localOrderId;
    if(order.snapshot.provider==='zid'){
      await assertSalesOrderLinkSchema();
      const [links]=await c.execute<any[]>('SELECT * FROM ai_sales_order_links WHERE merchant_id=? AND order_fact_id=? FOR SHARE',[input.merchantId,order.factId]);
      if(links.length>1)throw new SalesOrderEvidenceConflict();
      if(links.length){linkRow=links[0];localOrderId=readSalesOrderLink(linkRow,orders[0]).snapshot.localOrderId;
        const [conflicts]=await c.execute<any[]>('SELECT id FROM ai_sales_order_facts WHERE merchant_id=? AND local_order_id=? FOR SHARE',[input.merchantId,localOrderId]);
        if(conflicts.length)throw new SalesOrderEvidenceConflict();
      }
    }
    // An external ID must never be treated as a local primary key, even when both numbers match.
    const payments = localOrderId!==null
      ? (await c.execute<any[]>(`SELECT * FROM ai_sales_payment_facts WHERE merchant_id=? AND target_kind='order'
          AND target_id=? ORDER BY id LIMIT ${SALES_ORDER_SETTLEMENT_LIMIT+1} FOR SHARE`, [input.merchantId,localOrderId]))[0]
      : [];
    const result = buildSalesOrderSettlement(orders[0], payments,linkRow);
    await c.rollback(); return result;
  } catch (error) {
    try { await c.rollback(); } catch { reusable = false; c.destroy(); }
    throw error;
  } finally { if (reusable) c.release(); }
}
