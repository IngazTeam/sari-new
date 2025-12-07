import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  password: varchar("password", { length: 255 }), // For email/password login
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
  autoReplyEnabled: boolean("autoReplyEnabled").default(true).notNull(), // Enable/disable AI auto-reply
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
  sallaProductId: varchar("sallaProductId", { length: 100 }), // Salla product ID for syncing
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
  lastSyncedAt: timestamp("lastSyncedAt"), // Last time synced from Salla
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
  lastActivityAt: timestamp("lastActivityAt").defaultNow().notNull(), // For "افتقدناك" automation
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


// Invoices table
export const invoices = mysqlTable('invoices', {
  id: int('id').autoincrement().primaryKey(),
  invoiceNumber: varchar('invoice_number', { length: 50 }).notNull().unique(), // e.g., INV-2024-0001
  paymentId: int('payment_id').notNull(),
  merchantId: int('merchant_id').notNull(),
  subscriptionId: int('subscription_id'),
  amount: int('amount').notNull(), // Amount in cents
  currency: varchar('currency', { length: 10 }).notNull().default('SAR'),
  status: mysqlEnum('status', ['draft', 'sent', 'paid', 'cancelled']).notNull().default('paid'),
  pdfPath: text('pdf_path'), // S3 path to PDF file
  pdfUrl: text('pdf_url'), // Public URL to PDF
  emailSent: boolean('email_sent').notNull().default(false),
  emailSentAt: timestamp('email_sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

/**
 * Salla Store Connections (ربط متاجر سلة)
 */
export const sallaConnections = mysqlTable("salla_connections", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull().unique(), // One Salla store per merchant
  storeUrl: varchar("storeUrl", { length: 255 }).notNull(), // e.g., https://mystore.salla.sa
  accessToken: text("accessToken").notNull(), // Personal Access Token
  syncStatus: mysqlEnum("syncStatus", ["active", "syncing", "error", "paused"]).default("active").notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  syncErrors: text("syncErrors"), // JSON string of recent errors
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SallaConnection = typeof sallaConnections.$inferSelect;
export type InsertSallaConnection = typeof sallaConnections.$inferInsert;

/**
 * Sync Logs (سجل المزامنة)
 */
export const syncLogs = mysqlTable("sync_logs", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  syncType: mysqlEnum("syncType", ["full_sync", "stock_sync", "single_product"]).notNull(),
  status: mysqlEnum("status", ["success", "failed", "in_progress"]).notNull(),
  itemsSynced: int("itemsSynced").default(0).notNull(),
  errors: text("errors"), // JSON string of errors
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = typeof syncLogs.$inferInsert;

/**
 * Orders (الطلبات من الواتساب)
 */
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  sallaOrderId: varchar("sallaOrderId", { length: 100 }), // Salla order ID
  orderNumber: varchar("orderNumber", { length: 100 }), // Display order number
  customerPhone: varchar("customerPhone", { length: 20 }).notNull(),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  customerEmail: varchar("customerEmail", { length: 255 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  items: text("items").notNull(), // JSON string of order items
  totalAmount: int("totalAmount").notNull(), // Total in SAR (integer)
  discountCode: varchar("discountCode", { length: 50 }),
  status: mysqlEnum("status", ["pending", "paid", "processing", "shipped", "delivered", "cancelled"]).default("pending").notNull(),
  paymentUrl: text("paymentUrl"), // Payment link from Salla
  trackingNumber: varchar("trackingNumber", { length: 100 }),
  notes: text("notes"),
  // Gift order fields
  isGift: boolean("isGift").default(false).notNull(),
  giftRecipientName: varchar("giftRecipientName", { length: 255 }),
  giftMessage: text("giftMessage"),
  // Review request tracking
  reviewRequested: boolean("reviewRequested").default(false).notNull(),
  reviewRequestedAt: timestamp("reviewRequestedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

/**
 * Discount Codes (كودات الخصم)
 */
export const discountCodes = mysqlTable("discount_codes", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(), // e.g., WELCOME10
  type: mysqlEnum("type", ["percentage", "fixed"]).notNull(), // Percentage or fixed amount
  value: int("value").notNull(), // Percentage (10 = 10%) or amount in SAR
  minOrderAmount: int("minOrderAmount").default(0), // Minimum order amount to apply
  maxUses: int("maxUses"), // Max number of uses (null = unlimited)
  usedCount: int("usedCount").default(0).notNull(), // How many times used
  expiresAt: timestamp("expiresAt"), // Expiration date (null = no expiration)
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DiscountCode = typeof discountCodes.$inferSelect;
export type InsertDiscountCode = typeof discountCodes.$inferInsert;

/**
 * Referral Codes (كودات الإحالة)
 */
export const referralCodes = mysqlTable("referral_codes", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  customerId: int("customerId").notNull(), // Customer who owns this referral code
  code: varchar("code", { length: 50 }).notNull().unique(), // e.g., AHMED123
  discountValue: int("discountValue").notNull(), // Discount for referred friend
  rewardValue: int("rewardValue").notNull(), // Reward for referrer
  maxReferrals: int("maxReferrals").default(5).notNull(), // Max 5 friends
  referralCount: int("referralCount").default(0).notNull(), // How many used
  totalRewards: int("totalRewards").default(0).notNull(), // Total rewards earned
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReferralCode = typeof referralCodes.$inferSelect;
export type InsertReferralCode = typeof referralCodes.$inferInsert;

/**
 * Abandoned Carts (السلات المهجورة)
 */
export const abandonedCarts = mysqlTable("abandoned_carts", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  customerPhone: varchar("customerPhone", { length: 20 }).notNull(),
  customerName: varchar("customerName", { length: 255 }),
  items: text("items").notNull(), // JSON string of cart items
  totalAmount: int("totalAmount").notNull(), // Total in SAR
  reminderSent: boolean("reminderSent").default(false).notNull(),
  reminderSentAt: timestamp("reminderSentAt"),
  recovered: boolean("recovered").default(false).notNull(), // Did customer complete purchase?
  recoveredAt: timestamp("recoveredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AbandonedCart = typeof abandonedCarts.$inferSelect;
export type InsertAbandonedCart = typeof abandonedCarts.$inferInsert;

/**
 * Automation Rules (قواعد الأتمتة)
 */
export const automationRules = mysqlTable("automation_rules", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  type: mysqlEnum("type", [
    "abandoned_cart",
    "review_request",
    "order_tracking",
    "gift_notification",
    "holiday_greeting",
    "winback",
  ]).notNull(),
  isEnabled: boolean("isEnabled").default(true).notNull(),
  settings: text("settings"), // JSON string of rule settings
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AutomationRule = typeof automationRules.$inferSelect;
export type InsertAutomationRule = typeof automationRules.$inferInsert;

/**
 * Customer Reviews (التقييمات)
 */
export const customerReviews = mysqlTable("customer_reviews", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  orderId: int("orderId").notNull(),
  customerPhone: varchar("customerPhone", { length: 20 }).notNull(),
  customerName: varchar("customerName", { length: 255 }),
  rating: int("rating").notNull(), // 1-5 stars
  comment: text("comment"),
  productId: int("productId"), // Optional: review for specific product
  isPublic: boolean("isPublic").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustomerReview = typeof customerReviews.$inferSelect;
export type InsertCustomerReview = typeof customerReviews.$inferInsert;
