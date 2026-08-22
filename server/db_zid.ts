/**
 * Zid Integration Database Functions
 * دوال قاعدة البيانات الخاصة بتكامل زد
 */

import { getDb as _getDb, getIntegrationByType } from './db';

/** Non-nullable wrapper */
async function getDb() {
  const db = await _getDb();
  if (!db) throw new Error('Database not initialized');
  return db;
}
import { platformIntegrations, zidSettings, zidSyncLogs } from "../drizzle/schema";
import type { ZidSettings, InsertZidSettings, ZidSyncLog, InsertZidSyncLog } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { decryptSecret, encryptSecret } from './security/secrets';
import { getValidZidApiCredentials } from './integrations/zid-token-manager';

// ==================== Zid Settings ====================

/**
 * الحصول على إعدادات Zid للتاجر
 */
export async function getZidSettings(merchantId: number): Promise<ZidSettings | undefined> {
  // platform_integrations is the canonical source for all current Zid flows.
  // The legacy shape is retained only as an adapter for the order automation.
  const integration = await getIntegrationByType(merchantId, 'zid');
  if (integration?.isActive === 1) {
    const credentials = await getValidZidApiCredentials({ merchantId });
    let integrationSettings: Record<string, unknown> = {};
    try {
      const parsed = integration.settings ? JSON.parse(integration.settings) : {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) integrationSettings = parsed;
    } catch {
      integrationSettings = {};
    }
    const lastSync = integration.lastSyncAt || null;
    return {
      id: integration.id,
      merchantId: integration.merchantId,
      clientId: null,
      clientSecret: null,
      // ZidClient's legacy names are inverted: accessToken is sent as
      // X-Manager-Token and managerToken is sent as Authorization.
      accessToken: credentials.managerToken,
      managerToken: credentials.authorizationToken,
      refreshToken: credentials.refreshToken || null,
      storeId: typeof integrationSettings.storeId === 'string' ? integrationSettings.storeId : null,
      storeName: integration.storeName,
      storeUrl: integration.storeUrl,
      isActive: integration.isActive,
      autoSyncProducts: integrationSettings.syncProducts === false ? 0 : 1,
      autoSyncOrders: integrationSettings.syncOrders === false ? 0 : 1,
      autoSyncCustomers: integrationSettings.syncCustomers === true ? 1 : 0,
      lastProductSync: lastSync,
      lastOrderSync: lastSync,
      lastCustomerSync: lastSync,
      tokenExpiresAt: credentials.tokenExpiresAt || null,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    };
  }

  const db = await getDb();
  const [settings] = await db
    .select()
    .from(zidSettings)
    .where(eq(zidSettings.merchantId, merchantId))
    .limit(1);
  
  return settings ? {
    ...settings,
    clientSecret: decryptSecret(settings.clientSecret),
    accessToken: decryptSecret(settings.accessToken),
    managerToken: decryptSecret(settings.managerToken),
    refreshToken: decryptSecret(settings.refreshToken),
  } : undefined;
}

function protectLegacyCredentials<T extends Partial<InsertZidSettings>>(data: T): T {
  return {
    ...data,
    ...(data.clientSecret !== undefined && { clientSecret: encryptSecret(data.clientSecret) }),
    ...(data.accessToken !== undefined && { accessToken: encryptSecret(data.accessToken) }),
    ...(data.managerToken !== undefined && { managerToken: encryptSecret(data.managerToken) }),
    ...(data.refreshToken !== undefined && { refreshToken: encryptSecret(data.refreshToken) }),
  } as T;
}

/**
 * إنشاء إعدادات Zid جديدة
 */
export async function createZidSettings(data: InsertZidSettings): Promise<ZidSettings> {
  const db = await getDb();
  await db.insert(zidSettings).values(protectLegacyCredentials(data));
  // Re-fetch the created row
  const created = await getZidSettings(data.merchantId);
  return created!;
}

/**
 * تحديث إعدادات Zid
 */
