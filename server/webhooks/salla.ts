import type { Request, Response } from 'express';
import { enqueueSallaWebhookReceipt } from '../integrations/salla-webhook-receipts';
import { parseSallaWebhook, verifySallaWebhookSignature } from './salla-security';

type RequestWithRawBody = Request & { rawBody?: Buffer };

/**
 * Authenticate, validate and durably enqueue. Business effects run outside the
 * request lifecycle so Salla retries cannot be acknowledged before persistence.
 */
export async function handleSallaWebhook(req: RequestWithRawBody, res: Response) {
  const secret = process.env.SALLA_WEBHOOK_SECRET?.trim();
  if (!secret) return res.status(503).json({ error: 'Webhook not configured' });
  if (!req.rawBody) return res.status(500).json({ error: 'Webhook body unavailable' });

  const verified = verifySallaWebhookSignature({
    rawBody: req.rawBody,
    signature: req.headers['x-salla-signature'],
    strategy: req.headers['x-salla-security-strategy'],
    secret,
  });
  if (!verified) return res.status(401).json({ error: 'Invalid webhook signature' });

  const payload = parseSallaWebhook(req.rawBody);
  if (!payload) return res.status(400).json({ error: 'Invalid webhook payload' });

  try {
    const receipt = await enqueueSallaWebhookReceipt({ rawBody: req.rawBody, payload });
    return res.status(receipt.duplicate ? 200 : 202).json({
      received: true,
      duplicate: receipt.duplicate,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'store_identity_unmapped') {
      return res.status(404).json({ error: 'Store connection not found' });
    }
    console.error('[Salla Webhook] durable ingress unavailable');
    return res.status(503).json({ error: 'Webhook temporarily unavailable' });
  }
}
