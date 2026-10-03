import {randomUUID} from 'node:crypto';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({begin:vi.fn(),readJob:vi.fn(),advance:vi.fn(),finish:vi.fn(),fail:vi.fn(),access:vi.fn(),merchant:vi.fn(),analyze:vi.fn(),create:vi.fn(),update:vi.fn(),persist:vi.fn(),ingest:vi.fn(),embed:vi.fn(),sections:vi.fn(),invalidate:vi.fn()}));
vi.mock('./accounts/merchant-access',()=>({resolveMerchantAccess:m.access}));
vi.mock('./db',()=>({getMerchantById:m.merchant,createWebsiteAnalysis:m.create,updateWebsiteAnalysis:m.update,getPool:async()=>({execute:async()=>[{affectedRows:1}]})}));
vi.mock('./db/schema-readiness',()=>({assertRuntimeSchema:async()=>undefined}));
vi.mock('./_core/websiteAnalyzer',()=>({analyzeWebsite:m.analyze,cleanScrapedText:(s:string)=>s}));
vi.mock('./knowledge/crawled-snapshot',()=>({persistCrawledKnowledge:m.persist}));
vi.mock('./ai/knowledge-engine',()=>({ingestContent:m.ingest}));
vi.mock('./ai/rag-engine',()=>({embedAllSectionsWithEvidence:m.embed}));
vi.mock('./db/knowledge',()=>({getSectionsByMerchantId:m.sections,invalidateCache:m.invalidate}));
import { websiteJobDouble } from './tests/helpers/website-job-double';
vi.mock('./knowledge/website-analysis-jobs',async original=>({...await original<typeof import('./knowledge/website-analysis-jobs')>(),beginWebsiteAnalysisJob:m.begin,readWebsiteAnalysisJob:m.readJob,advanceWebsiteAnalysisJob:m.advance,finishWebsiteAnalysisJob:m.finish,failWebsiteAnalysisJob:m.fail}));
vi.mock('./knowledge/website-analysis-execution',()=>({runWebsiteAnalysisExecution:(_scope:any,work:()=>Promise<any>)=>work(),startWebsiteAnalysisHeartbeat:()=>async()=>undefined,currentWebsiteAnalysisExecution:()=>undefined,assertActiveWebsiteAnalysisTransaction:async()=>undefined,assertWebsiteAnalysisCheckpoint:async()=>undefined}));
vi.mock('./knowledge/transaction',()=>({withKnowledgeTransaction:(_id:number,work:(tx:any)=>Promise<any>)=>work({})}));
import {sariBrainRouter} from './routers-sari-brain';
import {websiteIndexingOutcome} from '../shared/website-analysis-tracking';
let merchantId=600,jobId:string;
const evidence=(count:number)=>({selectedSections:count,attemptedSections:count,storedSections:count,reusedSections:0,unconfirmedSections:0,currentSnapshot:{sections:count,matchingEmbeddings:count,changedSinceStart:false}});
const caller=()=>sariBrainRouter.createCaller({user:{id:7,role:'user'},req:{headers:{'x-merchant-id':String(merchantId)}},res:{}} as any);
const run=async()=>{const api=caller();await api.reanalyzeWebsite({merchantId,jobId});let result:any;await vi.waitFor(async()=>{result=await api.getAnalysisStatus({merchantId,jobId});expect(result.status).toBe('completed');});return result;};
beforeEach(()=>{
 vi.resetAllMocks();merchantId++;
 const jobStore=websiteJobDouble(m.merchant);m.begin.mockImplementation(jobStore.begin);m.readJob.mockImplementation(jobStore.read);m.advance.mockImplementation(jobStore.advance);m.finish.mockImplementation(jobStore.finish);m.fail.mockImplementation(jobStore.fail);
jobId=randomUUID();m.access.mockResolvedValue({merchantId,role:'owner'});m.merchant.mockResolvedValue({id:merchantId,businessName:'Fixture',websiteUrl:'https://example.test'});m.analyze.mockResolvedValue({title:'Fixture',_scrapedText:'Local knowledge sample. '.repeat(20),overallScore:70});m.create.mockResolvedValue(10);m.ingest.mockResolvedValue({evolveResult:{added:1,merged:2,evolved:3,conflicts:4,unchanged:5}});m.embed.mockResolvedValue(evidence(2));m.sections.mockResolvedValue([{section_type:'identity'},{section_type:'sales_intel'}]);
});
it.each([0,2])('returns an observed index count %s without claiming all sections are searchable',async count=>{m.embed.mockResolvedValue(evidence(count));const r=await run();expect(r.indexingOutcome).toEqual({status:'observed',evidence:evidence(count)});expect(r.knowledgeEvolution).toEqual({added:1,merged:2,evolved:3,conflicts:4,unchanged:5});expect(r.salesIntelSummary).toEqual({totalSections:1,hasIntel:true,hasOpportunities:false});expect(m.embed).toHaveBeenCalledExactlyOnceWith(merchantId,true);});
it.each(['throw','invalid','negative'])('reports %s indexing as incomplete while retaining knowledge results',async failure=>{
 if(failure==='throw')m.embed.mockRejectedValue(Error('PRIVATE_PROVIDER_SECRET'));else m.embed.mockResolvedValue(failure==='invalid'?undefined:-1);
 const r=await run();expect(r.indexingOutcome).toEqual({status:'failed',indexedSections:null});expect(r.knowledgeEvolution.added).toBe(1);expect(r.knowledgeError).toBeNull();expect(JSON.stringify(r)).not.toContain('PRIVATE_PROVIDER_SECRET');
});
it('records that indexing was not attempted after knowledge ingestion failed',async()=>{m.ingest.mockRejectedValue(Error('PRIVATE_PROVIDER_SECRET'));const r=await run();expect(r.indexingOutcome).toEqual({status:'not_attempted',indexedSections:null});expect(r.knowledgeError).toBe('knowledge_processing_incomplete');expect(JSON.stringify(r)).not.toContain('PRIVATE_PROVIDER_SECRET');expect(m.embed).not.toHaveBeenCalled();expect(r.knowledgeEvolution).toBeNull();});
it('does not turn a failed summary read into zero sections',async()=>{m.sections.mockRejectedValue(Error('private'));expect((await run()).salesIntelSummary).toBeNull();});
it('keeps the report running while indexing is pending',async()=>{let finish!:(v:ReturnType<typeof evidence>)=>void;m.embed.mockImplementation(()=>new Promise<ReturnType<typeof evidence>>(r=>finish=r));const api=caller();await api.reanalyzeWebsite({merchantId,jobId});await vi.waitFor(()=>expect(m.embed).toHaveBeenCalledOnce());expect(await api.getAnalysisStatus({merchantId,jobId})).toMatchObject({status:'running',currentStep:'embedding'});finish(evidence(0));await vi.waitFor(async()=>expect(await api.getAnalysisStatus({merchantId,jobId})).toMatchObject({status:'completed',indexingOutcome:{status:'observed',evidence:evidence(0)}}));});
it.each([{status:'returned',indexedSections:null},{status:'returned',indexedSections:'2'},{status:'returned',indexedSections:Infinity},{status:'failed',indexedSections:2},{status:'not_attempted',indexedSections:0},{status:'returned',indexedSections:0,secret:'hidden'}])('rejects an incoherent indexing observation %j',value=>expect(websiteIndexingOutcome.safeParse(value).success).toBe(false));
it('preserves partial writes and changed snapshot evidence at the API boundary',async()=>{
 const value={...evidence(3),storedSections:1,unconfirmedSections:2,currentSnapshot:{sections:4,matchingEmbeddings:1,changedSinceStart:true}};
 m.embed.mockResolvedValue(value);expect((await run()).indexingOutcome).toEqual({status:'observed',evidence:value});
});
it('does not fill an unavailable current snapshot using the batch write count',async()=>{
 const value={...evidence(3),currentSnapshot:null};m.embed.mockResolvedValue(value);expect((await run()).indexingOutcome).toEqual({status:'observed',evidence:value});
});
it.each([{storedSections:5},{currentSnapshot:{sections:1,matchingEmbeddings:3,changedSinceStart:false}},{secret:'PRIVATE'}])('rejects inconsistent batch evidence %j from the producer',async patch=>{
 m.embed.mockResolvedValue({...evidence(3),...patch});const result=await run();expect(result.indexingOutcome).toEqual({status:'failed',indexedSections:null});expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
