import { getPool } from '../db/connection';
import { decryptSecret } from '../security/secrets';
import { bookingReadId } from '../../shared/booking-read';
import { byaanResyncRequest, byaanResyncLookup, byaanResyncReceipt } from '../../shared/byaan-resync';
import { definition, writeAuthority } from './byaan-connection-workspace';
import { ByaanDashboardFault } from './byaan-dashboard-fault';
import { byaanDataStamp } from './byaan-data-values';
import type { PoolConnection } from 'mysql2/promise';
import { assertRuntimeSchema } from '../db/schema-readiness';

export const BYAAN_RESYNC_REQUIREMENTS = [{ table: 'byaan_resync_requests', columns: ['merchant_id','actor_id','request_id','connection_revision','state','created_at','updated_at'],
  uniqueIndexes: [{ name: 'uq_byaan_resync_request', columns: ['merchant_id','request_id'] }], checkConstraints: ['chk_byaan_resync_state'] }];

async function transaction<T>(work: (tx: PoolConnection) => Promise<T>) {
  const pool = await getPool(); if (!pool) throw new ByaanDashboardFault('unavailable');
  const tx = await pool.getConnection(); let committing = false, reusable = true;
  try { await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'); await tx.beginTransaction(); const value = await work(tx); committing = true; await tx.commit(); return value; }
  catch (error) { if (committing) reusable = false; else try { await tx.rollback(); } catch { reusable = false; } if (error instanceof ByaanDashboardFault) throw error; throw new ByaanDashboardFault('unavailable'); }
  finally { if (reusable) tx.release(); else tx.destroy(); }
}
async function lockAuthority(tx: PoolConnection, actorId: number, merchantId: number) {
  const current = await definition(tx, merchantId, true);
  try { await writeAuthority(tx, merchantId, actorId); } catch { throw new ByaanDashboardFault('forbidden'); }
  const [owners] = await tx.execute<any[]>("SELECT m.id FROM merchants m JOIN users u ON u.id=m.userId WHERE m.id=? AND m.status='active' AND u.account_status='active' FOR SHARE", [merchantId]);
  if (owners.length !== 1) throw new ByaanDashboardFault('forbidden');
  if (current.source !== 'byaan' || !current.row?.active || !current.row.verifiedAt) throw new ByaanDashboardFault('inactive');
  return current;
}
function receipt(row: any, replayed: boolean) {
  if (!['preparing','dispatching','queued','not_sent','unknown'].includes(row.state)) throw new ByaanDashboardFault('unavailable');
  return byaanResyncReceipt.parse({ actorId: row.actor_id, merchantId: row.merchant_id, requestId: row.request_id,
    revision: row.connection_revision, outcome: ['queued','not_sent'].includes(row.state) ? row.state : 'unknown', createdAt: byaanDataStamp(row.created_at), replayed });
}
export async function readByaanResyncAttempt(actorId: number, merchantId: number, input: unknown) {
  bookingReadId.parse(actorId); bookingReadId.parse(merchantId); const { requestId } = byaanResyncLookup.parse(input);
  const pool = await getPool(); if (!pool) throw new ByaanDashboardFault('unavailable');
  const [rows] = await pool.execute<any[]>('SELECT actor_id,merchant_id,request_id,connection_revision,state,created_at FROM byaan_resync_requests WHERE merchant_id=? AND actor_id=? AND request_id=?', [merchantId, actorId, requestId]);
  if (rows.length !== 1) throw new ByaanDashboardFault('missing'); return receipt(rows[0], true);
}
/** A request ID is reserved once. Replays only read the receipt; an uncertain POST is never dispatched again. */
export async function requestReviewedByaanResync(actorId: number, merchantId: number, input: unknown) {
  bookingReadId.parse(actorId); bookingReadId.parse(merchantId); const intent = byaanResyncRequest.parse(input);
  await assertRuntimeSchema('Byaan resync requests', BYAAN_RESYNC_REQUIREMENTS, { cacheSuccess: false });
  const reservation = await transaction(async tx => {
    const current = await lockAuthority(tx, actorId, merchantId);
    const [rows] = await tx.execute<any[]>('SELECT * FROM byaan_resync_requests WHERE merchant_id=? AND request_id=? FOR UPDATE', [merchantId, intent.requestId]);
    if (rows.length) {
      const row = rows[0];
      if (row.actor_id !== actorId || row.connection_revision !== intent.revision) throw new ByaanDashboardFault('stale');
      return { replay: receipt(row, true) };
    }
    if (current.revision !== intent.revision) throw new ByaanDashboardFault('stale');
    const [counts] = await tx.execute<any[]>("SELECT COUNT(*) AS count FROM byaan_resync_requests WHERE merchant_id=? AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)", [merchantId]);
    const count = Number(counts[0]?.count);
    if (counts.length !== 1 || !Number.isSafeInteger(count) || count < 0) throw new ByaanDashboardFault('unavailable');
    if (count >= 3) throw new ByaanDashboardFault('rate_limited');
    const [result] = await tx.execute<any>("INSERT INTO byaan_resync_requests(merchant_id,actor_id,request_id,connection_revision,state) VALUES (?,?,?,?,'preparing')", [merchantId, actorId, intent.requestId, intent.revision]);
    const [saved] = await tx.execute<any[]>('SELECT created_at FROM byaan_resync_requests WHERE id=?', [result.insertId]);
    if (saved.length !== 1 || !byaanDataStamp(saved[0].created_at)) throw new ByaanDashboardFault('unavailable');
    return { id: Number(result.insertId), createdAt: byaanDataStamp(saved[0].created_at)! };
  });
  if (reservation.replay) return reservation.replay;
  const id = reservation.id!;
  let outcome: 'queued' | 'not_sent' | 'unknown' = 'unknown';
  try {
    const { dispatchByaanResync } = await import('./byaan');
    outcome = (await dispatchByaanResync(merchantId, intent.requestId, async snapshot => {
      await transaction(async tx => {
        const current = await lockAuthority(tx, actorId, merchantId);
        if (current.revision !== intent.revision) throw new ByaanDashboardFault('stale');
        const [secrets] = await tx.execute<any[]>('SELECT webhook_secret FROM byaan_connections WHERE id=? AND merchant_id=?', [current.row.id, merchantId]);
        const transport = snapshot as any, secret = decryptSecret(secrets[0]?.webhook_secret);
        if (!transport || transport.id !== current.row.id || transport.merchant_id !== merchantId || transport.tenant_domain !== current.row.domain
          || transport.api_base_url !== current.row.baseUrl || byaanDataStamp(transport.verified_at) !== byaanDataStamp(current.row.verifiedAt)
          || typeof secret !== 'string' || secret.length < 32 || transport.webhook_secret !== secret) throw new ByaanDashboardFault('stale');
        const [updated] = await tx.execute<any>("UPDATE byaan_resync_requests SET state='dispatching',updated_at=UTC_TIMESTAMP(3) WHERE id=? AND merchant_id=? AND actor_id=? AND state='preparing'", [id, merchantId, actorId]);
        if (updated.affectedRows !== 1) throw new ByaanDashboardFault('stale');
      });
    })).outcome;
  } catch { /* Read persisted dispatch state below; an exception is not proof of no send. */ }
  try {
    return await transaction(async tx => {
      const [rows] = await tx.execute<any[]>('SELECT * FROM byaan_resync_requests WHERE id=? AND merchant_id=? AND actor_id=? FOR UPDATE', [id, merchantId, actorId]);
      const row = rows[0]; if (rows.length !== 1 || !['preparing','dispatching'].includes(row.state)) throw new ByaanDashboardFault('unavailable');
      outcome = row.state === 'preparing' ? 'not_sent' : outcome === 'queued' ? 'queued' : 'unknown';
      await tx.execute('UPDATE byaan_resync_requests SET state=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?', [outcome, id]);
      return receipt({ ...row, state: outcome }, false);
    });
  } catch { return { actorId, merchantId, requestId: intent.requestId, revision: intent.revision, outcome: 'unknown' as const, createdAt: reservation.createdAt!, replayed: false }; }
}
