import { Router, Request, Response } from 'express';
import { handleTapWebhook, verifyTapSignature } from './tap';
import { handlePayPalWebhook, verifyPayPalSignature } from './paypal';
import { handleGreenAPIWebhook } from './greenapi';
import { handleSallaWebhook } from './salla';
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
    console.log('[Green API Webhook] Received:', JSON.stringify(req.body, null, 2));
    
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
    console.log('[Salla Webhook] Received:', JSON.stringify(req.body, null, 2));
    
    // Process webhook
    await handleSallaWebhook(req, res);
  } catch (error) {
    console.error('[Salla Webhook] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
