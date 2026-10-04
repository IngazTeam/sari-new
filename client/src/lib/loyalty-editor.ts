import {
  loyaltyActionInput,
  type LoyaltyAction,
  type LoyaltyWorkspace,
} from '@shared/loyalty-workspace';
import {
  loyaltyDefaults,
  loyaltySettingsInput,
  loyaltyTierInput,
  validLoyaltyReward,
} from '@shared/loyalty-input';
import type { LoyaltyCopy } from './loyalty-workspace-labels';
export type LoyaltyEditor = {
  kind: LoyaltyAction['kind'];
  row?: any;
  mode?: 'credit' | 'debit';
  phone?: string;
  version?: string;
  balance?: number;
};
export type LoyaltyField = {
  key: keyof LoyaltyCopy;
  type:
    | 'text'
    | 'number'
    | 'flag'
    | 'textarea'
    | 'datetime-local'
    | 'select'
    | 'product'
    | 'color';
  options?: Array<keyof LoyaltyCopy>;
  advanced?: boolean;
  optional?: boolean;
};
const f = (
  key: LoyaltyField['key'],
  type: LoyaltyField['type'] = 'text',
  advanced = false,
  optional = false
): LoyaltyField => ({ key, type, advanced, optional });
export const settingsFields = [
  f('isEnabled', 'flag'),
  f('pointsPerCurrency', 'number'),
  f('currencyPerPoint', 'number'),
  f('pointsExpiryDays', 'number'),
  f('enableReferralBonus', 'flag', true),
  f('referralBonusPoints', 'number', true),
  f('enableReviewBonus', 'flag', true),
  f('reviewBonusPoints', 'number', true),
  f('enableBirthdayBonus', 'flag', true),
  f('birthdayBonusPoints', 'number', true),
];
export const tierFields = [
  f('nameAr'),
  f('name'),
  f('minPoints', 'number'),
  f('discountPercentage', 'number'),
  f('freeShipping', 'flag'),
  f('priority', 'number'),
  f('color', 'color', true),
  f('icon', 'text', true),
  f('benefits', 'textarea', true, true),
];
export const rewardFields: LoyaltyField[] = [
  f('titleAr'),
  f('title'),
  {
    ...f('type', 'select'),
    options: ['gift', 'discount', 'free_product', 'free_shipping'],
  },
  f('pointsCost', 'number'),
  f('isActive', 'flag'),
  f('discountAmount', 'number'),
  { ...f('discountType', 'select'), options: ['fixed', 'percentage'] },
  f('productId', 'product'),
  f('maxRedemptions', 'number'),
  f('descriptionAr', 'textarea', true, true),
  f('description', 'textarea', true, true),
  f('validFrom', 'datetime-local', true, true),
  f('validUntil', 'datetime-local', true, true),
  f('imageUrl', 'text', true, true),
  f('termsAndConditionsAr', 'textarea', true, true),
  f('termsAndConditions', 'textarea', true, true),
];
export function editorFields(
  editor: LoyaltyEditor,
  draft: Record<string, any>
): LoyaltyField[] {
  if (editor.kind === 'settings') return settingsFields;
  if (editor.kind === 'tier') return tierFields;
  if (editor.kind === 'createReward' || editor.kind === 'reward')
    return rewardFields
      .filter(
        field =>
          !['discountAmount', 'discountType'].includes(field.key) ||
          draft.type === 'discount'
      )
      .filter(
        field => field.key !== 'productId' || draft.type === 'free_product'
      );
  if (editor.kind === 'points')
    return [
      f('points', 'number'),
      f('reasonAr', 'textarea'),
      f('reason', 'textarea'),
    ];
  if (editor.kind === 'redemption')
    return [
      {
        ...f('status', 'select'),
        options: (
          {
            pending: ['pending', 'approved', 'cancelled', 'expired'],
            approved: ['approved', 'used', 'cancelled', 'expired'],
            used: ['used'],
            cancelled: ['cancelled'],
            expired: ['expired'],
          } as Record<string, Array<keyof LoyaltyCopy>>
        )[editor.row.status],
      },
      f('notes', 'textarea', false, true),
      f('orderId', 'number', false, true),
    ];
  return [];
}
export function initialLoyaltyDraft(
  editor: LoyaltyEditor,
  data: LoyaltyWorkspace
) {
  const source =
    editor.kind === 'settings'
      ? data.settings || loyaltyDefaults
      : editor.kind === 'createReward'
        ? {
            title: '',
            titleAr: '',
            type: 'gift',
            pointsCost: 100,
            isActive: 1,
            discountAmount: 10,
            discountType: 'fixed',
            maxRedemptions: 0,
          }
        : editor.kind === 'points'
          ? { points: '', reason: '', reasonAr: '' }
          : editor.row || {};
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      ['validFrom', 'validUntil'].includes(key)
        ? typeof value === 'string'
          ? value.slice(0, 16)
          : ''
        : (value ?? ''),
    ])
  );
}
export function reviewedLoyaltyAction(
  editor: LoyaltyEditor,
  draft: Record<string, any>,
  data: LoyaltyWorkspace,
  requestId: string
): LoyaltyAction {
  const base = { reviewed: true, requestId },
    number = (key: string, optional = false) =>
      String(draft[key] ?? '').trim() === ''
        ? optional
          ? null
          : NaN
        : Number(draft[key]);
  if (editor.kind === 'settings')
    return loyaltyActionInput.parse({
      ...base,
      kind: 'settings',
      expectedVersion: editor.version,
      values: loyaltySettingsInput.parse(
        Object.fromEntries(settingsFields.map(f => [f.key, number(f.key)]))
      ),
    });
  if (editor.kind === 'tier')
    return loyaltyActionInput.parse({
      ...base,
      kind: 'tier',
      id: editor.row.id,
      expectedVersion: editor.row.revision,
      values: loyaltyTierInput.parse({
        ...Object.fromEntries(
          tierFields.map(f => [
            f.key,
            f.type === 'number' || f.type === 'flag'
              ? number(f.key)
              : draft[f.key],
          ])
        ),
        benefits: draft.benefits || null,
      }),
    });
  if (editor.kind === 'createReward' || editor.kind === 'reward') {
    const values = validLoyaltyReward({
      ...Object.fromEntries(
        rewardFields.map(f => [
          f.key,
          f.type === 'number' || f.type === 'product'
            ? number(f.key, true)
            : f.type === 'flag'
              ? number(f.key)
              : f.type === 'datetime-local'
                ? draft[f.key]
                  ? draft[f.key] + ':00Z'
                  : null
                : draft[f.key] || null,
        ])
      ),
      title: draft.title,
      titleAr: draft.titleAr,
      type: draft.type,
      discountType: draft.discountType || null,
    });
    return loyaltyActionInput.parse({
      ...base,
      kind: editor.kind,
      ...(editor.kind === 'reward'
        ? { id: editor.row.id, expectedVersion: editor.row.revision }
        : {}),
      values,
    });
  }
  if (editor.kind === 'points')
    return loyaltyActionInput.parse({
      ...base,
      kind: 'points',
      customerPhone: editor.phone,
      mode: editor.mode,
      points: number('points'),
      reason: draft.reason,
      reasonAr: draft.reasonAr,
      expectedVersion: editor.version,
    });
  if (editor.kind === 'redeem')
    return loyaltyActionInput.parse({
      ...base,
      kind: 'redeem',
      id: editor.row.id,
      customerPhone: editor.phone,
      expectedVersion: editor.row.redemptionRevision,
    });
  if (editor.kind === 'deleteReward')
    return loyaltyActionInput.parse({
      ...base,
      kind: 'deleteReward',
      id: editor.row.id,
      expectedVersion: editor.row.revision,
    });
  return loyaltyActionInput.parse({
    ...base,
    kind: 'redemption',
    id: editor.row.id,
    expectedVersion: editor.row.revision,
    status: draft.status,
    notes: draft.notes || '',
    orderId: number('orderId', true),
  });
}
