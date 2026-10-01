import { describe,expect,it } from 'vitest';
import { campaignDeliveryEvidence as classify } from './campaign-delivery-evidence';
describe('campaign delivery evidence',()=>{
  it('separates a missing ledger from unknown transport',()=>{expect(classify(undefined)).toBe('missing');expect(classify({})).toBe('unknown');});
  it.each(['sent','delivered','read','failed'])('preserves proven acceptance after %s',status=>{expect(classify({status,provider_message_id:'receipt',error_code:'delivery_failed'})).toBe('accepted');});
  it.each(['sent','delivered','read','queued','received','unknown'])('does not infer acceptance from %s without a receipt',status=>{expect(classify({status})).toBe('unknown');});
  it.each(['http_200','http_302','http_408','http_500','http_503','provider_unreachable',null,'unrecognized',''])('never refunds or retries legacy ambiguity %s',error_code=>{expect(classify({status:'failed',error_code})).toBe('unknown');});
  it.each(['http_400','http_401','http_429','invalid_request','provider_rejected','configuration_missing','campaign_authority_suppressed'])('recognizes definite non-acceptance %s',error_code=>{expect(classify({status:'failed',error_code})).toBe('rejected');});
  it('does not accept malformed provider receipt identifiers',()=>{expect(classify({status:'sent',provider_message_id:123})).toBe('unknown');expect(classify({status:'failed',provider_message_id:' ',error_code:'http_400'})).toBe('unknown');});
});
