import { z } from 'zod';
import { knowledgeSourceGroups } from './knowledge-source-groups';
export const dashboardSourcesSchema = z
  .object({
    version: z.literal(1),
    merchantId: z.number().int().positive(),
    checkedAt: z.string().datetime(),
    groups: knowledgeSourceGroups,
    audience: z
      .object({
        kind: z.enum(['customers', 'trainees']),
        count: z.number().int().nonnegative().safe(),
      })
      .strict(),
    integration: z
      .object({
        source: z.enum([
          'none',
          'byaan',
          'salla',
          'zid',
          'woocommerce',
          'shopify',
          'calendly',
          'unknown',
        ]),
        state: z.enum([
          'not_connected',
          'unavailable',
          'configured',
          'syncing',
          'error',
          'paused',
          'pending_verification',
        ]),
        records: z
          .array(
            z
              .object({
                scope: z.enum(['all', 'products', 'orders', 'customers']),
                at: z.string().datetime().nullable(),
              })
              .strict()
          )
          .max(3),
      })
      .strict(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.groups.merchantId !== v.merchantId)
      ctx.addIssue({ code: 'custom', message: 'Foreign source snapshot' });
  });
export type DashboardSources = z.infer<typeof dashboardSourcesSchema>;
