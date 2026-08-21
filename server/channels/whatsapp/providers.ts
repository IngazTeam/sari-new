import axios from 'axios';
import type {
  WhatsAppProvider,
  WhatsAppProviderConfig,
  WhatsAppProviderKind,
  WhatsAppProviderResult,
  WhatsAppSendRequest,
} from './types';

function normalizedPersonalNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) throw new Error('Invalid WhatsApp destination number');
  return digits;
}

function normalizedGreenDestination(value: string): string {
  if (/^\d{8,30}@(c|g)\.us$/.test(value)) return value;
  if (value.startsWith('group_')) {
    const groupId = value.slice(6);
    if (!/^\d{8,30}$/.test(groupId)) throw new Error('Invalid WhatsApp group destination');
    return `${groupId}@g.us`;
  }
  return `${normalizedPersonalNumber(value)}@c.us`;
}

function requireHttpsMediaUrl(value: string | undefined): string {
  if (!value) throw new Error('Media URL is required');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Media URL must use HTTPS');
  return parsed.toString();
}

function requireGreenApiUrl(value: string | null | undefined): string {
  const parsed = new URL(value || '');
  const allowed = ['api.green-api.com', 'api.greenapi.com'].some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !allowed) throw new Error('Invalid Green API URL');
  return parsed.origin;
}

export class GreenApiWhatsAppProvider implements WhatsAppProvider {
  readonly kind = 'green_api' as const;

  async send(config: WhatsAppProviderConfig, request: WhatsAppSendRequest): Promise<WhatsAppProviderResult> {
    if (!config.instanceId || !config.token || !config.apiUrl) {
      return { accepted: false, status: 'failed', errorCode: 'configuration_missing' };
    }
    if (request.kind === 'template') {
      return { accepted: false, status: 'failed', errorCode: 'unsupported_template' };
    }
    try {
      const apiUrl = requireGreenApiUrl(config.apiUrl);
      const destination = normalizedGreenDestination(request.to);
      const endpoint = request.kind === 'text' ? 'sendMessage' : 'sendFileByUrl';
      const body = request.kind === 'text'
        ? { chatId: destination, message: request.text || '' }
        : {
            chatId: destination,
            urlFile: requireHttpsMediaUrl(request.mediaUrl),
            fileName: (request.fileName || (request.kind === 'audio' ? 'audio.ogg' : request.kind === 'image' ? 'image.jpg' : 'document')).slice(0, 240),
            caption: (request.text || '').slice(0, 1024),
          };
      const response = await axios.post(
        `${apiUrl}/waInstance${config.instanceId}/${endpoint}/${config.token}`,
        body,
        { timeout: 12_000, maxRedirects: 0, validateStatus: () => true }
      );
      const providerMessageId = response.data?.idMessage;
      return response.status >= 200 && response.status < 300 && providerMessageId
        ? { accepted: true, status: 'sent', providerMessageId: String(providerMessageId) }
        : { accepted: false, status: 'failed', errorCode: `http_${response.status}` };
    } catch (error: any) {
      return { accepted: false, status: 'failed', errorCode: 'provider_unreachable', errorMessage: String(error?.message || '').slice(0, 300) };
    }
  }

  async health(config: WhatsAppProviderConfig): Promise<{ healthy: boolean; detail?: string }> {
    try {
      if (!config.instanceId || !config.token || !config.apiUrl) return { healthy: false, detail: 'configuration_missing' };
      const apiUrl = requireGreenApiUrl(config.apiUrl);
      const response = await axios.get(
        `${apiUrl}/waInstance${config.instanceId}/getStateInstance/${config.token}`,
        { timeout: 8_000, maxRedirects: 0, validateStatus: () => true }
      );
      return { healthy: response.status === 200 && response.data?.stateInstance === 'authorized', detail: response.data?.stateInstance };
    } catch {
      return { healthy: false, detail: 'provider_unreachable' };
    }
  }
}

