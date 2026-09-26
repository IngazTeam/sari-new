import { z } from 'zod';
import { getPool } from '../db/connection';
import { databaseTimeEpoch } from '../db/time';
import { assertSalesPaymentFactSchema } from './sales-payment-facts';
import { buildSalesExperimentReadout, salesExperimentReadoutInput, SALES_READOUT_ASSIGNMENT_LIMIT, SALES_READOUT_PAYMENT_LIMIT, SALES_READOUT_EXPOSURE_LIMIT } from './sales-experiment-readout-contract';
import { assertSalesExperimentExposureSchema } from './sales-experiment-exposure';
import { SALES_READOUT_STAFF_LIMIT } from './sales-experiment-readout-contract';
import { assertSalesStaffAcceptanceSchema } from './sales-staff-acceptance';

export class SalesExperimentReadoutAccessDenied extends Error {}
export class SalesExperimentReadoutNotReady extends Error {}

export async function inspectSalesExperimentReadout(actorUserId:number,value:z.input<typeof salesExperimentReadoutInput>) {
  if (!z.number().int().positive().safe().safeParse(actorUserId).success) throw new SalesExperimentReadoutAccessDenied();
  const input=salesExperimentReadoutInput.parse(value),pool=await getPool();
  if (!pool) throw new SalesExperimentReadoutNotReady();
  const c=await pool.getConnection(); let reusable=true;
  try {
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    const [[clock]]=await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS read_at');
    // Lock current authority, but all historical evidence is read from the one snapshot.
    const [actors]=await c.execute<any[]>("SELECT id FROM users WHERE id=? AND role='admin' AND account_status='active' FOR SHARE",[actorUserId]);
    if (actors.length!==1) throw new SalesExperimentReadoutAccessDenied();
    await assertSalesPaymentFactSchema();
    await assertSalesExperimentExposureSchema();
    await assertSalesStaffAcceptanceSchema();
    const [protocols]=await c.execute<any[]>('SELECT * FROM ai_sales_experiment_protocols WHERE merchant_id=? AND id=?',[input.merchantId,input.protocolId]);
    if (protocols.length!==1) throw new SalesExperimentReadoutNotReady();
    const [withdrawals]=await c.execute<any[]>('SELECT * FROM ai_sales_experiment_withdrawals WHERE merchant_id=? AND protocol_id=? LIMIT 2',[input.merchantId,input.protocolId]);
    const [assignments]=await c.execute<any[]>(`SELECT *,DATE_FORMAT(observation_ends_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS observation_utc
      FROM ai_sales_experiment_assignments WHERE merchant_id=? AND protocol_id=? ORDER BY id LIMIT ${SALES_READOUT_ASSIGNMENT_LIMIT+1}`,[input.merchantId,input.protocolId]);
    const [payments]=await c.execute<any[]>(`SELECT * FROM ai_sales_payment_facts WHERE merchant_id=? ORDER BY id LIMIT ${SALES_READOUT_PAYMENT_LIMIT+1}`,[input.merchantId]);
    const [exposures]=await c.execute<any[]>(`SELECT * FROM ai_sales_experiment_exposures WHERE merchant_id=? AND protocol_id=? ORDER BY id LIMIT ${SALES_READOUT_EXPOSURE_LIMIT+1}`,[input.merchantId,input.protocolId]);
    const [deliveries]=await c.execute<any[]>(`SELECT d.* FROM ai_sales_reply_deliveries d JOIN ai_sales_experiment_exposures e
      ON e.merchant_id=d.merchant_id AND e.delivery_id=d.id WHERE e.merchant_id=? AND e.protocol_id=? ORDER BY e.id LIMIT ${SALES_READOUT_EXPOSURE_LIMIT+1}`,[input.merchantId,input.protocolId]);
    const [conversationBindings]=await c.execute<any[]>(`SELECT b.*,c.id AS current_conversation_id,c.customerPhone AS current_customer_phone
      FROM ai_sales_experiment_assignment_conversations b LEFT JOIN conversations c
      ON c.id=b.conversation_reference AND c.merchantId=b.merchant_id
      WHERE b.merchant_id=? AND b.protocol_id=? ORDER BY b.id LIMIT ${SALES_READOUT_STAFF_LIMIT+1}`,[input.merchantId,input.protocolId]);
    // Read retained metadata only. No text/media/receipt content or mutable takeover state.
    // Bound the complete selected history, not a sample of messages inside the window.
    const [staffMessages]=await c.execute<any[]>(`SELECT m.id,m.conversationId,m.direction,m.sender_type,
      DATE_FORMAT(m.createdAt,'%Y-%m-%dT%H:%i:%s.000Z') AS created_utc
      FROM ai_sales_experiment_assignment_conversations b JOIN conversations c
      ON c.id=b.conversation_reference AND c.merchantId=b.merchant_id JOIN messages m ON m.conversationId=c.id
      WHERE b.merchant_id=? AND b.protocol_id=? AND m.direction='outgoing' AND m.sender_type<>'assistant'
      ORDER BY m.id LIMIT ${SALES_READOUT_STAFF_LIMIT+1}`,[input.merchantId,input.protocolId]);
    // Select the whole merchant ledger, including unbound/older/late observations.
    // No source joins: deleting a message, conversation or outbox must not erase retained acceptance.
    const [staffAcceptances]=await c.execute<any[]>(`SELECT * FROM ai_sales_staff_acceptances WHERE merchant_id=? ORDER BY id LIMIT ${SALES_READOUT_STAFF_LIMIT+1}`,[input.merchantId]);
    const result={...buildSalesExperimentReadout(input,{protocol:protocols[0],withdrawals,assignments,payments,exposures,deliveries,conversationBindings,staffMessages,staffAcceptances},new Date(databaseTimeEpoch(clock.read_at)).toISOString()),
      consistency:'single_database_snapshot' as const};
    await c.rollback(); return result;
  } catch(error) {
    try { await c.rollback(); } catch { reusable=false;c.destroy(); }
    throw error;
  } finally { if(reusable)c.release(); }
}
