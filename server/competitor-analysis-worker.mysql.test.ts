import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({analyze:vi.fn(),extract:vi.fn()}));
vi.mock('./_core/websiteAnalyzer',()=>({analyzeWebsite:m.analyze,extractProducts:m.extract}));
import {closeDb,getPool} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {beginCompetitorAnalysisJob,readCompetitorAnalysisJob,settleCompetitorAnalysisJobs} from './competitor-analysis-jobs';
import {runCompetitorAnalysisWorker} from './competitor-analysis-worker';
import {readCompetitorWorkspace,readCompetitorDetail} from './competitor-workspace';
describe.skipIf(!process.env.DATABASE_URL)('competitor worker with durable local database',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,requestId:string;
 beforeEach(async()=>{vi.resetAllMocks();vi.spyOn(console,'error').mockImplementation(()=>{});owner=await createDisposableMerchant('competitor438');requestId=randomUUID();m.analyze.mockResolvedValue({_scrapedHtml:'Fixture',_scrapedText:'Fixture',_enrichedText:'',overallScore:75,seoScore:65,performanceScore:0,uxScore:70,contentQuality:80,industry:'Retail'});m.extract.mockResolvedValue([{name:'Local product',description:'Local',price:12,currency:'SAR'}]);});
 afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner?.userId].filter(Boolean));});afterAll(closeDb);
 const start=()=>beginCompetitorAnalysisJob(owner.userId,owner.merchantId,{requestId,name:'Local competitor',url:'https://example.test/'});
 it('publishes a full readable report only after a successful durable worker',async()=>{
  const accepted=await start();await runCompetitorAnalysisWorker(accepted.execution!,accepted.url!);
  expect(await readCompetitorAnalysisJob(owner.userId,owner.merchantId,{requestId})).toMatchObject({state:'completed'});
  const detail=await readCompetitorDetail(owner.userId,owner.merchantId,{id:accepted.competitorId});expect(detail.report).toMatchObject({status:'completed',products:1,scores:{performance:0}});expect(detail.products[0]).toMatchObject({name:'Local product'});
 });
 it('records extraction failure without exposing successful scores or partial products',async()=>{
  const accepted=await start();m.extract.mockRejectedValue(Error('PRIVATE_TOKEN'));await runCompetitorAnalysisWorker(accepted.execution!,accepted.url!);
  const report=await readCompetitorDetail(owner.userId,owner.merchantId,{id:accepted.competitorId});expect(report.report).toMatchObject({status:'failed',products:0,scores:{overall:null}});expect(JSON.stringify(report)).not.toContain('PRIVATE_TOKEN');
 });
 it('settles an expired worker on refresh and fences its late successful result',async()=>{
  const accepted=await start();await (await getPool())!.execute('UPDATE competitor_analysis_jobs SET lease_expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE merchant_id=?',[owner.merchantId]);await settleCompetitorAnalysisJobs(owner.userId,owner.merchantId);await runCompetitorAnalysisWorker(accepted.execution!,accepted.url!);
  expect(m.analyze).not.toHaveBeenCalled();expect((await readCompetitorWorkspace(owner.userId,owner.merchantId,{})).stats).toMatchObject({running:0,failed:1});
 });
});
