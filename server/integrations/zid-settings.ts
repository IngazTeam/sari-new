export type ZidIntegrationSettings = Record<string, unknown> & {
  valid: boolean;
  autoSync: boolean;
  syncProducts: boolean;
  syncOrders: boolean;
  syncCustomers: boolean;
};

export type ZidWebhookPolicy = Pick<
  ZidIntegrationSettings,
  'valid' | 'autoSync' | 'syncProducts' | 'syncOrders'
>;

const BOOLEAN_KEYS = ['autoSync', 'syncProducts', 'syncOrders', 'syncCustomers'] as const;

function disabledSettings(): ZidIntegrationSettings {
  return {
    valid: false,
    autoSync: false,
    syncProducts: false,
    syncOrders: false,
    syncCustomers: false,
  };
}

export function parseZidSettings(value: string | null | undefined): ZidIntegrationSettings {
  // Connections created before resource switches existed are treated as the
  // historical all-enabled configuration. Malformed persisted JSON is not.
  if (!value) {
    return {
      valid: true,
      autoSync: true,
      syncProducts: true,
      syncOrders: true,
      syncCustomers: true,
    };
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return disabledSettings();
    for (const key of BOOLEAN_KEYS) {
      if (key in parsed && typeof parsed[key] !== 'boolean') return disabledSettings();
    }
    return {
      ...parsed,
      valid: true,
      autoSync: parsed.autoSync !== false,
      syncProducts: parsed.syncProducts !== false,
      syncOrders: parsed.syncOrders !== false,
      syncCustomers: parsed.syncCustomers !== false,
    };
  } catch {
    return disabledSettings();
  }
}

export function zidWebhookPolicy(settings: ZidIntegrationSettings): ZidWebhookPolicy {
  return {
    valid: settings.valid,
    autoSync: settings.autoSync,
    syncProducts: settings.syncProducts,
    syncOrders: settings.syncOrders,
  };
}

export function isZidWebhookEventEnabled(policy: ZidWebhookPolicy, event: string): boolean {
  if (!policy.valid || !policy.autoSync) return false;
  if (/^order\.(create|created|update|updated|status\.update|payment_status\.update|cancel|cancelled)$/.test(event)) {
    return policy.syncOrders;
  }
  if (/^(product\.(create|created|update|updated|publish|delete|deleted)|inventory\.(update|updated))$/.test(event)) {
    return policy.syncProducts;
  }
  return false;
}
