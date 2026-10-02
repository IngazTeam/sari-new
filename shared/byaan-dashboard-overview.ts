import { z } from 'zod';
import { byaanConnectionWorkspaceSchema } from './byaan-connection-workspace';
import { byaanResyncReceipt } from './byaan-resync';
export const byaanDashboardOverviewSchema = z.object({
  connection: byaanConnectionWorkspaceSchema,
  access: z.object({ trainees: z.boolean(), faqs: z.boolean(), site: z.boolean(), sales: z.boolean(), integrations: z.boolean() }).strict(),
  lastRequest: byaanResyncReceipt.nullable(),
}).strict().refine(value => !value.lastRequest || value.lastRequest.actorId === value.connection.actorId && value.lastRequest.merchantId === value.connection.merchantId, 'Inconsistent Byaan overview');
