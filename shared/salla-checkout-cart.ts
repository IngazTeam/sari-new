import { z } from 'zod';

export const sallaCheckoutCartInput = z.object({
  requestId:z.string().uuid().transform(v=>v.toLowerCase()),
  items:z.array(z.object({productId:z.number().int().positive().max(2147483647),quantity:z.number().int().min(1).max(10000)}).strict()).min(1).max(20),
}).strict().superRefine((v,c)=>{
  if(new Set(v.items.map(i=>i.productId)).size!==v.items.length)c.addIssue({code:'custom',message:'Duplicate cart product'});
}).transform(v=>({...v,items:[...v.items].sort((a,b)=>a.productId-b.productId)}));
export type SallaCheckoutCartInput = z.infer<typeof sallaCheckoutCartInput>;
