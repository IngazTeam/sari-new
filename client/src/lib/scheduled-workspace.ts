import { scheduledMessageSelection, type ScheduledMessageSelection, type ScheduledMessageRow } from '@shared/scheduled-message-workspace';
import { scheduledMessageWorkspace, scheduledHistory } from '@shared/scheduled-message-evidence';
import { scheduledActionTarget, scheduledActionReview, scheduledActionResult, scheduledCancelledReceipt, type ScheduledActionTarget } from '@shared/scheduled-message-actions';
export const scheduledSelectionKey = (s: ScheduledMessageSelection) => JSON.stringify([s.query, s.state, s.day, s.sort, s.page]);
export function scheduledNavigation(search: string) {
  const p = new URLSearchParams(search), page = p.get('page'), day = p.get('day');
  return scheduledMessageSelection.parse({ query: (p.get('q') ?? '').trim().slice(0, 100), state: ['enabled', 'disabled', 'unknown'].includes(p.get('state') ?? '') ? p.get('state') : 'all',
    day: day !== null && /^[0-6]$/.test(day) ? Number(day) : null, sort: ['oldest', 'title', 'schedule'].includes(p.get('sort') ?? '') ? p.get('sort') : 'newest',
    page: page && /^[1-9]\d*$/.test(page) && Number(page) <= 1000000 ? Number(page) : 1 });
}
export function scopedScheduledWorkspace(raw: unknown, a: number, m: number, selection: ScheduledMessageSelection) {
  const p = scheduledMessageWorkspace.safeParse(raw); if (!p.success) return null; const d = p.data;
  return d.actorId === a && d.merchantId === m && scheduledSelectionKey(d.selection) === scheduledSelectionKey(selection) && d.matched <= d.total
    && d.pages === Math.ceil(d.matched / 25) && d.currentPage === Math.min(selection.page, Math.max(1, d.pages))
    && d.rows.length === Math.min(25, Math.max(0, d.matched - (d.currentPage - 1) * 25)) && new Set(d.rows.map(r => r.id)).size === d.rows.length
    && Object.values(d.counts).reduce((a, b) => a + b, 0) === d.total ? d : null;
}
export function scopedScheduledHistory(raw: unknown, a: number, m: number, id: number, page: number) {
  const p = scheduledHistory.safeParse(raw); if (!p.success) return null; const d = p.data;
  return d.actorId === a && d.merchantId === m && d.selection.id === id && d.selection.page === page && d.pages === Math.ceil(d.total / 25)
    && d.currentPage === Math.min(page, Math.max(1, d.pages)) && d.rows.length === Math.min(25, Math.max(0, d.total - (d.currentPage - 1) * 25))
    && new Set(d.rows.map(r => r.id)).size === d.rows.length ? d : null;
}
export function scopedScheduledReview(raw: unknown, a: number, m: number, target: ScheduledActionTarget) {
  const p = scheduledActionReview.safeParse(raw), t = scheduledActionTarget.parse(target);
  return p.success && p.data.actorId === a && p.data.merchantId === m && JSON.stringify(p.data.target) === JSON.stringify(t)
    && (t.action === 'create' ? p.data.before === null : p.data.before?.id === t.id) ? p.data : null;
}
export function scopedScheduledResult(raw: unknown, a: number, m: number, key: string, target?: ScheduledActionTarget) {
  const p = scheduledActionResult.safeParse(raw); if (!p.success) return null; const d = p.data;
  const effectValid = d.action === 'delete' ? d.enabled === null && d.authorizationId === null && d.nextDueAt === null
    : d.action === 'create' || d.action === 'update' ? d.enabled === false && d.authorizationId === null && d.nextDueAt === null
    : d.enabled === true ? d.authorizationId !== null && d.nextDueAt !== null : d.enabled === false && d.authorizationId === null && d.nextDueAt === null;
  return effectValid && d.actorId === a && d.merchantId === m && d.requestKey === key && (!target || d.action === target.action
    && (target.action === 'create' || d.id === target.id) && (target.action !== 'toggle' || d.enabled === target.enabled)) ? d : null;
}
export function scopedScheduledCancellation(raw: unknown, a: number, m: number, key: string) {
  const p = scheduledCancelledReceipt.safeParse(raw); return p.success && p.data.actorId === a && p.data.merchantId === m && p.data.requestKey === key ? p.data : null;
}
export const scheduledStorageKey = (a: number, m: number) => `sari.weekly.request.v1:${a}:${m}`;
export const scheduledDefinitionKey = (r: ScheduledMessageRow) => JSON.stringify([r.id, r.title, r.message, r.dayOfWeek, r.time, r.enabled]);
export type ScheduledForm = { title: string; message: string; day: string; time: string };
export function scheduledForm(row?: ScheduledMessageRow): ScheduledForm { return { title: row?.title ?? '', message: row?.message ?? '', day: row ? row.dayOfWeek?.toString() ?? '' : '4', time: row ? row.time ?? '' : '10:00' }; }
export function scheduledFormTarget(form: ScheduledForm, timezone: string | null, row?: ScheduledMessageRow) {
  const errors: Partial<Record<keyof ScheduledForm | 'timezone', 'fieldRequired' | 'fieldInvalid' | 'fieldTimezone'>> = {};
  if (!form.title.trim()) errors.title = 'fieldRequired'; else if (form.title.trim().length > 255) errors.title = 'fieldInvalid';
  if (!form.message.trim()) errors.message = 'fieldRequired'; else if (form.message.trim().length > 3800) errors.message = 'fieldInvalid';
  if (!/^[0-6]$/.test(form.day)) errors.day = 'fieldRequired';
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(form.time)) errors.time = 'fieldInvalid';
  if (!timezone) errors.timezone = 'fieldTimezone';
  const result = scheduledActionTarget.safeParse({ action: row ? 'update' : 'create', ...(row ? { id: row.id } : {}), data: { title: form.title, message: form.message, dayOfWeek: Number(form.day), time: form.time, timezone } });
  if (Object.keys(errors).length || !result.success) return { target: null, errors: Object.keys(errors).length ? errors : { timezone: 'fieldTimezone' as const }, noChanges: false };
  const unchanged = row && scheduledDefinitionKey({ ...row, title: form.title.trim(), message: form.message.trim(), dayOfWeek: Number(form.day), time: form.time }) === scheduledDefinitionKey(row);
  return { target: unchanged ? null : result.data, errors, noChanges: !!unchanged };
}
export function scheduledErrorKey(error: unknown) {
  const message = String((error as any)?.message ?? ''), reason = message.startsWith('scheduled_action:') ? message.slice(17) : '';
  const map = { forbidden: 'errorForbidden', missing: 'errorMissing', invalid: 'errorInvalid', timezone: 'errorTimezone', channel: 'errorChannel', schedule: 'errorSchedule', stale: 'stale', reused: 'stale', cancelled: 'cancelledRequest', unknown: 'pending' } as const;
  return map[reason as keyof typeof map] ?? 'errorUnavailable';
}
