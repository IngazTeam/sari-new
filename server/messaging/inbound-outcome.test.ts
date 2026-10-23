import { describe, expect, it } from 'vitest';
import { inboundCompletion, InboundBusinessLimitError, type InboundBusinessRejection } from './inbound-outcome';

describe('inbound completion preserves business rejection and uncertain effects', () => {
  it.each<InboundBusinessRejection>(['subscription_inactive', 'message_limit', 'conversation_limit'])('releases a rejected turn without claiming success: %s', businessRejection => {
    expect(inboundCompletion({ success: false, businessRejection })).toEqual({ status: 'dismissed', errorCode: businessRejection });
    expect(inboundCompletion({ success: false, businessRejection }, true)).toEqual({ status: 'review', errorCode: 'effect_unconfirmed' });
  });
  it('keeps unknown failures and provider ambiguity for review', () => {
    expect(inboundCompletion({ success: false })).toEqual({ status: 'review', errorCode: 'processing_failed' });
    expect(inboundCompletion({ success: false, businessRejection: 'provider_timeout' as any }).status).toBe('review');
    expect(inboundCompletion({ success: true }, true).status).toBe('review');
    expect(inboundCompletion({ success: true })).toEqual({ status: 'completed', errorCode: null });
  });
  it('does not equate arbitrary provider errors with a pre-action quota rejection', () => {
    expect(new Error('MESSAGE_LIMIT_REACHED')).not.toBeInstanceOf(InboundBusinessLimitError);
    expect(new InboundBusinessLimitError('message_limit').reason).toBe('message_limit');
  });
});
