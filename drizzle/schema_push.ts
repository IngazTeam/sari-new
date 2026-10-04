import { mysqlTable, int, varchar, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/mysql-core";
import { merchants } from "./schema";

export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: int("id").primaryKey().autoincrement(),
  merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  actorUserId: int("actor_user_id"),
  sessionHash: varchar("session_hash", { length: 64 }),
  endpointHash: varchar("endpoint_hash", { length: 64 }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: varchar("user_agent", { length: 500 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, table => ({endpointHashUnique: uniqueIndex("uq_push_endpoint_hash").on(table.endpointHash)}));

export const pushNotificationLogs = mysqlTable("push_notification_logs", {
  id: int("id").primaryKey().autoincrement(),
  merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  subscriptionId: int("subscription_id").references(() => pushSubscriptions.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  url: varchar("url", { length: 500 }),
  requestId: varchar("request_id", { length: 36 }),
  requestActorId: int("request_actor_id"),
  requestHash: varchar("request_hash", { length: 64 }),
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, sent, failed
  error: text("error"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => ({requestUnique: uniqueIndex("uq_push_test_request").on(table.requestId)}));
