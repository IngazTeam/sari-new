import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {orderNoticeAuthorizationContract,orderNoticeAuthorityDigest,projectOrderNoticeChannel,readOrderNoticeChannel,storeOrderNoticeAuthorization} from './order-notification-authority';
const channel={id:5,merchant_id:7,provider:'meta_cloud',status:'active',is_primary:1,instance_id:'local-only',token:'synthetic-token',phone_number_id:'123',api_url:null,provider_account_id:'account'};
const contract={version:'order-notice-authority.v1' as const,merchantId:7,ownerId:1,actorId:2,orderId:3,requestKey:'00000000-0000-4000-8000-000000000199',inputHash:'a'.repeat(64),reviewDigest:'b'.repeat(64),eventKey:'c'.repeat(64),status:'processing' as const,recipient:'+12025550161',message:'Exact reviewed message',orderDigest:'d'.repeat(64),...projectOrderNoticeChannel(channel,7)};
it.each([{merchantId:0},{ownerId:0},{actorId:1.1},{orderId:-1},{instanceId:0},{provider:'mock'},{status:'unknown'},{requestKey:'bad'},{eventKey:'A'.repeat(64)},{channelDigest:'bad'},{message:''},{message:'x'.repeat(4097)},{recipient:'phone'},{extra:'untrusted'}])('rejects malformed authority %j',patch=>expect(orderNoticeAuthorizationContract.safeParse({...contract,...patch}).success).toBe(false));
it.each(['merchantId','ownerId','actorId','orderId','instanceId','requestKey','inputHash','reviewDigest','eventKey','status','recipient','message','orderDigest','channelDigest'] as const)('binds %s into the exact contract digest',key=>{
 const next={...contract,[key]:typeof contract[key]==='number'?(contract[key] as number)+1:key==='requestKey'?'00000000-0000-4000-8000-000000000200':key==='status'?'shipped':key==='recipient'?'+12025550162':key==='message'?'exact reviewed message':'e'.repeat(64)};expect(orderNoticeAuthorityDigest(next as any)).not.toBe(orderNoticeAuthorityDigest(contract));
});
it.each([{merchant_id:8},{status:'inactive'},{is_primary:0},{is_primary:3},{provider:'mock'},{token:''},{token:null},{instance_id:''},{phone_number_id:null}])('rejects changed or incomplete primary channel %j',patch=>expect(()=>projectOrderNoticeChannel({...channel,...patch},7)).toThrow());
it.each([{token:'rotated'},{instance_id:'other'},{provider_account_id:'other'},{phone_number_id:'456'},{api_url:'https://example.test/provider'},{id:6}])('binds changed credentials or destination %j without exposing them',patch=>{
 const before=projectOrderNoticeChannel(channel,7),after=projectOrderNoticeChannel({...channel,...patch},7);expect(after.channelDigest).not.toBe(before.channelDigest);expect(JSON.stringify(after)).not.toContain('synthetic-token');expect(Object.keys(after).sort()).toEqual(['channelDigest','instanceId','provider']);
});
it.each([[],[channel,{...channel,id:6}]])('rejects absent or ambiguous primary channels',async rows=>{await expect(readOrderNoticeChannel({execute:async()=>[rows]} as any,7)).rejects.toThrow();});
it('stores exactly the reviewed contract and requires a successful insert',async()=>{
 const execute=vi.fn().mockResolvedValue([{affectedRows:1}]);await storeOrderNoticeAuthorization({execute} as any,10,11,contract);expect(execute.mock.calls[0][1]).toEqual([10,7,3,2,11,contract.eventKey,contract.requestKey,orderNoticeAuthorityDigest(contract),JSON.stringify(contract)]);
 execute.mockResolvedValue([{affectedRows:0}]);await expect(storeOrderNoticeAuthorization({execute} as any,10,11,contract)).rejects.toThrow();
});
it('adds authority and lease storage without inventing grants for old notifications',()=>{
 const sql=readFileSync('drizzle/0199_order_notification_authorizations.sql','utf8');expect(sql).toContain('UNIQUE KEY `uq_order_notice_authorization` (`notification_id`)');expect(sql).toContain('`claim_token`');expect(sql).not.toMatch(/INSERT INTO/i);expect(readFileSync('drizzle/meta/_journal.json','utf8')).toContain('0199_order_notification_authorizations');
});
