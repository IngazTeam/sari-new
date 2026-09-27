import {createHash} from 'node:crypto';
import {z} from 'zod';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';
import {parseStaffJson} from './sales-staff-acceptance-contract';
import {staffCompatibilityAuthority,staffCompatibilityResult} from './staff-dashboard-compatibility';
import {validateStaffVoiceUrl} from './staff-dashboard-voice-contract';
import {staffVoiceMime,staffVoiceExtension,type StaffVoiceInput} from '../../shared/staff-dashboard-voice';

const id=z.number().int().positive().safe(),digest=z.string().regex(/^[a-f0-9]{64}$/);
export const compatibilityAudioDigest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export const compatibilityVoiceCustomer=(merchant:number,phone:string)=>hash({merchant,phone});
const historicalIntent=z.object({version:z.literal('staff-voice-compatibility.v1'),merchant:id,actor:id,conversationId:id,
  requestId:z.string().uuid(),audioDigest:digest,byteLength:z.number().int().positive().max(16*1024*1024),mimeType:staffVoiceMime,
  duration:z.number().finite().positive().max(3600),customerKey:digest,scope:z.literal('unmeasured_compatibility')}).strict();
export const pinnedVoiceCompatibilityIntent=historicalIntent.extend({version:z.literal('staff-voice-compatibility.v2'),sourceId:id,
  ownershipVersion:id,authority:staffCompatibilityAuthority,
  reservedAt:z.string().datetime({precision:3}).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v)}).strict();
const intentSchema=z.discriminatedUnion('version',[historicalIntent,pinnedVoiceCompatibilityIntent]);
export const voiceCompatibilityBasis=z.object({version:z.literal('staff-voice-compatibility-basis.v2'),intentDigest:digest,
  mediaUrlDigest:digest,fileName:z.string(),result:staffCompatibilityResult.nullable()}).strict();
export const compatibilityVoiceKey=(merchant:number,source:number)=>`staff_compat_voice:${merchant}:${source}`;
export const compatibilityVoiceStorageKey=(i:z.infer<typeof pinnedVoiceCompatibilityIntent>)=>`audio/staff-compat-voice/${i.merchant}/${i.actor}/${i.requestId}.${staffVoiceExtension[i.mimeType]}`;
export function matchesCompatibilityRecording(i:z.infer<typeof intentSchema>,actor:number,input:StaffVoiceInput,bytes:Buffer){
  return i.actor===actor&&i.conversationId===input.conversationId&&i.requestId===input.requestId&&i.audioDigest===compatibilityAudioDigest(bytes)
    &&i.byteLength===bytes.length&&i.mimeType===input.mimeType&&i.duration===input.duration;
}
/** v1 history is readable only; v2 binds the uploaded object and result to the frozen intent. */
export function readVoiceCompatibility(r:any){
  const raw=parseStaffJson(r.intent),intent=intentSchema.parse(raw),rawResult=parseStaffJson(r.compatibility_result);
  const result=rawResult==null?null:staffCompatibilityResult.parse(rawResult);
  if(!id.safeParse(Number(r.id)).success||hash(raw)!==r.intent_digest||hash(intent)!==r.intent_digest||Number(r.compatibility)!==1
    ||intent.merchant!==Number(r.merchant_id)||intent.actor!==Number(r.actor_user_id)||intent.conversationId!==Number(r.conversation_id)
    ||intent.requestId!==r.request_id||Number(r.instance_id)!==0||typeof r.customer_phone!=='string'
    ||intent.customerKey!==compatibilityVoiceCustomer(intent.merchant,r.customer_phone)||r.next_reconcile_at!=null
    ||r.provider_message_id!=null||r.projected_message_id!=null||r.status!==(result?'accepted':'reserved'))throw Error('Voice compatibility unavailable');
  if(intent.version==='staff-voice-compatibility.v1'){
    if(!z.number().int().nonnegative().safe().safeParse(Number(r.ownership_version)).success||r.basis!=null||r.media_url!=null
      ||(result?r.basis_digest!==hash({intentDigest:r.intent_digest,result}):r.basis_digest!=null))throw Error('Historical voice compatibility unavailable');
    return {intent,basis:null,result};
  }
  if(intent.sourceId!==Number(r.id)||intent.ownershipVersion!==Number(r.ownership_version))throw Error('Voice compatibility identity changed');
  if(r.basis==null){if(r.media_url!=null||r.basis_digest!=null||result)throw Error('Incomplete voice compatibility basis');return {intent,basis:null,result:null};}
  const rawBasis=parseStaffJson(r.basis),basis=voiceCompatibilityBasis.parse(rawBasis);
  if(hash(rawBasis)!==r.basis_digest||hash(basis)!==r.basis_digest||basis.intentDigest!==hash(intent)||hash(basis.result)!==hash(result)
    ||basis.fileName!==`voice-message.${staffVoiceExtension[intent.mimeType]}`||basis.mediaUrlDigest!==hash(validateStaffVoiceUrl(r.media_url)))throw Error('Voice compatibility object changed');
  return {intent,basis,result};
}
