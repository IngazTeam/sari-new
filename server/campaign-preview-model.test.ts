import {readFileSync,existsSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {CampaignPreviewModel,campaignModes,campaignQueries,campaignMutations} from '../prototypes/tenant-dashboard/src/campaign-preview-model';
import {campaignPreviewHref,previewNavigation} from '../prototypes/tenant-dashboard/src/campaign-preview-router';
import {campaignPerformanceSchema} from '../shared/campaign-performance';
import {campaignReportSchema,campaignReportExportSchema} from '../shared/campaign-report';
const draft={name:'Local draft',message:'Sample local message',targetAudience:JSON.stringify({lastActivityDays:45,purchaseCountMin:0,purchaseCountMax:10})};
const read=(m:CampaignPreviewModel,name:string,input?:any)=>{const result=m.read('campaigns.'+name,input);expect(result.error).toBeNull();expect(result.data).toBeDefined();return result.data;};
describe('actual campaign preview contracts',()=>{
  it('covers every current campaign page read and mutation, including imperative full export',()=>{
    const routes=JSON.parse(readFileSync('docs/audits/tenant-features-2026-09-30/coverage.json','utf8')).routes.filter((r:any)=>/^\/merchant\/campaigns(?:\/|$)/.test(r.route));
    expect(routes).toHaveLength(5);expect([...new Set(routes.flatMap((r:any)=>r.queries))].sort()).toEqual([...campaignQueries,'campaigns.reportExport'].sort());expect([...new Set(routes.flatMap((r:any)=>r.mutations))].sort()).toEqual([...campaignMutations].sort());
    expect(readFileSync('client/src/components/merchant/CampaignReportWorkspace.tsx','utf8')).toContain('utils.campaigns.reportExport.fetch');
  });
  it.each(campaignModes)('initializes the %s state without unscoped records',mode=>{
    for(const id of [258,259]){const m=new CampaignPreviewModel(id,mode);expect(m.read('auth.me').data?.id??null).toBe(mode==='session'?null:id+1000);expect(m.read('merchants.getCurrent').data?.id??null).toBe(mode==='forbidden'?null:id);expect(m.operations).toBe(0);}
  });
  it.each([258,259])('paginates and filters the complete sample for tenant %s',id=>{
    const m=new CampaignPreviewModel(id);const a=read(m,'workspace',{}),b=read(m,'workspace',{page:2});expect(a.rows).toHaveLength(25);expect(b.rows).toHaveLength(6);expect(new Set([...a.rows,...b.rows].map(r=>r.id)).size).toBe(31);
    expect(read(m,'workspace',{status:'draft'}).rows.every(r=>r.status==='draft')).toBe(true);expect(read(m,'workspace',{search:'31'}).rows.map(r=>r.id)).toEqual([31]);expect(read(m,'workspace',{needsReview:true}).rows.every(r=>r.queue.needsReview>0)).toBe(true);
    for(const days of [7,30,90]){const data=read(m,'performanceSnapshot',{days});expect(campaignPerformanceSchema.safeParse(data).success).toBe(true);expect(data.timeline.rows).toHaveLength(days);}
    for(const view of ['recipients','results']){const report=read(m,'reportWorkspace',{id:3,view}),next=read(m,'reportWorkspace',{id:3,view,page:2});expect(campaignReportSchema.safeParse(report).success).toBe(true);expect(report.rows).toHaveLength(25);expect(next.rows).toHaveLength(6);}
    expect(read(m,'editorWorkspace',{}).campaign).toBeNull();expect(read(m,'editorWorkspace',{id:1}).campaign.audience.filters.purchaseCountMin).toBe(0);expect(read(m,'detailsWorkspace',{id:3}).queue.total).toBe(31);
  });
  it('exports all filtered rows, not the current 25-row page',async()=>{const m=new CampaignPreviewModel(258),all=await m.exportReport({id:3}),filtered=await m.exportReport({id:3,status:'manual_review'});expect(campaignReportExportSchema.safeParse(all).success).toBe(true);expect(all.rows).toHaveLength(31);expect(filtered.rows).toHaveLength(4);});
  it('creates, reviews, edits, sends and then reads the same local record without inventing acceptance',async()=>{
    const m=new CampaignPreviewModel(258),created=await m.mutate('campaigns.create',draft),id=created.id,first=read(m,'detailsWorkspace',{id});expect(first.campaign.name).toBe(draft.name);
    await m.mutate('campaigns.update',{...draft,name:'Updated',id,expectedDefinition:first.campaign.definitionKey});const edited=read(m,'detailsWorkspace',{id});expect(edited.campaign.name).toBe('Updated');expect(edited.campaign.definitionKey).not.toBe(first.campaign.definitionKey);
    await expect(m.mutate('campaigns.send',{id,expectedDefinition:first.campaign.definitionKey})).rejects.toMatchObject({data:{code:'CONFLICT'}});
    await m.mutate('campaigns.send',{id,expectedDefinition:edited.campaign.definitionKey});const sent=read(m,'detailsWorkspace',{id});expect(sent.campaign.status).toBe('sending');expect(sent.queue).toMatchObject({total:31,accepted:0,awaiting:31});expect(read(m,'reportWorkspace',{id}).summary.results.total).toBe(0);expect(m.operations).toBe(3);
  });
  it('keeps manual-review acknowledgment separate from acceptance and rejects unsafe deletion',async()=>{
    const m=new CampaignPreviewModel(258);await expect(m.mutate('campaigns.delete',{id:5})).rejects.toMatchObject({data:{code:'CONFLICT'}});await m.mutate('campaigns.acknowledgeManualReview',{id:5});expect(read(m,'detailsWorkspace',{id:5}).queue).toMatchObject({accepted:10,needsReview:0,suppressed:8});await m.mutate('campaigns.delete',{id:1});expect(m.read('campaigns.detailsWorkspace',{id:1}).error).toMatchObject({data:{code:'NOT_FOUND'}});
  });
  it.each(['readonly','forbidden','session','foreign','failure','stale-error'] as const)('rejects local writes in %s',async mode=>{const m=new CampaignPreviewModel(258,mode);for(const name of campaignMutations)await expect(m.mutate(name,{...draft,id:1})).rejects.toMatchObject({data:{code:'FORBIDDEN'}});expect(m.operations).toBe(0);});
  it('retains pending work until explicitly completed, and discards it when its tenant is disposed',async()=>{
    const m=new CampaignPreviewModel(258,'pending-save'),promise=m.mutate('campaigns.create',draft);expect(m.pending).toBe(1);expect(m.operations).toBe(0);m.finishPending();await expect(promise).resolves.toMatchObject({id:32});
    const b=new CampaignPreviewModel(259,'pending-save'),late=b.mutate('campaigns.create',draft);const rejected=expect(late).rejects.toMatchObject({data:{code:'CONFLICT'}});b.dispose();await rejected;expect(b.operations).toBe(0);
  });
  it.each([0,-1,999,1.5,NaN])('rejects invalid or absent record %s on every scoped read',id=>{const m=new CampaignPreviewModel(258);for(const method of ['detailsWorkspace','editorWorkspace','reportWorkspace'])expect(m.read('campaigns.'+method,{id}).error).toBeTruthy();});
  it('keeps path/configuration apart from list and report filters during navigation',()=>{
    const href=campaignPreviewHref('/merchant/campaigns/3/report?view=results&page=2','?embed=brain&tenant=259&lang=en&scenario=normal&path=/merchant/campaigns&q=old');expect(href).not.toContain('q=old');const parsed=previewNavigation(href!);expect(parsed.path).toBe('/merchant/campaigns/3/report');expect(parsed.search).toBe('view=results&page=2');expect(parsed.params.get('tenant')).toBe('259');expect(campaignPreviewHref('//evil.test/','')).toBeNull();
  });
  it('removes duplicate campaign forms and retains exact application components and styles',()=>{
    const root='prototypes/tenant-dashboard/',app=readFileSync(root+'site/app.js','utf8'),pages=readFileSync(root+'site/pages.js','utf8');expect(existsSync(root+'site/campaigns.js')).toBe(false);expect(app).not.toMatch(/campaignDialog|saveCampaign|data\.campaigns/);expect(pages).not.toContain('CampaignPreview');expect(pages).toContain('campaign-workspace.html');
    const entry=readFileSync(root+'src/campaign-preview.tsx','utf8');for(const name of ['Campaigns','CampaignDetails','CampaignReport','NewCampaign'])expect(entry).toContain('pages/merchant/'+name);
    const css=readFileSync(root+'site/campaign-preview.css','utf8');for(const selector of ['.campaign-workspace','.campaign-report-workspace','.campaign-editor-workspace','.campaign-details-workspace'])expect(css).toContain(selector);
  });
});
