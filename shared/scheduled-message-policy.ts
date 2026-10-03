import { z } from 'zod';
import { zonedWallTime, resolveZonedWallTime } from './followup-policy';
import { campaignMessageIssue, withCampaignOptOutNotice } from './campaign-message';
import { campaignScheduleMaximum } from './campaign-schedule';

export const scheduledAdmissionMinutes = 15;
export const scheduledDeliveryMinutes = 1440;
export const scheduledTimezone = z.string().min(1).max(100).refine(zone => {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
});
export const scheduledDefinitionFields = z.object({
  title: z.string().trim().min(1).max(255), message: z.string().trim().min(1).max(3800),
  dayOfWeek: z.number().int().min(0).max(6), time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), timezone: scheduledTimezone,
}).strict().refine(v => campaignMessageIssue(v.message, null) === null, { path: ['message'], message: 'Invalid scheduled message content' });
export type ScheduledDefinition = z.infer<typeof scheduledDefinitionFields>;
export const scheduledMessagePreview = (definition: ScheduledDefinition) => withCampaignOptOutNotice(scheduledDefinitionFields.parse(definition).message);
type Slot = { status: 'ready'; dueAt: string; expiresAt: string } | { status: 'invalid'; reason: 'definition' | 'nonexistent' | 'ambiguous' | 'out_of_range' } | { status: 'not_due' };

/** A local weekly wall clock never borrows the process or browser timezone. Repeated DST minutes are not silently selected. */
export function scheduledWeeklySlot(raw: ScheduledDefinition, now: Date, kind: 'next' | 'due'): Slot {
  const parsed = scheduledDefinitionFields.safeParse(raw);
  if (!parsed.success || !Number.isFinite(now.getTime())) return { status: 'invalid', reason: 'definition' };
  const d = parsed.data, wall = zonedWallTime(now, d.timezone), candidate = new Date(wall);
  const [hour, minute] = d.time.split(':').map(Number); candidate.setUTCHours(hour, minute, 0, 0);
  const offset = kind === 'next' ? (d.dayOfWeek - wall.getUTCDay() + 7) % 7 : -((wall.getUTCDay() - d.dayOfWeek + 7) % 7);
  candidate.setUTCDate(candidate.getUTCDate() + offset);
  if (kind === 'next' && candidate.getTime() <= wall.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 7);
  const matches = resolveZonedWallTime(candidate, d.timezone);
  if (!matches.length) return { status: 'invalid', reason: 'nonexistent' };
  if (matches.length !== 1) return { status: 'invalid', reason: 'ambiguous' };
  const at = matches[0].getTime(), expires = at + scheduledDeliveryMinutes * 60000;
  if (expires > Date.parse(campaignScheduleMaximum)) return { status: 'invalid', reason: 'out_of_range' };
  if (kind === 'due' && (at > now.getTime() || now.getTime() - at >= scheduledAdmissionMinutes * 60000)) return { status: 'not_due' };
  return { status: 'ready', dueAt: new Date(at).toISOString(), expiresAt: new Date(expires).toISOString() };
}
