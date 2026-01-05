import crypto from 'crypto';
import { createWebhookSecurityLog } from "../db-notifications";
import { getIntegrationByType } from "../db";

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
}

export function verifyZidSignature(payload: string, signature: string, secret: string): WebhookVerificationResult {
  try {
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    return { valid };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

export function verifyCalendlySignature(payload: string, signature: string, secret: string): WebhookVerificationResult {
  try {
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const signatureValue = signature.replace('sha256=', '');
    const valid = crypto.timingSafeEqual(Buffer.from(signatureValue), Buffer.from(expectedSignature));
    return { valid };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

export function verifySallaSignature(payload: string, signature: string, secret: string): WebhookVerificationResult {
  try {
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    return { valid };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

export async function verifyWebhookWithLogging(
  merchantId: number | undefined,
  platform: 'zid' | 'calendly' | 'salla',
  payload: string,
  signature: string | undefined,
  ipAddress: string,
  requestPath: string,
  requestMethod: string
): Promise<WebhookVerificationResult> {
  if (!signature) {
    await createWebhookSecurityLog({ merchantId, platform, ipAddress, signatureValid: false, requestPath, requestMethod, errorMessage: 'No signature provided' });
    return { valid: false, error: 'No signature provided' };
  }

  if (!merchantId) {
    await createWebhookSecurityLog({ merchantId: undefined, platform, ipAddress, signatureValid: false, requestPath, requestMethod, errorMessage: 'No merchant ID provided' });
    return { valid: false, error: 'No merchant ID provided' };
  }

  const integration = await getIntegrationByType(merchantId, platform as 'zid' | 'calendly' | 'shopify' | 'woocommerce');
  const secret = integration?.webhook_secret;

  if (!secret) {
    await createWebhookSecurityLog({ merchantId, platform, ipAddress, signatureValid: true, requestPath, requestMethod, errorMessage: 'No webhook secret configured - verification skipped' });
    return { valid: true };
  }

  let result: WebhookVerificationResult;
  switch (platform) {
    case 'zid': result = verifyZidSignature(payload, signature, secret); break;
    case 'calendly': result = verifyCalendlySignature(payload, signature, secret); break;
    case 'salla': result = verifySallaSignature(payload, signature, secret); break;
    default: result = { valid: false, error: 'Unknown platform' };
  }

  await createWebhookSecurityLog({ merchantId, platform, ipAddress, signatureValid: result.valid, requestPath, requestMethod, errorMessage: result.error });
  return result;
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function getSignatureHeaderName(platform: 'zid' | 'calendly' | 'salla'): string {
  switch (platform) {
    case 'zid': return 'x-zid-signature';
    case 'calendly': return 'calendly-webhook-signature';
    case 'salla': return 'x-salla-signature';
    default: return 'x-webhook-signature';
  }
}
