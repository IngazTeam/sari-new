import { z } from 'zod';
import { serviceCatalogId, serviceCatalogDefinition } from './service-catalog-write';
const text=z.string().nullable();
export const staffWorkspaceRecord=z.object({id:serviceCatalogId,merchantId:serviceCatalogId,definition:serviceCatalogDefinition,name:z.string(),phone:text,email:text,role:text,workingHours:text,googleCalendarId:text,isActive:z.number().int(),specialization:text.optional(),avatar:text.optional(),bio:text.optional(),serviceIds:text.optional()});
export const staffWorkspaceSnapshot=z.object({actorUserId:serviceCatalogId,merchantId:serviceCatalogId,canManage:z.boolean(),staff:z.array(staffWorkspaceRecord)}).refine(value=>value.staff.every(row=>row.merchantId===value.merchantId)&&new Set(value.staff.map(row=>row.id)).size===value.staff.length,'Inconsistent provider snapshot');
export type StaffWorkspaceRecord=z.infer<typeof staffWorkspaceRecord>;
