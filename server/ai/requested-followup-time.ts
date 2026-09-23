import { isSalesRefusal, normalizeCustomerText } from './customer-decision';

const OFFSET = 3 * 60 * 60 * 1000; // Follow-up policy currently uses Asia/Riyadh.
const dayMs = 24 * 60 * 60 * 1000;
export type RequestedFollowupTime = { kind: 'requested'; at: Date } | { kind: 'clarify' } | null;

/** Conservative date parser: incomplete/ambiguous dates request clarification.
 * Relative dates use the persisted incoming-message time, never the retry time. */
export function parseRequestedFollowupTime(message: string, sourceTime: Date, now = new Date()): RequestedFollowupTime {
  const text = normalizeCustomerText(message).replace(/[٠-٩۰-۹]/g, char => String('٠١٢٣٤٥٦٧٨٩'.includes(char)
    ? '٠١٢٣٤٥٦٧٨٩'.indexOf(char) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(char)));
  if (isSalesRefusal(message) || !/^(?:لو سمحت\s+)?(?:ذكرني|كلمني|تواصل معي|تابع معي|remind me|contact me)(?=\s|$)/.test(text)) return null;
  return parseTime(text, sourceTime, now);
}

function parseTime(text: string, sourceTime: Date, now: Date): RequestedFollowupTime {
  if (!Number.isFinite(sourceTime.getTime()) || !Number.isFinite(now.getTime()) || text.length > 500
    || /(?:^|\s)(?:او|or|اذا|لا|ليس|مو|if|unless|maybe)(?=\s|$)|بتوقيت|utc|gmt|دبي|cairo|dubai|[?؟]/.test(text)) return { kind: 'clarify' };
  const times = Array.from(text.matchAll(/(?:الساعه|ساعه|at)\s*(\d{1,2})(?::(\d{2}))?\s*(صباحا?|مساء(?:ا)?|ص|م|am|pm)?(?=\s|[.!،]|$)/g));
  if (times.length !== 1) return { kind: 'clarify' };
  const time = times[0];
  if (!time || (!time[2] && !time[3] && Number(time[1]) <= 12)) return { kind: 'clarify' };
  let hour = Number(time[1]); const minute = Number(time[2] || 0);
  if (minute > 59 || hour > 23 || (time[3] && (hour < 1 || hour > 12))) return { kind: 'clarify' };
  if (time[3]) { hour %= 12; if (/^(?:م|مساء|pm)/.test(time[3])) hour += 12; }
  const localSource = new Date(sourceTime.getTime() + OFFSET);
  let local = new Date(Date.UTC(localSource.getUTCFullYear(), localSource.getUTCMonth(), localSource.getUTCDate(), hour, minute));
  const explicitDate = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (explicitDate) {
    local = new Date(Date.UTC(Number(explicitDate[1]), Number(explicitDate[2]) - 1, Number(explicitDate[3]), hour, minute));
    if (local.toISOString().slice(0, 10) !== explicitDate[0]) return { kind: 'clarify' };
  } else if (/(?:بكره|غدا|tomorrow)/.test(text)) local = new Date(local.getTime() + dayMs);
  else if (/(?:اليوم|today)/.test(text)) { /* explicit same-day request */ }
  else {
    const days = ['الاحد', 'الاثنين', 'الثلاثاء', 'الاربعاء', 'الخميس', 'الجمعه', 'السبت'];
    const english = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const matches = days.map((day, index) => text.includes(day) || text.includes(english[index]) ? index : -1).filter(day => day >= 0);
    if (matches.length !== 1) return { kind: 'clarify' };
    let delta = (matches[0] - localSource.getUTCDay() + 7) % 7;
    if (delta === 0 && local <= localSource) delta = 7;
    local = new Date(local.getTime() + delta * dayMs);
  }
  const at = new Date(local.getTime() - OFFSET);
  if (at <= now || at.getTime() - now.getTime() > 90 * dayMs || at <= sourceTime) return { kind: 'clarify' };
  // Don't silently shift a requested night-time appointment to the next morning.
  if (hour < 8 || hour >= 23) return { kind: 'clarify' };
  return { kind: 'requested', at };
}
