import { bookingWorkspaceInput } from '@shared/booking-workspace';
import { createBookingSchema } from '@shared/booking-creation';
export function bookingNavigation(search: string) {
  const params = new URLSearchParams(search), id = params.get('booking');
  const positive = (value: string | null) => value === null ? undefined : /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
  const parsed = bookingWorkspaceInput.safeParse({ search: params.get('q') ?? '', status: params.get('status') ?? 'all', payment: params.get('payment') ?? 'all', startDate: params.get('from') || undefined, endDate: params.get('to') || undefined, serviceId: positive(params.get('service')), staffId: positive(params.get('staff')), page: positive(params.get('page')) });
  const view = id === null ? 'list' : id === 'new' ? 'new' : /^[1-9]\d*$/.test(id) && Number(id) <= 2147483647 ? Number(id) : 'invalid';
  return { selection: parsed.success ? parsed.data : null, view };
}
export function bookingHref(path: string, search: string, patch: Record<string, string | number | null>) {
  const params = new URLSearchParams(search); for (const [key, value] of Object.entries(patch)) { if (value === null || value === '' || value === 'all' || key === 'page' && value === 1) params.delete(key); else params.set(key, String(value)); }
  return path + (params.size ? '?' + params.toString() : '');
}
export const emptyBookingDraft = { serviceId: 0, staffId: 0, customerPhone: '', customerName: '', customerEmail: '', bookingDate: '', startTime: '', endTime: '', durationMinutes: '60', basePrice: '', discountAmount: '0', notes: '', bookingSource: 'walk_in' };
export type BookingDraft = typeof emptyBookingDraft;
export const bookingEndTime = (start: string, duration: string) => {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^[1-9]\d*$/.test(duration)) return '';
  const total = Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + Number(duration);
  return total < 1440 ? String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0') : '';
};
export function bookingMoney(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.'), minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor <= 2147483647 ? minor : null;
}
export function parseBookingDraft(draft: BookingDraft) {
  const errors: Record<string, boolean> = {}, base = bookingMoney(draft.basePrice), discount = bookingMoney(draft.discountAmount);
  if (base === null) errors.basePrice = true; if (discount === null || base !== null && discount > base) errors.discountAmount = true;
  const parsed = createBookingSchema.safeParse({ ...draft, staffId: draft.staffId || undefined, customerName: draft.customerName.trim() || undefined, customerEmail: draft.customerEmail.trim() || undefined, notes: draft.notes || undefined, durationMinutes: /^\d+$/.test(draft.durationMinutes) ? Number(draft.durationMinutes) : NaN, basePrice: base, discountAmount: discount, finalPrice: base === null || discount === null ? null : base - discount });
  if (!parsed.success) for (const issue of parsed.error.issues) { const field = String(issue.path[0] ?? 'endTime'); errors[field] = true; }
  return { data: parsed.success && !Object.keys(errors).length ? parsed.data : null, errors };
}
