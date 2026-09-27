import type {PoolConnection} from 'mysql2/promise';
import { z } from 'zod';
import { staffAttemptListInput, staffAttemptCheckInput, staffAttemptPage, staffAttemptItem } from '../../shared/staff-attempt-review';
import { diagnoseUnsettledStaffAttempt } from './staff-attempt-diagnostics';
import { checkoutTransaction } from './checkout-agreements';
import { databaseTimeEpoch } from '../db/time';
import { authorizeDashboardStaff, assertDashboardStaffSchema, reconcileDashboardStaff } from './staff-dashboard-reply';
import { assertDashboardVoiceSchema, reconcileDashboardVoice } from './staff-dashboard-voice';
import { isStaffTextCompatibility, readStaffTextCompatibility } from './staff-dashboard-compatibility';
import { readVoiceCompatibility } from './staff-voice-compatibility-contract';
import { readDashboardStaffBasis, readDashboardStaffAcceptance } from './staff-dashboard-reply-contract';
import { readStaffVoiceIntent, readStaffVoiceBasis, readStaffVoiceAcceptance } from './staff-dashboard-voice-contract';
import { reconcileStaffCompatibility } from './staff-compatibility-settlement';
import { staffReceiptDigest } from './sales-staff-acceptance-contract';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';

const id = z.number().int().positive().safe();
const unavailable = (): never => { throw Error('Staff attempt unavailable'); };
const tableFor = (kind: 'text' | 'voice') => kind === 'text' ? 'ai_sales_staff_replies' : 'ai_sales_staff_voices';
const compatible = (kind: 'text' | 'voice', row: any) => kind === 'text' ? isStaffTextCompatibility(row) : Number(row.compatibility) === 1;
async function schema(kind: 'text' | 'voice') { await (kind === 'text' ? assertDashboardStaffSchema() : assertDashboardVoiceSchema()); }

/** Inspect identity before exposing even metadata or choosing a recovery path. */
function identity(kind: 'text' | 'voice', row: any, merchant: number, actor: number, conversation: number) {
  if (Number(row.merchant_id) !== merchant || Number(row.actor_user_id) !== actor || Number(row.conversation_id) !== conversation) return unavailable();
  if (compatible(kind, row)) {
    if (kind === 'text') { const b = readStaffTextCompatibility(row); return { result: b.result, compatibility: true as const }; }
    const r = readVoiceCompatibility(row); return { result: r.result, compatibility: true as const };
  }
  if (kind === 'text') readDashboardStaffBasis(row);
  else { readStaffVoiceIntent(row); if (row.basis != null) readStaffVoiceBasis(row); }
  if (!['reserved', 'accepted', ...(kind === 'text' ? ['failed', 'suppressed'] : [])].includes(row.status)) return unavailable();
  return { result: null, compatibility: false as const };
}

/** Bounded, actor-owned metadata only: never returns text, recordings, URLs or credentials. */
export async function listStaffAttempts(merchant: number, actor: number, raw: z.infer<typeof staffAttemptListInput>) {
  id.parse(merchant); id.parse(actor); const input = staffAttemptListInput.parse(raw); await schema(input.kind);
  return checkoutTransaction(async c => {
    await authorizeDashboardStaff(c, merchant, actor);
    const [rows] = await c.execute<any[]>(`SELECT * FROM ${tableFor(input.kind)}
      WHERE merchant_id=? AND actor_user_id=? AND conversation_id=? ${input.beforeId ? 'AND id<?' : ''}
      ORDER BY id DESC LIMIT 21 FOR SHARE`, [merchant, actor, input.conversationId, ...(input.beforeId ? [input.beforeId] : [])]);
    const items = [];
    for (const row of rows.slice(0, 20)) {
      items.push(await inspectStaffAttemptItem(c,input.kind,row,merchant,actor,input.conversationId));
   }
    return staffAttemptPage.parse({ items, nextCursor: rows.length > 20 ? items.at(-1)!.id : null });
  });
}

/** SQL recovery only. A fresh reservation, upload, provider send, or manual success is never reachable. */
export async function checkStaffAttempt(merchant: number, actor: number, raw: z.infer<typeof staffAttemptCheckInput>) {
  id.parse(merchant); id.parse(actor); const input = staffAttemptCheckInput.parse(raw); await schema(input.kind);
  const compatibility = await checkoutTransaction(async c => {
    await authorizeDashboardStaff(c, merchant, actor);
    const [rows] = await c.execute<any[]>(`SELECT * FROM ${tableFor(input.kind)} WHERE id=? AND merchant_id=? FOR SHARE`, [input.sourceId, merchant]);
    if (rows.length !== 1) return unavailable();
    return identity(input.kind, rows[0], merchant, actor, input.conversationId).compatibility;
  });
  // Each reconciler repeats authorization and source binding inside its own committing transaction.
  if (compatibility) return reconcileStaffCompatibility(input.kind, merchant, actor, input.sourceId, input.conversationId);
  const authority = { actorUserId: actor, conversationId: input.conversationId };
  return input.kind === 'text' ? reconcileDashboardStaff(merchant, input.sourceId, authority) : reconcileDashboardVoice(merchant, input.sourceId, authority);
}

/** Shared strict metadata inspection; callers must authorize and tenant-scope the row first. */
export async function inspectStaffAttemptItem(c:PoolConnection,kind:'text'|'voice',row:any,merchant:number,actor:number,conversationId:number){
  const item:z.infer<typeof staffAttemptItem> = { id: Number(row.id), createdAt: new Date(databaseTimeEpoch(row.created_at)).toISOString(), state: 'pending', persisted: null };
  try {
    const inspected = identity(kind, row, merchant, actor, conversationId);
    if (inspected.compatibility) {
      if (inspected.result) { item.state = 'accepted'; item.persisted = inspected.result.persisted; }
    } else if (row.status === 'accepted') {
      const [facts] = await c.execute<any[]>('SELECT * FROM ai_sales_staff_acceptances WHERE merchant_id=? AND source_kind=? AND source_id=?',
        [merchant, kind === 'text' ? 'dashboard_text' : 'dashboard_voice', row.id]);
      if (facts.length !== 1) return unavailable();
      const fact = kind === 'text' ? readDashboardStaffAcceptance(facts[0]) : readStaffVoiceAcceptance(facts[0]);
      const basis = kind === 'text' ? readDashboardStaffBasis(row) : readStaffVoiceBasis(row);
      const account = kind === 'text' ? readDashboardStaffBasis(row) : readStaffVoiceIntent(row);
      if (fact.basisDigest !== hash(basis) || fact.providerMessageDigest !== staffReceiptDigest(merchant, account.instanceRecordId, account.provider, row.provider_message_id)
        || row.projected_message_id != null && !id.safeParse(Number(row.projected_message_id)).success) return unavailable();
      item.state = 'accepted'; item.persisted = row.projected_message_id != null;
    }
    if(item.state==='pending')Object.assign(item,await diagnoseUnsettledStaffAttempt(c,kind,row));
  } catch { item.state = 'unavailable'; item.persisted = null; item.diagnostic='evidence_conflict'; }
  return item;
}
