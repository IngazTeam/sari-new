import { beforeEach,describe,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),send:vi.fn(),authority:vi.fn()}));
vi.mock('./db',()=>({getPool:async()=>({execute:mocks.execute}),getPrimaryWhatsAppInstance:async()=>({id:1,merchantId:1,status:'active',provider:'mock',instanceId:'fixture',token:'fixture'})}));
vi.mock('./db/schema-readiness',()=>({assertRuntimeSchema:vi.fn()}));
vi.mock('./channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:mocks.send})}));
vi.mock('./campaign-transport',async original=>({...await original<typeof import('./campaign-transport')>(),withCampaignTransportAuthority:mocks.authority}));
import { sendMerchantWhatsApp } from './channels/whatsapp/service';
const input={merchantId:1,to:'966500000001',kind:'text' as const,text:'Fixture',idempotencyKey:'campaign:1:1',campaignGuard:{campaignId:1,deliveryId:1,token:'a'.repeat(64)}};
beforeEach(()=>{vi.resetAllMocks();mocks.execute.mockResolvedValue([{affectedRows:1}]);mocks.send.mockResolvedValue({accepted:true,status:'sent',providerMessageId:'fixture'});mocks.authority.mockImplementation(async(_input,_config,_instance,send)=>({allowed:true,result:await send({execute:mocks.execute})}));});
describe('campaign integration with the actual transport service',()=>{
  it('accepts the short canonical key only through the campaign fence',async()=>{
    expect(await sendMerchantWhatsApp(input)).toMatchObject({accepted:true});expect(mocks.authority).toHaveBeenCalledOnce();expect(mocks.send).toHaveBeenCalledOnce();
    expect(JSON.parse(mocks.execute.mock.calls[0][1][5]).campaignGuard).toEqual(input.campaignGuard);
  });
  it('does not loosen the minimum length for unrelated keys',async()=>{
    await expect(sendMerchantWhatsApp({...input,campaignGuard:undefined,idempotencyKey:'tiny'})).rejects.toThrow('Invalid WhatsApp idempotency key');expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('blocks a valid-length campaign key without its authority before reserving transport',async()=>{
    expect(await sendMerchantWhatsApp({...input,campaignGuard:undefined,idempotencyKey:'campaign:111:111'})).toMatchObject({accepted:false,errorCode:'campaign_authority_suppressed'});expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not enter the provider after a revoked lease',async()=>{
    mocks.authority.mockResolvedValue({allowed:false});expect(await sendMerchantWhatsApp(input)).toMatchObject({accepted:false,errorCode:'campaign_authority_suppressed'});expect(mocks.send).not.toHaveBeenCalled();
  });
  it('treats commit failure after provider acceptance as unknown',async()=>{
    mocks.authority.mockImplementation(async(_i,_c,_id,send)=>{await send({execute:mocks.execute});throw Error('Commit response lost');});
    await expect(sendMerchantWhatsApp(input)).rejects.toMatchObject({code:'delivery_outcome_unknown'});expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('does not reset a legacy failed row whose rejection cannot be established',async()=>{
    mocks.execute.mockRejectedValueOnce({code:'ER_DUP_ENTRY'}).mockResolvedValueOnce([[{status:'failed',error_code:'unrecognized',request_json:input}]]);
    expect(await sendMerchantWhatsApp({...input,retryFailed:true})).toMatchObject({accepted:false,duplicate:true});
    expect(mocks.authority).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  });
});
