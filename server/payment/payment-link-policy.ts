import { createHash } from 'node:crypto';

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

export function buildTapCheckoutIdempotentReference(
  paymentLinkId: number,
  checkoutAttemptId: string,
): string {
  if (!Number.isSafeInteger(paymentLinkId) || paymentLinkId <= 0) {
    throw new Error('Invalid payment link identity');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutAttemptId)) {
    throw new Error('Invalid checkout attempt identity');
  }
  const digest = createHash('sha256')
    .update(`sari:tap-checkout:v1:${paymentLinkId}:${checkoutAttemptId.toLowerCase()}`)
    .digest('hex');
  return `sari_pl_${digest}`;
}

export interface TapCheckoutChargeExpectation {
  amountInHalalas: number;
  currency: 'SAR';
  testMode: boolean;
}

export interface ValidatedTapCheckoutCharge {
  id: string;
  paymentUrl: string;
  expiresInMs: number | null;
}

export function validateTapCheckoutCharge(
  value: unknown,
  expected: TapCheckoutChargeExpectation,
): ValidatedTapCheckoutCharge | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const charge = value as Record<string, any>;
  const id = typeof charge.id === 'string' ? charge.id.trim() : '';
  if (!/^chg_[A-Za-z0-9_-]{3,250}$/.test(id)) return null;
  if (charge.status !== 'INITIATED') return null;
  if (charge.currency !== expected.currency) return null;
  if (!Number.isFinite(charge.amount) || Math.round(Number(charge.amount) * 100) !== expected.amountInHalalas) {
    return null;
  }
  if (typeof charge.live_mode !== 'boolean' || charge.live_mode !== !expected.testMode) return null;

  const paymentUrl = typeof charge.transaction?.url === 'string' ? charge.transaction.url.trim() : '';
  try {
    const parsedUrl = new URL(paymentUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) return null;
    if (hostname !== 'tap.company' && !hostname.endsWith('.tap.company')) return null;
  } catch {
    return null;
  }

  const rawExpiry = charge.transaction?.expiry?.period;
  const rawExpiryType = charge.transaction?.expiry?.type;
  const expiryUnitMs = rawExpiryType === 'MINUTE'
    ? 60_000
    : rawExpiryType === 'HOUR'
      ? 3_600_000
      : rawExpiryType === 'DAY'
        ? 86_400_000
        : null;
  const expiresInMs = expiryUnitMs && Number.isFinite(rawExpiry) && rawExpiry > 0
    && Number(rawExpiry) * expiryUnitMs <= 7 * 86_400_000
    ? Number(rawExpiry) * expiryUnitMs
    : null;
  return { id, paymentUrl, expiresInMs };
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
