import { z } from 'zod';

const id = z.number().int().positive().safe(), digest = z.string().regex(/^[a-f0-9]{64}$/);
export const replySendReadInput = z.object({ generationId: id, instanceRecordId: id.optional() }).strict();
export const replySendSubmitInput = z.object({ generationId: id, instanceRecordId: id,
  requestId: z.string().uuid().transform(v => v.toLowerCase()), basisDigest: digest,
  reason: z.string().trim().min(20).max(1200), allowSendCustomerMessage: z.literal(true), reviewedExactRecipientAndResponse: z.literal(true),
}).strict();
const message = z.object({ generationId: id, actorUserId: id, instanceRecordId: id, basisDigest: digest,
  recipient: z.string().regex(/^[1-9][0-9]{7,14}$/), responseText: z.string().min(1).max(4096),
}).strict();
export const replySendPreview = message.extend({ checkedAt: z.string().datetime(), expiresAt: z.string().datetime() });
export const replySendReceipt = message.extend({ deliveryId: id, requestId: z.string().uuid(), authorizedAt: z.string().datetime(),
  transport: z.enum(['not_attempted', 'unknown', 'suppressed', 'rejected', 'accepted', 'delivered', 'read', 'failed']),
  exposureRecorded: z.boolean(),
});
export const replySendWorkspace = z.object({ generationId: id, actorUserId: id,
  stage: z.enum(['choose_account', 'ready', 'unavailable', 'capacity_unavailable', 'recorded']),
  accounts: z.array(z.object({ id, phoneNumber: z.string().max(20).nullable(), primary: z.boolean() }).strict()).max(100),
  accountsTruncated: z.boolean(), preview: replySendPreview.nullable(), receipt: replySendReceipt.nullable(),
}).strict();
export type ReplySendSubmission = z.infer<typeof replySendSubmitInput>;
export type ReplySendPreview = z.infer<typeof replySendPreview>;
export type ReplySendReceipt = z.infer<typeof replySendReceipt>;
export type ReplySendWorkspace = z.infer<typeof replySendWorkspace>;
