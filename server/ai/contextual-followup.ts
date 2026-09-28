import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { defaultFollowupPolicy, isFollowupTimeAllowed, resolveZonedWallTime, type FollowupPolicy } from '../../shared/followup-policy';
import type { CheckoutIdentity } from './checkout-agreements';
import { readStoredUnderstanding } from './conversation-understanding';
import { semanticIdentityMatches, type ConversationUnderstanding } from './conversation-understanding-context';
import type { RequestedFollowupTime } from './requested-followup-time';

export const CONTEXTUAL_FOLLOWUP_SOURCE = 'contextual_customer_request';
const dayMs = 86_400_000;

/** AI interprets the dialogue. This function validates only authority and calendar values. */
export function resolveContextualFollowup(analysis: ConversationUnderstanding | undefined, sourceTime: Date,
  policy: FollowupPolicy, now = new Date()): RequestedFollowupTime {
  const request = analysis?.followup;
  if (!request || request.status === 'none') return null;
  if (request.status !== 'request' || analysis!.confidence < 0.85 || analysis!.conditional || analysis!.ambiguous
    || analysis!.intent === 'declined' || analysis!.action !== 'respond'
    || analysis!.nextStep === 'handoff' || analysis!.nextStep === 'respect_decline'
    || !Number.isFinite(sourceTime.getTime()) || !Number.isFinite(now.getTime())
    || request.sourceCreatedAt !== sourceTime.toISOString() || request.timeZone !== policy.timeZone
    || !request.localDate || !request.localTime) return { kind: 'clarify' };
  const wall = new Date(`${request.localDate}T${request.localTime}:00.000Z`);
  if (!Number.isFinite(wall.getTime()) || wall.toISOString().slice(0, 16) !== `${request.localDate}T${request.localTime}`) return { kind: 'clarify' };
  const candidates = resolveZonedWallTime(wall, policy.timeZone);
  if (candidates.length !== 1) return { kind: 'clarify' }; // Missing or repeated DST hour.
  const at = candidates[0];
  if (at <= sourceTime || at <= now || at.getTime() - sourceTime.getTime() > 90 * dayMs
    || !isFollowupTimeAllowed(policy, at)) return { kind: 'clarify' };
  return { kind: 'requested', at };
}

export async function readContextualFollowup(db: Pool | PoolConnection, input: CheckoutIdentity) {
  if (!semanticIdentityMatches(input)) throw Error('Follow-up interpretation identity mismatch');
  const stored = await readStoredUnderstanding(db, input);
  // No keyword fallback for new schedules, including old analyses without the new field.
  return stored?.analysis;
}

/** The marker prevents a deleted interpretation from downgrading to legacy consent.
 * Existing pre-contextual jobs retain their established transport/consent checks. */
export async function hasContextualFollowupProof(db: Pool | PoolConnection, row: RowDataPacket): Promise<boolean> {
  if (row.follow_up_type !== 'customer_requested') return row.source !== CONTEXTUAL_FOLLOWUP_SOURCE;
  if (row.source !== CONTEXTUAL_FOLLOWUP_SOURCE) return true;
  try {
    const stored = await readStoredUnderstanding(db, { merchantId: row.merchant_id, conversationId: row.conversation_id,
      customerPhone: row.customer_phone, incomingMessageId: row.anchor_message_id });
    if (!stored) return false;
    const [sources] = await db.execute<RowDataPacket[]>('SELECT createdAt FROM messages WHERE id=? AND conversationId=? AND direction=\'incoming\'',
      [row.anchor_message_id, row.conversation_id]);
    if (sources.length !== 1) return false;
    const sourceTime = new Date(sources[0].createdAt);
    // Reconstruct the agreed absolute instant, independently of retry time or later timezone edits.
    // Current sending hours and consent are checked separately at transport admission.
    const result = resolveContextualFollowup(stored.analysis, sourceTime,
      { ...defaultFollowupPolicy, timeZone: row.schedule_timezone, startHour: 0, endHour: 24 }, sourceTime);
    return result?.kind === 'requested' && result.at.getTime() === new Date(row.scheduled_at).getTime();
  } catch { return false; }
}
