import { z } from 'zod';
export const noticeChannel=z.enum(['owner','email','push']);
export const noticeState=z.enum(['ready','dispatching','accepted','rejected','unknown','blocked','disabled','unconfigured','unavailable']);
export const noticeSummary=z.object({
  result:z.enum(['accepted','partial','unknown','not_accepted']),
  targets:z.array(z.object({channel:noticeChannel,state:noticeState}).strict()).min(1).max(64),
}).strict().refine(v=>v.result===noticeResult(v.targets));
export function noticeResult(targets:Array<{state:z.infer<typeof noticeState>}>) {
  return targets.every(t=>t.state==='accepted')?'accepted':targets.some(t=>t.state==='accepted')?'partial'
    :targets.some(t=>['dispatching','unknown'].includes(t.state))?'unknown':'not_accepted';
}
