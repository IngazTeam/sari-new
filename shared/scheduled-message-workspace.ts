import { z } from 'zod';
const id = z.number().int().positive().max(2147483647);
export const scheduledMessageSelection = z.object({
  query: z.string().trim().max(100).default(''), state: z.enum(['all', 'enabled', 'disabled', 'unknown']).default('all'),
  day: z.number().int().min(0).max(6).nullable().default(null),
  sort: z.enum(['newest', 'oldest', 'title', 'schedule']).default('newest'),
  page: z.number().int().min(1).max(1000000).default(1),
}).strict();
export type ScheduledMessageSelection = z.infer<typeof scheduledMessageSelection>;
export const scheduledMessageRow = z.object({
  id, revision: z.string().regex(/^[a-f0-9]{64}$/), title: z.string().max(255).nullable(), message: z.string().max(65535).nullable(),
  dayOfWeek: z.number().int().min(0).max(6).nullable(), time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable(),
  enabled: z.boolean().nullable(), state: z.enum(['enabled', 'disabled', 'unknown']),
  legacyLastSentAt: z.string().datetime().nullable(), createdAt: z.string().datetime().nullable(), updatedAt: z.string().datetime().nullable(),
  issues: z.array(z.enum(['title', 'message', 'day', 'time', 'active', 'last_sent_at', 'created_at', 'updated_at'])),
}).strict();
export type ScheduledMessageRow = z.infer<typeof scheduledMessageRow>;
