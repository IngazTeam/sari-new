import { discountCreateInput, discountUpdateInput } from '@shared/discount-dashboard';
import { discountWorkspaceInput, discountWorkspaceSchema, discountStates, type DiscountSelection } from '@shared/discount-workspace';
export type DiscountDraft = { code: string; type: 'percentage' | 'fixed'; value: string; minOrderAmount: string; maxUses: string; expiresAt: string };
export const blankDiscount = (): DiscountDraft => ({ code: '', type: 'percentage', value: '', minOrderAmount: '', maxUses: '', expiresAt: '' });
export const discountSelectionKey = (value: DiscountSelection) => JSON.stringify([value.query, value.status, value.origin, value.page]);
export function discountNavigation(search: string) {
  const p = new URLSearchParams(search), page = p.get('page'), status = p.get('status'), origin = p.get('origin');
  return discountWorkspaceInput.parse({ query: (p.get('q') ?? '').trim().slice(0, 80), status: discountStates.includes(status as any) ? status : 'all', origin: ['manual', 'automatic'].includes(origin ?? '') ? origin : 'all', page: page && /^[1-9]\d*$/.test(page) && Number(page) <= 1000000 ? Number(page) : 1 });
}
export function scopedDiscountWorkspace(raw: unknown, actorId: number, merchantId: number, selection: DiscountSelection) {
  const parsed = discountWorkspaceSchema.safeParse(raw);
  return parsed.success && parsed.data.actorId === actorId && parsed.data.merchantId === merchantId && discountSelectionKey(parsed.data.selection) === discountSelectionKey(selection) ? parsed.data : null;
}
function integer(raw: string) {
  const text = raw.trim().replace(/[٠-٩]/g, char => String(char.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, char => String(char.charCodeAt(0) - 1776));
  return /^\d+$/.test(text) ? Number(text) : NaN;
}
export function parseDiscountDraft(draft: DiscountDraft, editing?: { id: number; revision: string }) {
  const fields = { maxUses: draft.maxUses.trim() ? integer(draft.maxUses) : editing ? null : undefined, expiresAt: draft.expiresAt || (editing ? null : undefined) };
  const parsed = editing ? discountUpdateInput.safeParse({ id: editing.id, expectedRevision: editing.revision, ...fields })
    : discountCreateInput.safeParse({ code: draft.code, type: draft.type, value: integer(draft.value), minOrderAmount: draft.minOrderAmount.trim() ? integer(draft.minOrderAmount) : undefined, ...fields });
  const errors: Record<string, string> = {};
  if (!parsed.success) for (const issue of parsed.error.issues) { const key = String(issue.path[0]); errors[key] = ({ code: 'invalidCode', value: 'invalidValue', minOrderAmount: 'invalidMinimum', maxUses: 'invalidLimit', expiresAt: 'invalidDate' } as Record<string, string>)[key] ?? 'invalidValue'; }
  return { parsed, errors };
}
export function discountTemplate(name: string, now = new Date()): DiscountDraft {
  const date = (days: number) => new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
  const presets: Record<string, DiscountDraft> = {
    template10: { code: 'SAVE10', type: 'percentage', value: '10', minOrderAmount: '100', maxUses: '100', expiresAt: '' },
    template25: { code: 'MEGA25', type: 'percentage', value: '25', minOrderAmount: '200', maxUses: '50', expiresAt: '' },
    template50: { code: 'FLAT50', type: 'fixed', value: '50', minOrderAmount: '200', maxUses: '100', expiresAt: '' },
    templateWelcome: { code: 'WELCOME', type: 'percentage', value: '15', minOrderAmount: '50', maxUses: '', expiresAt: '' },
    templateSeasonal: { code: 'SEASON30', type: 'percentage', value: '30', minOrderAmount: '150', maxUses: '200', expiresAt: date(30) },
    templateFlash: { code: 'FLASH40', type: 'percentage', value: '40', minOrderAmount: '100', maxUses: '30', expiresAt: date(3) },
  }; return presets[name] ?? blankDiscount();
}
