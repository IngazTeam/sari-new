import { Router, Request, Response } from 'express';
import { handleGreenAPIWebhook } from './greenapi';
import { handleMetaCloudWebhook, handleMetaWebhookVerification } from './meta-cloud';
import { verifyGreenWebhookAuthorization } from './greenapi-auth';
import { updateWhatsAppDeliveryStatus } from '../channels/whatsapp/service';
import { handleSallaWebhook } from './salla';
import { parseZidWebhookPayload, processZidWebhook } from './zid-webhook';
import { isZidWebhookEventEnabled } from '../integrations/zid-settings';
import {
  authenticateZidWebhook,
  claimZidWebhook,
  completeZidWebhook,
  failZidWebhook,
} from './zid-security';
import { getIntegrationByWebhookEndpoint } from '../db';
import { enqueueCalendlyWebhookReceipt } from '../integrations/calendly-webhook-receipts';
import {
  CALENDLY_ENDPOINT_PATTERN,
  CALENDLY_WEBHOOK_MAX_BYTES,
  parseCalendlyWebhook,
  verifyCalendlySignature,
} from './calendly-security';
import { getPaymentTransactionByTapChargeId, getTapSettings } from '../db';
import { ENV } from '../_core/env';
import { getMerchantPaymentSettings } from '../db';
import * as dbPayments from '../db_payments';
import { readPaymentLinkId } from '../payment/payment-link-policy';
import { readTapWebhookChargeId, unwrapTapWebhookCharge, verifyTapWebhookHash } from '../payment/tap-webhook-security';
import { processTapWebhook as processOrderPaymentWebhook } from './tap-webhook';
import { processCanonicalSubscriptionCharge } from '../subscriptions/canonical-state';

const router = Router();

/**
 * Tap Webhook Endpoint
 * POST /api/webhooks/tap
 */
