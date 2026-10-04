import axios from 'axios';
import { createHash, timingSafeEqual } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { withMerchantOwnerSettings, MerchantSettingsAuthorityError } from '../accounts/merchant-settings-authority';
import { reserveApiRateLimit } from '../api/distributed-rate-limit';
import { decryptSecret } from '../security/secrets';
import { whatsappConnectionTestInput, whatsappImageTestInput, whatsappTextTestInput, type WhatsAppTestCredentials } from '../../shared/whatsapp-test-input';

type Method = 'connection' | 'text' | 'image';
const failure = () => new TRPCError({ code: 'PRECONDITION_FAILED', message: 'whatsapp_test:unavailable' });
const forbidden = () => new TRPCError({ code: 'FORBIDDEN', message: 'whatsapp_test:access_required' });
const sameSecret = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
function providerOrigin(value: unknown) {
  if (typeof value !== 'string') throw failure();
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash ||
      !['api.green-api.com','api.greenapi.com'].some(host => url.hostname === host || url.hostname.endsWith('.' + host))) throw failure();
  return url.origin;
}

/** Held read locks fence the selected owner and the connection during the bounded provider call. */
async function owned<T>(actorId: number, merchantId: number, input: WhatsAppTestCredentials, method: Method, work: (origin: string) => Promise<T>) {
  return withMerchantOwnerSettings(actorId, merchantId, false, async (tx, authority) => {
    if (!authority.canManage) throw forbidden();
    const [rows] = await tx.execute<any[]>(`SELECT id,merchant_id,provider,token,api_url,status,
      (expires_at IS NULL OR expires_at > UTC_TIMESTAMP()) AS unexpired
      FROM whatsapp_instances WHERE instance_id=? LIMIT 2 FOR SHARE`, [input.instanceId]);
    if (!Array.isArray(rows) || rows.length > 1) throw failure();
    const row = rows[0];
    if (row && (row.merchant_id !== merchantId || row.provider !== 'green_api')) throw forbidden();
    if (row && (typeof row.token !== 'string' || !sameSecret(decryptSecret(row.token), input.token))) throw forbidden();
    // Before saving a new connection, an owner may test supplied credentials. Sending requires a saved active owned identity.
    if (method !== 'connection' && (!row || row.status !== 'active' || Number(row.unexpired) !== 1)) throw failure();
    return work(providerOrigin(row?.api_url ?? `https://${input.instanceId.slice(0,4)}.api.greenapi.com`));
  });
}
const requestOptions = { timeout: 15000, maxRedirects: 0, maxContentLength: 65536, maxBodyLength: 16384, validateStatus: () => true };
function objectResponse(response: {status: number; data: unknown}) {
  if (response.status < 200 || response.status >= 300 || !response.data || typeof response.data !== 'object' || Array.isArray(response.data)) throw failure();
  return response.data as Record<string, unknown>;
}

export async function runWhatsAppDiagnostic(actorId: number, merchantId: number, method: Method, raw: unknown) {
  const parsed = (method === 'connection' ? whatsappConnectionTestInput : method === 'text' ? whatsappTextTestInput : whatsappImageTestInput).safeParse(raw);
  if (!parsed.success) throw new TRPCError({ code: 'BAD_REQUEST', message: 'whatsapp_test:invalid_input' });
  const input = parsed.data;
  try {
    // Reject foreign or unavailable state before touching even the rate-limit store.
    await owned(actorId, merchantId, input, method, async () => undefined);
    const limit = await reserveApiRateLimit({ namespace: method === 'connection' ? 'whatsapp:diagnostic:connection' : 'whatsapp:diagnostic:send',
      identity: String(merchantId), maxRequests: method === 'connection' ? 30 : 10, windowMs: method === 'connection' ? 600000 : 86400000 });
    if (!limit.allowed) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'whatsapp_test:rate_limited' });
    return await owned(actorId, merchantId, input, method, async origin => {
      const base = `${origin}/waInstance${input.instanceId}`;
      if (method === 'connection') {
        const state = objectResponse(await axios.get(`${base}/getStateInstance/${input.token}`, requestOptions));
        if (typeof state.stateInstance !== 'string' || !state.stateInstance || state.stateInstance.length > 80) throw failure();
        if (state.stateInstance !== 'authorized') return { success: false, status: 'not_authorized' as const };
        const settings = objectResponse(await axios.get(`${base}/getSettings/${input.token}`, requestOptions));
        if (typeof settings.wid !== 'string' || !/^[1-9]\d{7,14}@c\.us$/.test(settings.wid)) throw failure();
        return { success: true, status: 'authorized' as const, phoneNumber: settings.wid.slice(0,-5) };
      }
      let body: Record<string, string>;
      if (method === 'text') {
        const message = whatsappTextTestInput.parse(raw);
        body = { chatId: `${message.phoneNumber}@c.us`, message: message.message };
      } else {
        const image = whatsappImageTestInput.parse(raw);
        body = { chatId: `${image.phoneNumber}@c.us`, urlFile: image.imageUrl, fileName: 'image.jpg', caption: image.caption ?? '' };
      }
      const result = objectResponse(await axios.post(`${base}/${method === 'text' ? 'sendMessage' : 'sendFileByUrl'}/${input.token}`, body, requestOptions));
      if (typeof result.idMessage !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(result.idMessage)) throw failure();
      // Provider acceptance is not delivery. Never expose raw settings, debug data, URLs or errors.
      return { idMessage: result.idMessage, accepted: true as const };
    });
  } catch (error) {
    if (error instanceof MerchantSettingsAuthorityError && error.reason === 'forbidden') throw forbidden();
    if (error instanceof TRPCError && ['FORBIDDEN','TOO_MANY_REQUESTS'].includes(error.code)) throw error;
    throw failure();
  }
}
