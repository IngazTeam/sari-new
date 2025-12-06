import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Merchants (التجار) - each merchant can have one WhatsApp connection
 */
export const merchants = mysqlTable("merchants", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // Reference to users table
  businessName: varchar("businessName", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  status: mysqlEnum("status", ["active", "suspended", "pending"]).default("pending").notNull(),
  subscriptionId: int("subscriptionId"), // Current subscription
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Merchant = typeof merchants.$inferSelect;
export type InsertMerchant = typeof merchants.$inferInsert;

/**
 * Subscription Plans (الباقات)
 */
export const plans = mysqlTable("plans", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // B1, B2, B3
  nameAr: varchar("nameAr", { length: 100 }).notNull(), // Starter, Growth, Pro
  priceMonthly: int("priceMonthly").notNull(), // Price in SAR (90, 230, 845)
  conversationLimit: int("conversationLimit").notNull(), // 150, 600, 2000
  voiceMessageLimit: int("voiceMessageLimit").notNull(), // 50, unlimited (-1), unlimited (-1)
  features: text("features"), // JSON string of features
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = typeof plans.$inferInsert;

/**
 * Merchant Subscriptions (اشتراكات التجار)
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  planId: int("planId").notNull(),
  status: mysqlEnum("status", ["active", "expired", "cancelled", "pending"]).default("pending").notNull(),
  conversationsUsed: int("conversationsUsed").default(0).notNull(),
  voiceMessagesUsed: int("voiceMessagesUsed").default(0).notNull(),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  autoRenew: boolean("autoRenew").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * WhatsApp Connections (ربط الواتساب)
 */
export const whatsappConnections = mysqlTable("whatsappConnections", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull().unique(), // One connection per merchant
  phoneNumber: varchar("phoneNumber", { length: 20 }),
  instanceId: varchar("instanceId", { length: 255 }), // Green API instance ID
  apiToken: varchar("apiToken", { length: 255 }), // Green API token
  status: mysqlEnum("status", ["connected", "disconnected", "pending", "error"]).default("pending").notNull(),
  qrCode: text("qrCode"), // QR code for connection
  lastConnected: timestamp("lastConnected"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WhatsappConnection = typeof whatsappConnections.$inferSelect;
export type InsertWhatsappConnection = typeof whatsappConnections.$inferInsert;

/**
 * Products (المنتجات)
 */
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  nameAr: varchar("nameAr", { length: 255 }),
  description: text("description"),
  descriptionAr: text("descriptionAr"),
  price: int("price").notNull(), // Price in SAR (stored as integer, e.g., 10000 = 100.00 SAR)
  imageUrl: varchar("imageUrl", { length: 500 }),
  productUrl: varchar("productUrl", { length: 500 }), // Link to product page or payment
  category: varchar("category", { length: 100 }),
  isActive: boolean("isActive").default(true).notNull(),
  stock: int("stock").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

/**
 * Conversations (المحادثات)
 */
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  customerPhone: varchar("customerPhone", { length: 20 }).notNull(),
  customerName: varchar("customerName", { length: 255 }),
  status: mysqlEnum("status", ["active", "closed", "archived"]).default("active").notNull(),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * Messages (الرسائل)
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  direction: mysqlEnum("direction", ["incoming", "outgoing"]).notNull(),
  messageType: mysqlEnum("messageType", ["text", "voice", "image"]).default("text").notNull(),
  content: text("content").notNull(),
  voiceUrl: varchar("voiceUrl", { length: 500 }), // For voice messages
  imageUrl: varchar("imageUrl", { length: 500 }), // For image messages
  isProcessed: boolean("isProcessed").default(false).notNull(),
  aiResponse: text("aiResponse"), // AI generated response
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Campaigns (الحملات)
 */
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  message: text("message").notNull(),
  imageUrl: varchar("imageUrl", { length: 500 }),
  targetAudience: text("targetAudience"), // JSON string of filters
  status: mysqlEnum("status", ["draft", "scheduled", "sending", "completed", "failed"]).default("draft").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  sentCount: int("sentCount").default(0).notNull(),
  totalRecipients: int("totalRecipients").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;

/**
 * Support Tickets (تذاكر الدعم)
 */
export const supportTickets = mysqlTable("supportTickets", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"]).default("open").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  adminResponse: text("adminResponse"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;

/**
 * Notifications (الإشعارات) - system notifications for users
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // Reference to users table
  type: mysqlEnum("type", ["info", "success", "warning", "error"]).default("info").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  link: varchar("link", { length: 500 }), // Optional link to related page
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Payments (المدفوعات)
 */
export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  subscriptionId: int("subscriptionId").notNull(),
  amount: int("amount").notNull(), // Amount in SAR (stored as integer)
  currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["tap", "paypal", "link"]).notNull(),
  transactionId: varchar("transactionId", { length: 255 }),
  status: mysqlEnum("status", ["pending", "completed", "failed", "refunded"]).default("pending").notNull(),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

/**
 * Analytics (الإحصائيات)
 */
export const analytics = mysqlTable("analytics", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  date: timestamp("date").notNull(),
  conversationsCount: int("conversationsCount").default(0).notNull(),
  messagesCount: int("messagesCount").default(0).notNull(),
  voiceMessagesCount: int("voiceMessagesCount").default(0).notNull(),
  campaignsSent: int("campaignsSent").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Analytics = typeof analytics.$inferSelect;
export type InsertAnalytics = typeof analytics.$inferInsert;

/**
 * Plan Change Logs (سجل تغييرات الباقات)
 */
export const planChangeLogs = mysqlTable("planChangeLogs", {
  id: int("id").autoincrement().primaryKey(),
  planId: int("planId").notNull(),
  changedBy: int("changedBy").notNull(), // User ID who made the change
  fieldName: varchar("fieldName", { length: 100 }).notNull(), // priceMonthly, conversationLimit, etc.
  oldValue: text("oldValue"), // Previous value
  newValue: text("newValue").notNull(), // New value
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PlanChangeLog = typeof planChangeLogs.$inferSelect;
export type InsertPlanChangeLog = typeof planChangeLogs.$inferInsert;

/**
 * WhatsApp Connection Requests (طلبات ربط الواتساب)
 */
export const whatsappConnectionRequests = mysqlTable("whatsapp_connection_requests", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(), // Reference to merchants table
  countryCode: varchar("countryCode", { length: 10 }).notNull(), // e.g., "+966"
  phoneNumber: varchar("phoneNumber", { length: 20 }).notNull(), // WhatsApp number without country code
  fullNumber: varchar("fullNumber", { length: 30 }).notNull(), // Full number with country code
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  rejectionReason: text("rejectionReason"), // Reason for rejection if rejected
  reviewedBy: int("reviewedBy"), // Admin user ID who reviewed the request
  reviewedAt: timestamp("reviewedAt"), // When the request was reviewed
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WhatsAppConnectionRequest = typeof whatsappConnectionRequests.$inferSelect;
export type InsertWhatsAppConnectionRequest = typeof whatsappConnectionRequests.$inferInsert;

/**
 * Payment Gateways Configuration (إعدادات بوابات الدفع)
 */
export const paymentGateways = mysqlTable("payment_gateways", {
  id: int("id").autoincrement().primaryKey(),
  gateway: mysqlEnum("gateway", ["tap", "paypal"]).notNull().unique(), // Gateway name
  isEnabled: boolean("isEnabled").default(false).notNull(), // Whether the gateway is enabled
  publicKey: text("publicKey"), // Public/Publishable key
  secretKey: text("secretKey"), // Secret/Private key (encrypted)
  webhookSecret: text("webhookSecret"), // Webhook secret for verification
  testMode: boolean("testMode").default(true).notNull(), // Sandbox/Test mode
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PaymentGateway = typeof paymentGateways.$inferSelect;
export type InsertPaymentGateway = typeof paymentGateways.$inferInsert;
