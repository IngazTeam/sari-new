import { mysqlTable, int, varchar, text, timestamp, boolean, mysqlEnum, index } from "drizzle-orm/mysql-core";
import { merchants } from "./schema";

/**
 * جدول تفضيلات الإشعارات لكل تاجر
 * يحدد أنواع الإشعارات المفعلة وساعات الهدوء
 */
export const notificationPreferences = mysqlTable("notification_preferences", {
  id: int("id").primaryKey().autoincrement(),
  merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  
  // أنواع الإشعارات المفعلة
  newOrdersEnabled: boolean("new_orders_enabled").notNull().default(true),
  newMessagesEnabled: boolean("new_messages_enabled").notNull().default(true),
  appointmentsEnabled: boolean("appointments_enabled").notNull().default(true),
  orderStatusEnabled: boolean("order_status_enabled").notNull().default(true),
  missedMessagesEnabled: boolean("missed_messages_enabled").notNull().default(true),
  whatsappDisconnectEnabled: boolean("whatsapp_disconnect_enabled").notNull().default(true),
  
  // طريقة الإرسال المفضلة
  preferredMethod: mysqlEnum("preferred_method", ['push', 'email', 'both']).notNull().default('both'),
  
  // ساعات الهدوء (Quiet Hours)
  quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(false),
  quietHoursStart: varchar("quiet_hours_start", { length: 5 }).default('22:00'), // HH:MM format
  quietHoursEnd: varchar("quiet_hours_end", { length: 5 }).default('08:00'), // HH:MM format
  
  // الإشعارات الفورية
  instantNotifications: boolean("instant_notifications").notNull().default(true),
  
  // تجميع الإشعارات (Batch Notifications)
  batchNotifications: boolean("batch_notifications").notNull().default(false),
  batchInterval: int("batch_interval").default(30), // minutes
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
},
(table) => [
  index("notification_preferences_merchant_id_idx").on(table.merchantId),
]);

/**
 * سجل جميع الإشعارات المرسلة (Push + Email)
 * يستخدم في لوحة تحكم Super Admin
 */
export const notificationLogs = mysqlTable("notification_logs", {
  id: int("id").primaryKey().autoincrement(),
  merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  
  // نوع الإشعار
  type: mysqlEnum("type", [
    'new_order',
    'new_message',
    'appointment',
    'order_status',
    'missed_message',
    'whatsapp_disconnect',
    'weekly_report',
    'custom'
  ]).notNull(),
  
  // طريقة الإرسال
  method: mysqlEnum("method", ['push', 'email', 'both']).notNull(),
  
  // محتوى الإشعار
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  url: varchar("url", { length: 500 }),
  
  // حالة الإرسال
  status: mysqlEnum("status", ['pending', 'sent', 'failed', 'cancelled']).notNull().default('pending'),
  error: text("error"),
  
  // معلومات إضافية
  metadata: text("metadata"), // JSON string with additional data
  
  // التوقيت
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
},
(table) => [
  index("notification_logs_merchant_id_idx").on(table.merchantId),
  index("notification_logs_type_idx").on(table.type),
  index("notification_logs_status_idx").on(table.status),
  index("notification_logs_created_at_idx").on(table.createdAt),
]);

/**
 * إعدادات لوحة تحكم الإشعارات في Super Admin
 * تحديد أنواع الإشعارات المفعلة على مستوى النظام
 */
export const notificationSettings = mysqlTable("notification_settings", {
  id: int("id").primaryKey().autoincrement(),
  
  // تفعيل/تعطيل أنواع الإشعارات على مستوى النظام
  newOrdersGlobalEnabled: boolean("new_orders_global_enabled").notNull().default(true),
  newMessagesGlobalEnabled: boolean("new_messages_global_enabled").notNull().default(true),
  appointmentsGlobalEnabled: boolean("appointments_global_enabled").notNull().default(true),
  orderStatusGlobalEnabled: boolean("order_status_global_enabled").notNull().default(true),
  missedMessagesGlobalEnabled: boolean("missed_messages_global_enabled").notNull().default(true),
  whatsappDisconnectGlobalEnabled: boolean("whatsapp_disconnect_global_enabled").notNull().default(true),
  weeklyReportsGlobalEnabled: boolean("weekly_reports_global_enabled").notNull().default(true),
  
  // إعدادات التقارير الأسبوعية
  weeklyReportDay: int("weekly_report_day").notNull().default(0), // 0 = Sunday, 1 = Monday, etc.
  weeklyReportTime: varchar("weekly_report_time", { length: 5 }).notNull().default('09:00'), // HH:MM format
  
  // البريد الإلكتروني للأدمن
  adminEmail: varchar("admin_email", { length: 255 }),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
