import { z } from 'zod';
const id=z.number().int().positive().max(2147483647);
export const whatsappDiagnosticWorkspaceInput=z.object({merchantId:id}).strict();
export const whatsappDiagnosticConnection=z.object({id,instanceId:z.string().min(1).max(255),provider:z.enum(['green_api','meta_cloud','mock']),status:z.enum(['active','inactive','pending','expired']),phoneNumber:z.string().max(30).nullable(),primary:z.boolean()}).strict();
export const whatsappDiagnosticWorkspace=z.object({actorId:id,merchantId:id,checkedAt:z.string().datetime(),truncated:z.boolean(),connections:z.array(whatsappDiagnosticConnection).max(100)}).strict().superRefine((data,ctx)=>{
 if(new Set(data.connections.map(r=>r.id)).size!==data.connections.length||new Set(data.connections.map(r=>r.instanceId)).size!==data.connections.length)ctx.addIssue({code:'custom',message:'Duplicate connection'});
});
export type WhatsAppDiagnosticWorkspace=z.infer<typeof whatsappDiagnosticWorkspace>;
