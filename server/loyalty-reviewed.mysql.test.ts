import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {createSessionId,hashSessionId} from './_core/session-security';
import {loyaltyRouter} from './routers-loyalty';
import {loyaltyDefaults} from '../shared/loyalty-input';
describe.skipIf(!process.env.DATABASE_URL)('Reviewed loyalty workspace and durable receipts',()=>{
 let a:Awaited<ReturnType<typeof createDisposableMerchant>>,b:typeof a,sessionId:string,caller:ReturnType<typeof loyaltyRouter.createCaller>;
 const phone='966500000523';
 const q=async(sql:string,args:any[]=[]) =>(await (await getPool())!.execute<any>(sql,args))[0];
 const read=()=>caller.workspace({view:'customers',customerPhone:phone});
 const base=()=>({reviewed:true as const,requestId:randomUUID()});
 const settings=async()=>{const d=await read();return caller.reviewedAction({...base(),kind:'settings',expectedVersion:d.settingsRevision,values:{...loyaltyDefaults,isEnabled:1}});};
 const credit=async(points=100)=>{const d=await read();return {...base(),kind:'points' as const,customerPhone:phone,mode:'credit' as const,points,reason:'Test points',reasonAr:'نقاط اختبار',expectedVersion:d.customerRevision};};
 const createReward=async()=>caller.reviewedAction({...base(),kind:'createReward',values:{title:'Gift',titleAr:'هدية',type:'gift',pointsCost:50,isActive:1}});
 beforeEach(async()=>{
  a=await createDisposableMerchant('loyalty523');b=await createDisposableMerchant('loyalty523other');sessionId=createSessionId();
  await q('INSERT INTO auth_sessions(user_id,token_id_hash,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))',[a.userId,hashSessionId(sessionId)]);
  caller=loyaltyRouter.createCaller({user:{id:a.userId,role:'user'},session:{sessionId},req:{headers:{'x-merchant-id':String(a.merchantId)}}} as any);
 });
 afterEach(async()=>{vi.restoreAllMocks();for(const x of [a,b])if(x){await q('DELETE FROM loyalty_transactions WHERE merchant_id=?',[x.merchantId]);await q('DELETE FROM loyalty_redemptions WHERE merchant_id=?',[x.merchantId]);await q('DELETE FROM loyalty_points WHERE merchant_id=?',[x.merchantId]);}await cleanupDisposableMerchants([a?.userId,b?.userId].filter(Boolean));});afterAll(closeDb);
 it('returns bound empty state without activating or creating records',async()=>{
  const d=await read();expect(d).toMatchObject({actorId:a.userId,merchantId:a.merchantId,settings:null,customer:null,customers:[],rewards:[],tiers:[],total:0,hasMore:false});expect(d.settingsRevision).toMatch(/^[a-f0-9]{64}$/);expect(await q('SELECT id FROM loyalty_settings WHERE merchant_id=?',[a.merchantId])).toEqual([]);
 });
 it('rejects a write without the review acknowledgement or with an invalid request key',async()=>{
  const i=await credit();await expect(caller.reviewedAction({...i,reviewed:false} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});await expect(caller.reviewedAction({...i,requestId:'invalid'})).rejects.toMatchObject({code:'BAD_REQUEST'});expect((await read()).customer).toBeNull();
 });
 it('commits settings and their receipt together, replays once, and rejects altered reuse',async()=>{
  const d=await read(),i={...base(),kind:'settings' as const,expectedVersion:d.settingsRevision,values:{...loyaltyDefaults,isEnabled:1}};
  const receipt=await caller.reviewedAction(i);expect(await caller.reviewedAction(i)).toEqual(receipt);expect(await caller.receipt({requestId:i.requestId})).toEqual(receipt);expect((await read()).tiers).toHaveLength(3);
  await expect(caller.reviewedAction({...i,values:{...i.values,isEnabled:0}})).rejects.toMatchObject({code:'CONFLICT'});expect(await q('SELECT id FROM loyalty_action_receipts WHERE merchant_id=?',[a.merchantId])).toHaveLength(1);
 });
 it('rejects stale settings instead of overwriting a different save',async()=>{const d=await read();await settings();await expect(caller.reviewedAction({...base(),kind:'settings',expectedVersion:d.settingsRevision,values:{...loyaltyDefaults}})).rejects.toMatchObject({code:'CONFLICT',message:'loyalty:review_changed'});expect((await read()).settings?.isEnabled).toBe(1);});
 it('serializes duplicate point submissions into one adjustment and one receipt',async()=>{const i=await credit();const results=await Promise.all([caller.reviewedAction(i),caller.reviewedAction(i),caller.reviewedAction(i)]);expect(results[0]).toEqual(results[1]);expect(results[1]).toEqual(results[2]);expect((await read()).customer?.totalPoints).toBe(100);expect((await read()).transactions).toHaveLength(1);});
 it('rejects a stale balance review and an overdraft without creating receipts',async()=>{
  const i=await credit();await caller.reviewedAction(i);await expect(caller.reviewedAction({...i,...base()})).rejects.toMatchObject({code:'CONFLICT'});
  const d=await read();await expect(caller.reviewedAction({...base(),kind:'points',mode:'debit',customerPhone:phone,points:101,reason:'Test',reasonAr:'اختبار',expectedVersion:d.customerRevision})).rejects.toMatchObject({code:'PRECONDITION_FAILED'});expect((await read()).customer?.totalPoints).toBe(100);expect(await q('SELECT id FROM loyalty_action_receipts WHERE merchant_id=?',[a.merchantId])).toHaveLength(1);
 });
 it('recovers a committed write after a lost acknowledgement without a second credit',async()=>{
  const i=await credit(),pool=(await getPool())!,original=pool.getConnection.bind(pool);let destroyed:any;
  vi.spyOn(pool,'getConnection').mockImplementationOnce(async()=>{const tx=await original(),commit=tx.commit.bind(tx);destroyed=vi.spyOn(tx,'destroy');vi.spyOn(tx,'commit').mockImplementationOnce(async()=>{await commit();throw Error('Lost acknowledgement');});return tx;});
  await expect(caller.reviewedAction(i)).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR',message:'loyalty:unknown'});expect(destroyed).toHaveBeenCalled();const receipt=await caller.receipt({requestId:i.requestId});expect(receipt?.newBalance).toBe(100);expect(await caller.reviewedAction(i)).toEqual(receipt);expect((await read()).transactions).toHaveLength(1);
 });
 it('rolls back points when the receipt insertion acknowledgement is invalid',async()=>{
  const i=await credit(),pool=(await getPool())!,original=pool.getConnection.bind(pool);let restore:()=>void=()=>{};
  vi.spyOn(pool,'getConnection').mockImplementationOnce(async()=>{const tx=await original(),execute=tx.execute.bind(tx);const spy=vi.spyOn(tx,'execute').mockImplementation(async(...args:any[])=>{const result=await (execute as any)(...args);if(String(args[0]).startsWith('INSERT INTO loyalty_action_receipts'))result[0].affectedRows=0;return result;});restore=()=>spy.mockRestore();return tx;});
  try{await expect(caller.reviewedAction(i)).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR'});}finally{restore();}
  expect((await read()).customer).toBeNull();expect(await caller.receipt({requestId:i.requestId})).toBeNull();
 });
 it('reviews each tier version and preserves all tier fields',async()=>{
  await settings();const tier=(await read()).tiers[0],{id,revision,createdAt,updatedAt,...values}=tier;const i={...base(),kind:'tier' as const,id,expectedVersion:revision,values:{...values,name:'Starter',nameAr:'بداية',freeShipping:1,benefits:'["Priority help"]'}};await caller.reviewedAction(i);expect((await read()).tiers[0]).toMatchObject({name:'Starter',freeShipping:1,benefits:'["Priority help"]'});await expect(caller.reviewedAction({...i,...base()})).rejects.toMatchObject({code:'CONFLICT'});
 });
 it('replays reward creation once, validates its reviewed edit and preserves history on delete',async()=>{
  await settings();const i={...base(),kind:'createReward' as const,values:{title:'Gift',titleAr:'هدية',type:'gift' as const,pointsCost:50,isActive:1}};const receipt=await caller.reviewedAction(i);expect(await caller.reviewedAction(i)).toEqual(receipt);
  const r=(await caller.workspace({view:'rewards'})).rewards[0],{id,revision,currentRedemptions,available,redemptionRevision,createdAt,updatedAt,...values}=r;
  await caller.reviewedAction({...base(),kind:'reward',id,expectedVersion:revision,values:{...values,title:'New gift'}});await expect(caller.reviewedAction({...base(),kind:'deleteReward',id,expectedVersion:revision})).rejects.toMatchObject({code:'CONFLICT'});
  const fresh=(await caller.workspace({view:'rewards'})).rewards[0];const deletion={...base(),kind:'deleteReward' as const,id,expectedVersion:fresh.revision};await caller.reviewedAction(deletion);await caller.reviewedAction(deletion);expect((await caller.workspace({view:'rewards'})).rewards).toEqual([]);
 });
 it('binds redemption review to customer balance, reward terms and program settings',async()=>{
  await settings();await caller.reviewedAction(await credit());await createReward();const d=await read(),r=d.rewards[0];await caller.updateSettings({isEnabled:0});await expect(caller.reviewedAction({...base(),kind:'redeem',id:r.id,customerPhone:phone,expectedVersion:r.redemptionRevision!})).rejects.toMatchObject({code:'CONFLICT'});expect((await read()).customer?.totalPoints).toBe(100);
 });
 it('replays redemption once and reviews terminal status changes',async()=>{
  await settings();await caller.reviewedAction(await credit());await createReward();const d=await read(),r=d.rewards[0],i={...base(),kind:'redeem' as const,id:r.id,customerPhone:phone,expectedVersion:r.redemptionRevision!};await caller.reviewedAction(i);await caller.reviewedAction(i);const fresh=await read();expect(fresh.customer?.totalPoints).toBe(50);expect(fresh.redemptions).toHaveLength(1);
  const rd=fresh.redemptions[0];await caller.reviewedAction({...base(),kind:'redemption',id:rd.id,expectedVersion:rd.revision,status:'used',notes:'Collected',orderId:null});const used=(await read()).redemptions[0];expect(used.usedAt).not.toBeNull();await expect(caller.reviewedAction({...base(),kind:'redemption',id:used.id,expectedVersion:used.revision,status:'approved',notes:'',orderId:null})).rejects.toMatchObject({code:'CONFLICT'});
 });
 it('bounds and pages customer data, searches all pages and treats wildcard text literally',async()=>{
  for(let i=0;i<28;i++)await q('INSERT INTO loyalty_points(merchant_id,customer_phone,customer_name,total_points,lifetime_points) VALUES (?,?,?,?,?)',[a.merchantId,'9665'+String(i).padStart(8,'0'),i===27?'Unique%name':'Sample',i,i]);
  const first=await caller.workspace({view:'customers'}),second=await caller.workspace({view:'customers',offset:25});expect(first.customers).toHaveLength(25);expect(first.hasMore).toBe(true);expect(first.total).toBe(28);expect(second.customers).toHaveLength(3);expect(second.hasMore).toBe(false);expect(first.customers.map(c=>c.id).some(id=>second.customers.some(c=>c.id===id))).toBe(false);
  expect((await caller.workspace({view:'customers',search:'%'})).customers).toHaveLength(1);expect((await caller.workspace({view:'customers',search:'Unique'})).total).toBe(1);
 });
 it('pages rewards and history with truthful totals',async()=>{
  for(let i=0;i<26;i++)await q("INSERT INTO loyalty_rewards(merchant_id,title,title_ar,type,points_cost) VALUES (?,'Reward','مكافأة','gift',?)",[a.merchantId,i+1]);const page=await caller.workspace({view:'rewards'});expect(page.rewards).toHaveLength(25);expect(page.hasMore).toBe(true);expect(page.total).toBe(26);
  for(let i=0;i<26;i++)await caller.reviewedAction(await credit(1));const d=await read();expect(d.transactions).toHaveLength(25);expect(d.hasMoreTransactions).toBe(true);expect((await caller.workspace({view:'customers',customerPhone:phone,historyOffset:25})).transactions).toHaveLength(1);
 });
 it('requires the same active actor for receipt reads/replay and denies revoked sessions',async()=>{
  const i=await credit();await caller.reviewedAction(i);await q('UPDATE loyalty_action_receipts SET actor_id=? WHERE merchant_id=?',[b.userId,a.merchantId]);await expect(caller.receipt({requestId:i.requestId})).rejects.toMatchObject({code:'CONFLICT'});await expect(caller.reviewedAction(i)).rejects.toMatchObject({code:'CONFLICT'});
  await q('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP() WHERE user_id=?',[a.userId]);await expect(caller.receipt({requestId:i.requestId})).rejects.toMatchObject({code:'UNAUTHORIZED'});await expect(read()).rejects.toMatchObject({code:'UNAUTHORIZED'});
 });
 it('returns no receipt for a different tenant and never reuses a foreign review hash',async()=>{
  const i=await credit();await caller.reviewedAction(i);await q('UPDATE loyalty_action_receipts SET merchant_id=? WHERE merchant_id=?',[b.merchantId,a.merchantId]);expect(await caller.receipt({requestId:i.requestId})).toBeNull();
  const other=await q('SELECT id FROM loyalty_points WHERE merchant_id=?',[a.merchantId]);await q('UPDATE loyalty_points SET merchant_id=? WHERE id=?',[b.merchantId,other[0].id]);const d=await read();expect(d.customer).toBeNull();expect(d.customers).toEqual([]);
 });
});