export async function updateZidSettings(
  merchantId: number,
  updates: Partial<InsertZidSettings>
): Promise<void> {
  const db = await getDb();
  await db
    .update(zidSettings)
    .set({
      ...protectLegacyCredentials(updates),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(zidSettings.merchantId, merchantId));
}

/**
 * حذف إعدادات Zid (فصل الاتصال)
 */
export async function deleteZidSettings(merchantId: number): Promise<void> {
  const db = await getDb();
  await db.delete(zidSettings).where(eq(zidSettings.merchantId, merchantId));
}

/** Atomically disconnect canonical and legacy Zid records. */
export async function deleteAllZidConnections(merchantId: number): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(platformIntegrations).where(and(
      eq(platformIntegrations.merchantId, merchantId),
      eq(platformIntegrations.platformType, 'zid'),
    ));
    await tx.delete(zidSettings).where(eq(zidSettings.merchantId, merchantId));
  });
}

/**
 * التحقق من وجود اتصال نشط مع Zid
 */
export async function isZidConnected(merchantId: number): Promise<boolean> {
  const settings = await getZidSettings(merchantId);
  return settings?.isActive === 1 && !!settings.accessToken;
}

/**
 * تحديث Tokens
 */
export async function updateZidTokens(
  merchantId: number,
  tokens: {
    accessToken: string;
    managerToken: string;
    refreshToken: string;
    tokenExpiresAt: string;
  }
): Promise<void> {
  await updateZidSettings(merchantId, tokens);
}

/**
 * تحديث وقت آخر مزامنة
 */
export async function updateLastSync(
  merchantId: number,
  syncType: 'products' | 'orders' | 'customers'
): Promise<void> {
  const now = new Date().toISOString();
  const updates: Partial<InsertZidSettings> = {};

  if (syncType === 'products') {
    updates.lastProductSync = now;
  } else if (syncType === 'orders') {
    updates.lastOrderSync = now;
  } else if (syncType === 'customers') {
    updates.lastCustomerSync = now;
  }

  await updateZidSettings(merchantId, updates);
}

/**
 * تفعيل/تعطيل الاتصال
 */
export async function toggleZidConnection(
  merchantId: number,
  isActive: boolean
): Promise<void> {
  await updateZidSettings(merchantId, { isActive: isActive ? 1 : 0 });
}

/**
 * تحديث إعدادات المزامنة التلقائية
 */
export async function updateAutoSyncSettings(
  merchantId: number,
  settings: {
    autoSyncProducts?: boolean;
    autoSyncOrders?: boolean;
    autoSyncCustomers?: boolean;
  }
): Promise<void> {
  const updates: Partial<InsertZidSettings> = {};

  if (settings.autoSyncProducts !== undefined) {
    updates.autoSyncProducts = settings.autoSyncProducts ? 1 : 0;
  }
  if (settings.autoSyncOrders !== undefined) {
    updates.autoSyncOrders = settings.autoSyncOrders ? 1 : 0;
  }
  if (settings.autoSyncCustomers !== undefined) {
    updates.autoSyncCustomers = settings.autoSyncCustomers ? 1 : 0;
  }

  await updateZidSettings(merchantId, updates);
}

// ==================== Zid Sync Logs ====================

/**
 * إنشاء سجل مزامنة جديد
 */
export async function createZidSyncLog(data: InsertZidSyncLog): Promise<ZidSyncLog> {
  const db = await getDb();
  const result = await db.insert(zidSyncLogs).values({
    ...data,
    startedAt: data.startedAt || new Date().toISOString().slice(0, 19).replace('T', ' '),
  });
  const logId = Number((result[0] as any).insertId);
  // Re-fetch the created row
  const created = await getZidSyncLog(logId);
  return created!;
}

/**
 * تحديث سجل المزامنة
 */
export async function updateZidSyncLog(
  logId: number,
  updates: Partial<InsertZidSyncLog>
): Promise<void> {
  const db = await getDb();
  await db.update(zidSyncLogs).set(updates).where(eq(zidSyncLogs.id, logId));
}

/**
 * تحديث حالة المزامنة
 */
