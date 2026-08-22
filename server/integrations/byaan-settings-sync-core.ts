import { ByaanSyncValidationError } from './byaan-sync-errors';

export type ByaanSettingField = 'businessName' | 'website' | 'city' | 'description';

export interface NormalizedByaanSetting {
  field: ByaanSettingField;
  column: 'businessName' | 'website_url' | 'address' | 'description';
  value: string | null;
}

const SETTINGS_CONTRACT: Record<ByaanSettingField, {
  column: NormalizedByaanSetting['column'];
  maxLength: number;
  required: boolean;
}> = {
  businessName: { column: 'businessName', maxLength: 255, required: true },
  website: { column: 'website_url', maxLength: 500, required: false },
  city: { column: 'address', maxLength: 500, required: false },
  description: { column: 'description', maxLength: 2_000, required: false },
};

function normalizeWebsite(value: string): string {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new ByaanSyncValidationError('settings');
    }
    return parsed.toString();
  } catch (error) {
    if (error instanceof ByaanSyncValidationError) throw error;
    throw new ByaanSyncValidationError('settings');
  }
}

export function normalizeByaanSettings(settings: unknown): NormalizedByaanSetting[] {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new ByaanSyncValidationError('settings');
  }
  const keys = Object.keys(settings);
  if (keys.some((key) => !Object.prototype.hasOwnProperty.call(SETTINGS_CONTRACT, key))) {
    throw new ByaanSyncValidationError('settings');
  }

  const input = settings as Record<string, unknown>;
  const normalized: NormalizedByaanSetting[] = [];
  for (const field of Object.keys(SETTINGS_CONTRACT) as ByaanSettingField[]) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    const rawValue = input[field];
    if (typeof rawValue !== 'string' || /[\u0000\u007f]/.test(rawValue)) {
      throw new ByaanSyncValidationError('settings');
    }
    const contract = SETTINGS_CONTRACT[field];
    const trimmed = rawValue.trim();
    const clean = trimmed.replace(/<[^>]*>/g, '').trim();
    if ((contract.required && !clean) || (trimmed && !clean)) {
      throw new ByaanSyncValidationError('settings');
    }
    let value: string | null = clean || null;
    if (field === 'website' && value) value = normalizeWebsite(value);
    if (value && value.length > contract.maxLength) {
      throw new ByaanSyncValidationError('settings');
    }
    normalized.push({ field, column: contract.column, value });
  }
  return normalized;
}
