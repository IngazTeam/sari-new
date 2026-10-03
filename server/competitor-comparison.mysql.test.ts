import {afterAll,afterEach,beforeEach,describe,expect,it} from 'vitest';
import {closeDb,getPool} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {readCompetitorComparison,readCompetitorComparisonChoices} from './competitor-workspace';
describe.skipIf(!process.env.DATABASE_URL)('scoped stored competitor comparison',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,baseline:number,competitor:number;
 const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
 const create=async(source:'website'|'competitor',merchantId=owner.merchantId,name='Local 100%_fixture',status='completed')=>Number((await q(`INSERT INTO ${source==='website'?'website_analyses':'competitor_analyses'} (merchant_id,${source==='website'?'title':'name'},url,status,overall_score,seo_score,performance_score) VALUES (?,?,?,?,75,60,0)`,[merchantId,name,'https://example.test/',status])).insertId);
 const product=async(source:'website'|'competitor',parent:number,price:number|null,currency='SAR',merchantId=owner.merchantId)=>q(`INSERT INTO ${source==='website'?'extracted_products':'competitor_products'} (merchant_id,${source==='website'?'analysis_id':'competitor_id'},name,price,currency) VALUES (?,?,'Local product',?,?)`,[merchantId,parent,price,currency]);
 const read=()=>readCompetitorComparison(owner.userId,owner.merchantId,{analysisId:baseline,competitorIds:[competitor]});
 beforeEach(async()=>{owner=await createDisposableMerchant('comparison441');other=await createDisposableMerchant('comparison441-other');baseline=await create('website');competitor=await create('competitor');});
 afterEach(()=>cleanupDisposableMerchants([owner.userId,other.userId]));afterAll(closeDb);
 it('compares actual stored estimates including zero without inventing sales proficiency',async()=>{
  await q('UPDATE competitor_analyses SET overall_score=85,seo_score=101 WHERE id=?',[competitor]);const data=await read();expect(data).toMatchObject({actorId:owner.userId,merchantId:owner.merchantId,evidence:'stored_website_estimates',priceComparability:'products_not_matched',salesProficiency:null});
  expect(data.competitors[0].differences).toContainEqual({metric:'overall',baseline:75,competitor:85,difference:-10});expect(data.competitors[0].differences).toContainEqual({metric:'seo',baseline:60,competitor:null,difference:null});expect(data.competitors[0].differences).toContainEqual({metric:'performance',baseline:0,competitor:0,difference:0});
 });
 it('separates currencies and unknown prices and excludes cross-tenant children',async()=>{
  await product('website',baseline,10,'SAR');await product('website',baseline,30,'USD');await product('website',baseline,0,'SAR');await product('website',baseline,900,'SAR',other.merchantId);
  await product('competitor',competitor,20,'SAR');await product('competitor',competitor,40,'EUR');await product('competitor',competitor,null,'USD');await product('competitor',competitor,500,'SAR',other.merchantId);
  const data=await read();expect(data.baseline.report).toMatchObject({products:3,excludedProducts:1});expect(data.baseline.pricing).toMatchObject({pricedCount:2,unverifiedCount:1});expect(data.baseline.pricing.groups.map(g=>g.currency)).toEqual(['SAR','USD']);expect(data.competitors[0].report).toMatchObject({products:3,excludedProducts:1});expect(data.competitors[0].commonCurrencies).toEqual(['SAR']);expect(data.competitors[0].pricing.groups.map(g=>g.currency)).toEqual(['EUR','SAR']);
 });
 it('changes the comparison fingerprint when a selected score or aggregate price changes',async()=>{
  const a=await read();expect((await read()).revision).toBe(a.revision);await q('UPDATE competitor_analyses SET overall_score=76 WHERE id=?',[competitor]);const b=await read();expect(b.revision).not.toBe(a.revision);await product('website',baseline,20);expect((await read()).revision).not.toBe(b.revision);
 });
 it.each(['baseline','competitor'])('rejects foreign %s instead of silently dropping it',async kind=>{
  const foreign=await create(kind==='baseline'?'website':'competitor',other.merchantId);
  await expect(readCompetitorComparison(owner.userId,owner.merchantId,{analysisId:kind==='baseline'?foreign:baseline,competitorIds:kind==='competitor'?[competitor,foreign]:[competitor]})).rejects.toMatchObject({reason:'missing'});
 });
 it.each(['pending','analyzing','failed'])('rejects a %s report as comparison evidence',async status=>{
  await q('UPDATE website_analyses SET status=? WHERE id=?',[status,baseline]);await expect(read()).rejects.toMatchObject({reason:'running'});
  await q("UPDATE website_analyses SET status='completed' WHERE id=?",[baseline]);await q('UPDATE competitor_analyses SET status=? WHERE id=?',[status,competitor]);await expect(read()).rejects.toMatchObject({reason:'running'});
 });
 it('rejects a revoked explicit membership despite ownership',async()=>{await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",[owner.merchantId,owner.userId]);await expect(read()).rejects.toMatchObject({reason:'forbidden'});});
 it('keeps private report bodies and provider errors out of the comparison',async()=>{await q("UPDATE website_analyses SET scraped_content='PRIVATE_BODY',error_message='PRIVATE_ERROR' WHERE id=?",[baseline]);await q("UPDATE competitor_analyses SET strengths='PRIVATE_NOTES',error_message='PRIVATE_PROVIDER' WHERE id=?",[competitor]);expect(JSON.stringify(await read())).not.toContain('PRIVATE_');});
 it.each(['website','competitor'] as const)('paginates all completed %s choices and searches literal wildcard text',async source=>{
  for(let i=0;i<28;i++)await create(source,owner.merchantId,'Local 100%_fixture '+i);await create(source,owner.merchantId,'Hidden','analyzing');await create(source,other.merchantId,'Foreign');
  const page=await readCompetitorComparisonChoices(owner.userId,owner.merchantId,{source,query:'%_',page:1});expect(page).toMatchObject({matched:29,pages:2,currentPage:1});expect(page.rows).toHaveLength(25);
  const next=await readCompetitorComparisonChoices(owner.userId,owner.merchantId,{source,query:'%_',page:999});expect(next.currentPage).toBe(2);expect(next.rows).toHaveLength(4);expect(new Set([...page.rows,...next.rows].map(r=>r.id)).size).toBe(29);
 });
});
