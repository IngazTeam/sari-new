/**
 * Tap Payment Gateway Integration
 * https://developers.tap.company
 */

import * as db from '../db';
import { ENV } from '../_core/env';

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
      return { success: false, error: errorData.message || 'Failed to create charge' };
    }

    const chargeResponse: TapChargeResponse = await response.json();

    // Create payment record in database
    await db.createPayment({
      merchantId: params.merchantId,
      subscriptionId: params.subscriptionId,
      amount: params.amount,
      currency: params.currency,
      paymentMethod: 'tap',
      transactionId: chargeResponse.id,
      status: 'pending',
    });

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
    const duration = Date.now() - startTime;
    console.error('[Tap Payment] Exception:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      merchantId: params.merchantId,
      duration: `${duration}ms`,
    });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function verifyTapPayment(chargeId: string): Promise<{ success: boolean; status: string; error?: string }> {
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
    const payment = await db.getPaymentByTransactionId(chargeId);
    if (payment) {
      const newStatus = charge.status === 'CAPTURED' ? 'completed' : 
                       charge.status === 'FAILED' ? 'failed' : 'pending';
      await db.updatePaymentStatus(payment.id, newStatus as any, chargeId);
    }

    return {
      success: true,
      status: charge.status,
    };
  } catch (error) {
    console.error('Tap Verification Error:', error);
    return { success: false, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
