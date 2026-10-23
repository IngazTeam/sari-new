/** Only these pre-action business rejections may release a customer's partition. */
export type InboundBusinessRejection = 'subscription_inactive' | 'conversation_limit' | 'message_limit';
export type InboundProcessingResult = { success: boolean; businessRejection?: InboundBusinessRejection };
export type InboundCompletion = { status: 'completed' | 'dismissed' | 'review'; errorCode: string | null };

export class InboundBusinessLimitError extends Error {
  constructor(readonly reason: 'conversation_limit' | 'message_limit') {
    super(reason === 'conversation_limit' ? 'CONVERSATION_LIMIT_REACHED' : 'MESSAGE_LIMIT_REACHED');
    this.name = 'InboundBusinessLimitError';
  }
}

export function inboundCompletion(result: InboundProcessingResult, uncertainEffect = false): InboundCompletion {
  // Even a quota notification can have an uncertain delivery. Never release or replay it blindly.
  if (uncertainEffect) return { status: 'review', errorCode: 'effect_unconfirmed' };
  if (result.success) return { status: 'completed', errorCode: null };
  if (result.businessRejection && ['subscription_inactive', 'conversation_limit', 'message_limit'].includes(result.businessRejection)) {
    return { status: 'dismissed', errorCode: result.businessRejection };
  }
  return { status: 'review', errorCode: 'processing_failed' };
}
