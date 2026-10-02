import { z } from 'zod';
import { serviceCatalogId, serviceCatalogDefinition } from './service-catalog-write';
import { bookingOperationalPatchSchema } from './booking-operations';
const time = bookingOperationalPatchSchema.shape.startTime.unwrap();
export const staffWeekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
export const staffWorkingHours = z.partialRecord(z.enum(staffWeekdays), z.object({ start: time, end: time }).strict().refine(v => v.start < v.end)).nullable();
const optionalText = (max: number) => z.string().trim().max(max).nullable();
export const staffCatalogFields = z.object({
  name: z.string().trim().min(1).max(255),
  phone: z.union([z.literal(''),z.string().trim().min(8).max(20).regex(/^\+?\d+$/)]).nullable().optional(),
  email: z.union([z.literal(''),z.string().trim().email().max(255)]).nullable().optional(),
  role: optionalText(100).optional(), workingHours: staffWorkingHours.optional(),
  googleCalendarId: optionalText(255).optional(), isActive: z.boolean().optional(),
}).strict();
export const staffCatalogPatch = staffCatalogFields.partial().strict().refine(v => Object.values(v).some(value => value !== undefined), 'No changes');
export const staffCatalogIdentity = z.object({ staffId: serviceCatalogId }).strict();
export const staffCatalogUpdate = staffCatalogFields.partial().extend({ staffId: serviceCatalogId, expectedDefinition: serviceCatalogDefinition.optional() }).strict().refine(v => Object.entries(v).some(([key,value]) => !['staffId','expectedDefinition'].includes(key) && value !== undefined), 'No changes');
export const staffCatalogArchive = staffCatalogIdentity.extend({ expectedDefinition: serviceCatalogDefinition.optional() }).strict();
export type StaffCatalogFields = z.infer<typeof staffCatalogFields>;
