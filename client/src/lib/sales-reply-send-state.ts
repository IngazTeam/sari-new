import { replySendWorkspace, replySendReceipt, replySendSubmitInput, type ReplySendPreview, type ReplySendSubmission } from '../../../shared/sales-reply-send';

export function sendWorkspace(value: unknown, generationId: number, instanceRecordId?: number) {
  const parsed = replySendWorkspace.safeParse(value);
  if (!parsed.success) return null;
  const w = parsed.data, p = w.preview, r = w.receipt;
  if (w.generationId !== generationId || new Set(w.accounts.map(a => a.id)).size !== w.accounts.length
    || (w.stage === 'ready') !== !!p || (w.stage === 'recorded') !== !!r || p && r
    || p && (p.generationId !== generationId || p.actorUserId !== w.actorUserId || p.instanceRecordId !== instanceRecordId
      || !w.accounts.some(a => a.id === p.instanceRecordId) || Date.parse(p.expiresAt) <= Date.parse(p.checkedAt))
    || r && r.generationId !== generationId) return null;
  return w;
}
export const replySendPreviewKey = (p: ReplySendPreview | null | undefined) => p ? JSON.stringify([p.generationId, p.actorUserId, p.instanceRecordId, p.basisDigest, p.recipient, p.responseText]) : '';
export function buildReplySendSubmission(p: ReplySendPreview, reason: string, requestId: string) {
  const parsed = replySendSubmitInput.safeParse({ generationId: p.generationId, instanceRecordId: p.instanceRecordId, basisDigest: p.basisDigest,
    requestId, reason, allowSendCustomerMessage: true, reviewedExactRecipientAndResponse: true });
  return parsed.success ? parsed.data : null;
}
export function matchingReplySendReceipt(value: unknown, request: ReplySendSubmission, preview: ReplySendPreview) {
  const result = replySendReceipt.safeParse(value);
  if (!result.success) return null;
  const r = result.data;
  return r.generationId === request.generationId && r.instanceRecordId === request.instanceRecordId && r.basisDigest === request.basisDigest
    && r.requestId === request.requestId && r.actorUserId === preview.actorUserId && r.recipient === preview.recipient
    && r.responseText === preview.responseText ? r : null;
}
