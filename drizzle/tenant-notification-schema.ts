import { sql } from 'drizzle-orm';
import { mysqlTable, mysqlEnum, int, varchar, text, datetime, timestamp, date, boolean, index, uniqueIndex } from 'drizzle-orm/mysql-core';
import { merchants } from './schema';

export const scheduledReports = mysqlTable('scheduled_reports', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, {onDelete: 'cascade'}),
  name: varchar({length: 200}).notNull(),
  reportType: mysqlEnum('report_type', ['daily', 'weekly', 'monthly', 'custom']).notNull(),
  scheduleDay: int('schedule_day').notNull().default(0),
  scheduleTime: varchar('schedule_time', {length: 5}).notNull().default('09:00'),
  deliveryMethod: mysqlEnum('delivery_method', ['email', 'whatsapp', 'both']).notNull().default('email'),
  recipientEmail: varchar('recipient_email', {length: 320}), recipientPhone: varchar('recipient_phone', {length: 32}),
  includeConversations: boolean('include_conversations').notNull().default(true),
  includeOrders: boolean('include_orders').notNull().default(true),
  includeRevenue: boolean('include_revenue').notNull().default(true),
  includeProducts: boolean('include_products').notNull().default(true),
  includeCustomers: boolean('include_customers').notNull().default(true),
  includeAppointments: boolean('include_appointments').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  lastSentAt: datetime('last_sent_at'), nextSendAt: datetime('next_send_at'),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, t => [index('idx_scheduled_report_merchant').on(t.merchantId, t.createdAt), index('idx_scheduled_report_due').on(t.isActive, t.nextSendAt)]);

export const whatsappAutoNotifications = mysqlTable('whatsapp_auto_notifications', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, {onDelete: 'cascade'}),
  triggerType: varchar('trigger_type', {length: 64}).notNull(), messageTemplate: text('message_template').notNull(),
  isActive: boolean('is_active').notNull().default(true), delayMinutes: int('delay_minutes', {unsigned: true}).notNull().default(0),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
}, t => [index('idx_auto_notification_trigger').on(t.merchantId, t.triggerType, t.isActive)]);

export const integrationStats = mysqlTable('integration_stats', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, {onDelete: 'cascade'}),
  platform: varchar({length: 64}).notNull(), statDate: date('stat_date').notNull(),
  syncCount: int('sync_count', {unsigned: true}).notNull().default(0),
  successCount: int('success_count', {unsigned: true}).notNull().default(0),
  errorCount: int('error_count', {unsigned: true}).notNull().default(0),
  lastSyncAt: datetime('last_sync_at'), createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [uniqueIndex('uq_integration_stat_day').on(t.merchantId, t.platform, t.statDate)]);

export const integrationErrors = mysqlTable('integration_errors', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, {onDelete: 'cascade'}),
  platform: varchar({length: 64}).notNull(), errorType: varchar('error_type', {length: 100}).notNull(),
  errorMessage: text('error_message'), errorDetails: text('error_details'),
  resolved: boolean().notNull().default(false), resolvedAt: datetime('resolved_at'),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [index('idx_integration_error_merchant').on(t.merchantId, t.resolved, t.createdAt), index('idx_integration_error_platform').on(t.merchantId, t.platform, t.createdAt)]);
