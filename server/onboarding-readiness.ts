import type { MerchantChannelReadiness } from './db';

export const merchantReadinessStages = [
  'registered',
  'profile_complete',
  'channel_pending',
  'ready',
] as const;

export type MerchantReadinessStage = (typeof merchantReadinessStages)[number];

export function resolveMerchantReadiness(
  setupCompleted: boolean,
  channelState: MerchantChannelReadiness,
): { stage: MerchantReadinessStage; ready: boolean; nextPath: string } {
  const stage: MerchantReadinessStage = !setupCompleted
    ? 'registered'
    : channelState === 'connected'
      ? 'ready'
      : channelState === 'pending'
        ? 'channel_pending'
        : 'profile_complete';

  return {
    stage,
    ready: stage === 'ready',
    nextPath: stage === 'registered'
      ? '/merchant/setup-wizard'
      : stage === 'ready'
        ? '/merchant/dashboard'
        : '/merchant/whatsapp',
  };
}
