import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, date } from "drizzle-orm/mysql-core";

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
  onboardingCompleted: boolean("onboardingCompleted").default(false).notNull(), // Has merchant completed onboarding wizard?
  onboardingStep: int("onboardingStep").default(0).notNull(), // Current onboarding step (0-4)
  onboardingCompletedAt: timestamp("onboardingCompletedAt"), // When onboarding was completed
  currency: mysqlEnum("currency", ["SAR", "USD"]).default("SAR").notNull(), // Merchant's preferred currency
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
  messagesUsed: int("messagesUsed").default(0).notNull(),
  voiceMessagesUsed: int("voiceMessagesUsed").default(0).notNull(),
  lastResetAt: timestamp("lastResetAt").defaultNow().notNull(),
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

export type WhatsAppConnection = typeof whatsappConnections.$inferSelect;
export type InsertWhatsAppConnection = typeof whatsappConnections.$inferInsert;

/**
 * Test Conversations (محادثات الاختبار) - for tracking test conversations in Test Sari page
 */
export const testConversations = mysqlTable("testConversations", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  endedAt: timestamp("endedAt"),
  messageCount: int("messageCount").default(0).notNull(),
  hasDeal: boolean("hasDeal").default(false).notNull(),
  dealValue: int("dealValue"), // in SAR
  dealMarkedAt: timestamp("dealMarkedAt"),
  satisfactionRating: int("satisfactionRating"), // 1-5 stars (CSAT)
  npsScore: int("npsScore"), // 0-10 (NPS)
  wasCompleted: boolean("wasCompleted").default(true).notNull(), // Did user complete the conversation?
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TestConversation = typeof testConversations.$inferSelect;
export type InsertTestConversation = typeof testConversations.$inferInsert;

/**
 * Test Messages (رسائل الاختبار) - individual messages in test conversations
 */
export const testMessages = mysqlTable("testMessages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  sender: mysqlEnum("sender", ["user", "sari"]).notNull(),
  content: text("content").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  responseTime: int("responseTime"), // in milliseconds (for Sari's responses)
  rating: mysqlEnum("rating", ["positive", "negative"]), // 👍/👎
  ratedAt: timestamp("ratedAt"),
  productsRecommended: text("productsRecommended"), // JSON array of product IDs
  wasClicked: boolean("wasClicked").default(false).notNull(), // Did user click on recommended products?
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TestMessage = typeof testMessages.$inferSelect;
export type InsertTestMessage = typeof testMessages.$inferInsert;

/**
 * Test Deals (الاتفاقات) - successful conversions in test conversations
 */
export const testDeals = mysqlTable("testDeals", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId"),
  merchantId: int("merchantId").notNull(),
  dealValue: int("dealValue").notNull(), // in SAR
  timeToConversion: int("timeToConversion"), // in seconds
  messageCount: int("messageCount").notNull(), // How many messages until deal?
  markedAt: timestamp("markedAt").defaultNow().notNull(),
  wasCompleted: boolean("wasCompleted").default(false).notNull(), // Did it turn into actual order?
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TestDeal = typeof testDeals.$inferSelect;
export type InsertTestDeal = typeof testDeals.$inferInsert;

/**
 * Test Metrics Daily (المقاييس اليومية) - aggregated daily metrics
 */
export const testMetricsDaily = mysqlTable("testMetricsDaily", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  date: date("date").notNull(),
  
  // Conversion metrics
  totalConversations: int("totalConversations").default(0).notNull(),
  totalDeals: int("totalDeals").default(0).notNull(),
  conversionRate: int("conversionRate").default(0).notNull(), // percentage * 100
  totalRevenue: int("totalRevenue").default(0).notNull(), // in SAR
  avgDealValue: int("avgDealValue").default(0).notNull(), // in SAR
  
  // Time metrics
  avgResponseTime: int("avgResponseTime").default(0).notNull(), // in milliseconds
  avgConversationLength: int("avgConversationLength").default(0).notNull(), // message count
  avgTimeToConversion: int("avgTimeToConversion").default(0).notNull(), // in seconds
  
  // Quality metrics
  totalMessages: int("totalMessages").default(0).notNull(),
  positiveRatings: int("positiveRatings").default(0).notNull(),
  negativeRatings: int("negativeRatings").default(0).notNull(),
  satisfactionRate: int("satisfactionRate").default(0).notNull(), // percentage * 100
  completedConversations: int("completedConversations").default(0).notNull(),
  engagementRate: int("engagementRate").default(0).notNull(), // percentage * 100
  
  // Growth metrics
  returningUsers: int("returningUsers").default(0).notNull(),
  productClicks: int("productClicks").default(0).notNull(),
  completedOrders: int("completedOrders").default(0).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TestMetricsDaily = typeof testMetricsDaily.$inferSelect;
export type InsertTestMetricsDaily = typeof testMetricsDaily.$inferInsert;

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
  purchaseCount: int("purchaseCount").default(0).notNull(), // Number of purchases
  totalSpent: int("totalSpent").default(0).notNull(), // Total amount spent (in SAR)
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
 * Campaign Logs (سجل إرسال الحملات) - Track individual message delivery status
 */
export const campaignLogs = mysqlTable("campaignLogs", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  customerId: int("customerId"), // Reference to conversations.id (optional)
  customerPhone: varchar("customerPhone", { length: 20 }).notNull(),
  customerName: varchar("customerName", { length: 255 }),
  status: mysqlEnum("status", ["success", "failed", "pending"]).default("pending").notNull(),
  errorMessage: text("errorMessage"), // Error details if failed
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CampaignLog = typeof campaignLogs.$inferSelect;
export type InsertCampaignLog = typeof campaignLogs.$inferInsert;

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
  code: varchar("code", { length: 50 }).notNull().unique(), // e.g., REF96781234
  referrerPhone: varchar("referrerPhone", { length: 20 }).notNull(), // Phone of the person who refers
  referrerName: varchar("referrerName", { length: 255 }).notNull(),
  referralCount: int("referralCount").default(0).notNull(), // How many successful referrals
  rewardGiven: boolean("rewardGiven").default(false).notNull(), // Has the 15% reward been given?
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Referrals (الإحالات الفردية)
 */
export const referrals = mysqlTable("referrals", {
  id: int("id").autoincrement().primaryKey(),
  referralCodeId: int("referralCodeId").notNull(), // FK to referral_codes
  referredPhone: varchar("referredPhone", { length: 20 }).notNull(), // Phone of referred friend
  referredName: varchar("referredName", { length: 255 }).notNull(),
  orderCompleted: boolean("orderCompleted").default(false).notNull(), // Has the friend completed an order?
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReferralCode = typeof referralCodes.$inferSelect;
export type InsertReferralCode = typeof referralCodes.$inferInsert;

export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = typeof referrals.$inferInsert;

/**
 * Rewards (المكافآت) - Track rewards earned from referrals
 */
export const rewards = mysqlTable("rewards", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(), // Merchant who earned the reward
  referralId: int("referralId").notNull(), // FK to referrals
  rewardType: mysqlEnum("rewardType", [
    "discount_10",      // 10% discount on next subscription
    "free_month",       // 1 free month added to subscription
    "analytics_upgrade" // Advanced analytics for 1 month
  ]).notNull(),
  status: mysqlEnum("status", ["pending", "claimed", "expired"]).default("pending").notNull(),
  claimedAt: timestamp("claimedAt"),
  expiresAt: timestamp("expiresAt").notNull(), // Rewards expire after 90 days
  description: text("description"), // Description of the reward
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Reward = typeof rewards.$inferSelect;
export type InsertReward = typeof rewards.$inferInsert;

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
  merchantReply: text("merchantReply"), // Merchant's reply to the review
  repliedAt: timestamp("repliedAt"), // When merchant replied
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustomerReview = typeof customerReviews.$inferSelect;
export type InsertCustomerReview = typeof customerReviews.$inferInsert;

/**
 * Order Tracking Logs (سجل تتبع الطلبات)
 */
export const orderTrackingLogs = mysqlTable("order_tracking_logs", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  oldStatus: varchar("oldStatus", { length: 50 }).notNull(),
  newStatus: varchar("newStatus", { length: 50 }).notNull(),
  trackingNumber: varchar("trackingNumber", { length: 255 }),
  notificationSent: boolean("notificationSent").default(false).notNull(),
  notificationMessage: text("notificationMessage"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OrderTrackingLog = typeof orderTrackingLogs.$inferSelect;
export type InsertOrderTrackingLog = typeof orderTrackingLogs.$inferInsert;

/**
 * Occasion Campaigns (حملات المناسبات)
 * Automatic campaigns for special occasions (Ramadan, Eid, National Day, etc.)
 */
export const occasionCampaigns = mysqlTable("occasion_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  merchantId: int("merchantId").notNull(),
  occasionType: mysqlEnum("occasionType", [
    "ramadan",           // رمضان
    "eid_fitr",          // عيد الفطر
    "eid_adha",          // عيد الأضحى
    "national_day",      // اليوم الوطني
    "new_year",          // رأس السنة الميلادية
    "hijri_new_year",    // رأس السنة الهجرية
  ]).notNull(),
  year: int("year").notNull(), // Year when campaign was sent
  enabled: boolean("enabled").default(true).notNull(), // Merchant can enable/disable
  discountCode: varchar("discountCode", { length: 50 }), // Generated discount code
  discountPercentage: int("discountPercentage").default(15).notNull(), // Default 15%
  messageTemplate: text("messageTemplate"), // Custom message template (optional)
  sentAt: timestamp("sentAt"), // When campaign was sent
  recipientCount: int("recipientCount").default(0).notNull(), // Number of recipients
  status: mysqlEnum("status", ["pending", "sent", "failed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OccasionCampaign = typeof occasionCampaigns.$inferSelect;
export type InsertOccasionCampaign = typeof occasionCampaigns.$inferInsert;


/**
 * WhatsApp Instances (إدارة instances الواتساب)
 * Supports multiple WhatsApp instances per merchant
 */
export const whatsappInstances = mysqlTable('whatsapp_instances', {
  id: int('id').primaryKey().autoincrement(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  instanceId: varchar('instance_id', { length: 255 }).notNull(),
  token: text('token').notNull(),
  apiUrl: varchar('api_url', { length: 255 }).default('https://api.green-api.com'),
  phoneNumber: varchar('phone_number', { length: 20 }),
  webhookUrl: text('webhook_url'),
  status: mysqlEnum('status', ['active', 'inactive', 'pending', 'expired']).default('pending').notNull(),
  isPrimary: boolean('is_primary').default(false).notNull(),
  lastSyncAt: timestamp('last_sync_at'),
  connectedAt: timestamp('connected_at'),
  expiresAt: timestamp('expires_at'),
  metadata: text('metadata'), // JSON string for additional data
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

export type WhatsAppInstance = typeof whatsappInstances.$inferSelect;
export type InsertWhatsAppInstance = typeof whatsappInstances.$inferInsert;


/**
 * WhatsApp Connection Requests (طلبات ربط الواتساب)
 * Stores requests from merchants to connect WhatsApp via One-Click Setup
 */
export const whatsappRequests = mysqlTable('whatsapp_requests', {
  id: int('id').primaryKey().autoincrement(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  phoneNumber: varchar('phone_number', { length: 20 }),
  businessName: varchar('business_name', { length: 255 }),
  status: mysqlEnum('status', ['pending', 'approved', 'rejected', 'completed']).default('pending').notNull(),
  
  // Green API Instance Details (filled by admin)
  instanceId: varchar('instance_id', { length: 100 }),
  token: text('token'),
  apiUrl: varchar('api_url', { length: 255 }).default('https://api.green-api.com'),
  
  // QR Code and Connection
  qrCodeUrl: text('qr_code_url'),
  qrCodeExpiresAt: timestamp('qr_code_expires_at'),
  connectedAt: timestamp('connected_at'),
  
  // Admin review
  reviewedBy: int('reviewed_by'), // Admin user ID
  reviewedAt: timestamp('reviewed_at'),
  adminNotes: text('admin_notes'),
  rejectionReason: text('rejection_reason'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

export type WhatsAppRequest = typeof whatsappRequests.$inferSelect;
export type InsertWhatsAppRequest = typeof whatsappRequests.$inferInsert;


// Order Notifications Table
export const orderNotifications = mysqlTable('order_notifications', {
  id: int('id').primaryKey().autoincrement(),
  orderId: int('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(), // pending, confirmed, shipped, delivered, cancelled
  message: text('message').notNull(),
  sent: boolean('sent').default(false),
  sentAt: timestamp('sent_at'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type OrderNotification = typeof orderNotifications.$inferSelect;
export type InsertOrderNotification = typeof orderNotifications.$inferInsert;

// Notification Templates Table
export const notificationTemplates = mysqlTable('notification_templates', {
  id: int('id').primaryKey().autoincrement(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).notNull(), // pending, confirmed, shipped, delivered, cancelled
  template: text('template').notNull(),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type NotificationTemplate = typeof notificationTemplates.$inferSelect;
export type InsertNotificationTemplate = typeof notificationTemplates.$inferInsert;


/**
 * Bot Settings (إعدادات الروبوت)
 * Customize AI bot behavior for each merchant
 */
export const botSettings = mysqlTable('bot_settings', {
  id: int('id').primaryKey().autoincrement(),
  merchantId: int('merchant_id').notNull().unique().references(() => merchants.id, { onDelete: 'cascade' }),
  
  // Auto-reply settings
  autoReplyEnabled: boolean('auto_reply_enabled').default(true).notNull(),
  
  // Working hours (24-hour format)
  workingHoursEnabled: boolean('working_hours_enabled').default(false).notNull(),
  workingHoursStart: varchar('working_hours_start', { length: 5 }).default('09:00'), // HH:MM format
  workingHoursEnd: varchar('working_hours_end', { length: 5 }).default('18:00'), // HH:MM format
  workingDays: varchar('working_days', { length: 50 }).default('1,2,3,4,5'), // 0=Sunday, 1=Monday, etc.
  
  // Messages
  welcomeMessage: text('welcome_message'), // First message to new customers
  outOfHoursMessage: text('out_of_hours_message'), // Message when outside working hours
  
  // Response behavior
  responseDelay: int('response_delay').default(2), // Delay in seconds (1-10)
  maxResponseLength: int('max_response_length').default(200), // Max characters in response
  
  // AI personality
  tone: mysqlEnum('tone', ['friendly', 'professional', 'casual']).default('friendly').notNull(),
  language: mysqlEnum('language', ['ar', 'en', 'both']).default('ar').notNull(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

export type BotSettings = typeof botSettings.$inferSelect;
export type InsertBotSettings = typeof botSettings.$inferInsert;

/**
 * Scheduled Messages - للرسائل المجدولة التلقائية
 */
export const scheduledMessages = mysqlTable('scheduled_messages', {
  id: int('id').primaryKey().autoincrement(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  
  title: varchar('title', { length: 255 }).notNull(), // عنوان الرسالة (مثل: عرض الخميس)
  message: text('message').notNull(), // محتوى الرسالة
  
  // Scheduling
  dayOfWeek: int('day_of_week').notNull(), // 0=Sunday, 1=Monday, ..., 4=Thursday, 6=Saturday
  time: varchar('time', { length: 5 }).notNull(), // HH:MM format (24-hour)
  
  // Status
  isActive: boolean('is_active').default(true).notNull(),
  lastSentAt: timestamp('last_sent_at'), // آخر مرة تم إرسال الرسالة
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

export type ScheduledMessage = typeof scheduledMessages.$inferSelect;
export type InsertScheduledMessage = typeof scheduledMessages.$inferInsert;
