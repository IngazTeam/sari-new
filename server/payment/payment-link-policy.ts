export interface PaymentLinkState {
  isActive: number | boolean;
  status: string;
  expiresAt?: string | Date | null;
  maxUsageCount?: number | null;
  usageCount: number;
}

export type PaymentLinkAvailability =
  | { available: true }
  | { available: false; reason: 'disabled' | 'expired' | 'exhausted' };

export function getPaymentLinkAvailability(
  link: PaymentLinkState,
  now = new Date(),
): PaymentLinkAvailability {
  if (!link.isActive || link.status === 'disabled' || link.status === 'completed') {
    return { available: false, reason: link.status === 'completed' ? 'exhausted' : 'disabled' };
  }

  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now.getTime()) {
    return { available: false, reason: 'expired' };
  }

  if (link.maxUsageCount != null && link.usageCount >= link.maxUsageCount) {
    return { available: false, reason: 'exhausted' };
  }

  return { available: true };
}

export function halalasToTapAmount(amountInHalalas: number): number {
  if (!Number.isSafeInteger(amountInHalalas) || amountInHalalas < 100) {
    throw new Error('Payment amount must be a safe integer of at least 100 halalas');
  }
  return Number((amountInHalalas / 100).toFixed(2));
}

export function normalizeSaudiPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('966')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^5\d{8}$/.test(digits)) {
    throw new Error('Invalid Saudi mobile number');
  }
  return digits;
}

export function readPaymentLinkId(metadata: string | null | undefined): number | null {
  if (!metadata) return null;
  try {
    const value = JSON.parse(metadata)?.paymentLinkId;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function tapKeyMatchesMode(secretKey: string, testMode: boolean): boolean {
  const normalized = secretKey.trim().toLowerCase();
  if (!normalized || normalized.includes('*')) return false;
  if (testMode) return normalized.startsWith('sk_test_');
  return normalized.startsWith('sk_live_');
}

export function tapPublicKeyMatchesMode(publicKey: string, testMode: boolean): boolean {
  const normalized = publicKey.trim().toLowerCase();
  if (!normalized || normalized.includes('*')) return false;
  if (testMode) return normalized.startsWith('pk_test_');
  return normalized.startsWith('pk_live_');
}

export interface TapPaymentSettingsState {
  tapEnabled: number | boolean | null;
  tapPublicKey?: string | null;
  tapSecretKey?: string | null;
  tapTestMode: number | boolean | null;
  isVerified: number | boolean | null;
  lastVerifiedAt?: string | Date | null;
}

export function hasVerifiedTapCredentials(settings: TapPaymentSettingsState): boolean {
  const testMode = Boolean(settings.tapTestMode);
  return Boolean(settings.isVerified)
    && tapPublicKeyMatchesMode(settings.tapPublicKey ?? '', testMode)
    && tapKeyMatchesMode(settings.tapSecretKey ?? '', testMode);
}

export function isTapPaymentReady(settings: TapPaymentSettingsState): boolean {
  return Boolean(settings.tapEnabled) && hasVerifiedTapCredentials(settings);
}

export function toMerchantPaymentSettingsView<T extends TapPaymentSettingsState>(settings: T) {
  const { tapSecretKey, ...publicSettings } = settings;
  const credentialsVerified = hasVerifiedTapCredentials(settings);

  return {
    ...publicSettings,
    // A presence bit lets the UI preserve an existing secret without receiving
    // even a masked fragment that could be mistaken for a writable credential.
    hasTapSecretKey: Boolean(tapSecretKey?.trim()),
    isVerified: credentialsVerified ? 1 : 0,
    credentialsVerified,
    isReadyForPayments: Boolean(settings.tapEnabled) && credentialsVerified,
    lastVerifiedAt: credentialsVerified ? settings.lastVerifiedAt ?? null : null,
  };
}

export function maskSecret(secret: string): string {
  if (secret.length <= 8) return '********';
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}
