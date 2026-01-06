import { mysqlTable, varchar, int, text, timestamp, boolean } from "drizzle-orm/mysql-core";

export const smtpSettings = mysqlTable("smtp_settings", {
  id: int("id").primaryKey().autoincrement(),
  host: varchar("host", { length: 255 }).notNull(),
  port: int("port").notNull().default(587),
  username: varchar("username", { length: 255 }).notNull(),
  password: text("password").notNull(), // Encrypted
  fromEmail: varchar("from_email", { length: 255 }).notNull(),
  fromName: varchar("from_name", { length: 255 }).notNull().default("ساري"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const emailLogs = mysqlTable("email_logs", {
  id: int("id").primaryKey().autoincrement(),
  toEmail: varchar("to_email", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, sent, failed
  error: text("error"),
  
  // معلومات إضافية
  emailType: varchar("email_type", { length: 100 }), // notification, report, alert, etc.
  merchantId: int("merchant_id"), // Optional: for tracking merchant-specific emails
  metadata: text("metadata"), // JSON string with additional data
  
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
