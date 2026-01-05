import { getDb } from "./db";
import { sql } from "drizzle-orm";

// Push Notification Settings
export async function getPushNotificationSettings(merchantId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.execute(sql`SELECT * FROM push_notification_settings WHERE merchant_id = ${merchantId}`);
  return (result as any)[0]?.[0] || null;
}

export async function upsertPushNotificationSettings(merchantId: number, data: {
  newMessageEnabled?: boolean;
  newOrderEnabled?: boolean;
  newAppointmentEnabled?: boolean;
  lowStockEnabled?: boolean;
  paymentReceivedEnabled?: boolean;
  batchNotifications?: boolean;
  batchIntervalMinutes?: number;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  notificationEmail?: string;
  emailNotificationsEnabled?: boolean;
}) {
  const db = await getDb();
  if (!db) return null;
  
  const existing = await getPushNotificationSettings(merchantId);
  
  if (existing) {
    await db.execute(sql`UPDATE push_notification_settings SET
      new_message_enabled = COALESCE(${data.newMessageEnabled}, new_message_enabled),
      new_order_enabled = COALESCE(${data.newOrderEnabled}, new_order_enabled),
      new_appointment_enabled = COALESCE(${data.newAppointmentEnabled}, new_appointment_enabled),
      low_stock_enabled = COALESCE(${data.lowStockEnabled}, low_stock_enabled),
      payment_received_enabled = COALESCE(${data.paymentReceivedEnabled}, payment_received_enabled),
      batch_notifications = COALESCE(${data.batchNotifications}, batch_notifications),
      batch_interval_minutes = COALESCE(${data.batchIntervalMinutes}, batch_interval_minutes),
      quiet_hours_enabled = COALESCE(${data.quietHoursEnabled}, quiet_hours_enabled),
      quiet_hours_start = COALESCE(${data.quietHoursStart}, quiet_hours_start),
      quiet_hours_end = COALESCE(${data.quietHoursEnd}, quiet_hours_end),
      notification_email = COALESCE(${data.notificationEmail}, notification_email),
      email_notifications_enabled = COALESCE(${data.emailNotificationsEnabled}, email_notifications_enabled)
    WHERE merchant_id = ${merchantId}`);
  } else {
    await db.execute(sql`INSERT INTO push_notification_settings 
      (merchant_id, new_message_enabled, new_order_enabled, new_appointment_enabled, 
       low_stock_enabled, payment_received_enabled, batch_notifications, batch_interval_minutes,
       quiet_hours_enabled, quiet_hours_start, quiet_hours_end, notification_email, email_notifications_enabled)
    VALUES (${merchantId}, ${data.newMessageEnabled ?? true}, ${data.newOrderEnabled ?? true}, 
      ${data.newAppointmentEnabled ?? true}, ${data.lowStockEnabled ?? true}, ${data.paymentReceivedEnabled ?? true},
      ${data.batchNotifications ?? false}, ${data.batchIntervalMinutes ?? 5}, ${data.quietHoursEnabled ?? false},
      ${data.quietHoursStart ?? '22:00'}, ${data.quietHoursEnd ?? '08:00'}, ${data.notificationEmail}, 
      ${data.emailNotificationsEnabled ?? true})`);
  }
  
  return getPushNotificationSettings(merchantId);
}

export async function createPushNotificationLog(data: {
  merchantId: number;
  notificationType: string;
  title: string;
  content?: string;
  status?: string;
}) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.execute(sql`INSERT INTO push_notification_logs 
    (merchant_id, notification_type, title, content, status)
    VALUES (${data.merchantId}, ${data.notificationType}, ${data.title}, ${data.content}, ${data.status || 'pending'})`);
  return (result as any)[0]?.insertId || 0;
}

export async function updatePushNotificationLog(id: number, data: {
  status?: string;
  sentAt?: Date;
  errorMessage?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`UPDATE push_notification_logs SET
    status = COALESCE(${data.status}, status),
    sent_at = COALESCE(${data.sentAt}, sent_at),
    error_message = COALESCE(${data.errorMessage}, error_message)
  WHERE id = ${id}`);
}

export async function getPushNotificationLogs(merchantId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`SELECT * FROM push_notification_logs WHERE merchant_id = ${merchantId} ORDER BY created_at DESC LIMIT ${limit}`);
  return (result as any)[0] || [];
}

// Scheduled Reports
export async function getScheduledReports(merchantId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`SELECT * FROM scheduled_reports WHERE merchant_id = ${merchantId} ORDER BY created_at DESC`);
  return (result as any)[0] || [];
}

export async function getScheduledReportById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.execute(sql`SELECT * FROM scheduled_reports WHERE id = ${id}`);
  return (result as any)[0]?.[0] || null;
}

