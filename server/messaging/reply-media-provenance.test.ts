import { describe, it, expect } from 'vitest';
import { assertReplyMediaProvenance, ReplyMediaReviewRequired } from './reply-media-provenance';
import { buildReplyPlan, type ReplyPlan } from './reply-plan';

const plan = () => buildReplyPlan({ merchantId: 1, instanceId: 2, providerAccount: 'fixture', eventId: 'incoming-3',
  conversationId: 4, incomingMessageId: 3, to: '966500000981', text: 'Reply',
  media: [{ type: 'image', url: 'https://example.com/product.png' }, { type: 'document', url: 'https://example.com/spec.pdf', fileName: 'spec.pdf' }] });
describe('ordinary reply media producer boundary', () => {
  it('writes the current version and keeps product media and documents usable', () => {
    const p = plan(); expect(p.version).toBe(2); expect(p.effects).toHaveLength(3);
    expect(() => assertReplyMediaProvenance(p)).not.toThrow();
  });
  it('does not retroactively upgrade an ambiguous historical image or document', () => {
    for (const index of [1, 2]) {
      const p: ReplyPlan = { ...plan(), version: 1, effects: [plan().effects[index]] };
      expect(() => assertReplyMediaProvenance(p)).toThrow(ReplyMediaReviewRequired); expect(p.version).toBe(1);
    }
  });
  it('keeps version-1 text-only plans eligible', () => {
    expect(() => assertReplyMediaProvenance({ ...plan(), version: 1, effects: [plan().effects[0]] })).not.toThrow();
  });
  it('recognizes previously guarded version-1 banners without bypassing the transport guard', () => {
    const p = plan(); p.version = 1; p.effects = [{ ...p.effects[1], idempotencyKey: 'promotion:v1:' + 'b'.repeat(64),
      promotionGuard: { id: 5, revision: 'a'.repeat(64) } }];
    expect(() => assertReplyMediaProvenance(p)).not.toThrow();
    delete p.effects[0].promotionGuard; expect(() => assertReplyMediaProvenance(p)).toThrow(ReplyMediaReviewRequired);
  });
  it.each(['unknown-version', 'missing-effects', 'null-effect', 'text-with-url', 'template', 'audio', 'promotion-without-key', 'invalid-promotion-id'])(
    'rejects %s without treating it as a current producer plan', change => {
      const p: any = plan();
      if (change === 'unknown-version') p.version = 999;
      if (change === 'missing-effects') delete p.effects;
      if (change === 'null-effect') p.effects = [null];
      if (change === 'text-with-url') p.effects[0].mediaUrl = 'https://example.com/a.png';
      if (change === 'template') p.effects[0].template = {};
      if (change === 'audio') p.effects[1].kind = 'audio';
      if (change === 'promotion-without-key') p.effects[1].promotionGuard = { id: 1, revision: 'a'.repeat(64) };
      if (change === 'invalid-promotion-id') Object.assign(p.effects[1], { idempotencyKey: 'promotion:v1:' + 'b'.repeat(64), promotionGuard: { id: -1, revision: 'a'.repeat(64) } });
      expect(() => assertReplyMediaProvenance(p)).toThrow(ReplyMediaReviewRequired);
    });
});
