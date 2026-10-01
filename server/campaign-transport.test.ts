import { describe,expect,it } from 'vitest';
import { validCampaignTransportInput,canRetryCampaignTransport } from './campaign-transport';
import type { SendMerchantWhatsAppInput } from './channels/whatsapp/types';
const input:SendMerchantWhatsAppInput={merchantId:1,idempotencyKey:'campaign:1:1',campaignGuard:{campaignId:1,deliveryId:1,token:'a'.repeat(64)},to:'966500000001',kind:'text',text:'Fixture'};
describe('campaign transport identity',()=>{
  it('accepts canonical short keys without changing their durable identity',()=>{expect(validCampaignTransportInput(input)).toBe(true);});
  it.each([
    {campaignGuard:undefined},{merchantId:0},{merchantId:Number.MAX_SAFE_INTEGER+1},
    {campaignGuard:{...input.campaignGuard!,deliveryId:-1}}, {campaignGuard:{...input.campaignGuard!,token:'old'}},
    {idempotencyKey:'campaign:01:1'},{idempotencyKey:'campaign:1:2'}, {idempotencyKey:'unrelated-key1234'},
    {replyGuard:{}}, {kind:'audio',mediaUrl:'https://example.test/a.ogg'}, {template:{name:'x'}},{messageId:1},
  ])('rejects missing, foreign or conflicting authority %j',patch=>{expect(validCampaignTransportInput({...input,...patch} as SendMerchantWhatsAppInput)).toBe(false);});
  it('allows a new worker token only with unchanged persisted payload',()=>{
    expect(canRetryCampaignTransport({...input,campaignGuard:{...input.campaignGuard!,token:'b'.repeat(64)}},input)).toBe(true);
  });
  it.each([null,{}, {...input,campaignGuard:undefined}, {...input,to:'966500000002'}, {...input,text:'Changed'}, {...input,mediaUrl:'https://example.test/changed.png'}, {...input,campaignGuard:{...input.campaignGuard!,campaignId:2}}])('refuses a changed or missing durable identity %j',prior=>{
    expect(canRetryCampaignTransport(input,prior)).toBe(false);
  });
});
