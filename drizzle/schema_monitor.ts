/**
 * Message Delivery Log Schema
 * Tracks every incoming WhatsApp message and its delivery outcome.
 */
import { mysqlTable, mysqlEnum, int, varchar, text, timestamp, index, InferSelectModel, InferInsertModel } from "drizzle-orm/mysql-core";

export const messageDeliveryLog = mysqlTable("message_delivery_log", {
  id: int().autoincrement().primaryKey(),
  merchantId: int("merchant_id").notNull(),
  instanceId: varchar("instance_id", { length: 255 }),
  customerPhone: varchar("customer_phone", { length: 30 }).notNull(),
  customerName: varchar("customer_name", { length: 255 }),
  messageType: mysqlEnum("message_type", ['text', 'voice', 'image', 'video', 'document', 'other']).default('text').notNull(),
  status: mysqlEnum(['delivered', 'failed', 'dropped']).notNull(),
  failureReason: varchar("failure_reason", { length: 255 }),
  failureDetails: text("failure_details"),
  responseTimeMs: int("response_time_ms"),
  source: mysqlEnum(['webhook', 'polling']).default('webhook').notNull(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("idx_mdl_merchant").on(table.merchantId),
  index("idx_mdl_status").on(table.status),
  index("idx_mdl_created").on(table.createdAt),
  index("idx_mdl_merchant_status").on(table.merchantId, table.status, table.createdAt),
]);

export type MessageDeliveryLog = InferSelectModel<typeof messageDeliveryLog>;
export type InsertMessageDeliveryLog = InferInsertModel<typeof messageDeliveryLog>;
