import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { bookingReadId } from '../../shared/booking-read';
import { sallaConnectionRevision } from '../../shared/salla-connection';
import { sallaConnectionDefinition } from './salla-workspace';
import { sallaConnectionWriter,SallaConnectionFault } from './salla-connection';
import type { SallaCatalogGuard } from './salla-catalog';

/** A dashboard sync keeps its initiating actor and reviewed connection throughout
 * the operation. Network reads hold no DB locks; writes recheck inside their own
 * transaction, locking the merchant before the connection and product rows. */
export function sallaSyncReview(actorId:number,merchantId:number,revision:string):SallaCatalogGuard {
  bookingReadId.parse(actorId);bookingReadId.parse(merchantId);sallaConnectionRevision.parse(revision);
  async function check(tx:PoolConnection) {
    const current=await sallaConnectionDefinition(tx,merchantId,true);
    await sallaConnectionWriter(tx,actorId,merchantId);
    if(current.revision!==revision)throw new SallaConnectionFault('changed');
    if(!current.row)throw new SallaConnectionFault('missing');
    if(current.row.syncStatus!=='active')throw new SallaConnectionFault('changed');
  }
  return async existing=>{
    if(existing)return check(existing);
    const pool=await getPool();if(!pool)throw new SallaConnectionFault('unavailable');
    const tx=await pool.getConnection();let committing=false,reusable=true;
    try { await tx.beginTransaction();await check(tx);committing=true;await tx.commit(); }
    catch(error) { if(committing)reusable=false;else try{await tx.rollback();}catch{reusable=false;}throw error instanceof SallaConnectionFault?error:new SallaConnectionFault('unavailable'); }
    finally { if(reusable)tx.release();else tx.destroy(); }
  };
}
