import { Router, Request, Response } from 'express';
import { handleTapWebhook, verifyTapSignature } from './tap';
import { handlePayPalWebhook, verifyPayPalSignature } from './paypal';
import { handleGreenAPIWebhook } from './greenapi';
import { handleSallaWebhook } from './salla';
import { handleZidWebhook } from '../integrations/zid';
import { handleCalendlyWebhook } from '../integrations/calendly';
import * as db from '../db';
import { getPaymentGatewayByName } from '../db';
import { ENV } from '../_core/env';

const router = Router();

/**
 * Tap Webhook Endpoint
 * POST /api/webhooks/tap
 */
router.post('/tap', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-tap-signature'] as string;
    const payload = JSON.stringify(req.body);

    // Check if Tap is configured
    if (!ENV.tapSecretKey) {
      return res.status(400).json({ error: 'Tap gateway not configured' });
    }

    // Verify signature (optional for testing, required in production)
    if (signature) {
      const isValid = await verifyTapSignature(payload, signature, ENV.tapSecretKey);
      if (!isValid) {
        console.error('[Tap Webhook] Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Process webhook
    const result = await handleTapWebhook(req.body);

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
 * PayPal Webhook Endpoint
 * POST /api/webhooks/paypal
 */
router.post('/paypal', async (req: Request, res: Response) => {
  try {
    const headers = req.headers as Record<string, string>;
    const body = JSON.stringify(req.body);

    // Get PayPal gateway config
    const paypalGateway = await getPaymentGatewayByName('paypal');
    if (!paypalGateway || !paypalGateway.isEnabled) {
      return res.status(400).json({ error: 'PayPal gateway not configured' });
    }

    // Verify signature
    const webhookId = paypalGateway.publicKey || ''; // Store webhook ID in publicKey field
    const isValid = await verifyPayPalSignature(headers, body, webhookId);
    if (!isValid) {
      console.error('[PayPal Webhook] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Process webhook
    const result = await handlePayPalWebhook(req.body);

    if (result.success) {
      return res.status(200).json({ message: result.message });
    } else {
      return res.status(400).json({ error: result.message });
    }
  } catch (error) {
    console.error('[PayPal Webhook] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Green API Webhook Endpoint
 * POST /api/webhooks/greenapi
 */
router.post('/greenapi', async (req: Request, res: Response) => {
  try {
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
 * POST /api/webhooks/zid/:merchantId
 */
router.post('/zid/:merchantId', async (req: Request, res: Response) => {
  try {
    const merchantId = parseInt(req.params.merchantId);

    if (isNaN(merchantId)) {
      return res.status(400).json({ error: 'Invalid merchant ID' });
    }

    console.log(`[Zid Webhook] Merchant ${merchantId} - Received webhook event`);

    // Verify webhook signature (if Zid provides one)
    const signature = req.headers['x-zid-signature'] as string;
    // TODO: Implement signature verification when Zid provides documentation

    // Extract event type from payload
    const event = req.body.event || req.body.type || 'unknown';
    const payload = req.body.data || req.body.payload || req.body;

    // Process webhook
    await handleZidWebhook(merchantId, event, payload);

    return res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('[Zid Webhook] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Calendly Webhook Endpoint
 * POST /api/webhooks/calendly/:merchantId
 */
router.post('/calendly/:merchantId', async (req: Request, res: Response) => {
  try {
    const merchantId = parseInt(req.params.merchantId);

    if (isNaN(merchantId)) {
      return res.status(400).json({ error: 'Invalid merchant ID' });
    }

    console.log(`[Calendly Webhook] Merchant ${merchantId} - Received webhook event`);

    // Verify webhook signature
    const signature = req.headers['calendly-webhook-signature'] as string;
    // TODO: Implement signature verification
    // Calendly uses HMAC-SHA256 with the webhook signing key

    // Extract event type from payload
    const event = req.body.event || 'unknown';
    const payload = req.body;

    // Process webhook
    await handleCalendlyWebhook(merchantId, event, payload);

    return res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('[Calendly Webhook] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Generic Integration Webhook Status
 * GET /api/webhooks/status/:platform/:merchantId
 */
router.get('/status/:platform/:merchantId', async (req: Request, res: Response) => {
  try {
    const { platform, merchantId } = req.params;
    const parsedMerchantId = parseInt(merchantId);

    if (isNaN(parsedMerchantId)) {
      return res.status(400).json({ error: 'Invalid merchant ID' });
    }

    // Require API key or authorization header for status checks
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const validPlatforms = ['zid', 'calendly', 'salla'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    // Get integration status
    const integration = await db.getIntegrationByType(
      parsedMerchantId,
      platform as 'zid' | 'calendly' | 'shopify' | 'woocommerce'
    );

    if (!integration) {
      return res.status(404).json({
        connected: false,
        message: 'Integration not found'
      });
    }

    return res.status(200).json({
      connected: !!integration.isActive,
      lastSync: integration.lastSyncAt,
      webhookUrl: `${req.protocol}://${req.get('host')}/api/webhooks/${platform}/${merchantId}`,
    });
  } catch (error) {
    console.error('[Webhook Status] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
