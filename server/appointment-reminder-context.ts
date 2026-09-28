import { createHash } from 'node:crypto';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { CheckoutIdentity } from './ai/checkout-agreements';
import { followupPhoneForms } from './ai/followup-send-guard';
import { readStoredUnderstanding } from './ai/conversation-understanding';
import { semanticIdentityMatches, type ConversationUnderstanding } from './ai/conversation-understanding-context';
import type { AppointmentReminderIntent } from './appointment-reminder-intent';

export type AppointmentReminderTarget = {
  id: number; service: string | null; date: string | null; startTime: string | null;
  canSchedule: boolean; hasPendingReminder: boolean; termsDigest: string | null;
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const day = (value: any) => String(value instanceof Date ? value.toISOString() : value).slice(0, 10);

/** Only this customer's appointments and this conversation's pending reminder references.
 * No phone, credentials or another customer's calendar is sent to the interpreter. */
export async function readAppointmentReminderTargets(db: Pool | PoolConnection, input: CheckoutIdentity): Promise<AppointmentReminderTarget[]> {
  const forms = followupPhoneForms(input.customerPhone);
  if (!forms.length) return [];
  const [appointments] = await db.execute<any[]>(`SELECT a.id,a.service_id,a.staff_id,a.appointment_date,a.start_time,a.end_time,a.status,
    s.name AS service_name,s.is_active AS service_active,f.is_active AS staff_active FROM appointments a
    JOIN services s ON s.id=a.service_id AND s.merchant_id=a.merchant_id
    LEFT JOIN staff_members f ON f.id=a.staff_id AND f.merchant_id=a.merchant_id
    WHERE a.merchant_id=? AND a.customer_phone IN (${forms.map(() => '?').join(',')})
    AND a.appointment_date>=DATE_SUB(UTC_DATE(),INTERVAL 1 DAY) ORDER BY a.appointment_date,a.id LIMIT 30`,
  [input.merchantId, ...forms]);
  const targets: AppointmentReminderTarget[] = appointments.map(a => ({ id: a.id, service: String(a.service_name).slice(0, 255),
    date: day(a.appointment_date), startTime: a.start_time,
    canSchedule: a.status === 'confirmed' && !!a.service_active && (a.staff_id === null || !!a.staff_active), hasPendingReminder: false,
    termsDigest: digest({ id: a.id, serviceId: a.service_id, staffId: a.staff_id, date: day(a.appointment_date), startTime: a.start_time, endTime: a.end_time, status: a.status }),
  }));
  const [reminders] = await db.execute<any[]>(`SELECT DISTINCT r.appointment_reference FROM appointment_reminders r
    JOIN messages m ON m.id=r.source_message_id AND m.direction='incoming'
    JOIN conversations c ON c.id=m.conversationId AND c.merchantId=r.merchant_id
    WHERE r.merchant_id=? AND c.id=? AND c.customerPhone=? AND r.state='pending' AND r.cancelled_at IS NULL ORDER BY r.appointment_reference LIMIT 20`,
  [input.merchantId, input.conversationId, input.customerPhone]);
  for (const r of reminders) {
    const found = targets.find(a => a.id === r.appointment_reference);
    if (found) found.hasPendingReminder = true;
    else targets.push({ id: r.appointment_reference, service: null, date: null, startTime: null, canSchedule: false, hasPendingReminder: true, termsDigest: null });
  }
  return targets;
}

export function contextualAppointmentReminderIntent(analysis?: ConversationUnderstanding): AppointmentReminderIntent | null {
  const value = analysis?.appointmentReminder;
  if (!value || value.status === 'none') return null;
  if (value.status === 'clarify' || analysis!.confidence < 0.85 || analysis!.conditional || analysis!.ambiguous
    || analysis!.action !== 'respond' || analysis!.nextStep === 'handoff' || analysis!.followup && analysis!.followup.status !== 'none'
    || !value.appointmentId) return { kind: 'clarify' };
  if (value.status === 'cancel') return { kind: 'cancel', appointmentId: value.appointmentId };
  if (!value.hoursBefore || !value.targetDigest || analysis!.intent === 'declined' || analysis!.nextStep === 'respect_decline') return { kind: 'clarify' };
  return { kind: 'schedule', appointmentId: value.appointmentId, hours: value.hoursBefore };
}

/** New requests never use the legacy command parser when analysis is absent or unavailable. */
export async function readContextualAppointmentReminder(db: Pool | PoolConnection, input: CheckoutIdentity) {
  if (!semanticIdentityMatches(input)) throw Error('Reminder interpretation identity mismatch');
  const context = await readStoredUnderstanding(db, input);
  return { analysis: context?.analysis, intent: contextualAppointmentReminderIntent(context?.analysis) };
}

export async function contextualReminderTargetMatches(db: Pool | PoolConnection, input: CheckoutIdentity, analysis: ConversationUnderstanding) {
  const request = analysis.appointmentReminder;
  if (contextualAppointmentReminderIntent(analysis)?.kind !== 'schedule') return false;
  const target = (await readAppointmentReminderTargets(db, input)).find(t => t.id === request!.appointmentId);
  return !!target?.canSchedule && target.termsDigest === request!.targetDigest;
}

export async function hasContextualAppointmentReminderProof(db: Pool | PoolConnection, snapshot: any): Promise<boolean> {
  if (snapshot.version === 1) return true; // Existing legacy jobs keep their original consent contract.
  if (snapshot.version !== 2) return false;
  try {
    const input = { merchantId: snapshot.merchantId, conversationId: snapshot.conversationId,
      customerPhone: snapshot.conversationPhone, incomingMessageId: snapshot.sourceId };
    const context = await readStoredUnderstanding(db, input);
    const intent = contextualAppointmentReminderIntent(context?.analysis);
    return intent?.kind === 'schedule' && intent.appointmentId === snapshot.appointmentId && intent.hours === snapshot.hours
      && context!.analysis.appointmentReminder!.targetDigest === snapshot.targetDigest
      && await contextualReminderTargetMatches(db, input, context!.analysis);
  } catch { return false; }
}
