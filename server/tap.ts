import { ENV } from "./_core/env";

interface TapChargeRequest {
  amount: number; // Amount in SAR
  currency: string;
  customer: {
    email: string;
    first_name: string;
  };
  source: {
    id: string; // "src_all" for all payment methods
  };
  redirect: {
    url: string; // Success redirect URL
  };
  metadata: {
    merchantId: number;
    planId: number;
    subscriptionId?: number;
  };
  description: string;
}

interface TapChargeResponse {
  id: string;
  status: string;
  amount: number;
  currency: string;
  transaction: {
    url: string; // Payment page URL
  };
  redirect: {
    status: string;
    url: string;
  };
}

/**
 * Create a Tap Charge for subscription payment
 */
export async function createTapCharge(params: {
  amount: number;
  planName: string;
  merchantId: number;
  planId: number;
  userEmail: string;
  userName: string;
  redirectUrl: string;
}): Promise<TapChargeResponse> {
  const chargeData: TapChargeRequest = {
    amount: params.amount,
    currency: "SAR",
    customer: {
      email: params.userEmail,
      first_name: params.userName,
    },
    source: {
      id: "src_all", // Accept all payment methods
    },
    redirect: {
      url: params.redirectUrl,
    },
    metadata: {
      merchantId: params.merchantId,
      planId: params.planId,
    },
    description: `اشتراك في باقة ${params.planName}`,
  };

  const response = await fetch("https://api.tap.company/v2/charges", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ENV.tapSecretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(chargeData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Tap API Error: ${JSON.stringify(error)}`);
  }

  return response.json();
}

/**
 * Retrieve a Tap Charge by ID
 */
export async function retrieveTapCharge(chargeId: string): Promise<TapChargeResponse> {
  const response = await fetch(`https://api.tap.company/v2/charges/${chargeId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${ENV.tapSecretKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Tap API Error: ${JSON.stringify(error)}`);
  }

  return response.json();
}
