import { createHash } from 'node:crypto';
import {
  attachTapChargeToPaymentTransaction,
  getTapSettings,
  type getPaymentTransactionById,
} from '../db';
import { publicPaymentUrls } from '../utils/public-url';
import {
  normalizeSaudiPhone,
  validateTapCheckoutCharge,
} from './payment-link-policy';
import { toPlatformTapSettingsView } from './platform-tap-settings';
import { postTapCharge, TapClientError } from './tap-client';

type PaymentTransaction = NonNullable<Awaited<ReturnType<typeof getPaymentTransactionById>>>;

export type SubscriptionTapCheckoutFailure =
  | 'gateway_not_ready'
  | 'attempt_already_finished'
  | 'stored_charge_invalid'
  | 'provider_rejected'
  | 'provider_unavailable'
  | 'provider_response_invalid'
  | 'charge_identity_conflict';

export class SubscriptionTapCheckoutError extends Error {
  constructor(public readonly failure: SubscriptionTapCheckoutFailure) {
    super(`Subscription Tap checkout failed: ${failure}`);
    this.name = 'SubscriptionTapCheckoutError';
  }
}

export function buildTapSubscriptionIdempotentReference(
  merchantId: number,
  checkoutAttemptId: string,
): string {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1) throw new Error('Invalid merchant identity');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutAttemptId)) {
    throw new Error('Invalid checkout attempt identity');
  }
  const digest = createHash('sha256')
    .update(`sari:tap-subscription:v1:${merchantId}:${checkoutAttemptId.toLowerCase()}`)
    .digest('hex');
  return `sari_sub_${digest}`;
}

function amountToMinorUnits(amount: number): number {
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor) || minor < 1) throw new Error('Invalid checkout amount');
  return minor;
}

function readStoredCharge(
  transaction: PaymentTransaction,
  expected: { amountInHalalas: number; currency: string; testMode: boolean },
) {
  if (!transaction.tapChargeId) return null;
  if (!transaction.tapResponse) throw new SubscriptionTapCheckoutError('stored_charge_invalid');
  try {
    const stored = JSON.parse(transaction.tapResponse);
    const charge = validateTapCheckoutCharge(stored, expected);
    if (!charge || charge.id !== transaction.tapChargeId) {
      throw new SubscriptionTapCheckoutError('stored_charge_invalid');
    }
    if (typeof stored.expires_at === 'string'
      && new Date(stored.expires_at).getTime() <= Date.now()) {
      throw new SubscriptionTapCheckoutError('attempt_already_finished');
    }
    return charge;
  } catch (error) {
    if (error instanceof SubscriptionTapCheckoutError) throw error;
    throw new SubscriptionTapCheckoutError('stored_charge_invalid');
  }
}

function optionalSaudiPhone(phone: string | null | undefined) {
  if (!phone) return undefined;
  try {
    return { country_code: '966', number: normalizeSaudiPhone(phone) };
  } catch {
    return undefined;
  }
}

export async function createPlatformSubscriptionTapCharge(input: {
  transaction: PaymentTransaction;
  merchantId: number;
  checkoutAttemptId: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  description: string;
}) {
  if (input.transaction.merchantId !== input.merchantId
    || input.transaction.checkoutAttemptId?.toLowerCase() !== input.checkoutAttemptId.toLowerCase()
    || Number(input.transaction.amount) !== input.amount
    || input.transaction.currency !== input.currency) {
    throw new SubscriptionTapCheckoutError('charge_identity_conflict');
  }
  if (input.transaction.status !== 'pending') {
    throw new SubscriptionTapCheckoutError('attempt_already_finished');
  }

  const settings = await getTapSettings();
  if (!settings || !settings.isActive || !toPlatformTapSettingsView(settings).credentialsVerified) {
    throw new SubscriptionTapCheckoutError('gateway_not_ready');
  }
  const expected = {
    amountInHalalas: amountToMinorUnits(input.amount),
    currency: input.currency,
    testMode: !Boolean(settings.isLive),
  };
  const storedCharge = readStoredCharge(input.transaction, expected);
  if (storedCharge) {
    return {
      transactionId: input.transaction.id,
      chargeId: storedCharge.id,
      paymentUrl: storedCharge.paymentUrl,
      reused: true,
    };
  }

  const idempotentReference = buildTapSubscriptionIdempotentReference(
    input.merchantId,
    input.checkoutAttemptId,
  );
  const customerPhone = optionalSaudiPhone(input.customerPhone);
  let response: Awaited<ReturnType<typeof postTapCharge>>;
  try {
    response = await postTapCharge(settings.secretKey, {
      amount: input.amount,
      currency: input.currency,
      customer: {
        first_name: input.customerName.trim().slice(0, 128) || 'Customer',
        ...(input.customerEmail && { email: input.customerEmail.trim().slice(0, 320) }),
        ...(customerPhone && { phone: customerPhone }),
      },
      source: { id: 'src_all' },
      redirect: { url: publicPaymentUrls.callback() },
      post: { url: publicPaymentUrls.webhook() },
      description: input.description.trim().slice(0, 255),
      reference: {
        transaction: idempotentReference,
        order: idempotentReference,
        idempotent: idempotentReference,
      },
      metadata: { flow: 'subscription_checkout' },
    });
  } catch (error) {
    if (error instanceof TapClientError) {
      throw new SubscriptionTapCheckoutError('provider_unavailable');
    }
    throw error;
  }
  if (!response.ok) throw new SubscriptionTapCheckoutError('provider_rejected');
  const charge = validateTapCheckoutCharge(response.body, expected);
  if (!charge) throw new SubscriptionTapCheckoutError('provider_response_invalid');

  const safeTapResponse = JSON.stringify({
    id: charge.id,
    status: 'INITIATED',
    amount: input.amount,
    currency: input.currency,
    live_mode: Boolean(settings.isLive),
    transaction: { url: charge.paymentUrl },
    expires_at: charge.expiresInMs ? new Date(Date.now() + charge.expiresInMs).toISOString() : null,
  });
  try {
    await attachTapChargeToPaymentTransaction({
      transactionId: input.transaction.id,
      merchantId: input.merchantId,
      tapChargeId: charge.id,
      safeTapResponse,
    });
  } catch {
    throw new SubscriptionTapCheckoutError('charge_identity_conflict');
  }
  return {
    transactionId: input.transaction.id,
    chargeId: charge.id,
    paymentUrl: charge.paymentUrl,
    reused: false,
  };
}