router.post('/tap', async (req: Request, res: Response) => {
  try {
    const signature = req.get('hashstring')?.trim() || '';
    const charge = unwrapTapWebhookCharge(req.body);
    const chargeId = readTapWebhookChargeId(charge);
    if (!charge || !chargeId) {
      return res.status(400).json({ error: 'Invalid Tap charge payload' });
    }
    const orderPayment = chargeId
      ? await dbPayments.getOrderPaymentByTapChargeId(chargeId)
      : null;
    const subscriptionPayment = chargeId && !orderPayment
      ? await getPaymentTransactionByTapChargeId(chargeId)
      : null;

    // Payment links use each merchant's verified Tap key. Platform subscription
    // charges continue to use the platform key. Select the verifier from a local,
    // trusted payment record rather than untrusted webhook metadata.
    let verificationSecret = ENV.tapSecretKey;
    let orderPaymentTestMode: boolean | null = null;
    if (orderPayment && readPaymentLinkId(orderPayment.metadata)) {
      const settings = await getMerchantPaymentSettings(orderPayment.merchantId);
      verificationSecret = settings?.tapSecretKey || '';
      orderPaymentTestMode = settings ? Boolean(settings.tapTestMode) : null;
    } else if (subscriptionPayment) {
      const settings = await getTapSettings();
      verificationSecret = settings?.secretKey || '';
    }
    if (!verificationSecret) {
      return res.status(503).json({ error: 'Tap gateway not configured' });
    }

    // SECURITY: Webhook signature verification is MANDATORY
    if (!signature) {
      console.error('[Tap Webhook] Missing signature — rejecting');
      return res.status(401).json({ error: 'Missing webhook signature' });
    }

    const isValid = verifyTapWebhookHash(charge, signature, verificationSecret);
    if (!isValid) {
      console.error('[Tap Webhook] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const subscriptionCharge = {
      id: chargeId,
      status: String(charge.status),
      amount: Number(charge.amount),
      currency: String(charge.currency),
      live_mode: typeof charge.live_mode === 'boolean' ? charge.live_mode : undefined,
    };

    // Route using a locally persisted charge ID, never untrusted webhook metadata.
    const result = orderPayment
      ? orderPaymentTestMode == null
        ? { success: false, message: 'Tap merchant settings unavailable' }
        : await processOrderPaymentWebhook(
          req.body?.data?.object ? req.body : { data: { object: charge } },
          { testMode: orderPaymentTestMode },
        )
      : subscriptionPayment
        ? await processCanonicalSubscriptionCharge(subscriptionCharge)
        : { success: true, message: 'Unknown Tap charge ignored' };

    if (result.success) {
      return res.status(200).json({ message: result.message });
    } else {
      return res.status(400).json({ error: result.message });
    }
  } catch (error) {
    console.error('[Tap Webhook] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Green API Webhook Endpoint
 * POST /api/webhooks/greenapi
 */
router.post('/greenapi', async (req: Request, res: Response) => {
  try {
    const instanceId = String(req.body?.instanceData?.idInstance || '');
    if (!instanceId) return res.status(400).json({ error: 'Missing instance ID' });
    const authorization = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization;
    const authResult = await verifyGreenWebhookAuthorization({ instanceId, authorization });
    if (authResult === 'not_configured') {
      return res.status(503).json({ error: 'Webhook authorization migration required' });
    }
    if (authResult !== 'valid') {
      return res.status(401).json({ error: 'Invalid webhook authorization' });
    }

    if (req.body?.typeWebhook === 'outgoingMessageStatus') {
      const providerMessageId = String(req.body?.idMessage || '');
      const rawStatus = String(req.body?.status || '');
      const status = ['sent', 'delivered', 'read'].includes(rawStatus)
        ? rawStatus as 'sent' | 'delivered' | 'read'
        : ['failed', 'noAccount', 'notInGroup', 'suspended', 'yellowCard'].includes(rawStatus)
          ? 'failed' as const
          : null;
      if (!providerMessageId || !status) return res.status(400).json({ error: 'Invalid outgoing status payload' });
      const result = await updateWhatsAppDeliveryStatus({
        provider: 'green_api',
        providerMessageId,
        status,
        errorCode: status === 'failed' ? rawStatus : undefined,
      });
      return res.status(200).json({ received: true, result });
    }

    console.log('[Green API Webhook] Received webhook event');

    // Process webhook
    const result = await handleGreenAPIWebhook(req.body);

    if (result.success) {
      return res.status(200).json({ message: result.message });
    } else {
      return res.status(400).json({ error: result.message });
    }
  } catch (error) {
    console.error('[Green API Webhook] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/** Meta Cloud API verification and signed event delivery. */
router.get('/meta', handleMetaWebhookVerification);
router.post('/meta', async (req: Request, res: Response) => {
  try {
    await handleMetaCloudWebhook(req, res);
  } catch (error) {
    console.error('[Meta Webhook] Processing failed:', error instanceof Error ? error.message : 'unknown error');
    if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Salla Webhook Endpoint
 * POST /api/webhooks/salla
 */
router.post('/salla', async (req: Request, res: Response) => {
  try {
    console.log('[Salla Webhook] Received webhook event');

    // Process webhook
    await handleSallaWebhook(req, res);
  } catch (error) {
    console.error('[Salla Webhook] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Zid Webhook Endpoint
 * Zid documents HTTP Basic authentication for webhook delivery. The opaque
 * endpoint identifier is a locator, not tenant authority; the stored Basic
 * credential digest is the authority and is never returned after rotation.
 * POST /api/webhooks/zid/:endpointId
 */
router.post('/zid/:endpointId', async (req: Request & { rawBody?: Buffer }, res: Response) => {
  try {
    const authorization = typeof req.headers.authorization === 'string'
      ? req.headers.authorization
      : undefined;
    const principal = await authenticateZidWebhook(req.params.endpointId, authorization);
    if (!principal) return res.status(401).json({ error: 'Unauthorized' });

    const payload = parseZidWebhookPayload(req.body);
    if (!payload) return res.status(400).json({ error: 'Invalid webhook payload' });
    if (!req.rawBody) return res.status(500).json({ error: 'Webhook body unavailable' });
    if (!isZidWebhookEventEnabled(principal.policy, payload.event)) {
      return res.status(200).json({ message: 'Webhook event disabled or unsupported' });
    }

    const claim = await claimZidWebhook({
      merchantId: principal.merchantId,
      rawBody: req.rawBody,
      eventType: payload.event,
      externalWebhookId: payload.webhook_id,
    });
    if (!claim.claimed) {
      return res.status(200).json({ message: 'Webhook already received' });
    }

    try {
      await processZidWebhook(payload, principal.merchantId, principal.policy);
      await completeZidWebhook(claim.receiptId, claim.attemptCount);
      return res.status(200).json({ message: 'Webhook processed successfully' });
    } catch {
      await failZidWebhook(claim.receiptId, claim.attemptCount).catch(() => undefined);
      console.error('[Zid Webhook] Authenticated delivery processing failed');
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  } catch {
    console.error('[Zid Webhook] Ingress unavailable');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Calendly Webhook Endpoint
 * POST /api/webhooks/calendly/:endpointId
 */
router.post('/calendly/:endpointId', async (req: Request & { rawBody?: Buffer }, res: Response) => {
  try {
    const endpointId = String(req.params.endpointId || '');
    const rawBody = req.rawBody;
    if (!CALENDLY_ENDPOINT_PATTERN.test(endpointId)) return res.status(401).json({ error: 'Unauthorized' });
    if (!rawBody) return res.status(500).json({ error: 'Webhook body unavailable' });
    if (rawBody.length > CALENDLY_WEBHOOK_MAX_BYTES) return res.status(413).json({ error: 'Payload too large' });
    const integration = await getIntegrationByWebhookEndpoint(endpointId, 'calendly');
    if (!integration?.webhookSigningSecret) return res.status(401).json({ error: 'Unauthorized' });
    const signatureHeader = Array.isArray(req.headers['calendly-webhook-signature'])
      ? undefined
      : req.headers['calendly-webhook-signature'];
    const signature = verifyCalendlySignature({
      rawBody,
      signatureHeader,
      signingSecret: integration.webhookSigningSecret,
    });
    if (!signature.valid) return res.status(401).json({ error: 'Unauthorized' });
    const payload = parseCalendlyWebhook(rawBody);
    if (!payload) return res.status(400).json({ error: 'Invalid webhook payload' });
    const result = await enqueueCalendlyWebhookReceipt({
      merchantId: integration.merchantId,
      integrationId: integration.id,
      signatureTimestamp: signature.timestamp,
      payload,
    });
    return res.status(result.duplicate ? 200 : 202).json({
      message: result.duplicate ? 'Webhook already received' : 'Webhook accepted',
    });
  } catch {
    console.error('[Calendly Webhook] ingress unavailable');
    return res.status(503).json({ error: 'Webhook temporarily unavailable' });
  }
});

export default router;