export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  readonly kind = 'meta_cloud' as const;

  private graphVersion(): string {
    const version = process.env.META_GRAPH_API_VERSION || 'v23.0';
    if (!/^v\d{2,3}\.\d$/.test(version)) throw new Error('Invalid META_GRAPH_API_VERSION');
    return version;
  }

  async send(config: WhatsAppProviderConfig, request: WhatsAppSendRequest): Promise<WhatsAppProviderResult> {
    const phoneNumberId = config.phoneNumberId || config.instanceId;
    if (!phoneNumberId || !/^\d{5,30}$/.test(phoneNumberId) || !config.token) {
      return { accepted: false, status: 'failed', errorCode: 'configuration_missing' };
    }
    try {
      const to = normalizedPersonalNumber(request.to);
      const payload: Record<string, any> = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
      if (request.kind === 'text') {
        payload.type = 'text';
        payload.text = { preview_url: false, body: request.text || '' };
      } else if (request.kind === 'template') {
        if (!request.template) throw new Error('Template details are required');
        payload.type = 'template';
        payload.template = {
          name: request.template.name,
          language: { code: request.template.languageCode },
          ...(request.template.components?.length ? { components: request.template.components } : {}),
        };
      } else {
        const type = request.kind === 'document' ? 'document' : request.kind;
        payload.type = type;
        payload[type] = {
          link: requireHttpsMediaUrl(request.mediaUrl),
          ...(request.text && type !== 'audio' ? { caption: request.text } : {}),
          ...(type === 'document' && request.fileName ? { filename: request.fileName.slice(0, 240) } : {}),
        };
      }
      const response = await axios.post(
        `https://graph.facebook.com/${this.graphVersion()}/${phoneNumberId}/messages`,
        payload,
        {
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          timeout: 12_000,
          maxRedirects: 0,
          validateStatus: () => true,
        }
      );
      const providerMessageId = response.data?.messages?.[0]?.id;
      if (response.status >= 200 && response.status < 300 && providerMessageId) {
        return { accepted: true, status: 'sent', providerMessageId: String(providerMessageId) };
      }
      return {
        accepted: false,
        status: 'failed',
        errorCode: String(response.data?.error?.code || `http_${response.status}`).slice(0, 100),
        errorMessage: String(response.data?.error?.message || 'Meta rejected the message').slice(0, 300),
      };
    } catch (error: any) {
      return { accepted: false, status: 'failed', errorCode: 'provider_unreachable', errorMessage: String(error?.message || '').slice(0, 300) };
    }
  }

  async health(config: WhatsAppProviderConfig): Promise<{ healthy: boolean; detail?: string }> {
    const phoneNumberId = config.phoneNumberId || config.instanceId;
    if (!phoneNumberId || !config.token) return { healthy: false, detail: 'configuration_missing' };
    try {
      const response = await axios.get(
        `https://graph.facebook.com/${this.graphVersion()}/${phoneNumberId}`,
        {
          params: { fields: 'id,display_phone_number,quality_rating' },
          headers: { Authorization: `Bearer ${config.token}` },
          timeout: 8_000,
          maxRedirects: 0,
          validateStatus: () => true,
        }
      );
      return { healthy: response.status >= 200 && response.status < 300, detail: response.status >= 400 ? `http_${response.status}` : 'connected' };
    } catch {
      return { healthy: false, detail: 'provider_unreachable' };
    }
  }
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly kind = 'mock' as const;
  async send(_config: WhatsAppProviderConfig, _request: WhatsAppSendRequest): Promise<WhatsAppProviderResult> {
    if (process.env.NODE_ENV !== 'test') return { accepted: false, status: 'failed', errorCode: 'mock_disabled' };
    return { accepted: true, status: 'sent', providerMessageId: `mock_${Date.now()}` };
  }
  async health(): Promise<{ healthy: boolean; detail?: string }> {
    return { healthy: process.env.NODE_ENV === 'test', detail: process.env.NODE_ENV === 'test' ? 'test' : 'mock_disabled' };
  }
}

const PROVIDERS: Record<WhatsAppProviderKind, WhatsAppProvider> = {
  green_api: new GreenApiWhatsAppProvider(),
  meta_cloud: new MetaCloudWhatsAppProvider(),
  mock: new MockWhatsAppProvider(),
};

export function getWhatsAppProvider(kind: WhatsAppProviderKind): WhatsAppProvider {
  return PROVIDERS[kind];
}
