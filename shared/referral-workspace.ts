import { z } from 'zod';
const id = z.number().int().positive().max(2147483647), count = z.number().int().nonnegative().safe(), stamp = z.string().datetime().nullable();
export const referralWorkspaceInput = z.object({
  tab: z.enum(['codes', 'referrals', 'rewards']).default('referrals'), query: z.string().trim().max(100).default(''),
  state: z.enum(['all', 'active', 'inactive', 'pending', 'completed', 'claimed', 'expired', 'invalid']).default('all'), page: z.number().int().min(1).max(1000000).default(1),
}).strict();
export type ReferralSelection = z.infer<typeof referralWorkspaceInput>;
const common = { id, revision: z.string().regex(/^[a-f0-9]{64}$/), createdAt: stamp, updatedAt: stamp, issues: z.array(z.string().max(40)).max(12) };
export const referralCodeRow = z.object({ ...common, kind: z.literal('code'), code: z.string().max(50), referrerName: z.string().max(255), referrerPhone: z.string().max(20), isActive: z.boolean().nullable(), recordedCount: count.nullable(), rewardGiven: z.boolean().nullable(), state: z.enum(['active', 'inactive', 'invalid']) }).strict();
export const referralRecordRow = z.object({ ...common, kind: z.literal('referral'), codeId: id, code: z.string().max(50), referredName: z.string().max(255), referredPhone: z.string().max(20), orderCompleted: z.boolean().nullable(), state: z.enum(['pending', 'completed', 'invalid']) }).strict();
export const referralRewardRow = z.object({ ...common, kind: z.literal('reward'), referralId: id, type: z.enum(['discount_10', 'free_month', 'analytics_upgrade']).nullable(), storedState: z.enum(['pending', 'claimed', 'expired']).nullable(), state: z.enum(['pending', 'claimed', 'expired', 'invalid']), description: z.string().max(100000), expiresAt: stamp, claimedAt: stamp, referralAvailable: z.boolean() }).strict();
export const referralWorkspaceRow = z.discriminatedUnion('kind', [referralCodeRow, referralRecordRow, referralRewardRow]);
export type ReferralWorkspaceRow = z.infer<typeof referralWorkspaceRow>;
export const referralWorkspaceSchema = z.object({
  actorId: id, merchantId: id, checkedAt: z.string().datetime(), canManage: z.boolean(), selection: referralWorkspaceInput,
  totals: z.object({ codes: count, referrals: count, rewards: count }).strict(),
  counts: z.object({ active: count, inactive: count, pending: count, completed: count, claimed: count, expired: count, invalid: count }).strict(),
  invitation: z.object({ state: z.enum(['not_created', 'ready', 'inactive', 'invalid']), codeId: id.nullable(), code: z.string().max(50).nullable(), applied: z.boolean() }).strict(),
  rewardFulfillment: z.literal('not_verified'), pageSize: z.literal(25), matched: count, pages: count, rows: z.array(referralWorkspaceRow).max(25),
}).strict();
export type ReferralWorkspace = z.infer<typeof referralWorkspaceSchema>;