export async function createScheduledReport(data: {
  merchantId: number;
  name: string;
  reportType: 'daily' | 'weekly' | 'monthly' | 'custom';
  scheduleDay?: number;
  scheduleTime?: string;
  deliveryMethod?: 'email' | 'whatsapp' | 'both';
  recipientEmail?: string;
  recipientPhone?: string;
  includeConversations?: boolean;
  includeOrders?: boolean;
  includeRevenue?: boolean;
  includeProducts?: boolean;
  includeCustomers?: boolean;
  includeAppointments?: boolean;
}) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.execute(sql`INSERT INTO scheduled_reports 
    (merchant_id, name, report_type, schedule_day, schedule_time, delivery_method,
     recipient_email, recipient_phone, include_conversations, include_orders,
     include_revenue, include_products, include_customers, include_appointments)
    VALUES (${data.merchantId}, ${data.name}, ${data.reportType}, ${data.scheduleDay ?? 0}, 
      ${data.scheduleTime ?? '09:00'}, ${data.deliveryMethod ?? 'email'}, ${data.recipientEmail},
      ${data.recipientPhone}, ${data.includeConversations ?? true}, ${data.includeOrders ?? true},
      ${data.includeRevenue ?? true}, ${data.includeProducts ?? true}, ${data.includeCustomers ?? true},
      ${data.includeAppointments ?? true})`);
  return (result as any)[0]?.insertId || 0;
}

export async function updateScheduledReport(id: number, data: Partial<{
  name: string;
  reportType: 'daily' | 'weekly' | 'monthly' | 'custom';
  scheduleDay: number;
  scheduleTime: string;
  deliveryMethod: 'email' | 'whatsapp' | 'both';
  recipientEmail: string;
  recipientPhone: string;
  includeConversations: boolean;
  includeOrders: boolean;
  includeRevenue: boolean;
  includeProducts: boolean;
  includeCustomers: boolean;
  includeAppointments: boolean;
  isActive: boolean;
  lastSentAt: Date;
  nextSendAt: Date;
}>) {
  const db = await getDb();
  if (!db) return;
  // Simple update - just update all fields
  await db.execute(sql`UPDATE scheduled_reports SET
    name = COALESCE(${data.name}, name),
    report_type = COALESCE(${data.reportType}, report_type),
    schedule_day = COALESCE(${data.scheduleDay}, schedule_day),
    schedule_time = COALESCE(${data.scheduleTime}, schedule_time),
    delivery_method = COALESCE(${data.deliveryMethod}, delivery_method),
    recipient_email = COALESCE(${data.recipientEmail}, recipient_email),
    recipient_phone = COALESCE(${data.recipientPhone}, recipient_phone),
    is_active = COALESCE(${data.isActive}, is_active),
    last_sent_at = COALESCE(${data.lastSentAt}, last_sent_at),
    next_send_at = COALESCE(${data.nextSendAt}, next_send_at)
  WHERE id = ${id}`);
}

export async function deleteScheduledReport(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`DELETE FROM scheduled_reports WHERE id = ${id}`);
}

export async function getDueScheduledReports() {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`SELECT * FROM scheduled_reports WHERE is_active = TRUE AND (next_send_at IS NULL OR next_send_at <= NOW())`);
  return (result as any)[0] || [];
}

// WhatsApp Auto Notifications
export async function getWhatsappAutoNotifications(merchantId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`SELECT * FROM whatsapp_auto_notifications WHERE merchant_id = ${merchantId} ORDER BY created_at DESC`);
  return (result as any)[0] || [];
}

export async function getWhatsappAutoNotificationById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.execute(sql`SELECT * FROM whatsapp_auto_notifications WHERE id = ${id}`);
  return (result as any)[0]?.[0] || null;
}

export async function getActiveWhatsappAutoNotification(merchantId: number, triggerType: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.execute(sql`SELECT * FROM whatsapp_auto_notifications WHERE merchant_id = ${merchantId} AND trigger_type = ${triggerType} AND is_active = TRUE`);
  return (result as any)[0]?.[0] || null;
}

export async function createWhatsappAutoNotification(data: {
  merchantId: number;
  triggerType: string;
  messageTemplate: string;
  isActive?: boolean;
  delayMinutes?: number;
}) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.execute(sql`INSERT INTO whatsapp_auto_notifications 
    (merchant_id, trigger_type, message_template, is_active, delay_minutes)
    VALUES (${data.merchantId}, ${data.triggerType}, ${data.messageTemplate}, ${data.isActive ?? true}, ${data.delayMinutes ?? 0})`);
  return (result as any)[0]?.insertId || 0;
}

