export type WhatsAppProviderKind = 'green_api' | 'meta_cloud' | 'mock';
export type WhatsAppMessageKind = 'text' | 'image' | 'audio' | 'document' | 'template';
export type WhatsAppDeliveryStatus = 'received' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export type WhatsAppProviderConfig = {
  provider: WhatsAppProviderKind;
  instanceId: string;
  token: string;
  apiUrl?: string | null;
  phoneNumberId?: string | null;
  providerAccountId?: string | null;
};
export type WhatsAppSendRequest = {
  to: string;
  kind: WhatsAppMessageKind;
  text?: string;
  mediaUrl?: string;
  fileName?: string;
  template?: {
    name: string;
    languageCode: string;
    components?: unknown[];
  };
};

export type WhatsAppProviderResult = {
  accepted: boolean;
  providerMessageId?: string;
  status: 'sent' | 'failed';
  errorCode?: string;
  errorMessage?: string;
};

export interface WhatsAppProvider {
  readonly kind: WhatsAppProviderKind;
  send(config: WhatsAppProviderConfig, request: WhatsAppSendRequest): Promise<WhatsAppProviderResult>;
  health(config: WhatsAppProviderConfig): Promise<{ healthy: boolean; detail?: string }>;
}

export type SendMerchantWhatsAppInput = WhatsAppSendRequest & {
  merchantId: number;
  idempotencyKey: string;
  messageId?: number;
  instanceRecordId?: number;
};
