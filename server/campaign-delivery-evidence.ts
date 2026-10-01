type Receipt = { status?:unknown; provider_message_id?:unknown; error_code?:unknown };
/** A provider receipt proves acceptance even when a later delivery webhook failed.
 * Legacy success without a provider ID, timeouts and malformed evidence require review. */
export function campaignDeliveryEvidence(receipt:Receipt|null|undefined):'missing'|'accepted'|'rejected'|'unknown' {
  if(!receipt)return 'missing';
  const {status,provider_message_id:id,error_code:code}=receipt;
  if(['sent','delivered','read','failed'].includes(String(status)) && typeof id==='string' && id.trim())return 'accepted';
  if(status!=='failed' || id!=null || typeof code!=='string')return 'unknown';
  if(/^http_4\d\d$/.test(code) && code!=='http_408')return 'rejected';
  return ['provider_rejected','configuration_missing','unsupported_template','invalid_request','mock_disabled',
    'instance_unavailable','campaign_authority_suppressed','byaan_enrollment_superseded','byaan_checkout_superseded']
    .includes(code)?'rejected':'unknown';
}
