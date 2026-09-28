import { TRPCError } from '@trpc/server';
import { eq, desc } from 'drizzle-orm';
import { whatsappConnectionRequests } from '../../drizzle/schema';
import {
  getDb,
  getWhatsAppRequestsByMerchantId,
  getWhatsAppInstancesByMerchantId,
  getMerchantCurrentSubscription,
  getSubscriptionPlanById,
  getWhatsAppConnectionRequestById,
  getWhatsAppRequestById,
  getWhatsAppInstanceByInstanceId,
  getWhatsAppInstanceById,
  getActiveInstanceByPhoneNumber,
  updateWhatsAppInstance,
  createWhatsAppInstance,
  updateWhatsAppConnectionRequest,
  completeWhatsAppRequest,
} from '../db';
import { deriveGreenWebhookToken } from '../channels/whatsapp/green-webhook-token';

export type RequestSource = 'current' | 'legacy';
export type RequestRef = { requestId: number; source: RequestSource };
const failed = () => new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Could not verify WhatsApp. Retry without changing the connection.' });

export async function listWorkspaceRequests(merchantId: number) {
  const store = await getDb();
  if (!store) throw failed();
  const [current, legacy] = await Promise.all([
    getWhatsAppRequestsByMerchantId(merchantId),
    store.select({ id: whatsappConnectionRequests.id, status: whatsappConnectionRequests.status,
      phoneNumber: whatsappConnectionRequests.fullNumber, createdAt: whatsappConnectionRequests.createdAt,
      rejectionReason: whatsappConnectionRequests.rejectionReason }).from(whatsappConnectionRequests)
      .where(eq(whatsappConnectionRequests.merchantId, merchantId)).orderBy(desc(whatsappConnectionRequests.createdAt)),
  ]);
  // Explicit projections: QR codes, credentials, provider IDs and admin notes stay server-side.
  return [
    ...current.map(r => ({ id: r.id, source: 'current' as const, status: r.status, phoneNumber: r.phoneNumber, createdAt: r.createdAt, rejectionReason: r.rejectionReason })),
    ...legacy.map(r => ({ ...r, source: 'legacy' as const, status: r.status === 'connected' ? 'completed' as const : r.status })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
}

export async function workspaceUsage(merchantId: number) {
  const [instances, subscription] = await Promise.all([getWhatsAppInstancesByMerchantId(merchantId), getMerchantCurrentSubscription(merchantId)]);
  const plan = subscription?.planId ? await getSubscriptionPlanById(subscription.planId) : null;
  const known = !subscription || !!plan && Number.isSafeInteger(plan.maxWhatsAppNumbers) && plan.maxWhatsAppNumbers >= 0;
  const max = known ? plan?.maxWhatsAppNumbers ?? 0 : null;
  return { current: instances.filter(i => i.status === 'active').length, total: instances.length, max,
    remaining: max === null ? null : Math.max(0, max - instances.length),
    percentage: max === null ? null : max === 0 ? (instances.length ? 100 : 0) : Math.min(100, instances.length / max * 100),
    known, planName: plan?.name ?? '' };
}

async function ownedRequest(merchantId: number, ref: RequestRef) {
  const r = ref.source === 'legacy' ? await getWhatsAppConnectionRequestById(ref.requestId) : await getWhatsAppRequestById(ref.requestId);
  if (!r || r.merchantId !== merchantId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
  if (!['approved', 'connected', 'completed'].includes(r.status)) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Request is not approved' });
  const token = 'apiToken' in r ? r.apiToken : r.token;
  if (!r.instanceId || !token) throw failed();
  const existing = await getWhatsAppInstanceByInstanceId(r.instanceId);
  if (existing && (existing.merchantId !== merchantId || existing.provider !== 'green_api')) throw new TRPCError({ code: 'CONFLICT', message: 'Connection identity conflict' });
  return { request: r, credentials: { instanceId: r.instanceId, token, apiUrl: r.apiUrl }, existing };
}

type Credentials = { instanceId: string; token: string; apiUrl?: string | null };
export async function greenWorkspaceCall(credentials: Credentials, method: 'qr' | 'getStateInstance' | 'getSettings' | 'logout' | 'setSettings', body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const url = new URL(credentials.apiUrl || 'https://api.green-api.com');
    const allowed = ['api.green-api.com', 'api.greenapi.com'].some(h => url.hostname === h || url.hostname.endsWith(`.${h}`));
    if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !/^\d{5,30}$/.test(credentials.instanceId)) throw failed();
    const result = await fetch(`${url.origin}/waInstance${credentials.instanceId}/${method}/${encodeURIComponent(credentials.token)}`, {
      signal: AbortSignal.timeout(15000), redirect: 'error',
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    if (!result.ok) throw failed();
    const data: unknown = await result.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw failed();
    return data as Record<string, unknown>;
  } catch { throw failed(); }
}

export async function workspaceQR(merchantId: number, ref: RequestRef) {
  const { credentials } = await ownedRequest(merchantId, ref);
  return connectionQR(credentials);
}

async function connectionQR(credentials: Credentials) {
  const data = await greenWorkspaceCall(credentials, 'qr');
  if (data.type === 'alreadyLogged') return { qrCodeUrl: null, alreadyConnected: true };
  if (data.type !== 'qrCode' || typeof data.message !== 'string' || data.message.length > 2_000_000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(data.message)) throw failed();
  return { qrCodeUrl: data.message, alreadyConnected: false };
}

async function verifyConnection(merchantId: number, credentials: Credentials, existing: Awaited<ReturnType<typeof getWhatsAppInstanceById>>, forceWebhook: boolean, activate = true) {
  const state = await greenWorkspaceCall(credentials, 'getStateInstance');
  if (state.stateInstance !== 'authorized') return { connected: false, status: 'waiting' as const };
  const settings = await greenWorkspaceCall(credentials, 'getSettings');
  const phone = typeof settings.wid === 'string' && /^\d{7,15}@c\.us$/.test(settings.wid) ? settings.wid.replace('@c.us', '') : null;
  if (!phone) throw failed(); // Never fall back to the unverified number typed in the request.
  const usage = await workspaceUsage(merchantId);
  if (activate && (!usage.known || usage.max === null || (existing ? usage.total > usage.max || usage.max === 0 : usage.total >= usage.max))) throw new TRPCError({ code: 'FORBIDDEN', message: 'Subscription limit prevents this connection' });
  const owner = await getActiveInstanceByPhoneNumber(phone);
  if (owner && owner.id !== existing?.id) throw new TRPCError({ code: 'CONFLICT', message: 'Phone ownership conflict' });
  if (existing?.status !== 'active' || existing.phoneNumber !== phone || forceWebhook) {
    const webhookUrl = `${process.env.VITE_APP_URL || 'https://sary.live'}/api/webhooks/greenapi`;
    const webhook = await greenWorkspaceCall(credentials, 'setSettings', { webhookUrl,
      webhookUrlToken: `Bearer ${deriveGreenWebhookToken(credentials.instanceId, credentials.token)}`,
      incomingWebhook: 'yes', outgoingWebhook: 'yes', outgoingMessageWebhook: 'yes', outgoingAPIMessageWebhook: 'yes', stateWebhook: 'yes', statusInstanceWebhook: 'yes' });
    if (webhook.saveSettings !== true) throw failed();
    const connectedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (existing) await updateWhatsAppInstance(existing.id, { status: activate ? 'active' : existing.status, phoneNumber: phone, connectedAt, webhookUrl });
    else {
      const created = await createWhatsAppInstance({ merchantId, ...credentials, status: 'active', phoneNumber: phone, connectedAt, webhookUrl, isPrimary: 0 });
      if (!created) throw failed();
    }
  }
  return { connected: true, status: 'authorized' as const, phoneNumber: phone };
}

export async function confirmWorkspaceRequest(merchantId: number, ref: RequestRef) {
  const { request, credentials, existing } = await ownedRequest(merchantId, ref);
  const result = await verifyConnection(merchantId, credentials, existing, request.status === 'approved');
  if (!result.connected || !result.phoneNumber) return result;
  // A failed completion can be retried using the existing exact provider identity.
  if (ref.source === 'legacy') await updateWhatsAppConnectionRequest(request.id, { status: 'connected', connectedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') });
  else await completeWhatsAppRequest(request.id, result.phoneNumber);
  return result;
}

async function ownedInstance(merchantId: number, instanceId: number) {
  const instance = await getWhatsAppInstanceById(instanceId);
  if (!instance || instance.merchantId !== merchantId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Connection not found' });
  if (instance.provider !== 'green_api') throw new TRPCError({ code: 'BAD_REQUEST', message: 'QR is only available for Green API' });
  return instance;
}
export async function workspaceInstanceQR(merchantId: number, instanceId: number) {
  const result = await connectionQR(await ownedInstance(merchantId, instanceId));
  return { qrCode: result.qrCodeUrl, status: result.alreadyConnected ? 'already_connected' : 'waiting' };
}
export async function confirmWorkspaceInstance(merchantId: number, instanceId: number, forceWebhook = true, preserveStatus = false) {
  const instance = await ownedInstance(merchantId, instanceId);
  return verifyConnection(merchantId, instance, instance, forceWebhook, !preserveStatus);
}
export async function reconnectWorkspaceInstance(merchantId: number, instanceId: number) {
  const instance = await ownedInstance(merchantId, instanceId);
  const result = await greenWorkspaceCall(instance, 'logout');
  if (result.isLogout !== true) throw failed();
  // Preserve the last verified number and request history; canonical update elects a replacement primary.
  await updateWhatsAppInstance(instance.id, { status: 'inactive' });
  return { success: true as const };
}
