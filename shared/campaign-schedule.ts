import { resolveZonedWallTime, zonedWallTime } from './followup-policy';

export const campaignScheduleMaximum = '2038-01-19T03:14:07.000Z';
export type CampaignScheduleIssue = 'invalid_timezone' | 'invalid_schedule' | 'past' | 'out_of_range' | 'nonexistent' | 'ambiguous';
export type CampaignScheduleResult = { status: 'empty' } | { status: 'valid'; iso: string } | { status: 'invalid'; issue: CampaignScheduleIssue };

export function campaignScheduleField(iso: string | null, timezone: string | null): string | null {
  if (iso === null) return '';
  if (!timezone || !/[zZ]$/.test(iso)) return null;
  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) return null;
  try { return zonedWallTime(instant, timezone).toISOString().slice(0, 19); } catch { return null; }
}

/** A wall clock value belongs to the merchant's zone, never the browser's zone. */
export function resolveCampaignSchedule(value: string, timezone: string | null, now = new Date()): CampaignScheduleResult {
  if (value === '') return { status: 'empty' };
  if (!Number.isFinite(now.getTime())) return { status: 'invalid', issue: 'invalid_schedule' };
  if (!timezone) return { status: 'invalid', issue: 'invalid_timezone' };
  try { zonedWallTime(now, timezone); } catch { return { status: 'invalid', issue: 'invalid_timezone' }; }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return { status: 'invalid', issue: 'invalid_schedule' };
  const canonical = value.length === 16 ? `${value}:00` : value, wall = new Date(`${canonical}Z`);
  if (!Number.isFinite(wall.getTime()) || wall.toISOString().slice(0, 19) !== canonical) return { status: 'invalid', issue: 'invalid_schedule' };
  const matches = resolveZonedWallTime(wall, timezone);
  if (!matches.length) return { status: 'invalid', issue: 'nonexistent' };
  if (matches.length !== 1) return { status: 'invalid', issue: 'ambiguous' };
  if (matches[0].getTime() <= now.getTime()) return { status: 'invalid', issue: 'past' };
  if (matches[0].getTime() > new Date(campaignScheduleMaximum).getTime()) return { status: 'invalid', issue: 'out_of_range' };
  return { status: 'valid', iso: matches[0].toISOString() };
}
