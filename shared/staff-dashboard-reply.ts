import { z } from 'zod';

export const staffDashboardReplyInput=z.object({
  conversationId:z.number().int().positive().safe(),requestId:z.string().uuid(),
  message:z.string().trim().min(1).max(4096),
}).strict();
export type StaffDashboardReplyInput=z.infer<typeof staffDashboardReplyInput>;
export type StaffDashboardReplyResult={success:boolean;status:'accepted'|'pending'|'failed'|'suppressed';persisted:boolean};