export async function updateSyncStatus(
  logId: number,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  errorMessage?: string
): Promise<void> {
  const updates: Partial<InsertZidSyncLog> = { status };

  if (status === 'completed' || status === 'failed') {
    updates.completedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  if (errorMessage) {
    updates.errorMessage = errorMessage;
  }

  await updateZidSyncLog(logId, updates);
}

/**
 * تحديث إحصائيات المزامنة
 */
export async function updateSyncStats(
  logId: number,
  stats: {
    processedItems?: number;
    successCount?: number;
    failedCount?: number;
  }
): Promise<void> {
  await updateZidSyncLog(logId, stats);
}

/**
 * الحصول على سجلات المزامنة للتاجر
 */
export async function getZidSyncLogs(
  merchantId: number,
  syncType?: 'products' | 'orders' | 'customers' | 'inventory',
  limit = 50
): Promise<ZidSyncLog[]> {
  const db = await getDb();
  
  if (syncType) {
    return db
      .select()
      .from(zidSyncLogs)
      .where(
        and(
          eq(zidSyncLogs.merchantId, merchantId),
          eq(zidSyncLogs.syncType, syncType)
        )
      )
      .orderBy(desc(zidSyncLogs.createdAt))
      .limit(limit);
  }

  return db
    .select()
    .from(zidSyncLogs)
    .where(eq(zidSyncLogs.merchantId, merchantId))
    .orderBy(desc(zidSyncLogs.createdAt))
    .limit(limit);
}

/**
 * الحصول على سجل مزامنة محدد
 */
export async function getZidSyncLog(logId: number): Promise<ZidSyncLog | undefined> {
  const db = await getDb();
  const [log] = await db
    .select()
    .from(zidSyncLogs)
    .where(eq(zidSyncLogs.id, logId))
    .limit(1);

  return log;
}

/**
 * الحصول على آخر سجل مزامنة ناجح
 */
export async function getLastSuccessfulSync(
  merchantId: number,
  syncType: 'products' | 'orders' | 'customers' | 'inventory'
): Promise<ZidSyncLog | undefined> {
  const db = await getDb();
  const [log] = await db
    .select()
    .from(zidSyncLogs)
    .where(
      and(
        eq(zidSyncLogs.merchantId, merchantId),
        eq(zidSyncLogs.syncType, syncType),
        eq(zidSyncLogs.status, 'completed')
      )
    )
    .orderBy(desc(zidSyncLogs.completedAt))
    .limit(1);

  return log;
}

/**
 * حذف سجلات المزامنة القديمة
 */
export async function cleanupOldSyncLogs(merchantId: number, daysToKeep = 30): Promise<void> {
  const db = await getDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  await db
    .delete(zidSyncLogs)
    .where(
      and(
        eq(zidSyncLogs.merchantId, merchantId),
        // Note: This comparison might need adjustment based on your date format
      )
    );
}

/**
 * الحصول على إحصائيات المزامنة
 */
export async function getZidSyncStats(merchantId: number): Promise<{
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  lastProductSync?: string;
  lastOrderSync?: string;
  lastCustomerSync?: string;
}> {
  const logs = await getZidSyncLogs(merchantId, undefined, 1000);
  const settings = await getZidSettings(merchantId);

  const totalSyncs = logs.length;
  const successfulSyncs = logs.filter((log) => log.status === 'completed').length;
  const failedSyncs = logs.filter((log) => log.status === 'failed').length;

  return {
    totalSyncs,
    successfulSyncs,
    failedSyncs,
    lastProductSync: settings?.lastProductSync || undefined,
    lastOrderSync: settings?.lastOrderSync || undefined,
    lastCustomerSync: settings?.lastCustomerSync || undefined,
  };
}

export default {
  // Settings
  getZidSettings,
  createZidSettings,
  updateZidSettings,
  deleteZidSettings,
  deleteAllZidConnections,
  isZidConnected,
  updateZidTokens,
  updateLastSync,
  toggleZidConnection,
  updateAutoSyncSettings,

  // Sync Logs
  createZidSyncLog,
  updateZidSyncLog,
  updateSyncStatus,
  updateSyncStats,
  getZidSyncLogs,
  getZidSyncLog,
  getLastSuccessfulSync,
  cleanupOldSyncLogs,
  getZidSyncStats,
};
