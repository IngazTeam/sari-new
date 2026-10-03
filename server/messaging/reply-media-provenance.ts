import type { ReplyPlan } from './reply-plan';

export class ReplyMediaReviewRequired extends Error {
  readonly code = 'reply_media_review_required';
  constructor() { super('Reply media source requires delivery review'); }
}

/** Version 2 is written only by the current producer, which preserves promotion guards.
 * Never upgrade a persisted version-1 plan: an unmarked image may be an obsolete offer.
 * This is a producer-version boundary, not proof of current product price or image content.
 */
export function assertReplyMediaProvenance(plan: ReplyPlan): void {
  const unavailable = (): never => { throw new ReplyMediaReviewRequired(); };
  if (![1, 2].includes(plan?.version) || !Array.isArray(plan.effects) || !plan.effects.length) return unavailable();
  for (const effect of plan.effects) {
    if (!effect) return unavailable();
    if (effect.promotionGuard || effect.idempotencyKey?.startsWith('promotion:')) {
      const guard = effect.promotionGuard;
      if (effect.kind !== 'image' || !guard || !Number.isInteger(guard.id) || guard.id < 1 || guard.id > 2147483647
          || !/^[a-f0-9]{64}$/.test(guard.revision) || !/^promotion:v1:[a-f0-9]{64}$/.test(effect.idempotencyKey)) return unavailable();
      continue; // The transport still validates the current offer and exact caption.
    }
    if (effect.kind === 'text' && !effect.mediaUrl && !effect.fileName && !effect.template) continue;
    if (plan.version !== 2 || !['image', 'document'].includes(effect.kind) || !effect.mediaUrl || effect.template) return unavailable();
  }
}
