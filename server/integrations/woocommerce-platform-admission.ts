import {TRPCError} from '@trpc/server';
import {sql,type SQL} from 'drizzle-orm';
import {bookingReadId} from '../../shared/booking-read';
type Executor={execute(query:SQL):Promise<unknown>};
async function rows(tx:Executor,query:SQL){const result=await tx.execute(query);if(!Array.isArray(result)||!Array.isArray(result[0]))throw Error('WooCommerce admission unavailable');return result[0] as Array<Record<string,unknown>>;}
/** Shared merchant-row ordering serializes Woo writes with reviewed Salla/Zid/Byaan admission. */
export async function lockWooPlatformMerchant(tx:Executor,merchantId:number){
 bookingReadId.parse(merchantId);const result=await rows(tx,sql`SELECT id FROM merchants WHERE id=${merchantId} FOR UPDATE`);if(result.length!==1||Number(result[0].id)!==merchantId)throw Error('WooCommerce admission unavailable');
}
export async function assertWooPlatformAdmission(tx:Executor,merchantId:number){
 await lockWooPlatformMerchant(tx,merchantId);
 const blockers=await rows(tx,sql`SELECT
  EXISTS(SELECT 1 FROM salla_connections WHERE merchantId=${merchantId}) AS salla,
  (EXISTS(SELECT 1 FROM platform_integrations WHERE merchant_id=${merchantId} AND platform_type='zid' AND is_active<>0)
   OR (NOT EXISTS(SELECT 1 FROM platform_integrations WHERE merchant_id=${merchantId} AND platform_type='zid') AND EXISTS(SELECT 1 FROM zid_settings WHERE merchant_id=${merchantId} AND is_active<>0))) AS zid,
  EXISTS(SELECT 1 FROM platform_integrations WHERE merchant_id=${merchantId} AND platform_type='shopify' AND is_active<>0) AS shopify,
  EXISTS(SELECT 1 FROM byaan_connections WHERE merchant_id=${merchantId} AND (is_active<>0 OR verified_at IS NULL)) AS byaan`);
 if(blockers.length!==1||Object.values(blockers[0]).some(value=>![0,1,'0','1'].includes(value as any)))throw Error('WooCommerce admission unavailable');
 if(Object.values(blockers[0]).some(value=>Number(value)!==0))throw new TRPCError({code:'CONFLICT',message:'تغير ربط المنصات. راجع المنصة المرتبطة قبل حفظ WooCommerce.'});
}
