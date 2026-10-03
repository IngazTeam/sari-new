import { z } from 'zod';
import { reviewDetail } from './review-workspace';
export const reviewReplyInput = z.object({
  id: z.number().int().positive().max(2147483647), revision: z.string().regex(/^[a-f0-9]{64}$/),
  reply: z.string().trim().min(1).max(1000),
}).strict();
export const reviewReplyResult = reviewDetail.extend({ effect: z.enum(['saved', 'already_current']), sendsMessage: z.literal(false) });
export type ReviewReplyInput = z.infer<typeof reviewReplyInput>;
