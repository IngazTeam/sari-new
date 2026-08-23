import type { Request, Response } from 'express';
import { getPool, getWhatsAppInstanceById } from '../db';
import { handleGreenAPIWebhook } from './greenapi';
import { recordInboundWhatsAppReceipt, updateWhatsAppDeliveryStatus } from '../channels/whatsapp/service';
import { constantTimeWebhookValueEqual, verifyMetaWebhookSignature } from './meta-webhook-security';
import { storagePut } from '../storage';

type RequestWithRawBody = Request & { rawBody?: Buffer };

export function handleMetaWebhookVerification(req: Request, res: Response) {
  const mode = String(req.query['hub.mode'] || '');
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN || '';
  if (mode === 'subscribe' && expected && constantTimeWebhookValueEqual(token, expected) && challenge) {
    return res.status(200).type('text/plain').send(challenge);
  }
  return res.status(403).json({ error: 'Webhook verification failed' });
}

function extractMetaMessageText(message: any): string | null {
  if (message?.type === 'text') return String(message.text?.body || '').slice(0, 4096) || null;
  if (message?.type === 'button') return String(message.button?.text || '').slice(0, 4096) || null;
  if (message?.type === 'interactive') {
    return String(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '').slice(0, 4096) || null;
  }
  return null;
}

