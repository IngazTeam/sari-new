import { getDb } from "./db";
import { eq, and, desc, gte, lte, count, sql } from "drizzle-orm";
import {
  notificationLogs,
  notificationSettings,
  notificationPreferences,
} from "../drizzle/schema_notifications";

// ==================== Notification Logs ====================

/**
 * إنشاء سجل إشعار جديد
 */
export async function createNotificationLog(data: {
  merchantId: number;
  type: 'new_order' | 'new_message' | 'appointment' | 'order_status' | 'missed_message' | 'whatsapp_disconnect' | 'weekly_report' | 'custom';
  method: 'push' | 'email' | 'both';
  title: string;
  body: string;
  url?: string;
  metadata?: any;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [log] = await db.insert(notificationLogs).values({
    merchantId: data.merchantId,
    type: data.type,
    method: data.method,
    title: data.title,
    body: data.body,
    url: data.url,
    metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    status: 'pending',
  }).returning();
  
  return log;
}

/**
 * تحديث حالة الإشعار
 */
export async function updateNotificationStatus(
  id: number,
  status: 'pending' | 'sent' | 'failed' | 'cancelled',
  error?: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [updated] = await db.update(notificationLogs)
    .set({
      status,
      error: error || null,
      sentAt: status === 'sent' ? new Date() : undefined,
    })
    .where(eq(notificationLogs.id, id))
    .returning();
  
  return updated;
}

/**
 * الحصول على سجل إشعار بالـ ID
 */
export async function getNotificationLogById(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [log] = await db.select()
    .from(notificationLogs)
    .where(eq(notificationLogs.id, id));
  
  return log;
}

/**
 * الحصول على جميع سجلات الإشعارات (للـ Super Admin)
 */
export async function getAllNotificationLogs(filters?: {
  merchantId?: number;
  type?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  let query = db.select().from(notificationLogs);
  
  const conditions = [];
  
  if (filters?.merchantId) {
    conditions.push(eq(notificationLogs.merchantId, filters.merchantId));
  }
  
  if (filters?.type) {
    conditions.push(eq(notificationLogs.type, filters.type as any));
  }
  
  if (filters?.status) {
    conditions.push(eq(notificationLogs.status, filters.status as any));
  }
  
  if (filters?.startDate) {
    conditions.push(gte(notificationLogs.createdAt, filters.startDate));
  }
  
  if (filters?.endDate) {
    conditions.push(lte(notificationLogs.createdAt, filters.endDate));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  
  query = query.orderBy(desc(notificationLogs.createdAt)) as any;
  
  if (filters?.limit) {
    query = query.limit(filters.limit) as any;
  }
  
  if (filters?.offset) {
    query = query.offset(filters.offset) as any;
  }
  
  const logs = await query;
  return logs;
}

/**
 * الحصول على سجلات إشعارات تاجر معين
 */
export async function getNotificationLogsByMerchant(
  merchantId: number,
  limit = 50,
  offset = 0
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const logs = await db.select()
    .from(notificationLogs)
    .where(eq(notificationLogs.merchantId, merchantId))
    .orderBy(desc(notificationLogs.createdAt))
    .limit(limit)
    .offset(offset);
  
  return logs;
}

/**
 * الحصول على إحصائيات الإشعارات
 */
export async function getNotificationStats(filters?: {
  merchantId?: number;
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const conditions = [];
  
  if (filters?.merchantId) {
    conditions.push(eq(notificationLogs.merchantId, filters.merchantId));
  }
  
  if (filters?.startDate) {
    conditions.push(gte(notificationLogs.createdAt, filters.startDate));
  }
  
  if (filters?.endDate) {
    conditions.push(lte(notificationLogs.createdAt, filters.endDate));
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  const [stats] = await db.select({
    total: count(),
    sent: sql<number>`SUM(CASE WHEN ${notificationLogs.status} = 'sent' THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN ${notificationLogs.status} = 'failed' THEN 1 ELSE 0 END)`,
    pending: sql<number>`SUM(CASE WHEN ${notificationLogs.status} = 'pending' THEN 1 ELSE 0 END)`,
    cancelled: sql<number>`SUM(CASE WHEN ${notificationLogs.status} = 'cancelled' THEN 1 ELSE 0 END)`,
  })
  .from(notificationLogs)
  .where(whereClause);
  
  return {
    total: Number(stats?.total || 0),
    sent: Number(stats?.sent || 0),
    failed: Number(stats?.failed || 0),
    pending: Number(stats?.pending || 0),
    cancelled: Number(stats?.cancelled || 0),
  };
}

/**
 * الحصول على إحصائيات الإشعارات حسب النوع
 */
export async function getNotificationStatsByType(filters?: {
  merchantId?: number;
  startDate?: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const conditions = [];
  
  if (filters?.merchantId) {
    conditions.push(eq(notificationLogs.merchantId, filters.merchantId));
  }
  
  if (filters?.startDate) {
    conditions.push(gte(notificationLogs.createdAt, filters.startDate));
  }
  
  if (filters?.endDate) {
    conditions.push(lte(notificationLogs.createdAt, filters.endDate));
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  const stats = await db.select({
    type: notificationLogs.type,
    total: count(),
    sent: sql<number>`SUM(CASE WHEN ${notificationLogs.status} = 'sent' THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN ${notificationLogs.status} = 'failed' THEN 1 ELSE 0 END)`,
  })
  .from(notificationLogs)
  .where(whereClause)
  .groupBy(notificationLogs.type);
  
  return stats.map(s => ({
    type: s.type,
    total: Number(s.total),
    sent: Number(s.sent),
    failed: Number(s.failed),
  }));
}

/**
 * حذف سجل إشعار
 */
export async function deleteNotificationLog(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  await db.delete(notificationLogs)
    .where(eq(notificationLogs.id, id));
  
  return true;
}

/**
 * حذف سجلات الإشعارات القديمة (أكثر من X يوم)
 */
export async function deleteOldNotificationLogs(daysOld: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const result = await db.delete(notificationLogs)
    .where(lte(notificationLogs.createdAt, cutoffDate));
  
  return result;
}

// ==================== Notification Settings ====================

/**
 * الحصول على إعدادات الإشعارات العامة
 */
export async function getNotificationSettings() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [settings] = await db.select()
    .from(notificationSettings)
    .limit(1);
  
  // إذا لم توجد إعدادات، إنشاء إعدادات افتراضية
  if (!settings) {
    const [newSettings] = await db.insert(notificationSettings)
      .values({
        newOrdersGlobalEnabled: true,
        newMessagesGlobalEnabled: true,
        appointmentsGlobalEnabled: true,
        orderStatusGlobalEnabled: true,
        missedMessagesGlobalEnabled: true,
        whatsappDisconnectGlobalEnabled: true,
        weeklyReportsGlobalEnabled: true,
        weeklyReportDay: 0,
        weeklyReportTime: '09:00',
      })
      .returning();
    
    return newSettings;
  }
  
  return settings;
}

/**
 * تحديث إعدادات الإشعارات العامة
 */
export async function updateNotificationSettings(data: Partial<{
  newOrdersGlobalEnabled: boolean;
  newMessagesGlobalEnabled: boolean;
  appointmentsGlobalEnabled: boolean;
  orderStatusGlobalEnabled: boolean;
  missedMessagesGlobalEnabled: boolean;
  whatsappDisconnectGlobalEnabled: boolean;
  weeklyReportsGlobalEnabled: boolean;
  weeklyReportDay: number;
  weeklyReportTime: string;
  adminEmail: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  // الحصول على الإعدادات الحالية أو إنشاء جديدة
  const currentSettings = await getNotificationSettings();
  
  const [updated] = await db.update(notificationSettings)
    .set(data)
    .where(eq(notificationSettings.id, currentSettings.id))
    .returning();
  
  return updated;
}

/**
 * تفعيل/تعطيل نوع معين من الإشعارات
 */
export async function toggleNotificationType(
  type: 'new_orders' | 'new_messages' | 'appointments' | 'order_status' | 'missed_messages' | 'whatsapp_disconnect' | 'weekly_reports',
  enabled: boolean
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const currentSettings = await getNotificationSettings();
  
  const fieldMap = {
    'new_orders': 'newOrdersGlobalEnabled',
    'new_messages': 'newMessagesGlobalEnabled',
    'appointments': 'appointmentsGlobalEnabled',
    'order_status': 'orderStatusGlobalEnabled',
    'missed_messages': 'missedMessagesGlobalEnabled',
    'whatsapp_disconnect': 'whatsappDisconnectGlobalEnabled',
    'weekly_reports': 'weeklyReportsGlobalEnabled',
  };
  
  const field = fieldMap[type];
  
  const [updated] = await db.update(notificationSettings)
    .set({ [field]: enabled })
    .where(eq(notificationSettings.id, currentSettings.id))
    .returning();
  
  return updated;
}

// ==================== Notification Preferences (Per Merchant) ====================

/**
 * الحصول على تفضيلات الإشعارات لتاجر معين
 */
export async function getNotificationPreferences(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const [prefs] = await db.select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.merchantId, merchantId));
  
  // إذا لم توجد تفضيلات، إنشاء تفضيلات افتراضية
  if (!prefs) {
    const [newPrefs] = await db.insert(notificationPreferences)
      .values({
        merchantId,
        newOrdersEnabled: true,
        newMessagesEnabled: true,
        appointmentsEnabled: true,
        orderStatusEnabled: true,
        missedMessagesEnabled: true,
        whatsappDisconnectEnabled: true,
        preferredMethod: 'both',
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
        instantNotifications: true,
        batchNotifications: false,
        batchInterval: 30,
      })
      .returning();
    
    return newPrefs;
  }
  
  return prefs;
}

/**
 * تحديث تفضيلات الإشعارات لتاجر معين
 */
export async function updateNotificationPreferences(
  merchantId: number,
  data: Partial<{
    newOrdersEnabled: boolean;
    newMessagesEnabled: boolean;
    appointmentsEnabled: boolean;
    orderStatusEnabled: boolean;
    missedMessagesEnabled: boolean;
    whatsappDisconnectEnabled: boolean;
    preferredMethod: 'push' | 'email' | 'both';
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    instantNotifications: boolean;
    batchNotifications: boolean;
    batchInterval: number;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const currentPrefs = await getNotificationPreferences(merchantId);
  
  const [updated] = await db.update(notificationPreferences)
    .set(data)
    .where(eq(notificationPreferences.id, currentPrefs.id))
    .returning();
  
  return updated;
}
