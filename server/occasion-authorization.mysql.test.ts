import {readFileSync} from 'node:fs';
import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {reviewOccasionAction,applyOccasionAction} from './occasion-actions';
import {getUpcomingOccasions} from '../shared/occasion-calendar';
import {parseOccasionAuthorization,ensureOccasionAuthorizationSchema} from './occasion-authorization';

describe.skipIf(!process.env.DATABASE_URL)('durable activation grants on disposable MySQL tenants',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,id:number;
 const q=async(sql:string,args:any[]=[]) =>(await (await getPool())!.execute<any>(sql,args))[0];
 const grants=()=>q('SELECT * FROM occasion_authorizations WHERE occasion_id=? ORDER BY id',[id]);
 const definition=()=>q('SELECT enabled,status FROM occasion_campaigns WHERE id=?',[id]);
 const toggle=async(enabled:boolean)=>{const target={action:'toggle' as const,id,enabled},review=await reviewOccasionAction(owner.userId,other.merchantId,target);return {target,reviewRevision:review.reviewRevision,acknowledged:true as const};};
 beforeEach(async()=>{
  owner=await createDisposableMerchant('occasion-grant');other=await createDisposableMerchant('occasion-scope');await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[other.merchantId,owner.userId]);
  const choice=getUpcomingOccasions()[0],target={action:'create' as const,occasionType:choice.type,year:choice.year},r=await reviewOccasionAction(owner.userId,other.merchantId,target);
  id=(await applyOccasionAction(owner.userId,other.merchantId,{target,reviewRevision:r.reviewRevision,acknowledged:true})).id;
 });
 afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);
 it('records the exact approving member and reviewed terms, never the unrelated merchant owner',async()=>{
  expect(await grants()).toEqual([]);const value=await toggle(true);await applyOccasionAction(owner.userId,other.merchantId,value);const [grant]=await grants();
  expect(grant).toMatchObject({actor_id:owner.userId,merchant_id:other.merchantId,occasion_id:id,active:1,review_revision:value.reviewRevision,revoked_at:null});
  expect(parseOccasionAuthorization(grant,other.merchantId,id)).toMatchObject({actorId:owner.userId,merchantId:other.merchantId,occasionId:id,terms:{sendsImmediately:false,deliveryGuaranteed:false,salesVerified:false}});
  expect(await definition()).toEqual([{enabled:1,status:'pending'}]);expect(parseOccasionAuthorization(grant,owner.merchantId,id)).toBeNull();
 });
 it('retains revoked history, appends a new approval, and never duplicates a replay',async()=>{
  const first=await toggle(true);await applyOccasionAction(owner.userId,other.merchantId,first);await expect(applyOccasionAction(owner.userId,other.merchantId,first)).rejects.toMatchObject({reason:'stale'});expect(await grants()).toHaveLength(1);
  await applyOccasionAction(owner.userId,other.merchantId,await toggle(false));const [old]=await grants();expect(old.active).toBeNull();expect(old.revoked_at).not.toBeNull();expect(parseOccasionAuthorization(old,other.merchantId,id)).toBeNull();
  await applyOccasionAction(owner.userId,other.merchantId,await toggle(true));const history=await grants();expect(history).toHaveLength(2);expect(history[0].reviewed_contract).toEqual(old.reviewed_contract);expect(history[1].active).toBe(1);expect(history[1].grant_key).not.toBe(old.grant_key);
 });
 it('rolls back the enabled flag when persisting its authorization fails',async()=>{
  const value=await toggle(true),pool=(await getPool())!,tx=await pool.getConnection(),native=tx.execute.bind(tx);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(tx);
  vi.spyOn(tx,'execute').mockImplementation((async(sql:any,args:any)=>{if(String(sql).startsWith('INSERT INTO occasion_authorizations'))throw Error('Injected grant failure');return native(sql,args);}) as any);
  await expect(applyOccasionAction(owner.userId,other.merchantId,value)).rejects.toMatchObject({reason:'unavailable'});vi.restoreAllMocks();expect(await definition()).toEqual([{enabled:0,status:'pending'}]);expect(await grants()).toEqual([]);
 });
 it('enforces one active grant and valid revocation/prepared pairs in storage',async()=>{
  await applyOccasionAction(owner.userId,other.merchantId,await toggle(true));const [grant]=await grants();
  await expect(q('UPDATE occasion_authorizations SET active=0 WHERE id=?',[grant.id])).rejects.toThrow();
  await expect(q('UPDATE occasion_authorizations SET active=NULL WHERE id=?',[grant.id])).rejects.toThrow();
  await expect(q('UPDATE occasion_authorizations SET prepared_campaign_id=77 WHERE id=?',[grant.id])).rejects.toThrow();
  await expect(q(`INSERT INTO occasion_authorizations (grant_key,occasion_id,merchant_id,actor_id,review_revision,contract_digest,reviewed_contract)
    SELECT UUID(),occasion_id,merchant_id,actor_id,review_revision,contract_digest,reviewed_contract FROM occasion_authorizations WHERE id=?`,[grant.id])).rejects.toMatchObject({code:'ER_DUP_ENTRY'});
  expect((await grants())[0]).toMatchObject({active:1,revoked_at:null,prepared_campaign_id:null});
 });
 it('replaying additive migration never invents an approval for legacy enabled definitions',async()=>{
  await q('UPDATE occasion_campaigns SET enabled=1 WHERE id=?',[id]);const sql=readFileSync('drizzle/0195_occasion_authorizations.sql','utf8');await (await getPool())!.query(sql);await ensureOccasionAuthorizationSchema();
  expect(await grants()).toEqual([]);expect(await definition()).toEqual([{enabled:1,status:'pending'}]);
 });
 it('revocation and deletion of the acting member do not erase the stored historical actor identity',async()=>{
  await applyOccasionAction(owner.userId,other.merchantId,await toggle(true));await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[other.merchantId,owner.userId]);
  await expect(reviewOccasionAction(owner.userId,other.merchantId,{action:'toggle',id,enabled:false})).rejects.toMatchObject({reason:'forbidden'});expect((await grants())[0].actor_id).toBe(owner.userId);
  await cleanupDisposableMerchants([owner.userId]);expect(await q('SELECT id FROM users WHERE id=?',[owner.userId])).toEqual([]);expect((await grants())[0].actor_id).toBe(owner.userId);
 });
});