export async function updateWhatsappAutoNotification(id: number, data: Partial<{
  triggerType: string;
  messageTemplate: string;
  isActive: boolean;
  delayMinutes: number;
}>) {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`UPDATE whatsapp_auto_notifications SET
    trigger_type = COALESCE(${data.triggerType}, trigger_type),
    message_template = COALESCE(${data.messageTemplate}, message_template),
    is_active = COALESCE(${data.isActive}, is_active),
    delay_minutes = COALESCE(${data.delayMinutes}, delay_minutes)
  WHERE id = ${id}`);
}

export async function deleteWhatsappAutoNotification(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`DELETE FROM whatsapp_auto_notifications WHERE id = ${id}`);
}

// Integration Stats
export async function getIntegrationStats(merchantId: number, platform?: string, days = 30) {
  const db = await getDb();
  if (!db) return [];
  if (platform) {
    const result = await db.execute(sql`SELECT * FROM integration_stats WHERE merchant_id = ${merchantId} AND platform = ${platform} AND stat_date >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY) ORDER BY stat_date DESC`);
    return (result as any)[0] || [];
  }
  const result = await db.execute(sql`SELECT * FROM integration_stats WHERE merchant_id = ${merchantId} AND stat_date >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY) ORDER BY stat_date DESC`);
  return (result as any)[0] || [];
}

export async function recordIntegrationStats(data: {
  merchantId: number;
  platform: string;
  syncCount?: number;
  successCount?: number;
  errorCount?: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`INSERT INTO integration_stats (merchant_id, platform, stat_date, sync_count, success_count, error_count, last_sync_at)
    VALUES (${data.merchantId}, ${data.platform}, CURDATE(), ${data.syncCount ?? 1}, ${data.successCount ?? 0}, ${data.errorCount ?? 0}, NOW())
    ON DUPLICATE KEY UPDATE
      sync_count = sync_count + VALUES(sync_count),
      success_count = success_count + VALUES(success_count),
      error_count = error_count + VALUES(error_count),
      last_sync_at = NOW()`);
}

// Integration Errors
export async function createIntegrationError(data: {
  merchantId: number;
  platform: string;
  errorType: string;
  errorMessage?: string;
  errorDetails?: string;
}) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.execute(sql`INSERT INTO integration_errors 
    (merchant_id, platform, error_type, error_message, error_details)
    VALUES (${data.merchantId}, ${data.platform}, ${data.errorType}, ${data.errorMessage}, ${data.errorDetails})`);
  return (result as any)[0]?.insertId || 0;
}

export async function getIntegrationErrors(merchantId: number, platform?: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  if (platform) {
    const result = await db.execute(sql`SELECT * FROM integration_errors WHERE merchant_id = ${merchantId} AND platform = ${platform} ORDER BY created_at DESC LIMIT ${limit}`);
    return (result as any)[0] || [];
  }
  const result = await db.execute(sql`SELECT * FROM integration_errors WHERE merchant_id = ${merchantId} ORDER BY created_at DESC LIMIT ${limit}`);
  return (result as any)[0] || [];
}

export async function getUnresolvedErrors(merchantId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`SELECT * FROM integration_errors WHERE merchant_id = ${merchantId} AND resolved = FALSE ORDER BY created_at DESC`);
  return (result as any)[0] || [];
}

export async function resolveIntegrationError(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`UPDATE integration_errors SET resolved = TRUE, resolved_at = NOW() WHERE id = ${id}`);
}

// Webhook Security Logs
export async function createWebhookSecurityLog(data: {
  merchantId?: number;
  platform: string;
  ipAddress?: string;
  signatureValid?: boolean;
  requestPath?: string;
  requestMethod?: string;
  errorMessage?: string;
}) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.execute(sql`INSERT INTO webhook_security_logs 
    (merchant_id, platform, ip_address, signature_valid, request_path, request_method, error_message)
    VALUES (${data.merchantId}, ${data.platform}, ${data.ipAddress}, ${data.signatureValid}, ${data.requestPath}, ${data.requestMethod}, ${data.errorMessage})`);
  return (result as any)[0]?.insertId || 0;
}

export async function getWebhookSecurityLogs(merchantId?: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  if (merchantId) {
    const result = await db.execute(sql`SELECT * FROM webhook_security_logs WHERE merchant_id = ${merchantId} ORDER BY created_at DESC LIMIT ${limit}`);
    return (result as any)[0] || [];
  }
  const result = await db.execute(sql`SELECT * FROM webhook_security_logs ORDER BY created_at DESC LIMIT ${limit}`);
  return (result as any)[0] || [];
}

export async function getFailedWebhookAttempts(hours = 24) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`SELECT * FROM webhook_security_logs WHERE signature_valid = FALSE AND created_at >= DATE_SUB(NOW(), INTERVAL ${hours} HOUR) ORDER BY created_at DESC`);
  return (result as any)[0] || [];
}
