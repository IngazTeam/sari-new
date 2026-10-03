import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ begin:vi.fn(),readJob:vi.fn(),advance:vi.fn(),finish:vi.fn(),fail:vi.fn(), access:vi.fn(), merchant:vi.fn(), analyze:vi.fn(), list:vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({resolveMerchantAccess:m.access}));
vi.mock('./db', () => ({getMerchantById:m.merchant}));
vi.mock('./_core/websiteAnalyzer', () => ({analyzeWebsite:m.analyze,cleanScrapedText:(s:string)=>s}));
vi.mock('./knowledge/page-workspace', () => ({listPageWorkspace:m.list}));
import { websiteJobDouble } from './tests/helpers/website-job-double';
vi.mock('./knowledge/website-analysis-jobs',async original=>({...await original<typeof import('./knowledge/website-analysis-jobs')>(),beginWebsiteAnalysisJob:m.begin,readWebsiteAnalysisJob:m.readJob,advanceWebsiteAnalysisJob:m.advance,finishWebsiteAnalysisJob:m.finish,failWebsiteAnalysisJob:m.fail}));
vi.mock('./knowledge/website-analysis-execution',()=>({runWebsiteAnalysisExecution:(_scope:any,work:()=>Promise<any>)=>work(),startWebsiteAnalysisHeartbeat:()=>async()=>undefined,currentWebsiteAnalysisExecution:()=>undefined,assertActiveWebsiteAnalysisTransaction:async()=>undefined,assertWebsiteAnalysisCheckpoint:async()=>undefined}));
vi.mock('./knowledge/transaction',()=>({withKnowledgeTransaction:(_id:number,work:(tx:any)=>Promise<any>)=>work({})}));
import { sariBrainRouter } from './routers-sari-brain';
let merchantId = 200;
const jobId = '00000000-0000-4000-8000-000000000001';
const caller = () => sariBrainRouter.createCaller({user:{id:7,role:'user'},req:{headers:{'x-merchant-id':String(merchantId)}},res:{},merchantId:999} as any);
beforeEach(() => {
  vi.clearAllMocks(); merchantId++;
 const jobStore=websiteJobDouble(m.merchant);m.begin.mockImplementation(jobStore.begin);m.readJob.mockImplementation(jobStore.read);m.advance.mockImplementation(jobStore.advance);m.finish.mockImplementation(jobStore.finish);m.fail.mockImplementation(jobStore.fail);

  m.access.mockResolvedValue({merchantId,role:'owner'});
  m.merchant.mockImplementation(async id => ({id,businessName:'Fixture',websiteUrl:'https://example.test'}));
  m.analyze.mockImplementation(() => new Promise(() => {}));
  m.list.mockResolvedValue({saved:3,enabled:2});
});
it.each(['getAnalysisStatus','reanalyzeWebsite','getWebsiteKnowledge'] as const)('blocks mismatched scope before %s accesses data or launches work', async name => {
  const input = name === 'getWebsiteKnowledge' ? {merchantId:999} : {merchantId:999,jobId};
  await expect((caller()[name] as any)(input)).rejects.toMatchObject({code:'CONFLICT'});
  expect(m.merchant).not.toHaveBeenCalled(); expect(m.list).not.toHaveBeenCalled(); expect(m.analyze).not.toHaveBeenCalled();
});
it.each(['viewer','sales_supervisor'])('blocks %s from starting analysis while preserving scoped status reading', async role => {
  m.access.mockResolvedValue({merchantId,role});
  await expect(caller().reanalyzeWebsite({merchantId,jobId})).rejects.toMatchObject({code:'FORBIDDEN'});
  expect(await caller().getAnalysisStatus({merchantId,jobId})).toEqual({merchantId,jobId,status:'idle'});
  expect(await caller().getWebsiteKnowledge({merchantId})).toEqual({merchantId,totalPages:3,activePages:2,canManage:false});
  expect(m.analyze).not.toHaveBeenCalled();
});
it('returns attempt identity and joins the current run without launching a duplicate', async () => {
  expect(await caller().reanalyzeWebsite({merchantId,jobId})).toEqual({merchantId,jobId,started:true,alreadyRunning:false});
  expect(await caller().reanalyzeWebsite({merchantId,jobId})).toEqual({merchantId,jobId,started:true,alreadyRunning:true});
  expect(await caller().reanalyzeWebsite({merchantId,jobId:'00000000-0000-4000-8000-000000000002'})).toEqual({merchantId,jobId,started:true,alreadyRunning:true});
  await vi.waitFor(() => expect(m.analyze).toHaveBeenCalledExactlyOnceWith('https://example.test',merchantId));
  expect(await caller().getAnalysisStatus({merchantId,jobId})).toMatchObject({merchantId,jobId,status:'running'});
  expect(await caller().getAnalysisStatus({merchantId,jobId:'00000000-0000-4000-8000-000000000002'})).toEqual({merchantId,jobId:'00000000-0000-4000-8000-000000000002',status:'idle'});
});
