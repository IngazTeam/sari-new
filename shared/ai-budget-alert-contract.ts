import { z } from 'zod';

const money = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER / 1_000_000);
const period = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const aiBudgetAlertsOutput = z.object({
  period, configured: z.boolean(), enabled: z.boolean(),
  limitUsd: money, spentUsd: money, reservedUsd: money,
  level: z.union([z.literal(0), z.literal(70), z.literal(90), z.literal(100)]),
  events: z.array(z.object({
    period, threshold: z.union([z.literal(70), z.literal(90)]),
    limitUsd: money, spentUsd: money, reservedUsd: money,
    observedAt: z.string().datetime(),
  }).strict()).max(14),
}).strict();
export type AiBudgetAlerts = z.infer<typeof aiBudgetAlertsOutput>;
