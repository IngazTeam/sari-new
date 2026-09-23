import { z } from 'zod';

export const suggestedFollowupTimezones = ['Asia/Riyadh', 'Asia/Dubai', 'Africa/Cairo', 'Europe/London', 'America/New_York', 'UTC'];
export const followupPolicySchema = z.object({
  enabled: z.boolean(), timeZone: z.string().min(1).max(64).refine(zone => {
    try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); return true; } catch { return false; }
  }, 'Invalid timezone'),
  startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(1).max(24),
  weeklyLimit: z.number().int().min(1).max(3),
}).strict().refine(p => p.startHour < p.endHour, 'Send window must end after it starts');
export type FollowupPolicy = z.infer<typeof followupPolicySchema>;
export const defaultFollowupPolicy: FollowupPolicy = { enabled: true, timeZone: 'Asia/Riyadh', startHour: 8, endHour: 23, weeklyLimit: 3 };

const formatters = new Map<string, Intl.DateTimeFormat>();
export function zonedWallTime(at: Date, timeZone: string): Date {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone, calendar: 'gregory', numberingSystem: 'latn',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    if (formatters.size >= 100) formatters.clear();
    formatters.set(timeZone, formatter);
  }
  const p = Object.fromEntries(formatter.formatToParts(at).map(part => [part.type, part.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second));
}

/** Zero candidates = DST gap, two = repeated clock time. A customer must clarify either case. */
export function resolveZonedWallTime(wall: Date, timeZone: string): Date[] {
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const instant = new Date(wall.getTime() + hours * 3600000);
    offsets.add(zonedWallTime(instant, timeZone).getTime() - instant.getTime());
  }
  return Array.from(offsets).map(offset => new Date(wall.getTime() - offset))
    .filter(at => zonedWallTime(at, timeZone).getTime() === wall.getTime()).sort((a, b) => a.getTime() - b.getTime());
}
export function isFollowupTimeAllowed(policy: FollowupPolicy, at = new Date()): boolean {
  if (!policy.enabled || !Number.isFinite(at.getTime())) return false;
  const hour = zonedWallTime(at, policy.timeZone).getUTCHours();
  return hour >= policy.startHour && hour < policy.endHour;
}
export function nextFollowupSendTime(policy: FollowupPolicy, now = new Date()): Date | null {
  if (!policy.enabled || !Number.isFinite(now.getTime())) return null;
  if (isFollowupTimeAllowed(policy, now)) return now;
  // Iterate real instants, so DST gaps/folds and non-hour offsets cannot fabricate a wall-clock instant.
  let next = Math.ceil(now.getTime() / 60000) * 60000;
  for (let minute = 0; minute < 3 * 24 * 60; minute++, next += 60000) {
    const at = new Date(next); if (isFollowupTimeAllowed(policy, at)) return at;
  }
  return null;
}
