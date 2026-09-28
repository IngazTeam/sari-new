import { z } from 'zod';

export const conversionIdentity=z.number().int().positive().max(2147483647);
export const conversionState=z.enum(['pending','completed','cancelled']);
export const conversionDigest=z.string().regex(/^[a-f0-9]{64}$/);
export const conversionHistoryInput=z.object({conversionId:conversionIdentity}).strict();
export const conversionObservation=z.object({version:z.literal(1),merchantId:conversionIdentity,conversionId:conversionIdentity,
  state:conversionState,source:z.enum(['api_key_report','internal_unverified']),apiKeyId:conversionIdentity.nullable(),
  payloadDigest:conversionDigest,previousDigest:conversionDigest.nullable(),observedAt:z.string().datetime({precision:3})
}).strict().refine(v=>(v.source==='api_key_report')===(v.apiKeyId!==null),'Invalid observation source');
export const conversionHistoryOutput=z.object({conversionId:conversionIdentity,currentState:conversionState,
  history:z.enum(['recorded','legacy_unrecorded']),paymentEvidence:z.literal('not_verified'),attribution:z.literal('not_recorded'),
  observations:z.array(z.object({observation:conversionObservation,digest:conversionDigest}).strict()).max(3)
}).strict();
