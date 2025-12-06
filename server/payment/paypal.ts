/**
 * PayPal Payment Gateway Integration
 * https://developer.paypal.com
 */

import * as db from '../db';

interface PayPalOrderRequest {
  intent: 'CAPTURE';
  purchase_units: Array<{
    amount: {
      currency_code: string;
      value: string;
    };
    custom_id: string; // merchantId_subscriptionId_planId
  }>;
  application_context: {
    return_url: string;
    cancel_url: string;
  };
}

interface PayPalOrderResponse {
  id: string;
  status: string;
  links: Array<{
    href: string;
    rel: string;
  }>;
}

async function getPayPalAccessToken(clientId: string, secret: string, testMode: boolean): Promise<string | null> {
  try {
    const apiUrl = testMode
      ? 'https://api-m.sandbox.paypal.com/v1/oauth2/token'
      : 'https://api-m.paypal.com/v1/oauth2/token';

    const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      console.error('PayPal Auth Error:', await response.text());
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('PayPal Auth Error:', error);
    return null;
  }
}

export async function createPayPalOrder(params: {
  amount: number;
  currency: string;
  merchantId: number;
  subscriptionId: number;
  planId: number;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ success: boolean; paymentUrl?: string; orderId?: string; error?: string }> {
  try {
    // Get PayPal gateway configuration
    const paypalGateway = await db.getPaymentGatewayByName('paypal');
    
    if (!paypalGateway || !paypalGateway.isEnabled) {
      return { success: false, error: 'PayPal is not enabled' };
    }

    if (!paypalGateway.publicKey || !paypalGateway.secretKey) {
      return { success: false, error: 'PayPal credentials are not configured' };
    }

    // Get access token
    const accessToken = await getPayPalAccessToken(
      paypalGateway.publicKey,
      paypalGateway.secretKey,
      paypalGateway.testMode
    );

    if (!accessToken) {
      return { success: false, error: 'Failed to authenticate with PayPal' };
    }

    // Determine API URL based on test mode
    const apiUrl = paypalGateway.testMode
      ? 'https://api-m.sandbox.paypal.com/v2/checkout/orders'
      : 'https://api-m.paypal.com/v2/checkout/orders';

    // Prepare order request
    const orderRequest: PayPalOrderRequest = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: params.currency,
          value: params.amount.toFixed(2),
        },
        custom_id: `${params.merchantId}_${params.subscriptionId}_${params.planId}`,
      }],
      application_context: {
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    };

    // Make API request
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderRequest),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('PayPal API Error:', errorData);
      return { success: false, error: errorData.message || 'Failed to create order' };
    }

    const orderResponse: PayPalOrderResponse = await response.json();

    // Find approval URL
    const approvalLink = orderResponse.links.find(link => link.rel === 'approve');
    if (!approvalLink) {
      return { success: false, error: 'No approval URL found' };
    }

    // Create payment record in database
    await db.createPayment({
      merchantId: params.merchantId,
      subscriptionId: params.subscriptionId,
      amount: params.amount,
      currency: params.currency,
      paymentMethod: 'paypal',
      transactionId: orderResponse.id,
      status: 'pending',
    });

    return {
      success: true,
      paymentUrl: approvalLink.href,
      orderId: orderResponse.id,
    };
  } catch (error) {
    console.error('PayPal Payment Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function capturePayPalOrder(orderId: string): Promise<{ success: boolean; status: string; error?: string }> {
  try {
    const paypalGateway = await db.getPaymentGatewayByName('paypal');
    
    if (!paypalGateway || !paypalGateway.publicKey || !paypalGateway.secretKey) {
      return { success: false, status: 'failed', error: 'PayPal configuration not found' };
    }

    // Get access token
    const accessToken = await getPayPalAccessToken(
      paypalGateway.publicKey,
      paypalGateway.secretKey,
      paypalGateway.testMode
    );

    if (!accessToken) {
      return { success: false, status: 'failed', error: 'Failed to authenticate' };
    }

    const apiUrl = paypalGateway.testMode
      ? `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`
      : `https://api-m.paypal.com/v2/checkout/orders/${orderId}/capture`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return { success: false, status: 'failed', error: 'Failed to capture payment' };
    }

    const captureResponse = await response.json();

    // Update payment status in database
    const payment = await db.getPaymentByTransactionId(orderId);
    if (payment) {
      const newStatus = captureResponse.status === 'COMPLETED' ? 'completed' : 'failed';
      await db.updatePaymentStatus(payment.id, newStatus as any, orderId);
    }

    return {
      success: true,
      status: captureResponse.status,
    };
  } catch (error) {
    console.error('PayPal Capture Error:', error);
    return { success: false, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function verifyPayPalPayment(orderId: string): Promise<{ success: boolean; status: string; error?: string }> {
  try {
    const paypalGateway = await db.getPaymentGatewayByName('paypal');
    
    if (!paypalGateway || !paypalGateway.publicKey || !paypalGateway.secretKey) {
      return { success: false, status: 'failed', error: 'PayPal configuration not found' };
    }

    const accessToken = await getPayPalAccessToken(
      paypalGateway.publicKey,
      paypalGateway.secretKey,
      paypalGateway.testMode
    );

    if (!accessToken) {
      return { success: false, status: 'failed', error: 'Failed to authenticate' };
    }

    const apiUrl = paypalGateway.testMode
      ? `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}`
      : `https://api-m.paypal.com/v2/checkout/orders/${orderId}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return { success: false, status: 'failed', error: 'Failed to verify payment' };
    }

    const order: PayPalOrderResponse = await response.json();

    return {
      success: true,
      status: order.status,
    };
  } catch (error) {
    console.error('PayPal Verification Error:', error);
    return { success: false, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
