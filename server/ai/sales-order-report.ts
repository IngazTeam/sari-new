import { z } from 'zod';
import { getPool } from '../db/connection';
import { databaseTimeEpoch } from '../db/time';
import { assertSalesOrderFactSchema } from './sales-order-facts';
import { assertSalesPaymentFactSchema } from './sales-payment-facts';
import { assertSalesOrderLinkSchema } from './sales-order-links';
import { readSalesOrderFact, SalesOrderEvidenceConflict } from './sales-order-fact-contract';
import { readSalesOrderLink } from './sales-order-link-contract';
import { buildSalesOrderReport, salesOrderReportInput, SALES_ORDER_REPORT_LIMIT, SalesOrderReportLimitExceeded } from './sales-order-report-contract';

export class SalesOrderReportAccessDenied extends Error {}
export class SalesOrderReportNotReady extends Error {}

export async function inspectSalesOrderReport(actorUserId: number, value: z.input<typeof salesOrderReportInput>) {
  if (!z.number().int().positive().safe().safeParse(actorUserId).success) throw new SalesOrderReportAccessDenied();
  const input = salesOrderReportInput.parse(value), pool = await getPool();
  if (!pool) throw new SalesOrderReportNotReady();
  const c = await pool.getConnection(); let reusable = true;
  try {
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    const [[clock]] = await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS read_at');
    // Authority is current and locked until the read ends. Evidence below uses
    // nonlocking consistent reads: no mixed pre/post-refund totals across orders.
    const [actors] = await c.execute<any[]>("SELECT id FROM users WHERE id=? AND role='admin' AND account_status='active' FOR SHARE", [actorUserId]);
    if (actors.length !== 1) throw new SalesOrderReportAccessDenied();
    const [merchants] = await c.execute<any[]>('SELECT id FROM merchants WHERE id=?', [input.merchantId]);
    if (merchants.length !== 1) throw new SalesOrderReportNotReady();
    await assertSalesOrderFactSchema(); await assertSalesPaymentFactSchema(); await assertSalesOrderLinkSchema();
    const [[highWater]] = await c.execute<any[]>('SELECT COALESCE(MAX(id),0) AS id FROM ai_sales_order_facts WHERE merchant_id=?', [input.merchantId]);
    const through = input.throughFactId ?? Number(highWater.id);
    const [rows] = await c.execute<any[]>(`SELECT * FROM ai_sales_order_facts WHERE merchant_id=? AND id>=? AND id<=? ORDER BY id LIMIT ${SALES_ORDER_REPORT_LIMIT+1}`,
      [input.merchantId, input.fromFactId, through]);
    if (rows.length > SALES_ORDER_REPORT_LIMIT) throw new SalesOrderReportLimitExceeded();
    const entries = rows.map(order => ({ order, fact: readSalesOrderFact(order), link: undefined as any, payments: [] as any[] }));
    if (entries.length) {
      const marks = (count: number) => Array(count).fill('?').join(',');
      const [links] = await c.execute<any[]>(`SELECT * FROM ai_sales_order_links WHERE merchant_id=? AND order_fact_id IN (${marks(entries.length)}) LIMIT ${SALES_ORDER_REPORT_LIMIT+1}`,
        [input.merchantId, ...entries.map(e => e.fact.factId)]);
      for (const link of links) {
        const entry = entries.find(e => e.fact.factId === Number(link.order_fact_id));
        if (!entry || entry.link) throw new SalesOrderEvidenceConflict();
        readSalesOrderLink(link, entry.order); entry.link = link;
      }
      const targets = entries.map(e => ({ entry: e, id: e.fact.snapshot.localOrderId ?? (e.link ? readSalesOrderLink(e.link,e.order).snapshot.localOrderId : null) }))
        .filter((v):v is typeof v & {id:number} => v.id !== null);
      if (new Set(targets.map(t => t.id)).size !== targets.length) throw new SalesOrderEvidenceConflict();
      if (targets.length) {
        const args = [input.merchantId, ...targets.map(t => t.id)], placeholders = marks(targets.length);
        // Check aliases outside the requested range too; narrowing a report must
        // not hide a second canonical owner for the same financial target.
        const [owners] = await c.execute<any[]>(`SELECT id,local_order_id FROM ai_sales_order_facts WHERE merchant_id=? AND local_order_id IN (${placeholders}) LIMIT ${SALES_ORDER_REPORT_LIMIT+1}`, args);
        for (const owner of owners) if (!targets.some(t => t.id===Number(owner.local_order_id) && t.entry.fact.factId===Number(owner.id))) throw new SalesOrderEvidenceConflict();
        const [aliases] = await c.execute<any[]>(`SELECT order_fact_id,local_order_id FROM ai_sales_order_links WHERE merchant_id=? AND local_order_id IN (${placeholders}) LIMIT ${SALES_ORDER_REPORT_LIMIT+1}`, args);
        for (const alias of aliases) if (!targets.some(t => t.id===Number(alias.local_order_id) && t.entry.fact.factId===Number(alias.order_fact_id))) throw new SalesOrderEvidenceConflict();
        const [payments] = await c.execute<any[]>(`SELECT * FROM ai_sales_payment_facts WHERE merchant_id=? AND target_kind='order' AND target_id IN (${placeholders}) ORDER BY id LIMIT ${SALES_ORDER_REPORT_LIMIT*2+1}`, args);
        if (payments.length > SALES_ORDER_REPORT_LIMIT*2) throw new SalesOrderReportLimitExceeded();
        for (const payment of payments) {
          const target = targets.find(t => t.id===Number(payment.target_id));
          if (!target) throw new SalesOrderEvidenceConflict();
          target.entry.payments.push(payment);
        }
      }
    }
    const report = buildSalesOrderReport(input, entries, through);
    const result = { ...report, readAt: new Date(databaseTimeEpoch(clock.read_at)).toISOString(), consistency: 'single_database_snapshot' as const };
    await c.rollback(); return result;
  } catch (error) {
    try { await c.rollback(); } catch { reusable=false; c.destroy(); }
    throw error;
  } finally { if (reusable) c.release(); }
}
