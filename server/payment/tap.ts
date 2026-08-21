/**
 * Tap Payment Gateway Integration
 * https://developers.tap.company
 */

import { createPayment, getPaymentByTransactionId, updatePayment, updatePaymentStatus } from '../db';
import { ENV } from '../_core/env';
import crypto from 'node:crypto';

interface TapChargeRequest {
  amount: number;
  currency: string;
  customer: {
    email: string;
    phone: {
      country_code: string;
      number: string;
    };
  };
  source: {
    id: string; // "src_all" for all payment methods
  };
  redirect: {
    url: string; // Return URL after payment
  };
  metadata: {
    merchantId: number;
    subscriptionId: number;
    planId: number;
  };
  reference: {
    transaction: string;
    order: string;
  };
}

interface TapChargeResponse {
  id: string;
  status: string;
  amount: number;
  currency: string;
  transaction: {
    url: string; // Payment page URL
  };
}

export async function createTapCharge(params: {
  amount: number;
  currency: string;
  merchantId: number;
  subscriptionId: number;
  planId: number;
  customerEmail: string;
  customerPhone: string;
  returnUrl: string;
}): Promise<{ success: boolean; paymentUrl?: string; chargeId?: string; error?: string }> {
  const startTime = Date.now();
  let localPaymentId: number | null = null;
  console.log('[Tap Payment] Creating charge:', {
    merchantId: params.merchantId,
    amount: params.amount,
    currency: params.currency,
    planId: params.planId,
  });

  try {
    if (!ENV.tapSecretKey) {
      console.error('[Tap Payment] Secret key not configured');
      return { success: false, error: 'Tap Secret Key is not configured' };
    }

    const apiUrl = 'https://api.tap.company/v2/charges';

    // Persist the payment intent first so the Tap reference always resolves to
    // a real local payment during fast webhook delivery.
    const localPayment = await createPayment({
      merchantId: params.merchantId,
      subscriptionId: params.subscriptionId,
      amount: params.amount,
      currency: params.currency,
      paymentMethod: 'tap',
      transactionId: `creating_${crypto.randomUUID()}`,
      status: 'pending',
    });
    if (!localPayment) {
      return { success: false, error: 'Failed to persist payment intent' };
    }
    localPaymentId = localPayment.id;

    // Prepare charge request
    const chargeRequest: TapChargeRequest = {
      amount: params.amount,
      currency: params.currency,
      customer: {
        email: params.customerEmail,
        phone: {
          country_code: '966', // Saudi Arabia
          number: params.customerPhone,
        },
      },
      source: {
        id: 'src_all', // Accept all payment methods
      },
      redirect: {
        url: params.returnUrl,
      },
      metadata: {
        merchantId: params.merchantId,
        subscriptionId: params.subscriptionId,
        planId: params.planId,
      },
      reference: {
        transaction: String(localPayment.id),
        order: String(params.subscriptionId),
      },
    };

    // Make API request
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ENV.tapSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chargeRequest),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Tap Payment] API Error:', {
        status: response.status,
        error: errorData,
        merchantId: params.merchantId,
      });
      await updatePayment(localPayment.id, { status: 'failed' });
      return { success: false, error: errorData.message || 'Failed to create charge' };
    }

    const chargeResponse: TapChargeResponse = await response.json();

    await updatePayment(localPayment.id, { transactionId: chargeResponse.id });

    const duration = Date.now() - startTime;
    console.log('[Tap Payment] Charge created successfully:', {
      chargeId: chargeResponse.id,
      merchantId: params.merchantId,
      duration: `${duration}ms`,
    });

    return {
      success: true,
      paymentUrl: chargeResponse.transaction.url,
      chargeId: chargeResponse.id,
    };
  } catch (error) {
    if (localPaymentId) {
      await updatePayment(localPaymentId, { status: 'failed' }).catch(updateError => {
        console.error('[Tap Payment] Failed to close local payment intent:', updateError);
      });
    }
    const duration = Date.now() - startTime;
    console.error('[Tap Payment] Exception:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      merchantId: params.merchantId,
      duration: `${duration}ms`,
    });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function verifyTapPayment(chargeId: string): Promise<{
  success: boolean;
  status: string;
  amount?: number;
  currency?: string;
  error?: string;
}> {
  try {
    if (!ENV.tapSecretKey) {
      return { success: false, status: 'failed', error: 'Tap configuration not found' };
    }

    const apiUrl = `https://api.tap.company/v2/charges/${chargeId}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ENV.tapSecretKey}`,
      },
    });

    if (!response.ok) {
      return { success: false, status: 'failed', error: 'Failed to verify payment' };
    }

    const charge: TapChargeResponse = await response.json();

    // Update payment status in database
    const payment = await getPaymentByTransactionId(chargeId);
    if (payment) {
      const newStatus = charge.status === 'CAPTURED' ? 'completed' : 
                       charge.status === 'FAILED' ? 'failed' : 'pending';
      await updatePaymentStatus(payment.id, newStatus as any, chargeId);
    }

    return {
      success: true,
      status: charge.status,
      amount: charge.amount,
      currency: charge.currency,
    };
  } catch (error) {
    console.error('Tap Verification Error:', error);
    return { success: false, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