async function fetchMetaMedia(instance: any, message: any): Promise<{
  typeMessage: 'imageMessage' | 'voiceMessage' | 'audioMessage' | 'documentMessage';
  downloadUrl: string;
  mimeType: string;
  fileName: string;
  caption?: string;
}> {
  const media = message?.[message?.type];
  const mediaId = String(media?.id || '');
  if (!mediaId || !/^\d{5,40}$/.test(mediaId)) throw new Error('Invalid Meta media ID');
  const version = process.env.META_GRAPH_API_VERSION || 'v23.0';
  if (!/^v\d{2,3}\.\d$/.test(version)) throw new Error('Invalid Meta Graph version');
  const headers = { Authorization: `Bearer ${instance.token}` };
  const axios = (await import('axios')).default;
  const metadata = await axios.get(`https://graph.facebook.com/${version}/${mediaId}`, {
    headers,
    timeout: 8_000,
    maxRedirects: 0,
    validateStatus: () => true,
  });
  const sourceUrl = String(metadata.data?.url || '');
  const parsed = new URL(sourceUrl);
  const allowedHost = ['facebook.com', 'fbcdn.net', 'whatsapp.net'].some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  if (metadata.status < 200 || metadata.status >= 300 || parsed.protocol !== 'https:' || !allowedHost) {
    throw new Error('Meta returned an invalid media URL');
  }
  const response = await axios.get(sourceUrl, {
    headers,
    responseType: 'arraybuffer',
    timeout: 15_000,
    maxRedirects: 0,
    maxContentLength: 16 * 1024 * 1024,
    validateStatus: () => true,
  });
  const buffer = Buffer.from(response.data || []);
  if (response.status < 200 || response.status >= 300 || !buffer.length || buffer.length > 16 * 1024 * 1024) {
    throw new Error('Meta media download failed or exceeded 16 MB');
  }
  const mimeType = String(metadata.data?.mime_type || response.headers['content-type'] || '').split(';')[0].toLowerCase();
  const typeMap: Record<string, { typeMessage: 'imageMessage' | 'voiceMessage' | 'audioMessage' | 'documentMessage'; extension: string }> = {
    image: { typeMessage: 'imageMessage', extension: mimeType.includes('png') ? 'png' : 'jpg' },
    voice: { typeMessage: 'voiceMessage', extension: mimeType.includes('ogg') ? 'ogg' : 'opus' },
    audio: { typeMessage: 'audioMessage', extension: mimeType.includes('mpeg') ? 'mp3' : 'ogg' },
    document: { typeMessage: 'documentMessage', extension: mimeType.includes('pdf') ? 'pdf' : 'bin' },
  };
  const mapped = typeMap[message.type];
  if (!mapped) throw new Error('Unsupported Meta media type');
  const fileName = message.type === 'document' && media?.filename
    ? String(media.filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
    : `${message.id}.${mapped.extension}`;
  const stored = await storagePut(
    `whatsapp/meta-inbound/${instance.merchantId}/${message.id}.${mapped.extension}`,
    buffer,
    mimeType || 'application/octet-stream'
  );
  return { ...mapped, downloadUrl: stored.url, mimeType, fileName, caption: String(media?.caption || '').slice(0, 1024) || undefined };
}

async function findMetaInstance(phoneNumberId: string): Promise<any | null> {
  const pool = await getPool();
  if (!pool) return null;
  const [rows] = await pool.execute(
    `SELECT id, merchant_id, instance_id, phone_number_id, status
     FROM whatsapp_instances
     WHERE provider = 'meta_cloud' AND phone_number_id = ? AND status = 'active' LIMIT 1`,
    [phoneNumberId]
  );
  const row = (rows as any[])?.[0];
  return row ? (await getWhatsAppInstanceById(Number(row.id))) || null : null;
}

export async function handleMetaCloudWebhook(req: RequestWithRawBody, res: Response) {
  const rawBody = req.rawBody;
  const appSecret = process.env.META_APP_SECRET || '';
  if (!rawBody || !appSecret) return res.status(503).json({ error: 'Meta webhook is not configured' });
  if (!verifyMetaWebhookSignature(rawBody, req.headers['x-hub-signature-256'] as string | undefined, appSecret)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }
  if (req.body?.object !== 'whatsapp_business_account' || !Array.isArray(req.body?.entry)) {
    return res.status(400).json({ error: 'Invalid WhatsApp webhook payload' });
  }

  for (const entry of req.body.entry.slice(0, 100)) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes.slice(0, 100) : []) {
      const value = change?.value;
      const phoneNumberId = String(value?.metadata?.phone_number_id || '');
      if (!phoneNumberId) continue;
      const instance = await findMetaInstance(phoneNumberId);
      if (!instance) continue;

      for (const status of Array.isArray(value?.statuses) ? value.statuses.slice(0, 500) : []) {
        const normalized = status?.status === 'delivered' || status?.status === 'read' || status?.status === 'sent'
          ? status.status
          : status?.status === 'failed' ? 'failed' : null;
        if (normalized && status?.id) {
          await updateWhatsAppDeliveryStatus({
            provider: 'meta_cloud',
            providerMessageId: String(status.id),
            status: normalized,
            errorCode: status?.errors?.[0]?.code ? String(status.errors[0].code) : undefined,
          });
        }
      }

      for (const message of Array.isArray(value?.messages) ? value.messages.slice(0, 100) : []) {
        const providerMessageId = String(message?.id || '');
        const customerPhone = String(message?.from || '').replace(/\D/g, '');
        const text = extractMetaMessageText(message);
        if (!providerMessageId || !customerPhone) continue;
        let messageData: any;
        if (text) {
          messageData = {
            typeMessage: 'textMessage',
            textMessageData: { textMessage: text },
          };
        } else if (['image', 'voice', 'audio', 'document'].includes(message?.type)) {
          const media = await fetchMetaMedia(instance, message);
          messageData = {
            typeMessage: media.typeMessage,
            fileMessageData: {
              downloadUrl: media.downloadUrl,
              mimeType: media.mimeType,
              fileName: media.fileName,
              caption: media.caption,
            },
            downloadUrl: media.downloadUrl,
            caption: media.caption,
            fileName: media.fileName,
          };
        } else {
          continue;
        }
        const senderName = String(value?.contacts?.find((item: any) => item?.wa_id === message.from)?.profile?.name || '').slice(0, 255);
        const result = await handleGreenAPIWebhook({
          typeWebhook: 'incomingMessageReceived',
          instanceData: {
            idInstance: phoneNumberId,
            wid: `${phoneNumberId}@c.us`,
            typeInstance: 'whatsapp',
          },
          timestamp: Number(message.timestamp || Math.floor(Date.now() / 1000)),
          idMessage: providerMessageId,
          sourceProvider: 'meta_cloud',
          sourceMessageType: message.type === 'button' || message.type === 'interactive' ? 'interactive' : 'text',
          senderData: {
            chatId: `${customerPhone}@c.us`,
            sender: `${customerPhone}@c.us`,
            senderName,
            chatName: senderName,
          },
          messageData,
        });
        if (!result.success) return res.status(503).json({ error: 'Message processing failed' });
        await recordInboundWhatsAppReceipt({
          merchantId: Number(instance.merchantId),
          instanceRecordId: Number(instance.id),
          provider: 'meta_cloud',
          providerMessageId,
        });
      }
    }
  }
  return res.status(200).json({ received: true });
}
