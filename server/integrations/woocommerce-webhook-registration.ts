import type { WooCommerceWebhookRegistrationInput } from '../db';
import type { WooCommerceClient } from '../woocommerce';
import { WOOCOMMERCE_WEBHOOK_TOPICS } from '../webhooks/woocommerce-security';

function wooCommerceWebhookOrigin(): string {
  const configured = process.env.PUBLIC_APP_URL
    || process.env.FRONTEND_URL
    || process.env.VITE_APP_URL
    || (process.env.NODE_ENV === 'production' ? 'https://sary.live' : '');
  if (!configured) throw new Error('WOOCOMMERCE_WEBHOOK_BASE_URL_REQUIRED');
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('WOOCOMMERCE_WEBHOOK_BASE_URL_INVALID');
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== '' && url.pathname !== '/')
  ) {
    throw new Error('WOOCOMMERCE_WEBHOOK_BASE_URL_INVALID');
  }
  return url.origin;
}

export async function verifyWooCommerceWebhookRegistrations(input: {
  client: WooCommerceClient;
  endpointId: string;
  registrations: readonly WooCommerceWebhookRegistrationInput[];
}): Promise<boolean> {
  if (input.registrations.length !== WOOCOMMERCE_WEBHOOK_TOPICS.length) return false;
  const deliveryUrl = `${wooCommerceWebhookOrigin()}/api/webhooks/woocommerce/${input.endpointId}`;
  try {
    for (const registration of input.registrations) {
      const remote = await input.client.getWebhook(registration.webhookId);
      if (
        remote.status !== 'active'
        || remote.topic !== registration.topic
        || remote.deliveryUrl !== deliveryUrl
      ) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function deleteWooCommerceWebhookRegistrations(
  client: WooCommerceClient,
  registrations: readonly WooCommerceWebhookRegistrationInput[],
): Promise<void> {
  for (const registration of registrations) {
    await client.deleteWebhook(registration.webhookId).catch(() => {
      console.warn('[WooCommerce] remote webhook cleanup deferred');
    });
  }
}

export async function registerWooCommerceWebhooks(input: {
  client: WooCommerceClient;
  endpointId: string;
  signingSecret: string;
}): Promise<WooCommerceWebhookRegistrationInput[]> {
  const deliveryUrl = `${wooCommerceWebhookOrigin()}/api/webhooks/woocommerce/${input.endpointId}`;
  const registrations: WooCommerceWebhookRegistrationInput[] = [];
  try {
    for (const topic of WOOCOMMERCE_WEBHOOK_TOPICS) {
      const webhookId = await input.client.createWebhook({
        name: `Sari ${topic}`,
        topic,
        deliveryUrl,
        secret: input.signingSecret,
      });
      registrations.push({ topic, webhookId });
    }
    return registrations;
  } catch (error) {
    await deleteWooCommerceWebhookRegistrations(input.client, registrations);
    throw error;
  }
}
