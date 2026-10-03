import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeEach,describe,expect,it} from 'vitest';
import {closeDb,getPool} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {beginCompetitorAnalysisJob,closeCompetitorAnalysisAttempt,readCompetitorAnalysisJob,failCompetitorAnalysisJob} from './competitor-analysis-jobs';
describe.skipIf(!process.env.DATABASE_URL)('competitor absent-request closure races',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,requestId:string;
 const command=()=>({requestId,name:'Local',url:'https://example.test/'});
 const start=()=>beginCompetitorAnalysisJob(owner.userId,owner.merchantId,command());
 const close=()=>closeCompetitorAnalysisAttempt(owner.userId,owner.merchantId,{requestId});
 const read=()=>readCompetitorAnalysisJob(owner.userId,owner.merchantId,{requestId});
 beforeEach(async()=>{owner=await createDisposableMerchant('competitor439');other=await createDisposableMerchant('competitor439-other');requestId=randomUUID();});
 afterEach(()=>cleanupDisposableMerchants([owner.userId,other.userId]));afterAll(closeDb);
 it('persists closure without a report and refuses any later admission of that reference',async()=>{
  expect(await close()).toEqual({actorId:owner.userId,merchantId:owner.merchantId,requestId,state:'closed',competitorId:null,reportAvailable:false});await closeDb();expect(await read()).toMatchObject({state:'closed'});await expect(start()).rejects.toMatchObject({reason:'stale'});
  const [reports]=await (await getPool())!.execute<any>('SELECT id FROM competitor_analyses WHERE merchant_id=?',[owner.merchantId]);expect(reports).toHaveLength(0);
 });
 it('returns a running accepted request instead of claiming to cancel its execution',async()=>{
  const accepted=await start();expect(await close()).toMatchObject({state:'running',competitorId:accepted.competitorId});expect(await read()).toMatchObject({state:'running'});
 });
 it('returns an existing terminal receipt without replacing its meaning',async()=>{
  const accepted=await start();await failCompetitorAnalysisJob(accepted.execution!);expect(await close()).toMatchObject({state:'failed',competitorId:accepted.competitorId});
 });
 it.each([0,1,2])('serializes concurrent close/start so only one meaning can win (%s)',async()=>{
  const [closed,started]=await Promise.allSettled([close(),start()]);expect(closed.status).toBe('fulfilled');const view=await read();
  if(view.state==='closed'){expect(started.status).toBe('rejected');await expect(start()).rejects.toMatchObject({reason:'stale'});}
  else{expect(view.state).toBe('running');expect(started.status).toBe('fulfilled');expect(await close()).toMatchObject({state:'running'});}
 });
 it('deduplicates repeated concurrent closure and does not count it as an analysis attempt',async()=>{
  const receipts=await Promise.all([close(),close(),close()]);expect(receipts.every(r=>r.state==='closed')).toBe(true);
  const accepted=await beginCompetitorAnalysisJob(owner.userId,owner.merchantId,{...command(),requestId:randomUUID()});expect(accepted.created).toBe(true);
 });
 it('isolates closure across tenants and rejects a foreign actor',async()=>{
  await close();expect(await beginCompetitorAnalysisJob(other.userId,other.merchantId,command())).toMatchObject({created:true});await expect(closeCompetitorAnalysisAttempt(other.userId,owner.merchantId,{requestId})).rejects.toMatchObject({reason:'forbidden'});
 });
 it('enforces the database state/reference invariant',async()=>{
  await close();await expect((await getPool())!.execute("UPDATE competitor_analysis_jobs SET state='failed' WHERE merchant_id=?",[owner.merchantId])).rejects.toBeTruthy();
 });
});
