import {z} from 'zod';
import type {PoolConnection} from 'mysql2/promise';
import {privacyHashExact} from './accounts/privacy-hash';
import {orderNoticeStatus} from '../shared/order-notification-workspace';

const id=z.number().int().positive().max(2147483647),digest=z.string().regex(/^[a-f0-9]{64}$/);
export const orderNoticeAuthorizationContract=z.object({
  version:z.literal('order-notice-authority.v1'),merchantId:id,ownerId:id,actorId:id,orderId:id,
  requestKey:z.string().uuid(),inputHash:digest,reviewDigest:digest,eventKey:digest,status:orderNoticeStatus,
  recipient:z.string().regex(/^\+?[0-9]{8,15}$/),message:z.string().min(1).max(4096),orderDigest:digest,
  instanceId:id,provider:z.enum(['green_api','meta_cloud']),channelDigest:digest,
}).strict();
export type OrderNoticeAuthorizationContract=z.infer<typeof orderNoticeAuthorizationContract>;
export class OrderNoticeAuthorityError extends Error {
  constructor(readonly reason:'unavailable'|'changed'){super('Order notification authority '+reason);}
}
export const orderNoticeAuthorityDigest=(contract:OrderNoticeAuthorizationContract)=>privacyHashExact(JSON.stringify(orderNoticeAuthorizationContract.parse(contract)));

/** No credential value leaves this module. A token or provider-account rotation invalidates the reviewed channel. */
export function projectOrderNoticeChannel(row:any,merchantId:number) {
  if(!row||!id.safeParse(row.id).success||row.merchant_id!==merchantId||row.is_primary!==1||row.status!=='active'
    ||!['green_api','meta_cloud'].includes(row.provider)||typeof row.token!=='string'||!row.token.trim()
    ||typeof row.instance_id!=='string'||!row.instance_id.trim()
    ||row.provider==='meta_cloud'&&(typeof row.phone_number_id!=='string'||!row.phone_number_id.trim()))throw new OrderNoticeAuthorityError('changed');
  return {instanceId:row.id as number,provider:row.provider as 'green_api'|'meta_cloud',channelDigest:privacyHashExact(JSON.stringify([
    merchantId,row.id,row.provider,row.instance_id,row.token,row.api_url??null,row.phone_number_id??null,row.provider_account_id??null,
  ]))};
}
export async function readOrderNoticeChannel(tx:PoolConnection,merchantId:number) {
  const [rows]=await tx.execute<any[]>('SELECT id,merchant_id,provider,status,is_primary,instance_id,token,api_url,phone_number_id,provider_account_id FROM whatsapp_instances WHERE merchant_id=? AND is_primary=1 ORDER BY id FOR SHARE',[merchantId]);
  if(rows.length!==1)throw new OrderNoticeAuthorityError('changed');
  return projectOrderNoticeChannel(rows[0],merchantId);
}

/** Frozen order contents after the reviewed status change, without converting missing data into values. */
export async function readOrderNoticeOrderDigest(tx:PoolConnection,merchantId:number,orderId:number) {
  const [rows]=await tx.execute<any[]>(`SELECT id,merchantId,orderNumber,customerName,customerPhone,status,payment_status,currency,totalAmount,sallaOrderId,trackingNumber,
    checkout_review_required,checkout_discount_released,checkout_subtotal_minor,checkout_discount_minor,discountCode,
    SHA2(items,256) itemsHash,SHA2(COALESCE(notes,''),256) notesHash,SHA2(COALESCE(address,''),256) addressHash,
    DATE_FORMAT(updatedAt,'%Y-%m-%dT%H:%i:%s.000Z') updatedAt
    FROM orders WHERE merchantId=? AND id=? FOR UPDATE`,[merchantId,orderId]);
  if(rows.length!==1||rows[0].merchantId!==merchantId||rows[0].id!==orderId)throw new OrderNoticeAuthorityError('changed');
  return privacyHashExact(JSON.stringify(rows[0]));
}
export async function storeOrderNoticeAuthorization(tx:PoolConnection,notificationId:number,receiptId:number,raw:unknown) {
  const contract=orderNoticeAuthorizationContract.parse(raw);id.parse(notificationId);id.parse(receiptId);
  const [result]=await tx.execute<any>(`INSERT INTO order_notification_authorizations
    (notification_id,merchant_id,order_id,actor_id,receipt_id,event_key,request_key,contract_digest,reviewed_contract)
    VALUES (?,?,?,?,?,?,?,?,?)`,[notificationId,contract.merchantId,contract.orderId,contract.actorId,receiptId,contract.eventKey,contract.requestKey,orderNoticeAuthorityDigest(contract),JSON.stringify(contract)]);
  if(result.affectedRows!==1)throw new OrderNoticeAuthorityError('unavailable');
}
