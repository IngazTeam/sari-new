import { createHash } from 'node:crypto';
import { z } from 'zod';
import { noticeChannel,noticeState } from '../../shared/notice-evidence';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const noticeTarget=z.object({key:hash,channel:noticeChannel,recipientHash:hash,payloadHash:hash,
  initial:z.enum(['ready','disabled','unconfigured','unavailable'])}).strict();
export const noticePlan=z.object({version:z.literal(1),method:z.enum(['owner','email','push','both']),targets:z.array(noticeTarget).min(1).max(64)}).strict().superRefine((p,ctx)=>{
  const channels=p.method==='both'?['email','push']:[p.method];
  if(new Set(p.targets.map(t=>t.key)).size!==p.targets.length||channels.some(c=>!p.targets.some(t=>t.channel===c))
    ||p.targets.some(t=>!channels.includes(t.channel)||t.key!==noticeHash([t.channel,t.recipientHash]))
    ||p.targets.filter(t=>t.channel==='email').length>1||p.targets.filter(t=>t.channel==='owner').length>1)ctx.addIssue({code:'custom',message:'Invalid notice plan'});
});
export const noticeOutcome=z.object({state:z.enum(['accepted','rejected','unknown','blocked']),httpStatus:z.number().int().min(100).max(599).nullable(),referenceHash:hash.nullable()}).strict();
export const noticeRecord=z.object({version:z.literal(1),plan:noticePlan,entries:z.array(z.object({key:hash,state:noticeState,outcome:noticeOutcome.nullable()}).strict()).min(1).max(64)}).strict().superRefine((v,ctx)=>{
  if(v.entries.length!==v.plan.targets.length||v.entries.some((e,i)=>{
    const t=v.plan.targets[i];if(e.key!==t.key)return true;
    if(t.initial!=='ready')return e.state!==t.initial||e.outcome!==null;
    if(['ready','dispatching'].includes(e.state))return e.outcome!==null;
    if(!e.outcome||e.outcome.state!==e.state)return true;
    if(e.state==='accepted')return !e.outcome.referenceHash||(t.channel==='email'?e.outcome.httpStatus!==200:t.channel==='push'?e.outcome.httpStatus!==201:!e.outcome.httpStatus||e.outcome.httpStatus<200||e.outcome.httpStatus>=300);
    if(e.state==='rejected')return !e.outcome.referenceHash||!e.outcome.httpStatus||!(t.channel==='email'?[200,400,401,403,422]:t.channel==='push'?[400,401,403,404,410,413]:[400,401,403,404,422]).includes(e.outcome.httpStatus);
    if(e.state==='unknown')return e.outcome.referenceHash!==null;
    return e.state==='blocked'&&(e.outcome.httpStatus!==null||e.outcome.referenceHash!==null);
  }))ctx.addIssue({code:'custom',message:'Invalid notice evidence'});
});
function canonical(v:any):any{return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,canonical(x)])):v;}
export const noticeHash=(v:unknown)=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export type NoticePlan=z.infer<typeof noticePlan>;
export type NoticeTarget=z.infer<typeof noticeTarget>;
export type NoticeOutcome=z.infer<typeof noticeOutcome>;
export type NoticeHooks={plan:(plan:NoticePlan)=>Promise<void>;start:(key:string)=>Promise<void>;finish:(key:string,outcome:NoticeOutcome)=>Promise<void>};
export function target(channel:NoticeTarget['channel'],recipient:unknown,payload:unknown,initial:NoticeTarget['initial']='ready'):NoticeTarget {
  const recipientHash=noticeHash(recipient);return noticeTarget.parse({key:noticeHash([channel,recipientHash]),channel,recipientHash,payloadHash:noticeHash(payload),initial});
}
