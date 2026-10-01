import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn()}));
vi.mock('./db/connection',()=>({getDb:mocks.db}));
import {campaignReportInput} from '../shared/campaign-report';
import {campaignReportReason,readCampaignReport,CampaignReportUnavailableError} from './campaign-report';
beforeEach(()=>{mocks.db.mockReset();mocks.db.mockResolvedValue(null);});
describe('campaign report authority and safe evidence',()=>{
 it('normalizes the report selection without accepting actor or merchant authority',()=>{expect(campaignReportInput.parse({id:7})).toEqual({id:7,view:'recipients',status:'all',search:'',page:1});});
 it.each([{id:0},{id:1.5},{id:7,merchantId:8},{id:7,actorId:8},{id:7,pageSize:500},{id:7,page:0},{id:7,page:1_000_001},{id:7,search:'x'.repeat(201)},{id:7,view:'results',status:'manual_review'},{id:7,view:'recipients',status:'success'}])('rejects forged or invalid selection %j',async input=>{await expect(readCampaignReport(1,2,input)).rejects.toThrow();expect(mocks.db).not.toHaveBeenCalled();});
 it.each([0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1])('rejects unsafe identity %s before storage',async id=>{await expect(readCampaignReport(id,2,{id:7})).rejects.toBeInstanceOf(CampaignReportUnavailableError);await expect(readCampaignReport(1,id,{id:7})).rejects.toBeInstanceOf(CampaignReportUnavailableError);expect(mocks.db).not.toHaveBeenCalled();});
 it('does not silently turn unavailable storage into an empty report',async()=>{await expect(readCampaignReport(1,2,{id:7})).rejects.toThrow('Campaign report is unavailable');mocks.db.mockRejectedValue(Error('PRIVATE database secret'));await expect(readCampaignReport(1,2,{id:7})).rejects.toThrow('Campaign report is unavailable');});
 it.each([['consent_withdrawn_before_dispatch','consent'],['message_limit','capacity'],['provider_rate','rate_limit'],['merchant_acknowledged','acknowledged'],['ambiguous_provider_outcome','uncertain'],['quota_without_delivery_receipt','uncertain'],['http_401','provider_rejected'],['http_408','other'],['retry_exhausted','retry_exhausted'],['database_unavailable','unavailable'],['campaign_or_merchant_inactive','inactive'],['quiet_hours','quiet_hours'],[null,'none'],['','none']])('maps recognized reason %s without exposing raw internals', (input,reason)=>{expect(campaignReportReason(input)).toBe(reason);});
 it.each(['PRIVATE provider token=secret','<script>alert(1)</script>','=WEBSERVICE("private")','http_400 token=secret',{secret:'test'}])('redacts unknown legacy details %j',input=>expect(campaignReportReason(input)).toBe('other'));
});
