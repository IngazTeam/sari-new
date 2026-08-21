import crypto from 'node:crypto';
import { TRPCError } from '@trpc/server';
import {
  createWhatsAppInstance,
  getActiveInstanceByPhoneNumber,
  getMerchantById,
  getPrimaryWhatsAppInstance,
  getWhatsAppInstanceById,
  getWhatsAppInstanceByInstanceId,
  updateWhatsAppInstance,
} from '../../db';

function toPublicInstance(instance: any) {
  if (!instance) return instance;
  const { token: _token, webhookTokenHash: _webhookTokenHash, metadata: _metadata, ...safe } = instance;
  return { ...safe, hasCredential: Boolean(_token), webhookAuthenticated: true };
}

export async function completeMetaEmbeddedSignup(input: {
  userId: number;
  merchantId: number;
  code: string;
  wabaId: string;
  phoneNumberId: string;
}) {
  const merchant = await getMerchantById(input.merchantId);
  if (!merchant || merchant.userId !== input.userId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
  const appId = process.env.META_APP_ID || '';
  const appSecret = process.env.META_APP_SECRET || '';
  const version = process.env.META_GRAPH_API_VERSION || 'v23.0';
  if (!appId || !appSecret || !/^v\d{2,3}\.\d$/.test(version)) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Meta Embedded Signup is not configured' });
  }

  const axios = (await import('axios')).default;
  const tokenResponse = await axios.get(`https://graph.facebook.com/${version}/oauth/access_token`, {
    params: { client_id: appId, client_secret: appSecret, code: input.code },
    timeout: 12_000,
    maxRedirects: 0,
    validateStatus: () => true,
  });
  const accessToken = String(tokenResponse.data?.access_token || '');
  if (tokenResponse.status < 200 || tokenResponse.status >= 300 || accessToken.length < 20) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Meta rejected the one-time signup code' });
  }
  const appSecretProof = crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');
  const graphHeaders = { Authorization: `Bearer ${accessToken}` };
  const [phoneResponse, numbersResponse] = await Promise.all([
    axios.get(`https://graph.facebook.com/${version}/${input.phoneNumberId}`, {
      params: { fields: 'id,display_phone_number,verified_name,quality_rating', appsecret_proof: appSecretProof },
      headers: graphHeaders,
      timeout: 10_000,
      maxRedirects: 0,
      validateStatus: () => true,
    }),
    axios.get(`https://graph.facebook.com/${version}/${input.wabaId}/phone_numbers`, {
      params: { fields: 'id', limit: 100, appsecret_proof: appSecretProof },
      headers: graphHeaders,
      timeout: 10_000,
      maxRedirects: 0,
      validateStatus: () => true,
    }),
  ]);
  const belongsToWaba = Array.isArray(numbersResponse.data?.data)
    && numbersResponse.data.data.some((row: any) => String(row?.id) === input.phoneNumberId);
  if (phoneResponse.status < 200 || phoneResponse.status >= 300 || !belongsToWaba) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Phone number does not belong to the selected WABA' });
  }

  const existing = await getWhatsAppInstanceByInstanceId(input.phoneNumberId);
  if (existing && existing.merchantId !== input.merchantId) {
    throw new TRPCError({ code: 'CONFLICT', message: 'Meta phone number ID is already linked to another merchant' });
  }
  if (existing && (existing.provider || 'green_api') !== 'meta_cloud') {
    throw new TRPCError({ code: 'CONFLICT', message: 'Provider instance ID is already assigned to a legacy connection' });
  }
  const displayPhone = String(phoneResponse.data?.display_phone_number || '').replace(/[^0-9+]/g, '').slice(0, 20) || null;
  if (displayPhone) {
    const conflicting = await getActiveInstanceByPhoneNumber(displayPhone, input.merchantId);
    if (conflicting) throw new TRPCError({ code: 'CONFLICT', message: 'Phone number is already linked to another merchant' });
  }

  // Validate the local plan before subscribing the WABA or persisting the token.
  // Re-authorizing an already active record does not consume another slot.
  if (!existing || existing.status !== 'active') {
    const { checkWhatsAppNumberLimit } = await import('../../helpers/subscriptionGuard');
    await checkWhatsAppNumberLimit(input.merchantId);
  }

  const subscriptionResponse = await axios.post(
    `https://graph.facebook.com/${version}/${input.wabaId}/subscribed_apps`,
    null,
    {
      params: { appsecret_proof: appSecretProof },
      headers: graphHeaders,
      timeout: 10_000,
      maxRedirects: 0,
      validateStatus: () => true,
    }
  );
  if (subscriptionResponse.status < 200 || subscriptionResponse.status >= 300 || subscriptionResponse.data?.success !== true) {
    throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Meta webhook subscription failed' });
  }

  let instance;
  if (existing) {
    await updateWhatsAppInstance(existing.id, {
      provider: 'meta_cloud',
      token: accessToken,
      apiUrl: 'https://graph.facebook.com',
      providerAccountId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      phoneNumber: displayPhone,
      webhookUrl: `${process.env.VITE_APP_URL || 'https://sary.live'}/api/webhooks/meta`,
      status: 'active',
      connectedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });
    instance = await getWhatsAppInstanceById(existing.id);
  } else {
    const currentPrimary = await getPrimaryWhatsAppInstance(input.merchantId);
    instance = await createWhatsAppInstance({
      merchantId: input.merchantId,
      provider: 'meta_cloud',
      instanceId: input.phoneNumberId,
      token: accessToken,
      apiUrl: 'https://graph.facebook.com',
      providerAccountId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      phoneNumber: displayPhone,
      webhookUrl: `${process.env.VITE_APP_URL || 'https://sary.live'}/api/webhooks/meta`,
      status: 'active',
      isPrimary: currentPrimary ? 0 : 1,
      connectedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      metadata: JSON.stringify({ qualityRating: phoneResponse.data?.quality_rating || null }),
    });
  }
  return { success: true, instance: toPublicInstance(instance) };
}
