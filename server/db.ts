import {
  eq, and, or, desc, gte, lte, lt, gt, sql, like
} from "drizzle-orm";

// Helper function to format Date for MySQL timestamp comparison
function formatDateForDB(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
import { drizzle } from "drizzle-orm/mysql2";
import "../drizzle/relations";
import {
  InsertUser,
  users,
  merchants,
  InsertMerchant,
  Merchant,
  plans,
  Plan,
  InsertPlan,
  subscriptions,
  Subscription,
  InsertSubscription,
  whatsappConnections,
  WhatsAppConnection,
  InsertWhatsAppConnection,
  whatsappConnectionRequests,
  WhatsAppConnectionRequest,
  InsertWhatsAppConnectionRequest,
  products,
  Product,
  InsertProduct,
  conversations,
  Conversation,
  InsertConversation,
  messages,
  Message,
  InsertMessage,
  campaigns,
  Campaign,
  InsertCampaign,
  campaignLogs,
  CampaignLog,
  InsertCampaignLog,
  supportTickets,
  SupportTicket,
  InsertSupportTicket,
  analytics,
  Analytics,
  InsertAnalytics,
  notifications,
  Notification,
  InsertNotification,
  payments,
  Payment,
  InsertPayment,
  planChangeLogs,
  PlanChangeLog,
  InsertPlanChangeLog,
  paymentGateways,
  PaymentGateway,
  InsertPaymentGateway,
  invoices,
  Invoice,
  InsertInvoice,
  sallaConnections,
  SallaConnection,
  InsertSallaConnection,
  syncLogs,
  SyncLog,
  InsertSyncLog,
  orders,
  Order,
  InsertOrder,
  discountCodes,
  DiscountCode,
  InsertDiscountCode,
  referralCodes,
  ReferralCode,
  InsertReferralCode,
  referrals,
  Referral,
  InsertReferral,
  rewards,
  Reward,
  InsertReward,
  abandonedCarts,
  AbandonedCart,
  InsertAbandonedCart,
  automationRules,
  AutomationRule,
  InsertAutomationRule,
  customerReviews,
  CustomerReview,
  InsertCustomerReview,
  orderTrackingLogs,
  OrderTrackingLog,
  InsertOrderTrackingLog,
  occasionCampaigns,
  OccasionCampaign,
  InsertOccasionCampaign,
  businessTemplates,
  BusinessTemplate,
  InsertBusinessTemplate,
  templateTranslations,
  services,
  Service,
  InsertService,
  servicePackages,
  ServicePackage,
  InsertServicePackage,
  serviceCategories,
  staffMembers,
  StaffMember,
  InsertStaffMember,
  appointments,
  Appointment,
  InsertAppointment,
  serviceReviews,
  ServiceReview,
  InsertServiceReview,
  bookings,
  Booking,
  InsertBooking,
  bookingTimeSlots,
  BookingTimeSlot,
  InsertBookingTimeSlot,
  bookingReviews,
  BookingReview,
  InsertBookingReview,
  setupWizardProgress,
  SetupWizardProgress,
  InsertSetupWizardProgress,
  googleIntegrations,
  GoogleIntegration,
  InsertGoogleIntegration,
  whatsappInstances,
  WhatsAppInstance,
  InsertWhatsAppInstance,
  whatsappRequests,
  WhatsAppRequest,
  InsertWhatsAppRequest,
  orderNotifications,
  notificationTemplates,
  testConversations,
  testMessages,
  testDeals,
  testMetricsDaily,
  botSettings,
  sariPersonalitySettings,
  quickResponses,
  sentimentAnalysis,
  keywordAnalysis,
  weeklySentimentReports,
  abTestResults,
  passwordResetTokens,
  passwordResetAttempts,
  trySariAnalytics,
  limitedTimeOffers,
  signupPromptVariants,
  signupPromptTestResults,
  seoPages,
  SeoPage,
  InsertSeoPage,
  seoKeywords,
  SeoKeyword,
  InsertSeoKeyword,
  seoRankings,
  SeoRanking,
  InsertSeoRanking,
  seoBacklinks,
  SeoBacklink,
  InsertSeoBacklink,
  seoPerformanceAlerts,
  SeoPerformanceAlert,
  InsertSeoPerformanceAlert,
  seoRecommendations,
  SeoRecommendation,
  InsertSeoRecommendation,
  seoSitemaps,
  SeoSitemap,
  InsertSeoSitemap,
  emailVerificationTokens,
  EmailVerificationToken,
  InsertEmailVerificationToken,
  merchantPaymentSettings,
  MerchantPaymentSettings,
  InsertMerchantPaymentSettings,
  platformIntegrations,
  PlatformIntegration,
  InsertPlatformIntegration,
  loyaltyPoints,
  LoyaltyPoints,
  InsertLoyaltyPoints,
  loyaltySettings,
  LoyaltySettings,
  InsertLoyaltySettings,
  loyaltyTiers,
  LoyaltyTier,
  InsertLoyaltyTier,
  loyaltyTransactions,
  LoyaltyTransaction,
  InsertLoyaltyTransaction,
  loyaltyRewards,
  LoyaltyReward,
  InsertLoyaltyReward,
  websiteAnalyses,
  websiteInsights,
  extractedProducts,
  competitorAnalyses,
  competitorProducts,
  discoveredPages,
  extractedFaqs,
  zidSettings,
  zidProducts,
  zidOrders,
  zidWebhooks,
  zidSyncLogs,
  woocommerceSettings,
  woocommerceProducts,
  woocommerceOrders,
  woocommerceSyncLogs,
  woocommerceWebhooks,
  NewWooCommerceSettings,
  NewWooCommerceProduct,
  NewWooCommerceOrder,
  NewWooCommerceSyncLog,
  NewWooCommerceWebhook,
  subscriptionPlans,
  SubscriptionPlan,
  NewSubscriptionPlan,
  subscriptionAddons,
  SubscriptionAddon,
  NewSubscriptionAddon,
  merchantSubscriptions,
  MerchantSubscription,
  NewMerchantSubscription,
  merchantAddons,
  MerchantAddon,
  NewMerchantAddon,
  paymentTransactions,
  PaymentTransaction,
  NewPaymentTransaction,
  tapSettings,
  TapSettings,
  NewTapSettings,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================
// User Management
// ============================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Trial Period Management
export async function activateUserTrial(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const trialStartDate = new Date();
  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 7); // 7 days trial

  // Format dates as MySQL-compatible TIMESTAMP strings (YYYY-MM-DD HH:MM:SS)
  const formatDate = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

  await db.update(users)
    .set({
      trialStartDate: formatDate(trialStartDate),
      trialEndDate: formatDate(trialEndDate),
      isTrialActive: 1,
    })
    .where(eq(users.id, userId));

  return true;
}

export async function deactivateUserTrial(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.update(users)
    .set({
      isTrialActive: 0,
    })
    .where(eq(users.id, userId));

  return true;
}

export async function updateWhatsAppConnectionStatus(userId: number, connected: boolean): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.update(users)
    .set({
      whatsappConnected: connected ? 1 : 0,
    })
    .where(eq(users.id, userId));

  return true;
}

export async function getUsersWithExpiringTrial(daysUntilExpiry: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysUntilExpiry);

  // Get users whose trial expires within the specified days
  const result = await db.select()
    .from(users)
    .where(
      and(
        eq(users.isTrialActive, 1),
        lte(users.trialEndDate, targetDate.toISOString()),
        gte(users.trialEndDate, now.toISOString())
      )
    );

  return result;
}

export async function getUsersWithExpiredTrial(): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();

  const result = await db.select()
    .from(users)
    .where(
      and(
        eq(users.isTrialActive, 1),
        lt(users.trialEndDate, now.toISOString())
      )
    );

  return result;
}

export async function updateUserLastSignedIn(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

export async function createUser(data: InsertUser) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.insert(users).values(data);
  const insertId = Number(result[0].insertId);
  return await getUserById(insertId);
}

export async function updateUser(id: number | string, data: Partial<InsertUser>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const userId = typeof id === 'string' ? parseInt(id) : id;
  await db.update(users).set(data).where(eq(users.id, userId));
}

// ============================================
// Merchant Management
// ============================================

export async function createMerchant(merchant: InsertMerchant): Promise<Merchant | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(merchants).values(merchant);
  const insertedId = Number(result[0].insertId);

  return getMerchantById(insertedId);
}

export async function getMerchantById(id: number): Promise<Merchant | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(merchants).where(eq(merchants.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getMerchantByUserId(userId: number): Promise<Merchant | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(merchants).where(eq(merchants.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllMerchants(): Promise<Merchant[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(merchants).orderBy(desc(merchants.createdAt));
}

export async function updateMerchant(id: number, data: Partial<InsertMerchant>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(merchants).set(data).where(eq(merchants.id, id));
}

/**
 * Get onboarding status for a merchant
 */
export async function getOnboardingStatus(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  const merchant = await getMerchantById(merchantId);
  if (!merchant) throw new Error('Merchant not found');

  return {
    completed: merchant.onboardingCompleted,
    currentStep: merchant.onboardingStep,
    completedAt: merchant.onboardingCompletedAt,
  };
}

/**
 * Update onboarding step for a merchant
 */
export async function updateOnboardingStep(merchantId: number, step: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  await db.update(merchants)
    .set({ onboardingStep: step })
    .where(eq(merchants.id, merchantId));
}

/**
 * Mark onboarding as completed for a merchant
 */
export async function completeOnboarding(merchantId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  await db.update(merchants)
    .set({
      onboardingCompleted: true,
      onboardingStep: 4,
      onboardingCompletedAt: new Date(),
    })
    .where(eq(merchants.id, merchantId));
}

// ============================================
// Plan Management
// ============================================

export async function createPlan(plan: InsertPlan): Promise<Plan | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(plans).values(plan);
  const insertedId = Number(result[0].insertId);

  return getPlanById(insertedId);
}

export async function getPlanById(id: number): Promise<Plan | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllPlans(): Promise<Plan[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.priceMonthly);
}

export async function updatePlan(id: number, data: Partial<InsertPlan>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(plans).set(data).where(eq(plans.id, id));
}

// ============================================
// Subscription Management
// ============================================

export async function createSubscription(subscription: InsertSubscription): Promise<Subscription | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(subscriptions).values(subscription);
  const insertedId = Number(result[0].insertId);

  return getSubscriptionById(insertedId);
}

export async function getSubscriptionById(id: number): Promise<Subscription | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getActiveSubscriptionByMerchantId(merchantId: number): Promise<Subscription | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.merchantId, merchantId), eq(subscriptions.status, "active")))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateSubscription(id: number, data: Partial<InsertSubscription>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(subscriptions).set(data).where(eq(subscriptions.id, id));
}

export async function incrementSubscriptionUsage(
  subscriptionId: number,
  conversationIncrement: number = 0,
  voiceMessageIncrement: number = 0
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(subscriptions)
    .set({
      conversationsUsed: sql`${subscriptions.conversationsUsed} + ${conversationIncrement}`,
      voiceMessagesUsed: sql`${subscriptions.voiceMessagesUsed} + ${voiceMessageIncrement}`,
    })
    .where(eq(subscriptions.id, subscriptionId));
}

// ============================================
// WhatsApp Connection Management
// ============================================

export async function createWhatsappConnection(
  connection: InsertWhatsAppConnection
): Promise<WhatsAppConnection | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(whatsappConnections).values(connection);
  const insertedId = Number(result[0].insertId);

  return getWhatsappConnectionById(insertedId);
}

export async function getWhatsappConnectionById(id: number): Promise<WhatsAppConnection | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(whatsappConnections).where(eq(whatsappConnections.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getWhatsappConnectionByMerchantId(merchantId: number): Promise<WhatsAppConnection | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(whatsappConnections)
    .where(eq(whatsappConnections.merchantId, merchantId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateWhatsappConnection(id: number, data: Partial<InsertWhatsAppConnection>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(whatsappConnections).set(data).where(eq(whatsappConnections.id, id));
}

// ============================================
// Product Management
// ============================================

export async function createProduct(product: InsertProduct): Promise<Product | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(products).values(product);
  const insertedId = Number(result[0].insertId);

  return getProductById(insertedId);
}

export async function getProductById(id: number): Promise<Product | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getProductsByMerchantId(merchantId: number): Promise<Product[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(products).where(eq(products.merchantId, merchantId)).orderBy(desc(products.createdAt));
}

export async function getActiveProductsByMerchantId(merchantId: number): Promise<Product[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(products)
    .where(and(eq(products.merchantId, merchantId), eq(products.isActive, true)))
    .orderBy(desc(products.createdAt));
}

export async function updateProduct(id: number, data: Partial<InsertProduct>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(products).set(data).where(eq(products.id, id));
}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(products).where(eq(products.id, id));
}

export async function bulkCreateProducts(productList: InsertProduct[]): Promise<void> {
  const db = await getDb();
  if (!db) return;

  if (productList.length === 0) return;

  await db.insert(products).values(productList);
}

// ============================================
// Conversation Management
// ============================================

export async function createConversation(conversation: InsertConversation): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  // Check if conversation already exists for this customer
  const existingConversation = await getConversationByMerchantAndPhone(
    conversation.merchantId,
    conversation.customerPhone
  );

  // If new customer, check subscription limits
  if (!existingConversation) {
    const { checkCustomerLimit } = await import('./helpers/subscriptionGuard');
    await checkCustomerLimit(conversation.merchantId, conversation.customerPhone);

    // Check and notify if approaching limit (80%)
    const { checkAndNotifyLimits } = await import('./helpers/notificationHelper');
    await checkAndNotifyLimits(conversation.merchantId);
  }

  const result = await db.insert(conversations).values(conversation);
  const insertedId = Number(result[0].insertId);

  return getConversationById(insertedId);
}

export async function getConversationById(id: number): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getConversationByMerchantAndPhone(
  merchantId: number,
  customerPhone: string
): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.merchantId, merchantId), eq(conversations.customerPhone, customerPhone)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getConversationsByMerchantId(merchantId: number): Promise<Conversation[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(conversations)
    .where(eq(conversations.merchantId, merchantId))
    .orderBy(desc(conversations.lastMessageAt));
}

export async function updateConversation(id: number, data: Partial<InsertConversation>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(conversations).set(data).where(eq(conversations.id, id));
}

// ============================================
// Message Management
// ============================================

export async function createMessage(message: InsertMessage): Promise<Message | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(messages).values(message);
  const insertedId = Number(result[0].insertId);

  // Update conversation's lastMessageAt
  const msg = await getMessageById(insertedId);
  if (msg) {
    const conversation = await getConversationById(msg.conversationId);
    if (conversation) {
      await updateConversation(conversation.id, { lastMessageAt: new Date() });
    }
  }

  return msg;
}

export async function getMessageById(id: number): Promise<Message | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getMessagesByConversationId(conversationId: number): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
}

export async function updateMessage(id: number, data: Partial<InsertMessage>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(messages).set(data).where(eq(messages.id, id));
}

// ============================================
// Campaign Management
// ============================================

export async function createCampaign(campaign: InsertCampaign): Promise<Campaign | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(campaigns).values(campaign);
  const insertedId = Number(result[0].insertId);

  return getCampaignById(insertedId);
}

export async function getCampaignById(id: number): Promise<Campaign | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getCampaignsByMerchantId(merchantId: number): Promise<Campaign[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(campaigns).where(eq(campaigns.merchantId, merchantId)).orderBy(desc(campaigns.createdAt));
}

export async function getAllCampaigns(): Promise<Campaign[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
}

export async function getAllCampaignsWithMerchants() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      message: campaigns.message,
      status: campaigns.status,
      scheduledAt: campaigns.scheduledAt,
      totalRecipients: campaigns.totalRecipients,
      sentCount: campaigns.sentCount,
      createdAt: campaigns.createdAt,
      updatedAt: campaigns.updatedAt,
      merchantId: campaigns.merchantId,
      merchantName: merchants.businessName,
      merchantPhone: merchants.phone,
    })
    .from(campaigns)
    .leftJoin(merchants, eq(campaigns.merchantId, merchants.id))
    .orderBy(desc(campaigns.createdAt));
}

export async function updateCampaign(id: number, data: Partial<InsertCampaign>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(campaigns).set(data).where(eq(campaigns.id, id));
}

// ============================================
// Campaign Logs Management
// ============================================

/**
 * Create a campaign log entry
 */
export async function createCampaignLog(log: InsertCampaignLog): Promise<CampaignLog | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(campaignLogs).values(log);
  const insertedId = Number(result[0].insertId);

  return getCampaignLogById(insertedId);
}

/**
 * Get campaign log by ID
 */
export async function getCampaignLogById(id: number): Promise<CampaignLog | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(campaignLogs).where(eq(campaignLogs.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get all logs for a specific campaign
 */
export async function getCampaignLogsByCampaignId(campaignId: number): Promise<CampaignLog[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(campaignLogs)
    .where(eq(campaignLogs.campaignId, campaignId))
    .orderBy(desc(campaignLogs.sentAt));
}

/**
 * Get campaign logs with statistics
 */
export async function getCampaignLogsWithStats(campaignId: number) {
  const db = await getDb();
  if (!db) return { logs: [], stats: { total: 0, success: 0, failed: 0, pending: 0, successRate: 0 } };

  const logs = await getCampaignLogsByCampaignId(campaignId);

  const stats = {
    total: logs.length,
    success: logs.filter(log => log.status === 'success').length,
    failed: logs.filter(log => log.status === 'failed').length,
    pending: logs.filter(log => log.status === 'pending').length,
    successRate: logs.length > 0 ? Math.round((logs.filter(log => log.status === 'success').length / logs.length) * 100) : 0
  };

  return { logs, stats };
}

/**
 * Update campaign log status
 */
export async function updateCampaignLog(id: number, data: Partial<InsertCampaignLog>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(campaignLogs).set(data).where(eq(campaignLogs.id, id));
}

// ============================================
// Support Ticket Management
// ============================================

export async function createSupportTicket(ticket: InsertSupportTicket): Promise<SupportTicket | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(supportTickets).values(ticket);
  const insertedId = Number(result[0].insertId);

  return getSupportTicketById(insertedId);
}

export async function getSupportTicketById(id: number): Promise<SupportTicket | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getSupportTicketsByMerchantId(merchantId: number): Promise<SupportTicket[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.merchantId, merchantId))
    .orderBy(desc(supportTickets.createdAt));
}

export async function getAllSupportTickets(): Promise<SupportTicket[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
}

export async function updateSupportTicket(id: number, data: Partial<InsertSupportTicket>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(supportTickets).set(data).where(eq(supportTickets.id, id));
}

// ============================================
// Payment Management
// ============================================

export async function createPayment(payment: InsertPayment): Promise<Payment | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(payments).values(payment);
  const insertedId = Number(result[0].insertId);

  return getPaymentById(insertedId);
}

export async function getPaymentById(id: number): Promise<Payment | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getPaymentsByMerchantId(merchantId: number): Promise<Payment[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(payments).where(eq(payments.merchantId, merchantId)).orderBy(desc(payments.createdAt));
}

export async function getAllPayments(): Promise<Payment[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(payments).orderBy(desc(payments.createdAt));
}

export async function updatePayment(id: number, data: Partial<InsertPayment>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(payments).set(data).where(eq(payments.id, id));
}

// ============================================
// Analytics Management
// ============================================

export async function createAnalytics(analytics_data: InsertAnalytics): Promise<Analytics | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(analytics).values(analytics_data);
  const insertedId = Number(result[0].insertId);

  const inserted = await db.select().from(analytics).where(eq(analytics.id, insertedId)).limit(1);
  return inserted.length > 0 ? inserted[0] : undefined;
}

export async function getAnalyticsByMerchantId(
  merchantId: number,
  startDate?: Date,
  endDate?: Date
): Promise<Analytics[]> {
  const db = await getDb();
  if (!db) return [];

  if (startDate && endDate) {
    return db
      .select()
      .from(analytics)
      .where(and(eq(analytics.merchantId, merchantId), gte(analytics.date, formatDateForDB(startDate)), lte(analytics.date, formatDateForDB(endDate))))
      .orderBy(desc(analytics.date));
  }

  return db.select().from(analytics).where(eq(analytics.merchantId, merchantId)).orderBy(desc(analytics.date));
}


// Notifications functions
export async function getNotificationsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function getUnreadNotificationsCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

  return result.length;
}

export async function markNotificationAsRead(notificationId: number, userId: number) {
  const db = await getDb();
  if (!db) return false;

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));

  return true;
}

export async function markAllNotificationsAsRead(userId: number) {
  const db = await getDb();
  if (!db) return false;

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, userId));

  return true;
}

export async function deleteNotification(notificationId: number, userId: number) {
  const db = await getDb();
  if (!db) return false;

  await db
    .delete(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));

  return true;
}

export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(notifications).values(data);
  return result;
}


// WhatsApp connection functions
export async function getWhatsappConnectionByPhone(phoneNumber: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(whatsappConnections)
    .where(eq(whatsappConnections.phoneNumber, phoneNumber))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function getConversationByCustomerPhone(merchantId: number, customerPhone: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.merchantId, merchantId), eq(conversations.customerPhone, customerPhone)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}


// ============================================
// Plan Change Logs Management
// ============================================

export async function createPlanChangeLog(log: InsertPlanChangeLog): Promise<PlanChangeLog | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(planChangeLogs).values(log);
  const insertedId = Number(result[0].insertId);

  const inserted = await db.select().from(planChangeLogs).where(eq(planChangeLogs.id, insertedId)).limit(1);
  return inserted.length > 0 ? inserted[0] : undefined;
}

export async function getPlanChangeLogs(planId?: number): Promise<PlanChangeLog[]> {
  const db = await getDb();
  if (!db) return [];

  if (planId) {
    return db
      .select()
      .from(planChangeLogs)
      .where(eq(planChangeLogs.planId, planId))
      .orderBy(desc(planChangeLogs.createdAt));
  }

  return db.select().from(planChangeLogs).orderBy(desc(planChangeLogs.createdAt)).limit(100);
}

export async function getAllPlanChangeLogs(): Promise<PlanChangeLog[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(planChangeLogs).orderBy(desc(planChangeLogs.createdAt)).limit(100);
}


// ============================================
// WhatsApp Connection Requests Management
// ============================================

export async function createWhatsAppConnectionRequest(request: InsertWhatsAppConnectionRequest): Promise<WhatsAppConnectionRequest | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(whatsappConnectionRequests).values(request);
  const insertedId = Number(result[0].insertId);

  const inserted = await db.select().from(whatsappConnectionRequests).where(eq(whatsappConnectionRequests.id, insertedId)).limit(1);
  return inserted.length > 0 ? inserted[0] : undefined;
}

export async function getWhatsAppConnectionRequestById(id: number): Promise<WhatsAppConnectionRequest | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(whatsappConnectionRequests).where(eq(whatsappConnectionRequests.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getWhatsAppConnectionRequestByMerchantId(merchantId: number): Promise<WhatsAppConnectionRequest | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(whatsappConnectionRequests)
    .where(eq(whatsappConnectionRequests.merchantId, merchantId))
    .orderBy(desc(whatsappConnectionRequests.createdAt))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getAllWhatsAppConnectionRequests(status?: "pending" | "approved" | "rejected"): Promise<WhatsAppConnectionRequest[]> {
  const db = await getDb();
  if (!db) return [];

  if (status) {
    return db
      .select()
      .from(whatsappConnectionRequests)
      .where(eq(whatsappConnectionRequests.status, status))
      .orderBy(desc(whatsappConnectionRequests.createdAt));
  }

  return db.select().from(whatsappConnectionRequests).orderBy(desc(whatsappConnectionRequests.createdAt));
}

export async function updateWhatsAppConnectionRequest(
  id: number,
  data: Partial<InsertWhatsAppConnectionRequest>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(whatsappConnectionRequests).set(data).where(eq(whatsappConnectionRequests.id, id));
}

export async function approveWhatsAppConnectionRequest(
  id: number,
  reviewedBy: number,
  instanceId?: string,
  apiToken?: string,
  apiUrl?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(whatsappConnectionRequests).set({
    status: 'approved',
    reviewedBy,
    reviewedAt: new Date(),
    instanceId: instanceId || undefined,
    apiToken: apiToken || undefined,
    apiUrl: apiUrl || 'https://api.green-api.com',
  }).where(eq(whatsappConnectionRequests.id, id));
}

export async function rejectWhatsAppConnectionRequest(
  id: number,
  reviewedBy: number,
  rejectionReason: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(whatsappConnectionRequests).set({
    status: 'rejected',
    reviewedBy,
    reviewedAt: new Date(),
    rejectionReason,
  }).where(eq(whatsappConnectionRequests.id, id));
}

export async function deleteWhatsAppConnectionRequest(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(whatsappConnectionRequests).where(eq(whatsappConnectionRequests.id, id));
}


// ============================================
// Payment Gateways Functions
// ============================================

export async function createOrUpdatePaymentGateway(gateway: InsertPaymentGateway): Promise<PaymentGateway | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  // Check if gateway already exists
  const existing = await db.select().from(paymentGateways).where(eq(paymentGateways.gateway, gateway.gateway)).limit(1);

  if (existing.length > 0) {
    // Update existing gateway
    await db.update(paymentGateways)
      .set({
        ...gateway,
        updatedAt: new Date(),
      })
      .where(eq(paymentGateways.gateway, gateway.gateway));

    return getPaymentGatewayByName(gateway.gateway);
  } else {
    // Create new gateway
    const result = await db.insert(paymentGateways).values(gateway);
    const insertedId = Number(result[0].insertId);
    return getPaymentGatewayById(insertedId);
  }
}

export async function getPaymentGatewayById(id: number): Promise<PaymentGateway | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(paymentGateways).where(eq(paymentGateways.id, id)).limit(1);
  return result[0];
}

export async function getPaymentGatewayByName(gateway: 'tap' | 'paypal'): Promise<PaymentGateway | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(paymentGateways).where(eq(paymentGateways.gateway, gateway)).limit(1);
  return result[0];
}

export async function getAllPaymentGateways(): Promise<PaymentGateway[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(paymentGateways);
}

export async function getEnabledPaymentGateways(): Promise<PaymentGateway[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(paymentGateways).where(eq(paymentGateways.isEnabled, true));
}

// ============================================
// Additional Payment Functions
// ============================================

export async function getPaymentByTransactionId(transactionId: string): Promise<Payment | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(payments).where(eq(payments.transactionId, transactionId)).limit(1);
  return result[0];
}

export async function updatePaymentStatus(id: number, status: 'pending' | 'completed' | 'failed' | 'refunded', transactionId?: string): Promise<Payment | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'completed') {
    updateData.paidAt = new Date();
  }

  if (transactionId) {
    updateData.transactionId = transactionId;
  }

  await db.update(payments).set(updateData).where(eq(payments.id, id));

  return getPaymentById(id);
}


// ============================================
// Invoice Functions
// ============================================

export async function createInvoice(invoice: InsertInvoice): Promise<Invoice | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  await db.insert(invoices).values(invoice);
  return getInvoiceByNumber(invoice.invoiceNumber);
}

export async function getInvoiceById(id: number): Promise<Invoice | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return result[0];
}

export async function getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(invoices).where(eq(invoices.invoiceNumber, invoiceNumber)).limit(1);
  return result[0];
}

export async function getInvoicesByMerchantId(merchantId: number): Promise<Invoice[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(invoices).where(eq(invoices.merchantId, merchantId)).orderBy(desc(invoices.createdAt));
}

export async function getAllInvoices(): Promise<Invoice[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(invoices).orderBy(desc(invoices.createdAt));
}

export async function updateInvoice(id: number, data: Partial<InsertInvoice>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(invoices).set(data).where(eq(invoices.id, id));
}

export async function generateInvoiceNumber(): Promise<string> {
  const db = await getDb();
  if (!db) return `INV-${new Date().getFullYear()}-0001`;

  // Get the latest invoice number for this year
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const result = await db
    .select()
    .from(invoices)
    .where(sql`${invoices.invoiceNumber} LIKE ${prefix + '%'}`)
    .orderBy(desc(invoices.invoiceNumber))
    .limit(1);

  if (result.length === 0) {
    return `${prefix}0001`;
  }

  const lastNumber = result[0].invoiceNumber.split('-')[2];
  const nextNumber = (parseInt(lastNumber) + 1).toString().padStart(4, '0');
  return `${prefix}${nextNumber}`;
}


// ============================================
// Salla Integration Functions
// ============================================

export async function createSallaConnection(connection: InsertSallaConnection): Promise<SallaConnection | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  await db.insert(sallaConnections).values(connection);
  return getSallaConnectionByMerchantId(connection.merchantId);
}

export async function getSallaConnectionByMerchantId(merchantId: number): Promise<SallaConnection | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(sallaConnections).where(eq(sallaConnections.merchantId, merchantId)).limit(1);
  return result[0];
}

export async function updateSallaConnection(merchantId: number, data: Partial<InsertSallaConnection>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(sallaConnections).set({
    ...data,
    updatedAt: new Date()
  }).where(eq(sallaConnections.merchantId, merchantId));
}

export async function deleteSallaConnection(merchantId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(sallaConnections).where(eq(sallaConnections.merchantId, merchantId));
}

export async function getAllSallaConnections(): Promise<SallaConnection[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(sallaConnections).where(eq(sallaConnections.syncStatus, 'active'));
}

// ============================================
// Sync Logs Functions
// ============================================

export async function createSyncLog(merchantId: number, syncType: 'full_sync' | 'stock_sync' | 'single_product', status: 'success' | 'failed' | 'in_progress'): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.insert(syncLogs).values({
    merchantId,
    syncType,
    status,
    itemsSynced: 0,
    startedAt: new Date()
  });

  return result[0].insertId;
}

export async function updateSyncLog(id: number, status: 'success' | 'failed', itemsSynced: number, errors?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(syncLogs).set({
    status,
    itemsSynced,
    errors,
    completedAt: new Date()
  }).where(eq(syncLogs.id, id));
}

export async function getSyncLogsByMerchantId(merchantId: number, limit: number = 50): Promise<SyncLog[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(syncLogs).where(eq(syncLogs.merchantId, merchantId)).orderBy(desc(syncLogs.startedAt)).limit(limit);
}

// ============================================
// Products - Salla Integration Functions
// ============================================

export async function getProductBySallaId(merchantId: number, sallaProductId: string): Promise<Product | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(products).where(
    and(
      eq(products.merchantId, merchantId),
      eq(products.sallaProductId, sallaProductId)
    )
  ).limit(1);

  return result[0];
}

export async function getProductsWithSallaId(merchantId: number): Promise<Product[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(products).where(
    and(
      eq(products.merchantId, merchantId),
      sql`${products.sallaProductId} IS NOT NULL`
    )
  );
}

export async function updateProductStock(productId: number, stock: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(products).set({
    stock,
    isActive: stock > 0,
    lastSyncedAt: new Date(),
    updatedAt: new Date()
  }).where(eq(products.id, productId));
}

// ============================================
// Orders Functions
// ============================================

export async function createOrder(order: InsertOrder): Promise<Order | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(orders).values(order);
  return getOrderById(result[0].insertId);
}

export async function getOrderById(id: number): Promise<Order | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return result[0];
}

export async function getOrderBySallaId(merchantId: number, sallaOrderId: string): Promise<Order | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(orders).where(
    and(
      eq(orders.merchantId, merchantId),
      eq(orders.sallaOrderId, sallaOrderId)
    )
  ).limit(1);

  return result[0];
}

export async function getOrdersByMerchantId(merchantId: number): Promise<Order[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(orders).where(eq(orders.merchantId, merchantId)).orderBy(desc(orders.createdAt));
}

export async function updateOrderStatus(id: number, status: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled', trackingNumber?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const updateData: any = {
    status,
    updatedAt: new Date()
  };

  if (trackingNumber) {
    updateData.trackingNumber = trackingNumber;
  }

  await db.update(orders).set(updateData).where(eq(orders.id, id));
}

export async function updateOrderBySallaId(merchantId: number, sallaOrderId: string, data: Partial<InsertOrder>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(orders).set({
    ...data,
    updatedAt: new Date()
  }).where(
    and(
      eq(orders.merchantId, merchantId),
      eq(orders.sallaOrderId, sallaOrderId)
    )
  );
}


// ============================================
// Discount Codes Functions
// ============================================

export async function createDiscountCode(data: InsertDiscountCode): Promise<DiscountCode | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(discountCodes).values(data);
  const id = Number(result[0].insertId);

  return getDiscountCodeById(id);
}

export async function getDiscountCodeById(id: number): Promise<DiscountCode | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(discountCodes).where(eq(discountCodes.id, id)).limit(1);
  return result[0];
}

export async function getDiscountCodeByCode(code: string): Promise<DiscountCode | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(discountCodes).where(eq(discountCodes.code, code.toUpperCase())).limit(1);
  return result[0];
}

export async function getDiscountCodesByMerchantId(merchantId: number): Promise<DiscountCode[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(discountCodes).where(eq(discountCodes.merchantId, merchantId)).orderBy(desc(discountCodes.createdAt));
}

export async function updateDiscountCode(id: number, data: Partial<InsertDiscountCode>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(discountCodes).set({
    ...data,
    updatedAt: new Date()
  }).where(eq(discountCodes.id, id));
}

export async function incrementDiscountCodeUsage(code: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const discountCode = await getDiscountCodeByCode(code);
  if (!discountCode) return;

  await db.update(discountCodes).set({
    usedCount: discountCode.usedCount + 1,
    updatedAt: new Date()
  }).where(eq(discountCodes.id, discountCode.id));
}

export async function deleteDiscountCode(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(discountCodes).where(eq(discountCodes.id, id));
}

// ============================================
// Referral Codes Functions
// ============================================

export async function createReferralCode(data: InsertReferralCode): Promise<ReferralCode | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(referralCodes).values(data);
  const id = Number(result[0].insertId);

  return getReferralCodeById(id);
}

export async function getReferralCodeById(id: number): Promise<ReferralCode | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(referralCodes).where(eq(referralCodes.id, id)).limit(1);
  return result[0];
}

export async function getReferralCodeByCode(code: string): Promise<ReferralCode | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(referralCodes).where(eq(referralCodes.code, code.toUpperCase())).limit(1);
  return result[0];
}

export async function getReferralCodeByPhone(merchantId: number, phone: string): Promise<ReferralCode | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(referralCodes).where(
    and(
      eq(referralCodes.merchantId, merchantId),
      eq(referralCodes.referrerPhone, phone)
    )
  ).limit(1);

  return result[0];
}

export async function incrementReferralCount(id: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const referralCode = await getReferralCodeById(id);
  if (!referralCode) return 0;

  const newCount = referralCode.referralCount + 1;

  await db.update(referralCodes).set({
    referralCount: newCount,
    updatedAt: new Date()
  }).where(eq(referralCodes.id, id));

  return newCount;
}

export async function markReferralRewardGiven(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(referralCodes).set({
    rewardGiven: true,
    updatedAt: new Date()
  }).where(eq(referralCodes.id, id));
}

// ============================================
// Abandoned Carts Functions
// ============================================

export async function createAbandonedCart(data: InsertAbandonedCart): Promise<AbandonedCart | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(abandonedCarts).values(data);
  const id = Number(result[0].insertId);

  return getAbandonedCartById(id);
}

export async function getAbandonedCartById(id: number): Promise<AbandonedCart | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(abandonedCarts).where(eq(abandonedCarts.id, id)).limit(1);
  return result[0];
}

export async function getAbandonedCartsByMerchantId(merchantId: number): Promise<AbandonedCart[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(abandonedCarts).where(eq(abandonedCarts.merchantId, merchantId)).orderBy(desc(abandonedCarts.createdAt));
}

export async function getPendingAbandonedCarts(): Promise<AbandonedCart[]> {
  const db = await getDb();
  if (!db) return [];

  // Get carts created more than 24 hours ago that haven't received reminder
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return db.select().from(abandonedCarts).where(
    and(
      eq(abandonedCarts.reminderSent, false),
      eq(abandonedCarts.recovered, false),
      lt(abandonedCarts.createdAt, twentyFourHoursAgo)
    )
  ).limit(50);
}

export async function markAbandonedCartReminderSent(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(abandonedCarts).set({
    reminderSent: true,
    reminderSentAt: new Date(),
    updatedAt: new Date()
  }).where(eq(abandonedCarts.id, id));
}

export async function markAbandonedCartRecovered(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(abandonedCarts).set({
    recovered: true,
    recoveredAt: new Date(),
    updatedAt: new Date()
  }).where(eq(abandonedCarts.id, id));
}

// ============================================
// Automation Rules Functions
// ============================================

export async function createAutomationRule(data: InsertAutomationRule): Promise<AutomationRule | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(automationRules).values(data);
  const id = Number(result[0].insertId);

  return getAutomationRuleById(id);
}

export async function getAutomationRuleById(id: number): Promise<AutomationRule | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(automationRules).where(eq(automationRules.id, id)).limit(1);
  return result[0];
}

export async function getAutomationRuleByType(merchantId: number, type: string): Promise<AutomationRule | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(automationRules).where(
    and(
      eq(automationRules.merchantId, merchantId),
      eq(automationRules.type, type as any)
    )
  ).limit(1);

  return result[0];
}

export async function getAutomationRulesByMerchantId(merchantId: number): Promise<AutomationRule[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(automationRules).where(eq(automationRules.merchantId, merchantId));
}

export async function updateAutomationRule(id: number, data: Partial<InsertAutomationRule>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(automationRules).set({
    ...data,
    updatedAt: new Date()
  }).where(eq(automationRules.id, id));
}

// ============================================
// Customer Reviews Functions
// ============================================

export async function createCustomerReview(data: InsertCustomerReview): Promise<CustomerReview | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(customerReviews).values(data);
  const id = Number(result[0].insertId);

  return getCustomerReviewById(id);
}

export async function getCustomerReviewById(id: number): Promise<CustomerReview | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(customerReviews).where(eq(customerReviews.id, id)).limit(1);
  return result[0];
}

export async function getCustomerReviewsByMerchantId(merchantId: number): Promise<CustomerReview[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(customerReviews).where(eq(customerReviews.merchantId, merchantId)).orderBy(desc(customerReviews.createdAt));
}

export async function getCustomerReviewsByOrderId(orderId: number): Promise<CustomerReview[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(customerReviews).where(eq(customerReviews.orderId, orderId));
}

export async function getPublicReviews(merchantId: number, limit: number = 10): Promise<CustomerReview[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(customerReviews).where(
    and(
      eq(customerReviews.merchantId, merchantId),
      eq(customerReviews.isPublic, true)
    )
  ).orderBy(desc(customerReviews.createdAt)).limit(limit);
}

export async function updateCustomerReview(id: number, data: Partial<InsertCustomerReview>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(customerReviews).set({
    ...data,
    updatedAt: new Date()
  }).where(eq(customerReviews.id, id));
}

// ============================================
// Orders - Additional Functions for Automation
// ============================================

export async function getOrdersForReviewRequest(): Promise<Order[]> {
  const db = await getDb();
  if (!db) return [];

  // Get delivered orders from 3 days ago that haven't received review request
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

  return db.select().from(orders).where(
    and(
      eq(orders.status, 'delivered'),
      eq(orders.reviewRequested, false),
      gte(orders.updatedAt, fourDaysAgo),
      lte(orders.updatedAt, threeDaysAgo)
    )
  ).limit(50);
}

export async function markOrderReviewRequested(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(orders).set({
    reviewRequested: true,
    reviewRequestedAt: new Date(),
    updatedAt: new Date()
  }).where(eq(orders.id, id));
}

// ============================================
// Conversations - Additional Functions for Automation
// ============================================

export async function getInactiveConversations(days: number = 30): Promise<Conversation[]> {
  const db = await getDb();
  if (!db) return [];

  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return db.select().from(conversations).where(
    and(
      eq(conversations.status, 'active'),
      lt(conversations.lastActivityAt, cutoffDate)
    )
  ).limit(100);
}

export async function updateConversationActivity(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(conversations).set({
    lastActivityAt: new Date(),
    updatedAt: new Date()
  }).where(eq(conversations.id, id));
}


// ============================================
// Order Tracking Logs
// ============================================

export async function createOrderTrackingLog(data: InsertOrderTrackingLog) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(orderTrackingLogs).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getOrderTrackingLogs(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(orderTrackingLogs)
    .where(eq(orderTrackingLogs.orderId, orderId))
    .orderBy(desc(orderTrackingLogs.createdAt));
}

export async function getLatestOrderTrackingLog(orderId: number) {
  const db = await getDb();
  if (!db) return null;
  const logs = await db
    .select()
    .from(orderTrackingLogs)
    .where(eq(orderTrackingLogs.orderId, orderId))
    .orderBy(desc(orderTrackingLogs.createdAt))
    .limit(1);
  return logs[0] || null;
}


// ============================================
// Referrals Functions
// ============================================

export async function createReferral(data: InsertReferral): Promise<Referral | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(referrals).values(data);
  const id = Number(result[0].insertId);

  const newReferral = await db.select().from(referrals).where(eq(referrals.id, id)).limit(1);
  return newReferral[0];
}

export async function getReferralByPhone(referralCodeId: number, phone: string): Promise<Referral | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(referrals).where(
    and(
      eq(referrals.referralCodeId, referralCodeId),
      eq(referrals.referredPhone, phone)
    )
  ).limit(1);

  return result[0];
}

export async function getReferralsByReferredPhone(phone: string): Promise<Referral[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(referrals).where(eq(referrals.referredPhone, phone));
}

export async function updateReferralStatus(id: number, completed: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(referrals).set({
    orderCompleted: completed,
    updatedAt: new Date()
  }).where(eq(referrals.id, id));
}

export async function getReferralsByCodeId(referralCodeId: number): Promise<Referral[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(referrals).where(eq(referrals.referralCodeId, referralCodeId));
}

// ============================================
// Occasion Campaigns Functions
// ============================================

/**
 * Create a new occasion campaign
 */
export async function createOccasionCampaign(data: InsertOccasionCampaign): Promise<OccasionCampaign | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [campaign] = await db.insert(occasionCampaigns).values(data);
  return getOccasionCampaignById(campaign.insertId);
}

/**
 * Get occasion campaign by ID
 */
export async function getOccasionCampaignById(id: number): Promise<OccasionCampaign | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [campaign] = await db.select().from(occasionCampaigns).where(eq(occasionCampaigns.id, id));
  return campaign;
}

/**
 * Get all occasion campaigns for a merchant
 */
export async function getOccasionCampaignsByMerchantId(merchantId: number): Promise<OccasionCampaign[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(occasionCampaigns).where(eq(occasionCampaigns.merchantId, merchantId)).orderBy(desc(occasionCampaigns.createdAt));
}

/**
 * Get occasion campaign by merchant, type, and year
 */
export async function getOccasionCampaignByTypeAndYear(
  merchantId: number,
  occasionType: string,
  year: number
): Promise<OccasionCampaign | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [campaign] = await db
    .select()
    .from(occasionCampaigns)
    .where(
      and(
        eq(occasionCampaigns.merchantId, merchantId),
        eq(occasionCampaigns.occasionType, occasionType as any),
        eq(occasionCampaigns.year, year)
      )
    );
  return campaign;
}

/**
 * Update occasion campaign
 */
export async function updateOccasionCampaign(id: number, data: Partial<InsertOccasionCampaign>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(occasionCampaigns).set(data).where(eq(occasionCampaigns.id, id));
}

/**
 * Mark occasion campaign as sent
 */
export async function markOccasionCampaignSent(id: number, recipientCount: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(occasionCampaigns)
    .set({
      status: 'sent',
      sentAt: new Date(),
      recipientCount,
    })
    .where(eq(occasionCampaigns.id, id));
}

/**
 * Get enabled occasion campaigns for all merchants
 */
export async function getEnabledOccasionCampaigns(): Promise<OccasionCampaign[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(occasionCampaigns).where(eq(occasionCampaigns.enabled, true));
}

/**
 * Get occasion campaigns statistics for a merchant
 */
export async function getOccasionCampaignsStats(merchantId: number) {
  const db = await getDb();
  if (!db) return { totalCampaigns: 0, sentCampaigns: 0, totalRecipients: 0 };

  const campaigns = await getOccasionCampaignsByMerchantId(merchantId);

  const sentCampaigns = campaigns.filter((c) => c.status === 'sent');
  const totalRecipients = sentCampaigns.reduce((sum, c) => sum + c.recipientCount, 0);

  return {
    totalCampaigns: campaigns.length,
    sentCampaigns: sentCampaigns.length,
    totalRecipients,
  };
}


// ==================== WhatsApp Instances ====================

/**
 * Create a new WhatsApp instance
 */
export async function createWhatsAppInstance(data: InsertWhatsAppInstance): Promise<WhatsAppInstance | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [instance] = await db.insert(whatsappInstances).values(data);
  return getWhatsAppInstanceById(Number(instance.insertId));
}

/**
 * Get WhatsApp instance by ID
 */
export async function getWhatsAppInstanceById(id: number): Promise<WhatsAppInstance | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [instance] = await db.select().from(whatsappInstances).where(eq(whatsappInstances.id, id));
  return instance;
}

/**
 * Get all WhatsApp instances for a merchant
 */
export async function getWhatsAppInstancesByMerchantId(merchantId: number): Promise<WhatsAppInstance[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(whatsappInstances)
    .where(eq(whatsappInstances.merchantId, merchantId))
    .orderBy(desc(whatsappInstances.isPrimary), desc(whatsappInstances.createdAt));
}

/**
 * Get primary WhatsApp instance for a merchant
 */
export async function getPrimaryWhatsAppInstance(merchantId: number): Promise<WhatsAppInstance | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [instance] = await db.select().from(whatsappInstances)
    .where(and(
      eq(whatsappInstances.merchantId, merchantId),
      eq(whatsappInstances.isPrimary, true),
      eq(whatsappInstances.status, 'active')
    ));

  return instance;
}

/**
 * Get WhatsApp instance by instance ID
 */
export async function getWhatsAppInstanceByInstanceId(instanceId: string): Promise<WhatsAppInstance | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [instance] = await db.select().from(whatsappInstances)
    .where(eq(whatsappInstances.instanceId, instanceId));

  return instance;
}

/**
 * Update WhatsApp instance
 */
export async function updateWhatsAppInstance(id: number, data: Partial<InsertWhatsAppInstance>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(whatsappInstances)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(whatsappInstances.id, id));
}

/**
 * Set WhatsApp instance as primary
 * This will unset all other instances for the merchant
 */
export async function setWhatsAppInstanceAsPrimary(id: number, merchantId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // First, unset all primary instances for this merchant
  await db.update(whatsappInstances)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(eq(whatsappInstances.merchantId, merchantId));

  // Then set the specified instance as primary
  await db.update(whatsappInstances)
    .set({ isPrimary: true, updatedAt: new Date() })
    .where(eq(whatsappInstances.id, id));
}

/**
 * Delete WhatsApp instance
 */
export async function deleteWhatsAppInstance(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(whatsappInstances).where(eq(whatsappInstances.id, id));
}

/**
 * Get active WhatsApp instances count for a merchant
 */
export async function getActiveWhatsAppInstancesCount(merchantId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const instances = await db.select().from(whatsappInstances)
    .where(and(
      eq(whatsappInstances.merchantId, merchantId),
      eq(whatsappInstances.status, 'active')
    ));

  return instances.length;
}

/**
 * Get expired WhatsApp instances
 */
export async function getExpiredWhatsAppInstances(): Promise<WhatsAppInstance[]> {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  return db.select().from(whatsappInstances)
    .where(and(
      eq(whatsappInstances.status, 'active'),
      lt(whatsappInstances.expiresAt, now)
    ));
}

/**
 * Mark WhatsApp instance as expired
 */
export async function markWhatsAppInstanceExpired(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(whatsappInstances)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(eq(whatsappInstances.id, id));
}


/**
 * Get WhatsApp instances expiring within specified days
 */
export async function getInstancesExpiringSoon(days: number): Promise<WhatsAppInstance[]> {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return db.select().from(whatsappInstances)
    .where(and(
      eq(whatsappInstances.status, 'active'),
      gt(whatsappInstances.expiresAt, now),
      lt(whatsappInstances.expiresAt, futureDate)
    ));
}

/**
 * Get WhatsApp instances expiring in 7, 3, or 1 day(s)
 */
export async function getExpiringWhatsAppInstances(): Promise<{
  expiring7Days: WhatsAppInstance[];
  expiring3Days: WhatsAppInstance[];
  expiring1Day: WhatsAppInstance[];
  expired: WhatsAppInstance[];
}> {
  const db = await getDb();
  if (!db) return { expiring7Days: [], expiring3Days: [], expiring1Day: [], expired: [] };

  const now = new Date();
  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const in3Days = new Date();
  in3Days.setDate(in3Days.getDate() + 3);
  const in1Day = new Date();
  in1Day.setDate(in1Day.getDate() + 1);

  const allInstances = await db.select().from(whatsappInstances)
    .where(eq(whatsappInstances.status, 'active'));

  const expiring7Days: WhatsAppInstance[] = [];
  const expiring3Days: WhatsAppInstance[] = [];
  const expiring1Day: WhatsAppInstance[] = [];
  const expired: WhatsAppInstance[] = [];

  for (const instance of allInstances) {
    if (!instance.expiresAt) continue;

    const expiryDate = new Date(instance.expiresAt);

    if (expiryDate <= now) {
      expired.push(instance);
    } else if (expiryDate <= in1Day) {
      expiring1Day.push(instance);
    } else if (expiryDate <= in3Days) {
      expiring3Days.push(instance);
    } else if (expiryDate <= in7Days) {
      expiring7Days.push(instance);
    }
  }

  return { expiring7Days, expiring3Days, expiring1Day, expired };
}


// ============================================
// WhatsApp Requests Functions
// ============================================

export async function createWhatsAppRequest(data: InsertWhatsAppRequest) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  const result = await db.insert(whatsappRequests).values(data);
  const insertId = Number(result[0].insertId);
  const [request] = await db.select().from(whatsappRequests).where(eq(whatsappRequests.id, insertId));
  return request;
}

export async function getWhatsAppRequestById(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  const [request] = await db.select().from(whatsappRequests).where(eq(whatsappRequests.id, id));
  return request;
}

export async function getWhatsAppRequestsByMerchantId(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  return db.select().from(whatsappRequests)
    .where(eq(whatsappRequests.merchantId, merchantId))
    .orderBy(desc(whatsappRequests.createdAt));
}

export async function getAllWhatsAppRequests() {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  return db.select().from(whatsappRequests)
    .orderBy(desc(whatsappRequests.createdAt));
}

export async function getPendingWhatsAppRequests() {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  return db.select().from(whatsappRequests)
    .where(eq(whatsappRequests.status, 'pending'))
    .orderBy(desc(whatsappRequests.createdAt));
}

export async function updateWhatsAppRequest(id: number, data: Partial<InsertWhatsAppRequest>) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  await db.update(whatsappRequests)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(whatsappRequests.id, id));
  return getWhatsAppRequestById(id);
}

export async function approveWhatsAppRequest(
  id: number,
  instanceId: string,
  token: string,
  apiUrl: string,
  reviewedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  await db.update(whatsappRequests)
    .set({
      status: 'approved',
      instanceId,
      token,
      apiUrl,
      reviewedBy,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappRequests.id, id));
  return getWhatsAppRequestById(id);
}

export async function rejectWhatsAppRequest(
  id: number,
  rejectionReason: string,
  reviewedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  await db.update(whatsappRequests)
    .set({
      status: 'rejected',
      rejectionReason,
      reviewedBy,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappRequests.id, id));
  return getWhatsAppRequestById(id);
}

export async function completeWhatsAppRequest(id: number, phoneNumber: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  await db.update(whatsappRequests)
    .set({
      status: 'completed',
      phoneNumber,
      connectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappRequests.id, id));
  return getWhatsAppRequestById(id);
}

export async function deleteWhatsAppRequest(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  await db.delete(whatsappRequests).where(eq(whatsappRequests.id, id));
}


// ============================================
// Order Notifications Functions
// ============================================

export async function createOrderNotification(data: InsertOrderNotification) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  const result = await db.insert(orderNotifications).values(data);
  const id = Number(result[0].insertId);
  return getOrderNotificationById(id);
}

export async function getOrderNotificationById(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  const result = await db.select().from(orderNotifications).where(eq(orderNotifications.id, id)).limit(1);
  return result[0] || null;
}

export async function getOrderNotificationsByOrderId(orderId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  return db.select().from(orderNotifications).where(eq(orderNotifications.orderId, orderId)).orderBy(desc(orderNotifications.createdAt));
}

export async function getOrderNotificationsByMerchantId(merchantId: number, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  return db.select().from(orderNotifications).where(eq(orderNotifications.merchantId, merchantId)).orderBy(desc(orderNotifications.createdAt)).limit(limit);
}

export async function updateOrderNotification(id: number, data: Partial<InsertOrderNotification>) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  await db.update(orderNotifications).set(data).where(eq(orderNotifications.id, id));
  return getOrderNotificationById(id);
}

// ============================================
// Notification Templates Functions
// ============================================

export async function createNotificationTemplate(data: InsertNotificationTemplate) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  const result = await db.insert(notificationTemplates).values(data);
  const id = Number(result[0].insertId);
  return getNotificationTemplateById(id);
}

export async function getNotificationTemplateById(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  const result = await db.select().from(notificationTemplates).where(eq(notificationTemplates.id, id)).limit(1);
  return result[0] || null;
}

export async function getNotificationTemplateByStatus(merchantId: number, status: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  const result = await db.select().from(notificationTemplates)
    .where(and(
      eq(notificationTemplates.merchantId, merchantId),
      eq(notificationTemplates.status, status)
    ))
    .limit(1);
  return result[0] || null;
}

export async function getNotificationTemplatesByMerchantId(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  return db.select().from(notificationTemplates).where(eq(notificationTemplates.merchantId, merchantId));
}

export async function updateNotificationTemplate(id: number, data: Partial<InsertNotificationTemplate>) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  await db.update(notificationTemplates).set({ ...data, updatedAt: new Date() }).where(eq(notificationTemplates.id, id));
  return getNotificationTemplateById(id);
}

export async function deleteNotificationTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');
  await db.delete(notificationTemplates).where(eq(notificationTemplates.id, id));
}


// ============================================
// Analytics Functions
// ============================================

/**
 * Get message statistics for a merchant
 * Returns count of messages by type (text, voice, image)
 */
export async function getMessageStats(merchantId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return { text: 0, voice: 0, image: 0, total: 0 };

  // Get all conversations for this merchant
  const merchantConversations = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.merchantId, merchantId));

  if (merchantConversations.length === 0) {
    return { text: 0, voice: 0, image: 0, total: 0 };
  }

  const conversationIds = merchantConversations.map(c => c.id);

  // Build date filter
  let dateFilter = sql`1=1`;
  if (startDate && endDate) {
    dateFilter = and(
      gte(messages.createdAt, formatDateForDB(startDate)),
      lte(messages.createdAt, formatDateForDB(endDate))
    ) || sql`1=1`;
  }

  // Count messages by type
  const result = await db
    .select({
      messageType: messages.messageType,
      count: sql<number>`COUNT(*)`,
    })
    .from(messages)
    .where(
      and(
        sql`${messages.conversationId} IN (${sql.join(conversationIds.map(id => sql`${id}`), sql`, `)})`,
        dateFilter
      )
    )
    .groupBy(messages.messageType);

  const stats = {
    text: 0,
    voice: 0,
    image: 0,
    total: 0,
  };

  result.forEach((row: any) => {
    const count = Number(row.count);
    stats.total += count;
    if (row.messageType === 'text') stats.text = count;
    else if (row.messageType === 'voice') stats.voice = count;
    else if (row.messageType === 'image') stats.image = count;
  });

  return stats;
}

/**
 * Get peak hours for messages
 * Returns message count by hour of day
 */
export async function getPeakHours(merchantId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return [];

  // Get all conversations for this merchant
  const merchantConversations = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.merchantId, merchantId));

  if (merchantConversations.length === 0) {
    return [];
  }

  const conversationIds = merchantConversations.map(c => c.id);

  // Build date filter
  let dateFilter = sql`1=1`;
  if (startDate && endDate) {
    dateFilter = and(
      gte(messages.createdAt, formatDateForDB(startDate)),
      lte(messages.createdAt, formatDateForDB(endDate))
    ) || sql`1=1`;
  }

  // Get message count by hour
  const result = await db
    .select({
      hour: sql<number>`HOUR(${messages.createdAt})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(messages)
    .where(
      and(
        sql`${messages.conversationId} IN (${sql.join(conversationIds.map(id => sql`${id}`), sql`, `)})`,
        dateFilter
      )
    )
    .groupBy(sql`HOUR(${messages.createdAt})`)
    .orderBy(sql`HOUR(${messages.createdAt})`);

  return result.map((row: any) => ({
    hour: Number(row.hour),
    count: Number(row.count),
  }));
}

/**
 * Get top products mentioned in conversations
 * Searches for product names in message content
 */
export async function getTopProducts(merchantId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) return [];

  // Get all products for this merchant
  const merchantProducts = await getProductsByMerchantId(merchantId);

  if (merchantProducts.length === 0) {
    return [];
  }

  // Get all conversations for this merchant
  const merchantConversations = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.merchantId, merchantId));

  if (merchantConversations.length === 0) {
    return [];
  }

  const conversationIds = merchantConversations.map(c => c.id);

  // Get all messages
  const allMessages = await db
    .select({
      content: messages.content,
    })
    .from(messages)
    .where(
      sql`${messages.conversationId} IN (${sql.join(conversationIds.map(id => sql`${id}`), sql`, `)})`
    );

  // Count product mentions
  const productMentions: { [key: number]: number } = {};

  allMessages.forEach((msg: any) => {
    const content = (msg.content || '').toLowerCase();
    merchantProducts.forEach(product => {
      const productName = product.name.toLowerCase();
      if (content.includes(productName)) {
        productMentions[product.id] = (productMentions[product.id] || 0) + 1;
      }
    });
  });

  // Sort by mention count
  const sortedProducts = Object.entries(productMentions)
    .map(([productId, count]) => {
      const product = merchantProducts.find(p => p.id === Number(productId));
      return {
        productId: Number(productId),
        productName: product?.name || '',
        mentionCount: count,
        price: product?.price || 0,
      };
    })
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, limit);

  return sortedProducts;
}

/**
 * Get conversion rate
 * Calculates percentage of conversations that led to orders
 */
export async function getConversionRate(merchantId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return { rate: 0, totalConversations: 0, convertedConversations: 0 };

  // Build date filter
  let dateFilter = sql`1=1`;
  if (startDate && endDate) {
    dateFilter = and(
      gte(conversations.createdAt, formatDateForDB(startDate)),
      lte(conversations.createdAt, formatDateForDB(endDate))
    ) || sql`1=1`;
  }

  // Get total conversations
  const totalConversations = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(conversations)
    .where(
      and(
        eq(conversations.merchantId, merchantId),
        dateFilter
      )
    );

  const total = Number(totalConversations[0]?.count || 0);

  if (total === 0) {
    return { rate: 0, totalConversations: 0, convertedConversations: 0 };
  }

  // Get conversations with orders
  // A conversation is "converted" if there's an order with the same customerPhone
  const conversationsWithOrders = await db
    .selectDistinct({ customerPhone: conversations.customerPhone })
    .from(conversations)
    .innerJoin(
      orders,
      and(
        eq(orders.merchantId, conversations.merchantId),
        eq(orders.customerPhone, conversations.customerPhone)
      )
    )
    .where(
      and(
        eq(conversations.merchantId, merchantId),
        dateFilter
      )
    );

  const converted = conversationsWithOrders.length;
  const rate = (converted / total) * 100;

  return {
    rate: Math.round(rate * 100) / 100, // Round to 2 decimal places
    totalConversations: total,
    convertedConversations: converted,
  };
}

/**
 * Get daily message count for the last N days
 */
export async function getDailyMessageCount(merchantId: number, days: number = 30) {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get all conversations for this merchant
  const merchantConversations = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.merchantId, merchantId));

  if (merchantConversations.length === 0) {
    return [];
  }

  const conversationIds = merchantConversations.map(c => c.id);

  // Get message count by date
  const result = await db
    .select({
      date: sql<string>`DATE(${messages.createdAt})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(messages)
    .where(
      and(
        sql`${messages.conversationId} IN (${sql.join(conversationIds.map(id => sql`${id}`), sql`, `)})`,
        gte(messages.createdAt, formatDateForDB(startDate))
      )
    )
    .groupBy(sql`DATE(${messages.createdAt})`)
    .orderBy(sql`DATE(${messages.createdAt})`);

  return result.map((row: any) => ({
    date: row.date,
    count: Number(row.count),
  }));
}


/**
 * Get orders with filters (status, date range)
 */
export async function getOrdersWithFilters(
  merchantId: number,
  filters?: {
    status?: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
    startDate?: Date;
    endDate?: Date;
    searchQuery?: string;
  }
): Promise<Order[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(orders.merchantId, merchantId)];

  if (filters?.status) {
    conditions.push(eq(orders.status, filters.status));
  }

  if (filters?.startDate) {
    conditions.push(gte(orders.createdAt, filters.startDate));
  }

  if (filters?.endDate) {
    conditions.push(lte(orders.createdAt, filters.endDate));
  }

  let results = await db
    .select()
    .from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt));

  // Search in customer name, phone, order number
  if (filters?.searchQuery) {
    const query = filters.searchQuery.toLowerCase();
    results = results.filter(order =>
      order.customerName?.toLowerCase().includes(query) ||
      order.customerPhone?.toLowerCase().includes(query) ||
      order.orderNumber?.toLowerCase().includes(query)
    );
  }

  return results;
}

/**
 * Get order statistics for merchant
 */
export async function getOrderStats(merchantId: number): Promise<{
  total: number;
  pending: number;
  processing: number;
  completed: number;
  cancelled: number;
  totalRevenue: number;
}> {
  const db = await getDb();
  if (!db) return {
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    cancelled: 0,
    totalRevenue: 0
  };

  const allOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.merchantId, merchantId));

  const stats = {
    total: allOrders.length,
    pending: allOrders.filter(o => o.status === 'pending').length,
    processing: allOrders.filter(o => o.status === 'processing' || o.status === 'shipped').length,
    completed: allOrders.filter(o => o.status === 'delivered').length,
    cancelled: allOrders.filter(o => o.status === 'cancelled').length,
    totalRevenue: allOrders
      .filter(o => o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.totalAmount, 0)
  };

  return stats;
}

/**
 * Cancel order
 */
export async function cancelOrder(id: number, reason?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(orders).set({
    status: 'cancelled',
    notes: reason || 'تم إلغاء الطلب',
    updatedAt: new Date()
  }).where(eq(orders.id, id));
}

// ============================================
// Test Conversations & Metrics
// ============================================

/**
 * Create or get test conversation
 */
export async function createTestConversation(merchantId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.insert(testConversations).values({
    merchantId,
    startedAt: new Date(),
  });

  return Number(result[0].insertId);
}

/**
 * Save test message
 */
export async function saveTestMessage(data: {
  conversationId: number;
  sender: 'user' | 'sari';
  content: string;
  responseTime?: number;
  rating?: 'positive' | 'negative' | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(testMessages).values({
    conversationId: data.conversationId,
    sender: data.sender,
    content: data.content,
    responseTime: data.responseTime || null,
    rating: data.rating || null,
    sentAt: new Date(),
  });
}

/**
 * Update message rating
 */
export async function updateTestMessageRating(
  conversationId: number,
  messageIndex: number,
  rating: 'positive' | 'negative' | null
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get all messages for this conversation
  const messages = await db
    .select()
    .from(testMessages)
    .where(eq(testMessages.conversationId, conversationId))
    .orderBy(testMessages.sentAt);

  if (messages[messageIndex]) {
    await db
      .update(testMessages)
      .set({ rating })
      .where(eq(testMessages.id, messages[messageIndex].id));
  }
}

/**
 * Mark conversation as deal
 */
export async function markTestConversationAsDeal(data: {
  merchantId: number;
  conversationId?: number;
  dealValue: number;
  messageCount: number;
  timeToConversion: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.insert(testDeals).values({
    merchantId: data.merchantId,
    conversationId: data.conversationId || null,
    dealValue: data.dealValue,
    messageCount: data.messageCount,
    timeToConversion: data.timeToConversion,
    markedAt: new Date(),
  });

  return Number(result[0].insertId);
}

/**
 * Get test conversation messages
 */
export async function getTestConversationMessages(conversationId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(testMessages)
    .where(eq(testMessages.conversationId, conversationId))
    .orderBy(testMessages.sentAt);
}

/**
 * Get merchant test conversations
 */
export async function getMerchantTestConversations(merchantId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(testConversations)
    .where(eq(testConversations.merchantId, merchantId))
    .orderBy(desc(testConversations.startedAt));
}

/**
 * Get test deals for merchant
 */
export async function getMerchantTestDeals(merchantId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(testDeals)
    .where(eq(testDeals.merchantId, merchantId))
    .orderBy(desc(testDeals.markedAt));
}


// ============================================================
// Bot Settings Functions
// ============================================================

/**
 * Get bot settings for a merchant (create default if not exists)
 */
export async function getBotSettings(merchantId: number): Promise<BotSettings> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Try to get existing settings
  const existing = await db
    .select()
    .from(botSettings)
    .where(eq(botSettings.merchantId, merchantId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Create default settings
  const result = await db
    .insert(botSettings)
    .values({
      merchantId,
      autoReplyEnabled: true,
      workingHoursEnabled: false,
      workingHoursStart: '09:00',
      workingHoursEnd: '18:00',
      workingDays: '1,2,3,4,5', // Monday-Friday
      welcomeMessage: 'مرحباً! أنا ساري، مساعدك الذكي. كيف أقدر أساعدك اليوم؟ 😊',
      outOfHoursMessage: 'شكراً لتواصلك! نحن حالياً خارج أوقات العمل. سنرد عليك في أقرب وقت ممكن. ⏰',
      responseDelay: 2,
      maxResponseLength: 200,
      tone: 'friendly',
      language: 'ar',
    });

  const insertId = Number(result[0].insertId);
  const newSettings = await db
    .select()
    .from(botSettings)
    .where(eq(botSettings.id, insertId))
    .limit(1);

  return newSettings[0];
}

/**
 * Update bot settings
 */
export async function updateBotSettings(
  merchantId: number,
  updates: Partial<InsertBotSettings>
): Promise<BotSettings> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Ensure settings exist first
  await getBotSettings(merchantId);

  // Update
  await db
    .update(botSettings)
    .set(updates)
    .where(eq(botSettings.merchantId, merchantId));

  // Return updated settings
  return getBotSettings(merchantId);
}

/**
 * Check if bot should respond based on working hours
 */
export async function shouldBotRespond(merchantId: number): Promise<{
  shouldRespond: boolean;
  reason?: string;
}> {
  const settings = await getBotSettings(merchantId);

  // Check if auto-reply is enabled
  if (!settings.autoReplyEnabled) {
    return {
      shouldRespond: false,
      reason: 'Auto-reply is disabled',
    };
  }

  // If working hours not enabled, always respond
  if (!settings.workingHoursEnabled) {
    return { shouldRespond: true };
  }

  // Check working hours
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, etc.
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Check if today is a working day
  const workingDays = settings.workingDays?.split(',').map(d => parseInt(d)) || [];
  if (!workingDays.includes(dayOfWeek)) {
    return {
      shouldRespond: false,
      reason: 'Outside working days',
    };
  }

  // Check if current time is within working hours
  const start = settings.workingHoursStart || '09:00';
  const end = settings.workingHoursEnd || '18:00';

  if (currentTime < start || currentTime >= end) {
    return {
      shouldRespond: false,
      reason: 'Outside working hours',
    };
  }

  return { shouldRespond: true };
}


// ==================== Scheduled Messages ====================

/**
 * Get all scheduled messages for a merchant
 */
export async function getScheduledMessages(merchantId: number) {
  const db = await getDb();
  if (!db) return [];

  const { scheduledMessages } = await import('../drizzle/schema');
  return await db.select().from(scheduledMessages).where(eq(scheduledMessages.merchantId, merchantId));
}

/**
 * Get a single scheduled message by ID
 */
export async function getScheduledMessageById(id: number, merchantId: number) {
  const db = await getDb();
  if (!db) return null;

  const { scheduledMessages } = await import('../drizzle/schema');
  const results = await db.select().from(scheduledMessages)
    .where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.merchantId, merchantId)));

  return results[0] || null;
}

/**
 * Create a new scheduled message
 */
export async function createScheduledMessage(data: {
  merchantId: number;
  title: string;
  message: string;
  dayOfWeek: number;
  time: string;
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const { scheduledMessages } = await import('../drizzle/schema');
  const result = await db.insert(scheduledMessages).values(data);

  const insertedId = Number(result[0].insertId);
  return await getScheduledMessageById(insertedId, data.merchantId);
}

/**
 * Update a scheduled message
 */
export async function updateScheduledMessage(
  id: number,
  merchantId: number,
  data: {
    title?: string;
    message?: string;
    dayOfWeek?: number;
    time?: string;
    isActive?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const { scheduledMessages } = await import('../drizzle/schema');
  await db.update(scheduledMessages)
    .set(data)
    .where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.merchantId, merchantId)));

  return await getScheduledMessageById(id, merchantId);
}

/**
 * Delete a scheduled message
 */
export async function deleteScheduledMessage(id: number, merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const { scheduledMessages } = await import('../drizzle/schema');
  await db.delete(scheduledMessages)
    .where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.merchantId, merchantId)));

  return true;
}

/**
 * Toggle scheduled message active status
 */
export async function toggleScheduledMessage(id: number, merchantId: number, isActive: boolean) {
  return await updateScheduledMessage(id, merchantId, { isActive });
}

/**
 * Get all active scheduled messages that should be sent now
 */
export async function getScheduledMessagesToSend() {
  const db = await getDb();
  if (!db) return [];

  const { scheduledMessages } = await import('../drizzle/schema');
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday, etc.
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Get all active messages for today
  const results = await db.select().from(scheduledMessages)
    .where(and(
      eq(scheduledMessages.isActive, true),
      eq(scheduledMessages.dayOfWeek, dayOfWeek),
      eq(scheduledMessages.time, currentTime)
    ));

  return results;
}

/**
 * Update last sent timestamp for a scheduled message
 */
export async function updateScheduledMessageLastSent(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const { scheduledMessages } = await import('../drizzle/schema');
  await db.update(scheduledMessages)
    .set({ lastSentAt: new Date() })
    .where(eq(scheduledMessages.id, id));

  return true;
}


// ============================================
// Rewards Functions
// ============================================

/**
 * Create a new reward
 */
export async function createReward(data: InsertReward): Promise<Reward | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(rewards).values(data);
  const id = Number(result[0].insertId);

  const newReward = await db.select().from(rewards).where(eq(rewards.id, id)).limit(1);
  return newReward[0];
}

/**
 * Get reward by ID
 */
export async function getRewardById(id: number): Promise<Reward | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(rewards).where(eq(rewards.id, id)).limit(1);
  return result[0];
}

/**
 * Get all rewards for a merchant
 */
export async function getRewardsByMerchantId(merchantId: number): Promise<Reward[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(rewards)
    .where(eq(rewards.merchantId, merchantId))
    .orderBy(desc(rewards.createdAt));
}

/**
 * Get pending rewards for a merchant
 */
export async function getPendingRewardsByMerchantId(merchantId: number): Promise<Reward[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(rewards)
    .where(and(
      eq(rewards.merchantId, merchantId),
      eq(rewards.status, 'pending')
    ))
    .orderBy(desc(rewards.createdAt));
}

/**
 * Claim a reward
 */
export async function claimReward(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(rewards).set({
    status: 'claimed',
    claimedAt: new Date(),
    updatedAt: new Date()
  }).where(eq(rewards.id, id));
}

/**
 * Expire old rewards (90 days)
 */
export async function expireOldRewards(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();

  await db.update(rewards).set({
    status: 'expired',
    updatedAt: new Date()
  }).where(and(
    eq(rewards.status, 'pending'),
    lt(rewards.expiresAt, now)
  ));
}

/**
 * Get referral code by merchant ID
 */
export async function getReferralCodeByMerchantId(merchantId: number): Promise<ReferralCode | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(referralCodes)
    .where(eq(referralCodes.merchantId, merchantId))
    .limit(1);

  return result[0];
}

/**
 * Generate a unique referral code for a merchant
 */
export async function generateReferralCode(merchantId: number, referrerName: string, referrerPhone: string): Promise<ReferralCode | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  // Check if merchant already has a code
  const existing = await getReferralCodeByMerchantId(merchantId);
  if (existing) return existing;

  // Generate unique code (REF + random 8 digits)
  let code = '';
  let isUnique = false;

  while (!isUnique) {
    code = 'REF' + Math.floor(10000000 + Math.random() * 90000000);
    const check = await getReferralCodeByCode(code);
    if (!check) isUnique = true;
  }

  return createReferralCode({
    merchantId,
    code,
    referrerPhone,
    referrerName,
    referralCount: 0,
    rewardGiven: false,
    isActive: true,
  });
}

/**
 * Get referral statistics for a merchant
 */
export async function getReferralStats(merchantId: number) {
  const db = await getDb();
  if (!db) return {
    totalReferrals: 0,
    completedReferrals: 0,
    pendingReferrals: 0,
    totalRewards: 0,
    pendingRewards: 0,
    claimedRewards: 0,
  };

  const referralCode = await getReferralCodeByMerchantId(merchantId);
  if (!referralCode) return {
    totalReferrals: 0,
    completedReferrals: 0,
    pendingReferrals: 0,
    totalRewards: 0,
    pendingRewards: 0,
    claimedRewards: 0,
  };

  const allReferrals = await getReferralsByCodeId(referralCode.id);
  const completedReferrals = allReferrals.filter(r => r.orderCompleted);
  const pendingReferrals = allReferrals.filter(r => !r.orderCompleted);

  const allRewards = await getRewardsByMerchantId(merchantId);
  const pendingRewards = allRewards.filter(r => r.status === 'pending');
  const claimedRewards = allRewards.filter(r => r.status === 'claimed');

  return {
    totalReferrals: allReferrals.length,
    completedReferrals: completedReferrals.length,
    pendingReferrals: pendingReferrals.length,
    totalRewards: allRewards.length,
    pendingRewards: pendingRewards.length,
    claimedRewards: claimedRewards.length,
  };
}

/**
 * Get referrals with details for a merchant
 */
export async function getReferralsWithDetails(merchantId: number) {
  const db = await getDb();
  if (!db) return [];

  const referralCode = await getReferralCodeByMerchantId(merchantId);
  if (!referralCode) return [];

  return getReferralsByCodeId(referralCode.id);
}

// ============================================================================
// Sari Personality Settings
// ============================================================================

/**
 * Get personality settings for a merchant
 */
export async function getSariPersonalitySettings(merchantId: number): Promise<SariPersonalitySetting | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(sariPersonalitySettings)
    .where(eq(sariPersonalitySettings.merchantId, merchantId))
    .limit(1);

  return result[0];
}

/**
 * Create personality settings for a merchant
 */
export async function createSariPersonalitySettings(data: InsertSariPersonalitySetting): Promise<SariPersonalitySetting | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(sariPersonalitySettings).values(data);
  return getSariPersonalitySettings(data.merchantId);
}

/**
 * Update personality settings
 */
export async function updateSariPersonalitySettings(
  merchantId: number,
  data: Partial<InsertSariPersonalitySetting>
): Promise<SariPersonalitySetting | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  await db.update(sariPersonalitySettings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(sariPersonalitySettings.merchantId, merchantId));

  return getSariPersonalitySettings(merchantId);
}

/**
 * Get or create personality settings (with defaults)
 */
export async function getOrCreatePersonalitySettings(merchantId: number): Promise<SariPersonalitySetting> {
  let settings = await getSariPersonalitySettings(merchantId);

  if (!settings) {
    settings = await createSariPersonalitySettings({
      merchantId,
      tone: 'friendly',
      style: 'saudi_dialect',
      emojiUsage: 'moderate',
      maxResponseLength: 200,
      responseDelay: 2,
      recommendationStyle: 'consultative',
    });
  }

  return settings!;
}

// ============================================================================
// Quick Responses
// ============================================================================

/**
 * Get all quick responses for a merchant
 */
export async function getQuickResponses(merchantId: number): Promise<QuickResponse[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(quickResponses)
    .where(eq(quickResponses.merchantId, merchantId))
    .orderBy(desc(quickResponses.priority), desc(quickResponses.useCount));
}

/**
 * Get active quick responses for a merchant
 */
export async function getActiveQuickResponses(merchantId: number): Promise<QuickResponse[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(quickResponses)
    .where(
      and(
        eq(quickResponses.merchantId, merchantId),
        eq(quickResponses.isActive, true)
      )
    )
    .orderBy(desc(quickResponses.priority), desc(quickResponses.useCount));
}

/**
 * Create quick response
 */
export async function createQuickResponse(data: InsertQuickResponse): Promise<QuickResponse | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(quickResponses).values(data);
  const id = result[0].insertId;

  return getQuickResponseById(id);
}

/**
 * Get quick response by ID
 */
export async function getQuickResponseById(id: number): Promise<QuickResponse | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(quickResponses)
    .where(eq(quickResponses.id, id))
    .limit(1);

  return result[0];
}

/**
 * Update quick response
 */
export async function updateQuickResponse(
  id: number,
  data: Partial<InsertQuickResponse>
): Promise<QuickResponse | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  await db.update(quickResponses)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(quickResponses.id, id));

  return getQuickResponseById(id);
}

/**
 * Delete quick response
 */
export async function deleteQuickResponse(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  await db.delete(quickResponses).where(eq(quickResponses.id, id));
  return true;
}

/**
 * Increment use count for quick response
 */
export async function incrementQuickResponseUse(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(quickResponses)
    .set({
      useCount: sql`${quickResponses.useCount} + 1`,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(quickResponses.id, id));
}

/**
 * Find matching quick response for a message
 */
export async function findMatchingQuickResponse(
  merchantId: number,
  message: string
): Promise<QuickResponse | null> {
  const responses = await getActiveQuickResponses(merchantId);

  if (responses.length === 0) return null;

  const lowerMessage = message.toLowerCase().trim();

  // Try exact trigger match first
  for (const response of responses) {
    if (lowerMessage === response.trigger.toLowerCase().trim()) {
      await incrementQuickResponseUse(response.id);
      return response;
    }
  }

  // Try keyword match
  for (const response of responses) {
    if (response.keywords) {
      try {
        const keywords = JSON.parse(response.keywords) as string[];
        const hasMatch = keywords.some(kw =>
          lowerMessage.includes(kw.toLowerCase())
        );

        if (hasMatch) {
          await incrementQuickResponseUse(response.id);
          return response;
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }
  }

  return null;
}

// ============================================================================
// Sentiment Analysis
// ============================================================================

/**
 * Create sentiment analysis record
 */
export async function createSentimentAnalysis(data: InsertSentimentAnalysis): Promise<SentimentAnalysis | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(sentimentAnalysis).values(data);
  const id = result[0].insertId;

  return getSentimentAnalysisById(id);
}

/**
 * Get sentiment analysis by ID
 */
export async function getSentimentAnalysisById(id: number): Promise<SentimentAnalysis | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(sentimentAnalysis)
    .where(eq(sentimentAnalysis.id, id))
    .limit(1);

  return result[0];
}

/**
 * Get sentiment analysis for a message
 */
export async function getSentimentByMessageId(messageId: number): Promise<SentimentAnalysis | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(sentimentAnalysis)
    .where(eq(sentimentAnalysis.messageId, messageId))
    .limit(1);

  return result[0];
}

/**
 * Get all sentiment analyses for a conversation
 */
export async function getSentimentsByConversationId(conversationId: number): Promise<SentimentAnalysis[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(sentimentAnalysis)
    .where(eq(sentimentAnalysis.conversationId, conversationId))
    .orderBy(desc(sentimentAnalysis.createdAt));
}

/**
 * Get sentiment statistics for a merchant
 */
export async function getMerchantSentimentStats(merchantId: number, days: number = 30) {
  const db = await getDb();
  if (!db) return {
    total: 0,
    positive: 0,
    negative: 0,
    neutral: 0,
    angry: 0,
    happy: 0,
    sad: 0,
    frustrated: 0,
    averageConfidence: 0,
  };

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get all conversations for this merchant
  const merchantConversations = await db.select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.merchantId, merchantId));

  if (merchantConversations.length === 0) {
    return {
      total: 0,
      positive: 0,
      negative: 0,
      neutral: 0,
      angry: 0,
      happy: 0,
      sad: 0,
      frustrated: 0,
      averageConfidence: 0,
    };
  }

  const conversationIds = merchantConversations.map(c => c.id);

  // Get sentiment analyses
  const sentiments = await db.select().from(sentimentAnalysis)
    .where(
      and(
        sql`${sentimentAnalysis.conversationId} IN (${sql.join(conversationIds.map(id => sql`${id}`), sql`, `)})`,
        gte(sentimentAnalysis.createdAt, formatDateForDB(startDate))
      )
    );

  const stats = {
    total: sentiments.length,
    positive: 0,
    negative: 0,
    neutral: 0,
    angry: 0,
    happy: 0,
    sad: 0,
    frustrated: 0,
    averageConfidence: 0,
  };

  if (sentiments.length === 0) return stats;

  let totalConfidence = 0;

  sentiments.forEach(s => {
    const sentimentKey = s.sentiment;
    if (sentimentKey in stats) {
      stats[sentimentKey]++;
    }
    totalConfidence += s.confidence;
  });

  stats.averageConfidence = Math.round(totalConfidence / sentiments.length);

  return stats;
}

// ============================================
// Keyword Analysis Functions
// ============================================

/**
 * إنشاء أو تحديث تحليل كلمة مفتاحية
 */
export async function upsertKeywordAnalysis(data: {
  merchantId: number;
  keyword: string;
  category: 'product' | 'price' | 'shipping' | 'complaint' | 'question' | 'other';
  sampleMessage: string;
  suggestedResponse?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  // البحث عن كلمة مفتاحية موجودة
  const existing = await db.select().from(keywordAnalysis)
    .where(
      and(
        eq(keywordAnalysis.merchantId, data.merchantId),
        eq(keywordAnalysis.keyword, data.keyword)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // تحديث الموجودة
    const current = existing[0];
    const currentSamples = current.sampleMessages ? JSON.parse(current.sampleMessages) : [];
    const updatedSamples = [...currentSamples, data.sampleMessage].slice(-5); // آخر 5 رسائل فقط

    await db.update(keywordAnalysis)
      .set({
        frequency: current.frequency + 1,
        sampleMessages: JSON.stringify(updatedSamples),
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(keywordAnalysis.id, current.id));

    return current.id;
  } else {
    // إنشاء جديدة
    const result = await db.insert(keywordAnalysis).values({
      merchantId: data.merchantId,
      keyword: data.keyword,
      category: data.category,
      frequency: 1,
      sampleMessages: JSON.stringify([data.sampleMessage]),
      suggestedResponse: data.suggestedResponse,
      status: 'new',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    });

    return Number(result[0].insertId);
  }
}

/**
 * الحصول على إحصائيات الكلمات المفتاحية للتاجر
 */
export async function getKeywordStats(merchantId: number, options?: {
  category?: string;
  status?: string;
  minFrequency?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(keywordAnalysis.merchantId, merchantId)];

  if (options?.category) {
    conditions.push(eq(keywordAnalysis.category, options.category as any));
  }

  if (options?.status) {
    conditions.push(eq(keywordAnalysis.status, options.status as any));
  }

  if (options?.minFrequency) {
    conditions.push(gte(keywordAnalysis.frequency, options.minFrequency));
  }

  const baseQuery = db.select().from(keywordAnalysis)
    .where(and(...conditions))
    .orderBy(desc(keywordAnalysis.frequency));

  if (options?.limit) {
    return await baseQuery.limit(options.limit);
  }

  return await baseQuery;
}

/**
 * الحصول على الكلمات المفتاحية الجديدة التي تحتاج مراجعة
 */
export async function getNewKeywords(merchantId: number, limit: number = 20) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(keywordAnalysis)
    .where(
      and(
        eq(keywordAnalysis.merchantId, merchantId),
        eq(keywordAnalysis.status, 'new')
      )
    )
    .orderBy(desc(keywordAnalysis.frequency))
    .limit(limit);
}

/**
 * تحديث حالة الكلمة المفتاحية
 */
export async function updateKeywordStatus(
  keywordId: number,
  status: 'new' | 'reviewed' | 'response_created' | 'ignored'
) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  await db.update(keywordAnalysis)
    .set({
      status,
      reviewedAt: status !== 'new' ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(keywordAnalysis.id, keywordId));
}

/**
 * حذف كلمة مفتاحية
 */
export async function deleteKeywordAnalysis(keywordId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  await db.delete(keywordAnalysis).where(eq(keywordAnalysis.id, keywordId));
}

// ============================================
// Weekly Sentiment Reports Functions
// ============================================

/**
 * إنشاء تقرير أسبوعي جديد
 */
export async function createWeeklySentimentReport(data: {
  merchantId: number;
  weekStartDate: Date;
  weekEndDate: Date;
  totalConversations: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  topKeywords: string[];
  topComplaints: string[];
  recommendations: string[];
}) {
  const total = data.totalConversations;
  const positivePercentage = total > 0 ? Math.round((data.positiveCount / total) * 100) : 0;
  const negativePercentage = total > 0 ? Math.round((data.negativeCount / total) * 100) : 0;
  const satisfactionScore = total > 0 ? Math.round(((data.positiveCount - data.negativeCount) / total) * 50 + 50) : 50;

  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  const result = await db.insert(weeklySentimentReports).values({
    merchantId: data.merchantId,
    weekStartDate: data.weekStartDate,
    weekEndDate: data.weekEndDate,
    totalConversations: data.totalConversations,
    positiveCount: data.positiveCount,
    negativeCount: data.negativeCount,
    neutralCount: data.neutralCount,
    positivePercentage,
    negativePercentage,
    satisfactionScore,
    topKeywords: JSON.stringify(data.topKeywords),
    topComplaints: JSON.stringify(data.topComplaints),
    recommendations: JSON.stringify(data.recommendations),
    emailSent: false,
  });

  return Number(result[0].insertId);
}

/**
 * الحصول على تقارير التاجر
 */
export async function getWeeklySentimentReports(merchantId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(weeklySentimentReports)
    .where(eq(weeklySentimentReports.merchantId, merchantId))
    .orderBy(desc(weeklySentimentReports.weekStartDate))
    .limit(limit);
}

/**
 * الحصول على تقرير معين
 */
export async function getWeeklySentimentReportById(reportId: number) {
  const db = await getDb();
  if (!db) return null;

  const results = await db.select().from(weeklySentimentReports)
    .where(eq(weeklySentimentReports.id, reportId))
    .limit(1);

  return results[0] || null;
}

/**
 * تحديث حالة إرسال البريد
 */
export async function markReportEmailSent(reportId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  await db.update(weeklySentimentReports)
    .set({
      emailSent: true,
      emailSentAt: new Date(),
    })
    .where(eq(weeklySentimentReports.id, reportId));
}

// ============================================
// A/B Testing Functions
// ============================================

/**
 * إنشاء اختبار A/B جديد
 */
export async function createABTest(data: {
  merchantId: number;
  testName: string;
  keyword: string;
  variantAId?: number;
  variantAText: string;
  variantBId?: number;
  variantBText: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  const result = await db.insert(abTestResults).values({
    merchantId: data.merchantId,
    testName: data.testName,
    keyword: data.keyword,
    variantAId: data.variantAId,
    variantAText: data.variantAText,
    variantBId: data.variantBId,
    variantBText: data.variantBText,
    status: 'running',
    startedAt: new Date(),
  });

  return Number(result[0].insertId);
}

/**
 * الحصول على اختبارات A/B للتاجر
 */
export async function getABTests(merchantId: number, status?: 'running' | 'completed' | 'paused') {
  const db = await getDb();
  if (!db) return [];

  const query = db.select().from(abTestResults)
    .where(
      status
        ? and(eq(abTestResults.merchantId, merchantId), eq(abTestResults.status, status))
        : eq(abTestResults.merchantId, merchantId)
    )
    .orderBy(desc(abTestResults.startedAt));

  return await query;
}

/**
 * الحصول على اختبار A/B معين
 */
export async function getABTestById(testId: number) {
  const db = await getDb();
  if (!db) return null;

  const results = await db.select().from(abTestResults)
    .where(eq(abTestResults.id, testId))
    .limit(1);

  return results[0] || null;
}

/**
 * الحصول على اختبار A/B نشط للكلمة المفتاحية
 */
export async function getActiveABTestForKeyword(merchantId: number, keyword: string) {
  const db = await getDb();
  if (!db) return null;

  const results = await db.select().from(abTestResults)
    .where(
      and(
        eq(abTestResults.merchantId, merchantId),
        eq(abTestResults.keyword, keyword),
        eq(abTestResults.status, 'running')
      )
    )
    .limit(1);

  return results[0] || null;
}

/**
 * تسجيل استخدام نسخة من الاختبار
 */
export async function trackABTestUsage(
  testId: number,
  variant: 'A' | 'B',
  wasSuccessful: boolean
) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  const test = await getABTestById(testId);
  if (!test) return;

  if (variant === 'A') {
    await db.update(abTestResults)
      .set({
        variantAUsageCount: test.variantAUsageCount + 1,
        variantASuccessCount: wasSuccessful ? test.variantASuccessCount + 1 : test.variantASuccessCount,
        updatedAt: new Date(),
      })
      .where(eq(abTestResults.id, testId));
  } else {
    await db.update(abTestResults)
      .set({
        variantBUsageCount: test.variantBUsageCount + 1,
        variantBSuccessCount: wasSuccessful ? test.variantBSuccessCount + 1 : test.variantBSuccessCount,
        updatedAt: new Date(),
      })
      .where(eq(abTestResults.id, testId));
  }
}

/**
 * إعلان الفائز في اختبار A/B
 */
export async function declareABTestWinner(
  testId: number,
  winner: 'variant_a' | 'variant_b' | 'no_winner',
  confidenceLevel: number
) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  await db.update(abTestResults)
    .set({
      status: 'completed',
      winner,
      confidenceLevel,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(abTestResults.id, testId));
}

/**
 * إيقاف مؤقت لاختبار A/B
 */
export async function pauseABTest(testId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  await db.update(abTestResults)
    .set({
      status: 'paused',
      updatedAt: new Date(),
    })
    .where(eq(abTestResults.id, testId));
}

/**
 * استئناف اختبار A/B
 */
export async function resumeABTest(testId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  await db.update(abTestResults)
    .set({
      status: 'running',
      updatedAt: new Date(),
    })
    .where(eq(abTestResults.id, testId));
}

// ============================================
// Password Reset Token Management
// ============================================

/**
 * إنشاء رمز إعادة تعيين كلمة المرور
 */
export async function createPasswordResetToken(data: {
  userId: number;
  email: string;
  token: string;
  expiresAt: Date | string;
  used?: number;
}): Promise<PasswordResetToken | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  // Format expiresAt to MySQL-compatible TIMESTAMP (YYYY-MM-DD HH:MM:SS)
  const expiresAtDate = data.expiresAt instanceof Date ? data.expiresAt : new Date(data.expiresAt);
  const formattedExpiresAt = expiresAtDate.toISOString().slice(0, 19).replace('T', ' ');

  const [result] = await db.insert(passwordResetTokens).values({
    ...data,
    expiresAt: formattedExpiresAt,
  });
  return await getPasswordResetTokenById(Number(result.insertId));
}

/**
 * الحصول على رمز إعادة تعيين بواسطة ID
 */
export async function getPasswordResetTokenById(id: number): Promise<PasswordResetToken | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [token] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.id, id));
  return token;
}

/**
 * الحصول على رمز إعادة تعيين بواسطة Token
 */
export async function getPasswordResetTokenByToken(token: string): Promise<PasswordResetToken | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [resetToken] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));
  return resetToken;
}

/**
 * التحقق من صلاحية رمز إعادة التعيين
 * @returns { valid: boolean, reason?: string, token?: PasswordResetToken }
 */
export async function validatePasswordResetToken(token: string): Promise<{
  valid: boolean;
  reason?: string;
  token?: PasswordResetToken;
}> {
  const resetToken = await getPasswordResetTokenByToken(token);

  if (!resetToken) {
    return { valid: false, reason: 'invalid_token' };
  }

  if (resetToken.used) {
    return { valid: false, reason: 'token_already_used' };
  }

  if (new Date() > new Date(resetToken.expiresAt)) {
    return { valid: false, reason: 'token_expired' };
  }

  return { valid: true, token: resetToken };
}

/**
 * تحديث رمز إعادة التعيين كمستخدم
 */
export async function markPasswordResetTokenAsUsed(tokenId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(passwordResetTokens)
    .set({ used: true, usedAt: new Date() })
    .where(eq(passwordResetTokens.id, tokenId));
}

/**
 * حذف جميع رموز إعادة التعيين للمستخدم (للتنظيف)
 */
export async function deletePasswordResetTokensByUserId(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
}

/**
 * حذف الرموز المنتهية الصلاحية (للتنظيف الدوري)
 */
export async function deleteExpiredPasswordResetTokens(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, new Date()));
}

/**
 * ========================================
 * Password Reset Rate Limiting Functions
 * ========================================
 */

/**
 * تسجيل محاولة إعادة تعيين كلمة المرور
 */
export async function trackResetAttempt(data: {
  email: string;
  ipAddress?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(passwordResetAttempts).values({
    email: data.email,
    ipAddress: data.ipAddress,
  });
}

/**
 * الحصول على محاولات إعادة التعيين لبريد إلكتروني معين خلال فترة زمنية
 * @param email البريد الإلكتروني
 * @param minutesAgo عدد الدقائق الماضية (افتراضي: 10 دقائق)
 */
export async function getResetAttempts(
  email: string,
  minutesAgo: number = 10
): Promise<PasswordResetAttempt[]> {
  const db = await getDb();
  if (!db) return [];

  const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000);

  const attempts = await db
    .select()
    .from(passwordResetAttempts)
    .where(
      and(
        eq(passwordResetAttempts.email, email),
        gte(passwordResetAttempts.attemptedAt, cutoffTime)
      )
    )
    .orderBy(desc(passwordResetAttempts.attemptedAt));

  return attempts;
}

/**
 * التحقق من إمكانية طلب إعادة تعيين كلمة المرور
 * @returns { allowed: boolean, remainingTime?: number, attemptsCount: number }
 */
export async function canRequestReset(email: string): Promise<{
  allowed: boolean;
  remainingTime?: number; // بالثواني
  attemptsCount: number;
}> {
  const attempts = await getResetAttempts(email, 10); // آخر 10 دقائق
  const attemptsCount = attempts.length;

  // إذا كان عدد المحاولات أقل من 3، مسموح
  if (attemptsCount < 3) {
    return { allowed: true, attemptsCount };
  }

  // إذا وصل إلى 3 محاولات، احسب الوقت المتبقي
  const oldestAttempt = attempts[attempts.length - 1];
  const attemptTime = new Date(oldestAttempt.attemptedAt).getTime();
  const now = Date.now();
  const tenMinutesInMs = 10 * 60 * 1000;
  const elapsedTime = now - attemptTime;
  const remainingTime = Math.ceil((tenMinutesInMs - elapsedTime) / 1000); // بالثواني

  if (remainingTime > 0) {
    return { allowed: false, remainingTime, attemptsCount };
  }

  // إذا مرت 10 دقائق من أقدم محاولة، مسموح
  return { allowed: true, attemptsCount };
}

/**
 * حذف المحاولات القديمة (أكثر من ساعة)
 */
export async function clearOldAttempts(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await db.delete(passwordResetAttempts).where(lt(passwordResetAttempts.attemptedAt, oneHourAgo));
}


// ============================================
// Try Sari Analytics Functions
// ============================================

/**
 * Create or update analytics session
 */
export async function upsertTrySariAnalytics(data: {
  sessionId: string;
  messageCount?: number;
  exampleUsed?: string;
  convertedToSignup?: boolean;
  signupPromptShown?: boolean;
  ipAddress?: string;
  userAgent?: string;
}): Promise<TrySariAnalytics | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  try {
    // Check if session exists
    const existing = await db
      .select()
      .from(trySariAnalytics)
      .where(eq(trySariAnalytics.sessionId, data.sessionId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing session
      await db
        .update(trySariAnalytics)
        .set({
          messageCount: data.messageCount ?? existing[0].messageCount,
          exampleUsed: data.exampleUsed ?? existing[0].exampleUsed,
          convertedToSignup: data.convertedToSignup ?? existing[0].convertedToSignup,
          signupPromptShown: data.signupPromptShown ?? existing[0].signupPromptShown,
          updatedAt: new Date(),
        })
        .where(eq(trySariAnalytics.sessionId, data.sessionId));

      return existing[0];
    } else {
      // Create new session
      await db
        .insert(trySariAnalytics)
        .values({
          sessionId: data.sessionId,
          messageCount: data.messageCount ?? 0,
          exampleUsed: data.exampleUsed,
          convertedToSignup: data.convertedToSignup ?? false,
          signupPromptShown: data.signupPromptShown ?? false,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        });

      // Fetch the created record
      const created = await db
        .select()
        .from(trySariAnalytics)
        .where(eq(trySariAnalytics.sessionId, data.sessionId))
        .limit(1);

      return created[0];
    }
  } catch (error) {
    console.error("[DB] Error upserting try sari analytics:", error);
    return undefined;
  }
}

/**
 * Increment message count for a session
 */
export async function incrementTrySariMessageCount(sessionId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db
      .update(trySariAnalytics)
      .set({
        messageCount: sql`${trySariAnalytics.messageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(trySariAnalytics.sessionId, sessionId));
  } catch (error) {
    console.error("[DB] Error incrementing message count:", error);
  }
}

/**
 * Mark session as shown signup prompt
 */
export async function markSignupPromptShown(sessionId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db
      .update(trySariAnalytics)
      .set({
        signupPromptShown: true,
        updatedAt: new Date(),
      })
      .where(eq(trySariAnalytics.sessionId, sessionId));
  } catch (error) {
    console.error("[DB] Error marking signup prompt shown:", error);
  }
}

/**
 * Mark session as converted to signup
 */
export async function markConvertedToSignup(sessionId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db
      .update(trySariAnalytics)
      .set({
        convertedToSignup: true,
        updatedAt: new Date(),
      })
      .where(eq(trySariAnalytics.sessionId, sessionId));
  } catch (error) {
    console.error("[DB] Error marking converted to signup:", error);
  }
}

/**
 * Get analytics session by sessionId
 */
export async function getTrySariAnalyticsBySessionId(sessionId: string): Promise<TrySariAnalytics | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  try {
    const [result] = await db
      .select()
      .from(trySariAnalytics)
      .where(eq(trySariAnalytics.sessionId, sessionId))
      .limit(1);

    return result;
  } catch (error) {
    console.error("[DB] Error getting try sari analytics:", error);
    return undefined;
  }
}

/**
 * Get Try Sari analytics stats (for admin dashboard)
 */
export async function getTrySariAnalyticsStats(days: number = 30) {
  const db = await getDb();
  if (!db) return null;

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all sessions in the time range
    const sessions = await db
      .select()
      .from(trySariAnalytics)
      .where(gte(trySariAnalytics.createdAt, formatDateForDB(startDate)));

    // Calculate stats
    const totalSessions = sessions.length;
    const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);
    const promptsShown = sessions.filter(s => s.signupPromptShown).length;
    const conversions = sessions.filter(s => s.convertedToSignup).length;
    const conversionRate = promptsShown > 0 ? (conversions / promptsShown) * 100 : 0;

    // Count example usage
    const exampleUsage: Record<string, number> = {};
    sessions.forEach(s => {
      if (s.exampleUsed) {
        exampleUsage[s.exampleUsed] = (exampleUsage[s.exampleUsed] || 0) + 1;
      }
    });

    // Get unique visitors (by IP)
    const uniqueIPs = new Set(sessions.map(s => s.ipAddress).filter(Boolean));
    const uniqueVisitors = uniqueIPs.size;

    return {
      totalSessions,
      uniqueVisitors,
      totalMessages,
      averageMessagesPerSession: totalSessions > 0 ? (totalMessages / totalSessions).toFixed(1) : '0',
      promptsShown,
      conversions,
      conversionRate: conversionRate.toFixed(1),
      exampleUsage,
    };
  } catch (error) {
    console.error("[DB] Error getting try sari analytics stats:", error);
    return null;
  }
}

/**
 * Get daily analytics data for charts
 */
export async function getTrySariDailyData(days: number = 30) {
  const db = await getDb();
  if (!db) return [];

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const sessions = await db
      .select()
      .from(trySariAnalytics)
      .where(gte(trySariAnalytics.createdAt, formatDateForDB(startDate)))
      .orderBy(trySariAnalytics.createdAt);

    // Group by date
    const dailyData: Record<string, {
      date: string;
      sessions: number;
      messages: number;
      conversions: number;
    }> = {};

    sessions.forEach(s => {
      const dateKey = s.createdAt.toISOString().split('T')[0];
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { date: dateKey, sessions: 0, messages: 0, conversions: 0 };
      }
      dailyData[dateKey].sessions += 1;
      dailyData[dateKey].messages += s.messageCount;
      if (s.convertedToSignup) {
        dailyData[dateKey].conversions += 1;
      }
    });

    return Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error("[DB] Error getting daily data:", error);
    return [];
  }
}


/**
 * Limited Time Offers - دوال إدارة العروض المحدودة الوقت
 */

export async function createLimitedTimeOffer(data: InsertLimitedTimeOffer): Promise<LimitedTimeOffer | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db.insert(limitedTimeOffers).values(data);
    const insertId = Number(result.insertId);
    return await db.query.limitedTimeOffers.findFirst({
      where: eq(limitedTimeOffers.id, insertId),
    }) as LimitedTimeOffer | null;
  } catch (error) {
    console.error("[DB] Error creating limited time offer:", error);
    return null;
  }
}

export async function getActiveLimitedTimeOffers(): Promise<LimitedTimeOffer[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select()
      .from(limitedTimeOffers)
      .where(eq(limitedTimeOffers.isActive, true));
  } catch (error) {
    console.error("[DB] Error getting active offers:", error);
    return [];
  }
}

export async function updateLimitedTimeOffer(id: number, data: Partial<InsertLimitedTimeOffer>): Promise<LimitedTimeOffer | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    await db.update(limitedTimeOffers).set(data).where(eq(limitedTimeOffers.id, id));
    return await db.query.limitedTimeOffers.findFirst({
      where: eq(limitedTimeOffers.id, id),
    }) as LimitedTimeOffer | null;
  } catch (error) {
    console.error("[DB] Error updating offer:", error);
    return null;
  }
}

/**
 * Signup Prompt Variants - دوال إدارة متغيرات النافذة المنبثقة
 */

export async function createSignupPromptVariant(data: InsertSignupPromptVariant): Promise<SignupPromptVariant | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db.insert(signupPromptVariants).values(data);
    const insertId = Number(result.insertId);
    return await db.query.signupPromptVariants.findFirst({
      where: eq(signupPromptVariants.id, insertId),
    }) as SignupPromptVariant | null;
  } catch (error) {
    console.error("[DB] Error creating variant:", error);
    return null;
  }
}

export async function getActiveSignupPromptVariants(): Promise<SignupPromptVariant[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select()
      .from(signupPromptVariants)
      .where(eq(signupPromptVariants.isActive, true));
  } catch (error) {
    console.error("[DB] Error getting variants:", error);
    return [];
  }
}

export async function getRandomSignupPromptVariant(): Promise<SignupPromptVariant | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const variants = await getActiveSignupPromptVariants();
    if (variants.length === 0) return null;
    return variants[Math.floor(Math.random() * variants.length)];
  } catch (error) {
    console.error("[DB] Error getting random variant:", error);
    return null;
  }
}

export async function updateSignupPromptVariant(id: number, data: Partial<InsertSignupPromptVariant>): Promise<SignupPromptVariant | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    await db.update(signupPromptVariants).set(data).where(eq(signupPromptVariants.id, id));
    return await db.query.signupPromptVariants.findFirst({
      where: eq(signupPromptVariants.id, id),
    }) as SignupPromptVariant | null;
  } catch (error) {
    console.error("[DB] Error updating variant:", error);
    return null;
  }
}

/**
 * Signup Prompt Test Results - دوال تتبع نتائج الاختبار
 */

export async function recordSignupPromptTestResult(data: InsertSignupPromptTestResult): Promise<SignupPromptTestResult | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    await db.insert(signupPromptTestResults).values(data);
    return await db.query.signupPromptTestResults.findFirst({
      where: and(
        eq(signupPromptTestResults.sessionId, data.sessionId),
        eq(signupPromptTestResults.variantId, data.variantId),
      ),
    }) as SignupPromptTestResult | null;
  } catch (error) {
    console.error("[DB] Error recording test result:", error);
    return null;
  }
}

export async function updateSignupPromptTestResult(id: number, data: Partial<InsertSignupPromptTestResult>): Promise<SignupPromptTestResult | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    await db.update(signupPromptTestResults).set(data).where(eq(signupPromptTestResults.id, id));
    return await db.query.signupPromptTestResults.findFirst({
      where: eq(signupPromptTestResults.id, id),
    }) as SignupPromptTestResult | null;
  } catch (error) {
    console.error("[DB] Error updating test result:", error);
    return null;
  }
}

export async function getSignupPromptTestStats(days: number = 30) {
  const db = await getDb();
  if (!db) return null;
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await db
      .select()
      .from(signupPromptTestResults)
      .where(gte(signupPromptTestResults.createdAt, formatDateForDB(startDate)));

    // Group by variant
    const stats: Record<string, {
      variant: string;
      shown: number;
      clicked: number;
      converted: number;
      clickRate: number;
      conversionRate: number;
    }> = {};

    results.forEach(r => {
      if (!stats[r.variantId]) {
        stats[r.variantId] = {
          variant: r.variantId,
          shown: 0,
          clicked: 0,
          converted: 0,
          clickRate: 0,
          conversionRate: 0,
        };
      }
      if (r.shown) stats[r.variantId].shown += 1;
      if (r.clicked) stats[r.variantId].clicked += 1;
      if (r.converted) stats[r.variantId].converted += 1;
    });

    // Calculate rates
    Object.values(stats).forEach(s => {
      s.clickRate = s.shown > 0 ? Math.round((s.clicked / s.shown) * 100) : 0;
      s.conversionRate = s.shown > 0 ? Math.round((s.converted / s.shown) * 100) : 0;
    });

    return Object.values(stats);
  } catch (error) {
    console.error("[DB] Error getting test stats:", error);
    return null;
  }
}

// ============================================
// Email Verification
// ============================================

export async function createEmailVerificationToken(data: InsertEmailVerificationToken) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.insert(emailVerificationTokens).values(data);
}

export async function getEmailVerificationToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.query.emailVerificationTokens.findFirst({
    where: eq(emailVerificationTokens.token, token),
  });
}

export async function markEmailVerificationTokenAsUsed(tokenId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(emailVerificationTokens)
    .set({
      isUsed: 1,
      usedAt: new Date().toISOString()
    })
    .where(eq(emailVerificationTokens.id, tokenId));
}

export async function deleteExpiredVerificationTokens() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(emailVerificationTokens)
    .where(lt(emailVerificationTokens.expiresAt, new Date().toISOString()));
}

export async function updateUserEmailVerified(userId: number, email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(users)
    .set({ email, emailVerified: 1 })
    .where(eq(users.id, userId));
}


// Green API Sync Helper Functions
export async function getMessageByExternalId(externalId: string): Promise<Message | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.query.messages.findFirst({
    where: eq(messages.externalId, externalId),
  });
}

export async function updateConversationLastMessage(conversationId: number, lastMessageAt: Date): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(conversations)
    .set({ lastMessageAt })
    .where(eq(conversations.id, conversationId));
}

export async function getSyncLog(merchantId: string) {
  // This can be extended to store sync logs in database
  return {
    merchantId,
    lastSync: new Date(),
    status: "idle",
  };
}

// ============================================
// Setup Wizard Functions
// ============================================

// Business Templates
export async function getAllBusinessTemplates() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(businessTemplates).where(eq(businessTemplates.is_active, 1));
}

export async function getBusinessTemplatesByType(businessType: 'store' | 'services' | 'both') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(businessTemplates)
    .where(and(
      eq(businessTemplates.business_type, businessType),
      eq(businessTemplates.is_active, 1)
    ));
}

export async function getBusinessTemplateById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(businessTemplates).where(eq(businessTemplates.id, id));
  return results[0];
}

export async function incrementTemplateUsage(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(businessTemplates)
    .set({ usageCount: sql`${businessTemplates.usageCount} + 1` })
    .where(eq(businessTemplates.id, id));
}

// Services
export async function createService(service: InsertService) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(services).values(service);
  return result[0].insertId;
}

export async function getServicesByMerchant(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(services)
    .where(and(
      eq(services.merchantId, merchantId),
      eq(services.isActive, 1)
    ))
    .orderBy(services.displayOrder, services.name);
}

export async function getServiceById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(services).where(eq(services.id, id));
  return results[0];
}

export async function updateService(id: number, data: Partial<InsertService>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(services).set(data).where(eq(services.id, id));
}

export async function deleteService(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(services).set({ isActive: 0 }).where(eq(services.id, id));
}

// Service Packages
export async function createServicePackage(pkg: InsertServicePackage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(servicePackages).values(pkg);
  return result[0].insertId;
}

export async function getServicePackagesByMerchant(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(servicePackages)
    .where(and(
      eq(servicePackages.merchantId, merchantId),
      eq(servicePackages.isActive, 1)
    ));
}

// Service Reviews
export async function createServiceReview(review: InsertServiceReview) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(serviceReviews).values(review);
  return result[0].insertId;
}

export async function getServiceReviewsByMerchant(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(serviceReviews)
    .where(eq(serviceReviews.merchantId, merchantId))
    .orderBy(desc(serviceReviews.createdAt));
}

export async function getServiceReviewsByService(serviceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(serviceReviews)
    .where(eq(serviceReviews.serviceId, serviceId))
    .orderBy(desc(serviceReviews.createdAt));
}

// Setup Wizard Progress
export async function getSetupWizardProgress(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(setupWizardProgress)
    .where(eq(setupWizardProgress.merchantId, merchantId));
  return results[0];
}

export async function createSetupWizardProgress(progress: InsertSetupWizardProgress) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(setupWizardProgress).values(progress);
  return result[0].insertId;
}

export async function updateSetupWizardProgress(merchantId: number, data: Partial<InsertSetupWizardProgress>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(setupWizardProgress)
    .set(data)
    .where(eq(setupWizardProgress.merchantId, merchantId));
}

export async function completeSetupWizard(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await db.update(setupWizardProgress)
    .set({ isCompleted: 1, completedAt: now })
    .where(eq(setupWizardProgress.merchantId, merchantId));

  // Also update merchant table
  await db.update(merchants)
    .set({ setupCompleted: 1, setupCompletedAt: now })
    .where(eq(merchants.id, merchantId));
}

// Google Integrations
export async function createGoogleIntegration(integration: InsertGoogleIntegration) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(googleIntegrations).values(integration);
  return result[0].insertId;
}

export async function getGoogleIntegrationsByMerchant(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(googleIntegrations)
    .where(eq(googleIntegrations.merchantId, merchantId));
}

export async function getGoogleIntegration(merchantId: number, integrationType: 'calendar' | 'sheets') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(googleIntegrations)
    .where(and(
      eq(googleIntegrations.merchantId, merchantId),
      eq(googleIntegrations.integrationType, integrationType)
    ));
  return results[0];
}

export async function updateGoogleIntegration(id: number, data: Partial<InsertGoogleIntegration>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(googleIntegrations).set(data).where(eq(googleIntegrations.id, id));
}

export async function deleteGoogleIntegration(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(googleIntegrations).where(eq(googleIntegrations.id, id));
}



// ==================== Appointments ====================

export async function createAppointment(appointment: InsertAppointment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(appointments).values(appointment);
  return result[0].insertId;
}

export async function getAppointmentById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(appointments)
    .where(eq(appointments.id, id));
  return results[0];
}

export async function getAppointmentsByMerchant(merchantId: number, status?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let query = db.select().from(appointments)
    .where(eq(appointments.merchantId, merchantId));

  if (status) {
    query = query.where(eq(appointments.status, status as any));
  }

  return await query.orderBy(desc(appointments.appointmentDate));
}

export async function getAppointmentsByCustomer(merchantId: number, customerPhone: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(appointments)
    .where(and(
      eq(appointments.merchantId, merchantId),
      eq(appointments.customerPhone, customerPhone)
    ))
    .orderBy(desc(appointments.appointmentDate));
}

export async function getAppointmentsByStaff(staffId: number, startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let conditions = [eq(appointments.staffId, staffId)];

  if (startDate) {
    conditions.push(gte(appointments.appointmentDate, startDate));
  }

  if (endDate) {
    conditions.push(lte(appointments.appointmentDate, endDate));
  }

  return await db.select().from(appointments)
    .where(and(...conditions))
    .orderBy(appointments.appointmentDate, appointments.startTime);
}

export async function getAppointmentsByService(serviceId: number, startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let conditions = [eq(appointments.serviceId, serviceId)];

  if (startDate) {
    conditions.push(gte(appointments.appointmentDate, startDate));
  }

  if (endDate) {
    conditions.push(lte(appointments.appointmentDate, endDate));
  }

  return await db.select().from(appointments)
    .where(and(...conditions))
    .orderBy(appointments.appointmentDate, appointments.startTime);
}

export async function getAppointmentsByDate(merchantId: number, date: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(appointments)
    .where(and(
      eq(appointments.merchantId, merchantId),
      eq(appointments.appointmentDate, date)
    ))
    .orderBy(appointments.startTime);
}

export async function updateAppointment(id: number, data: Partial<InsertAppointment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(appointments).set(data).where(eq(appointments.id, id));
}

export async function cancelAppointment(id: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(appointments)
    .set({
      status: 'cancelled',
      cancellationReason: reason
    })
    .where(eq(appointments.id, id));
}

export async function completeAppointment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(appointments)
    .set({ status: 'completed' })
    .where(eq(appointments.id, id));
}

export async function markNoShow(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(appointments)
    .set({ status: 'no_show' })
    .where(eq(appointments.id, id));
}

export async function getUpcomingAppointments(merchantId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  return await db.select().from(appointments)
    .where(and(
      eq(appointments.merchantId, merchantId),
      gte(appointments.appointmentDate, now),
      eq(appointments.status, 'confirmed')
    ))
    .orderBy(appointments.appointmentDate, appointments.startTime)
    .limit(limit);
}

export async function getAppointmentsNeedingReminder(type: '24h' | '1h') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const targetTime = new Date();

  if (type === '24h') {
    targetTime.setHours(targetTime.getHours() + 24);
  } else {
    targetTime.setHours(targetTime.getHours() + 1);
  }

  const targetTimeStr = targetTime.toISOString().slice(0, 19).replace('T', ' ');
  const reminderField = type === '24h' ? appointments.reminder24hSent : appointments.reminder1hSent;

  return await db.select().from(appointments)
    .where(and(
      eq(appointments.status, 'confirmed'),
      lte(appointments.appointmentDate, targetTimeStr),
      eq(reminderField, 0)
    ))
    .orderBy(appointments.appointmentDate, appointments.startTime);
}

export async function markReminderSent(id: number, type: '24h' | '1h') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData = type === '24h'
    ? { reminder24hSent: 1 }
    : { reminder1hSent: 1 };

  await db.update(appointments)
    .set(updateData)
    .where(eq(appointments.id, id));
}

// Check for conflicting appointments
export async function checkAppointmentConflict(
  merchantId: number,
  date: string,
  startTime: string,
  endTime: string,
  staffId?: number,
  excludeAppointmentId?: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let conditions = [
    eq(appointments.merchantId, merchantId),
    eq(appointments.appointmentDate, date),
    ne(appointments.status, 'cancelled'),
  ];

  if (staffId) {
    conditions.push(eq(appointments.staffId, staffId));
  }

  if (excludeAppointmentId) {
    conditions.push(ne(appointments.id, excludeAppointmentId));
  }

  const existingAppointments = await db.select().from(appointments)
    .where(and(...conditions));

  // Check for time overlap
  for (const apt of existingAppointments) {
    const aptStart = apt.startTime;
    const aptEnd = apt.endTime;

    // Check if there's any overlap
    if (
      (startTime >= aptStart && startTime < aptEnd) ||
      (endTime > aptStart && endTime <= aptEnd) ||
      (startTime <= aptStart && endTime >= aptEnd)
    ) {
      return true; // Conflict found
    }
  }

  return false; // No conflict
}

// Get appointment statistics
export async function getAppointmentStats(merchantId: number, startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let conditions = [eq(appointments.merchantId, merchantId)];

  if (startDate) {
    conditions.push(gte(appointments.appointmentDate, startDate));
  }

  if (endDate) {
    conditions.push(lte(appointments.appointmentDate, endDate));
  }

  const allAppointments = await db.select().from(appointments)
    .where(and(...conditions));

  const stats = {
    total: allAppointments.length,
    confirmed: allAppointments.filter(a => a.status === 'confirmed').length,
    completed: allAppointments.filter(a => a.status === 'completed').length,
    cancelled: allAppointments.filter(a => a.status === 'cancelled').length,
    noShow: allAppointments.filter(a => a.status === 'no_show').length,
    pending: allAppointments.filter(a => a.status === 'pending').length,
  };

  return stats;
}

// Get appointments for reminder within time range
export async function getAppointmentsForReminder(
  merchantId: number,
  startTime: Date,
  endTime: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const startStr = formatDateForDB(startTime);
  const endStr = formatDateForDB(endTime);

  // البحث عن المواعيد التي تبدأ في النطاق الزمني المحدد
  const results = await db.select({
    id: appointments.id,
    merchantId: appointments.merchantId,
    customerName: appointments.customerName,
    customerPhone: appointments.customerPhone,
    serviceName: appointments.serviceName,
    staffName: appointments.staffName,
    startTime: appointments.startTime,
    reminder24hSent: appointments.reminder24hSent,
    reminder1hSent: appointments.reminder1hSent,
  })
    .from(appointments)
    .where(and(
      eq(appointments.merchantId, merchantId),
      eq(appointments.status, 'confirmed'),
      gte(appointments.startTime, startStr),
      lt(appointments.startTime, endStr)
    ));

  return results;
}

// Get all merchants with Google Calendar integration
export async function getAllMerchantsWithCalendar() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db.select({
    id: merchants.id,
    businessName: merchants.businessName,
  })
    .from(merchants)
    .innerJoin(googleIntegrations, eq(merchants.id, googleIntegrations.merchantId))
    .where(eq(googleIntegrations.isActive, 1));

  return results;
}

// ==================== Google OAuth Settings ====================

// Get Google OAuth settings
export async function getGoogleOAuthSettings() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db.select()
    .from(googleOAuthSettings)
    .limit(1);

  return results[0] || null;
}

// Create or update Google OAuth settings
export async function upsertGoogleOAuthSettings(data: {
  clientId: string;
  clientSecret: string;
  isEnabled?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getGoogleOAuthSettings();

  if (existing) {
    await db.update(googleOAuthSettings)
      .set({
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        isEnabled: data.isEnabled ?? existing.isEnabled,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(googleOAuthSettings.id, existing.id));

    return { ...existing, ...data };
  } else {
    const [result] = await db.insert(googleOAuthSettings)
      .values({
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        isEnabled: data.isEnabled ?? 1,
      });

    return {
      id: result.insertId,
      ...data,
      isEnabled: data.isEnabled ?? 1,
    };
  }
}

// Toggle Google OAuth enabled status
export async function toggleGoogleOAuthEnabled(isEnabled: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getGoogleOAuthSettings();
  if (!existing) throw new Error("Google OAuth settings not found");

  await db.update(googleOAuthSettings)
    .set({
      isEnabled: isEnabled ? 1 : 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(googleOAuthSettings.id, existing.id));

  return { ...existing, isEnabled: isEnabled ? 1 : 0 };
}


// ============================================
// Service Categories Functions
// ============================================

export async function createServiceCategory(category: {
  merchantId: number;
  name: string;
  nameEn?: string;
  description?: string;
  icon?: string;
  color?: string;
  displayOrder?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(serviceCategories).values(category);
  return result[0].insertId;
}

export async function getServiceCategoriesByMerchant(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(serviceCategories)
    .where(and(
      eq(serviceCategories.merchantId, merchantId),
      eq(serviceCategories.isActive, 1)
    ))
    .orderBy(serviceCategories.displayOrder, serviceCategories.name);
}

export async function getServiceCategoryById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(serviceCategories).where(eq(serviceCategories.id, id));
  return results[0];
}

export async function updateServiceCategory(id: number, data: {
  name?: string;
  nameEn?: string;
  description?: string;
  icon?: string;
  color?: string;
  displayOrder?: number;
  isActive?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(serviceCategories).set(data).where(eq(serviceCategories.id, id));
}

export async function deleteServiceCategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(serviceCategories).set({ isActive: 0 }).where(eq(serviceCategories.id, id));
}

export async function getServicesByCategory(categoryId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(services)
    .where(and(
      eq(services.categoryId, categoryId),
      eq(services.isActive, 1)
    ))
    .orderBy(services.displayOrder, services.name);
}

// ============================================
// Enhanced Staff Functions
// ============================================

export async function updateStaffMember(id: number, data: {
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  specialization?: string;
  workingHours?: string;
  serviceIds?: string;
  avatar?: string;
  bio?: string;
  isActive?: number;
  googleCalendarId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(staffMembers).set(data).where(eq(staffMembers.id, id));
}

export async function assignServicesToStaff(staffId: number, serviceIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(staffMembers)
    .set({ serviceIds: JSON.stringify(serviceIds) })
    .where(eq(staffMembers.id, staffId));
}

export async function getStaffByService(serviceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const allStaff = await db.select().from(staffMembers)
    .where(eq(staffMembers.isActive, 1));

  return allStaff.filter(staff => {
    if (!staff.serviceIds) return false;
    try {
      const ids = JSON.parse(staff.serviceIds);
      return ids.includes(serviceId);
    } catch {
      return false;
    }
  });
}

// ============================================
// Enhanced Service Package Functions
// ============================================

export async function getServicePackageById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(servicePackages).where(eq(servicePackages.id, id));
  return results[0];
}

export async function updateServicePackage(id: number, data: {
  name?: string;
  description?: string;
  serviceIds?: string;
  originalPrice?: number;
  packagePrice?: number;
  discountPercentage?: number;
  isActive?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(servicePackages).set(data).where(eq(servicePackages.id, id));
}

export async function deleteServicePackage(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(servicePackages).set({ isActive: 0 }).where(eq(servicePackages.id, id));
}

export async function getPackageServices(packageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const pkg = await getServicePackageById(packageId);
  if (!pkg || !pkg.serviceIds) return [];

  try {
    const serviceIds = JSON.parse(pkg.serviceIds);
    return await db.select().from(services)
      .where(and(
        sql`${services.id} IN (${serviceIds.join(',')})`,
        eq(services.isActive, 1)
      ));
  } catch {
    return [];
  }
}


// ============================================
// Bookings Functions
// ============================================

export async function createBooking(data: {
  merchantId: number;
  serviceId: number;
  customerPhone: string;
  customerName?: string;
  customerEmail?: string;
  staffId?: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  basePrice: number;
  discountAmount?: number;
  finalPrice: number;
  notes?: string;
  bookingSource?: 'whatsapp' | 'website' | 'phone' | 'walk_in';
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(bookings).values({
    merchantId: data.merchantId,
    serviceId: data.serviceId,
    customerPhone: data.customerPhone,
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    staffId: data.staffId,
    bookingDate: data.bookingDate,
    startTime: data.startTime,
    endTime: data.endTime,
    durationMinutes: data.durationMinutes,
    status: 'pending',
    paymentStatus: 'unpaid',
    basePrice: data.basePrice,
    discountAmount: data.discountAmount || 0,
    finalPrice: data.finalPrice,
    notes: data.notes,
    bookingSource: data.bookingSource || 'whatsapp',
  });

  return result.insertId;
}

export async function getBookingById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(bookings).where(eq(bookings.id, id));
  return results[0];
}

export async function getBookingsByMerchant(merchantId: number, filters?: {
  status?: string;
  serviceId?: number;
  staffId?: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let query = db.select().from(bookings).where(eq(bookings.merchantId, merchantId));

  const conditions = [eq(bookings.merchantId, merchantId)];

  if (filters?.status) {
    conditions.push(eq(bookings.status, filters.status as any));
  }
  if (filters?.serviceId) {
    conditions.push(eq(bookings.serviceId, filters.serviceId));
  }
  if (filters?.staffId) {
    conditions.push(eq(bookings.staffId, filters.staffId));
  }
  if (filters?.startDate) {
    conditions.push(sql`${bookings.bookingDate} >= ${filters.startDate}`);
  }
  if (filters?.endDate) {
    conditions.push(sql`${bookings.bookingDate} <= ${filters.endDate}`);
  }

  const results = await db.select().from(bookings)
    .where(and(...conditions))
    .orderBy(desc(bookings.bookingDate), desc(bookings.startTime))
    .limit(filters?.limit || 100);

  return results;
}

export async function getBookingsByService(serviceId: number, filters?: {
  status?: string;
  startDate?: string;
  endDate?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(bookings.serviceId, serviceId)];

  if (filters?.status) {
    conditions.push(eq(bookings.status, filters.status as any));
  }
  if (filters?.startDate) {
    conditions.push(sql`${bookings.bookingDate} >= ${filters.startDate}`);
  }
  if (filters?.endDate) {
    conditions.push(sql`${bookings.bookingDate} <= ${filters.endDate}`);
  }

  return await db.select().from(bookings)
    .where(and(...conditions))
    .orderBy(desc(bookings.bookingDate));
}

export async function getBookingsByCustomer(merchantId: number, customerPhone: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(bookings)
    .where(and(
      eq(bookings.merchantId, merchantId),
      eq(bookings.customerPhone, customerPhone)
    ))
    .orderBy(desc(bookings.createdAt));
}

export async function updateBooking(id: number, data: {
  status?: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  paymentStatus?: 'unpaid' | 'paid' | 'refunded';
  staffId?: number;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  cancellationReason?: string;
  cancelledBy?: 'customer' | 'merchant' | 'system';
  googleEventId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = { ...data };

  if (data.status === 'confirmed' && !updateData.confirmedAt) {
    updateData.confirmedAt = new Date().toISOString();
  }
  if (data.status === 'completed' && !updateData.completedAt) {
    updateData.completedAt = new Date().toISOString();
  }
  if (data.status === 'cancelled' && !updateData.cancelledAt) {
    updateData.cancelledAt = new Date().toISOString();
  }

  await db.update(bookings).set(updateData).where(eq(bookings.id, id));
}

export async function deleteBooking(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(bookings).where(eq(bookings.id, id));
}

export async function getBookingStats(merchantId: number, filters?: {
  startDate?: string;
  endDate?: string;
  serviceId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(bookings.merchantId, merchantId)];

  if (filters?.startDate) {
    conditions.push(sql`${bookings.bookingDate} >= ${filters.startDate}`);
  }
  if (filters?.endDate) {
    conditions.push(sql`${bookings.bookingDate} <= ${filters.endDate}`);
  }
  if (filters?.serviceId) {
    conditions.push(eq(bookings.serviceId, filters.serviceId));
  }

  const allBookings = await db.select().from(bookings).where(and(...conditions));

  return {
    total: allBookings.length,
    pending: allBookings.filter(b => b.status === 'pending').length,
    confirmed: allBookings.filter(b => b.status === 'confirmed').length,
    inProgress: allBookings.filter(b => b.status === 'in_progress').length,
    completed: allBookings.filter(b => b.status === 'completed').length,
    cancelled: allBookings.filter(b => b.status === 'cancelled').length,
    noShow: allBookings.filter(b => b.status === 'no_show').length,
    totalRevenue: allBookings
      .filter(b => b.status === 'completed' && b.paymentStatus === 'paid')
      .reduce((sum, b) => sum + b.finalPrice, 0),
  };
}

export async function checkBookingConflict(
  serviceId: number,
  staffId: number | null,
  bookingDate: string,
  startTime: string,
  endTime: string,
  excludeBookingId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [
    eq(bookings.serviceId, serviceId),
    eq(bookings.bookingDate, bookingDate),
    sql`${bookings.status} IN ('pending', 'confirmed', 'in_progress')`,
    sql`(
      (${bookings.startTime} < ${endTime} AND ${bookings.endTime} > ${startTime})
    )`
  ];

  if (staffId) {
    conditions.push(eq(bookings.staffId, staffId));
  }

  if (excludeBookingId) {
    conditions.push(sql`${bookings.id} != ${excludeBookingId}`);
  }

  const conflicts = await db.select().from(bookings).where(and(...conditions));
  return conflicts.length > 0;
}

export async function markBookingReminderSent(bookingId: number, type: '24h' | '1h') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (type === '24h') {
    await db.update(bookings)
      .set({ reminder24hSent: 1 })
      .where(eq(bookings.id, bookingId));
  } else {
    await db.update(bookings)
      .set({ reminder1hSent: 1 })
      .where(eq(bookings.id, bookingId));
  }
}

export async function getUpcomingBookingsForReminders(merchantId: number, hoursAhead: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const targetTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  const reminderField = hoursAhead === 24 ? bookings.reminder24hSent : bookings.reminder1hSent;

  return await db.select().from(bookings)
    .where(and(
      eq(bookings.merchantId, merchantId),
      eq(bookings.status, 'confirmed'),
      eq(reminderField, 0),
      sql`CONCAT(${bookings.bookingDate}, ' ', ${bookings.startTime}) <= ${targetTime.toISOString().slice(0, 16).replace('T', ' ')}`,
      sql`CONCAT(${bookings.bookingDate}, ' ', ${bookings.startTime}) > ${now.toISOString().slice(0, 16).replace('T', ' ')}`
    ));
}

// ============================================
// Booking Time Slots Functions
// ============================================

export async function createTimeSlot(data: {
  merchantId: number;
  serviceId: number;
  staffId?: number;
  slotDate: string;
  startTime: string;
  endTime: string;
  maxBookings?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(bookingTimeSlots).values({
    merchantId: data.merchantId,
    serviceId: data.serviceId,
    staffId: data.staffId,
    slotDate: data.slotDate,
    startTime: data.startTime,
    endTime: data.endTime,
    isAvailable: 1,
    isBlocked: 0,
    maxBookings: data.maxBookings || 1,
    currentBookings: 0,
  });

  return result.insertId;
}

export async function getAvailableTimeSlots(
  serviceId: number,
  date: string,
  staffId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [
    eq(bookingTimeSlots.serviceId, serviceId),
    eq(bookingTimeSlots.slotDate, date),
    eq(bookingTimeSlots.isAvailable, 1),
    eq(bookingTimeSlots.isBlocked, 0),
    sql`${bookingTimeSlots.currentBookings} < ${bookingTimeSlots.maxBookings}`
  ];

  if (staffId) {
    conditions.push(eq(bookingTimeSlots.staffId, staffId));
  }

  return await db.select().from(bookingTimeSlots)
    .where(and(...conditions))
    .orderBy(bookingTimeSlots.startTime);
}

export async function blockTimeSlot(id: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(bookingTimeSlots)
    .set({ isBlocked: 1, blockReason: reason })
    .where(eq(bookingTimeSlots.id, id));
}

export async function unblockTimeSlot(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(bookingTimeSlots)
    .set({ isBlocked: 0, blockReason: null })
    .where(eq(bookingTimeSlots.id, id));
}

export async function incrementSlotBookings(slotId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(bookingTimeSlots)
    .set({ currentBookings: sql`${bookingTimeSlots.currentBookings} + 1` })
    .where(eq(bookingTimeSlots.id, slotId));
}

export async function decrementSlotBookings(slotId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(bookingTimeSlots)
    .set({ currentBookings: sql`${bookingTimeSlots.currentBookings} - 1` })
    .where(eq(bookingTimeSlots.id, slotId));
}

// ============================================
// Booking Reviews Functions
// ============================================

export async function createBookingReview(data: {
  merchantId: number;
  bookingId: number;
  serviceId: number;
  staffId?: number;
  customerPhone: string;
  customerName?: string;
  overallRating: number;
  serviceQuality?: number;
  professionalism?: number;
  valueForMoney?: number;
  comment?: string;
  isPublic?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(bookingReviews).values({
    merchantId: data.merchantId,
    bookingId: data.bookingId,
    serviceId: data.serviceId,
    staffId: data.staffId,
    customerPhone: data.customerPhone,
    customerName: data.customerName,
    overallRating: data.overallRating,
    serviceQuality: data.serviceQuality,
    professionalism: data.professionalism,
    valueForMoney: data.valueForMoney,
    comment: data.comment,
    isPublic: data.isPublic ?? 1,
    isVerified: 1,
  });

  return result.insertId;
}

export async function getBookingReviews(merchantId: number, filters?: {
  serviceId?: number;
  staffId?: number;
  minRating?: number;
  isPublic?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(bookingReviews.merchantId, merchantId)];

  if (filters?.serviceId) {
    conditions.push(eq(bookingReviews.serviceId, filters.serviceId));
  }
  if (filters?.staffId) {
    conditions.push(eq(bookingReviews.staffId, filters.staffId));
  }
  if (filters?.minRating) {
    conditions.push(sql`${bookingReviews.overallRating} >= ${filters.minRating}`);
  }
  if (filters?.isPublic !== undefined) {
    conditions.push(eq(bookingReviews.isPublic, filters.isPublic));
  }

  return await db.select().from(bookingReviews)
    .where(and(...conditions))
    .orderBy(desc(bookingReviews.createdAt))
    .limit(filters?.limit || 50);
}

export async function getReviewsByService(serviceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(bookingReviews)
    .where(and(
      eq(bookingReviews.serviceId, serviceId),
      eq(bookingReviews.isPublic, 1)
    ))
    .orderBy(desc(bookingReviews.createdAt));
}

export async function replyToReview(reviewId: number, reply: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(bookingReviews)
    .set({
      merchantReply: reply,
      repliedAt: new Date().toISOString()
    })
    .where(eq(bookingReviews.id, reviewId));
}

export async function getServiceRatingStats(serviceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const reviews = await db.select().from(bookingReviews)
    .where(and(
      eq(bookingReviews.serviceId, serviceId),
      eq(bookingReviews.isPublic, 1)
    ));

  if (reviews.length === 0) {
    return {
      averageRating: 0,
      totalReviews: 0,
      ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    };
  }

  const totalRating = reviews.reduce((sum, r) => sum + r.overallRating, 0);
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  reviews.forEach(r => {
    distribution[r.overallRating as keyof typeof distribution]++;
  });

  return {
    averageRating: totalRating / reviews.length,
    totalReviews: reviews.length,
    ratingDistribution: distribution
  };
}


// ==================== Merchant Payment Settings ====================

/**
 * Get merchant payment settings
 */
export async function getMerchantPaymentSettings(merchantId: number): Promise<MerchantPaymentSettings | null> {
  const db = await getDb();
  if (!db) return null;

  const results = await db.select()
    .from(merchantPaymentSettings)
    .where(eq(merchantPaymentSettings.merchantId, merchantId))
    .limit(1);

  return results[0] || null;
}

/**
 * Create or update merchant payment settings
 */
export async function upsertMerchantPaymentSettings(
  merchantId: number,
  data: Partial<Omit<InsertMerchantPaymentSettings, 'merchantId' | 'id' | 'createdAt' | 'updatedAt'>>
): Promise<MerchantPaymentSettings | null> {
  const db = await getDb();
  if (!db) return null;

  const existing = await getMerchantPaymentSettings(merchantId);

  if (existing) {
    // Update existing
    await db.update(merchantPaymentSettings)
      .set(data)
      .where(eq(merchantPaymentSettings.merchantId, merchantId));
  } else {
    // Insert new
    await db.insert(merchantPaymentSettings).values({
      merchantId,
      ...data,
    });
  }

  return getMerchantPaymentSettings(merchantId);
}

/**
 * Enable/disable Tap payments for merchant
 */
export async function setMerchantTapEnabled(merchantId: number, enabled: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await upsertMerchantPaymentSettings(merchantId, { tapEnabled: enabled ? 1 : 0 });
}

/**
 * Update Tap API keys for merchant
 */
export async function updateMerchantTapKeys(
  merchantId: number,
  publicKey: string,
  secretKey: string,
  testMode: boolean = true
): Promise<MerchantPaymentSettings | null> {
  return upsertMerchantPaymentSettings(merchantId, {
    tapPublicKey: publicKey,
    tapSecretKey: secretKey,
    tapTestMode: testMode ? 1 : 0,
  });
}

/**
 * Set merchant payment settings as verified
 */
export async function setMerchantPaymentVerified(merchantId: number, verified: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await upsertMerchantPaymentSettings(merchantId, {
    isVerified: verified ? 1 : 0,
    lastVerifiedAt: verified ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
  });
}

/**
 * Get all merchants with Tap enabled
 */
export async function getMerchantsWithTapEnabled(): Promise<MerchantPaymentSettings[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(merchantPaymentSettings)
    .where(eq(merchantPaymentSettings.tapEnabled, 1));
}

/**
 * Check if merchant has valid Tap configuration
 */
export async function hasMerchantValidTapConfig(merchantId: number): Promise<boolean> {
  const settings = await getMerchantPaymentSettings(merchantId);

  if (!settings) return false;
  if (!settings.tapEnabled) return false;
  if (!settings.tapPublicKey || !settings.tapSecretKey) return false;

  return true;
}


// ============================================
// Platform Integrations (Zid, Calendly, etc.)
// ============================================

/**
 * Get integration by type for a merchant
 */
export async function getIntegrationByType(merchantId: number, type: 'zid' | 'calendly' | 'shopify' | 'woocommerce'): Promise<PlatformIntegration | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select()
    .from(platformIntegrations)
    .where(and(
      eq(platformIntegrations.merchantId, merchantId),
      eq(platformIntegrations.platformType, type)
    ))
    .limit(1);

  return result[0];
}

/**
 * Create a new integration
 */
export async function createIntegration(data: {
  merchantId: number;
  type: 'zid' | 'calendly' | 'shopify' | 'woocommerce';
  storeName?: string;
  storeUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  isActive?: boolean;
  settings?: string;
}): Promise<PlatformIntegration | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  // Delete existing integration of same type
  await deleteIntegrationByType(data.merchantId, data.type);

  const result = await db.insert(platformIntegrations).values({
    merchantId: data.merchantId,
    platformType: data.type,
    storeName: data.storeName,
    storeUrl: data.storeUrl,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    isActive: data.isActive !== false ? 1 : 0,
    settings: data.settings,
  });

  return getIntegrationByType(data.merchantId, data.type);
}

/**
 * Delete integration by type
 */
export async function deleteIntegrationByType(merchantId: number, type: 'zid' | 'calendly' | 'shopify' | 'woocommerce'): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(platformIntegrations)
    .where(and(
      eq(platformIntegrations.merchantId, merchantId),
      eq(platformIntegrations.platformType, type)
    ));
}

/**
 * Update integration last sync time
 */
export async function updateIntegrationLastSync(integrationId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(platformIntegrations)
    .set({ lastSyncAt: new Date().toISOString().slice(0, 19).replace('T', ' ') })
    .where(eq(platformIntegrations.id, integrationId));
}

/**
 * Update integration settings
 */
export async function updateIntegrationSettings(integrationId: number, settings: Record<string, any>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(platformIntegrations)
    .set({ settings: JSON.stringify(settings) })
    .where(eq(platformIntegrations.id, integrationId));
}

/**
 * Get all integrations for a merchant
 */
export async function getIntegrationsByMerchant(merchantId: number): Promise<PlatformIntegration[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(platformIntegrations)
    .where(eq(platformIntegrations.merchantId, merchantId));
}

/**
 * Upsert product from Zid
 */
export async function upsertProductFromZid(merchantId: number, zidProduct: any): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Check if product exists by external ID
  const existing = await db.select()
    .from(products)
    .where(and(
      eq(products.merchantId, merchantId),
      eq(products.externalId, String(zidProduct.id))
    ))
    .limit(1);

  const productData = {
    merchantId,
    externalId: String(zidProduct.id),
    name: zidProduct.name || zidProduct.title,
    description: zidProduct.description,
    price: Math.round((zidProduct.price || 0) * 100), // Convert to cents
    stock: zidProduct.quantity || zidProduct.stock || 0,
    imageUrl: zidProduct.image?.url || zidProduct.images?.[0]?.url,
    category: zidProduct.category?.name,
    isActive: zidProduct.is_active !== false ? 1 : 0,
    source: 'zid' as const,
  };

  if (existing[0]) {
    await db.update(products)
      .set(productData)
      .where(eq(products.id, existing[0].id));
  } else {
    await db.insert(products).values(productData);
  }
}

/**
 * Upsert order from Zid
 */
export async function upsertOrderFromZid(merchantId: number, zidOrder: any): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Check if order exists by external ID
  const existing = await db.select()
    .from(orders)
    .where(and(
      eq(orders.merchantId, merchantId),
      eq(orders.externalId, String(zidOrder.id))
    ))
    .limit(1);

  const orderData = {
    merchantId,
    externalId: String(zidOrder.id),
    customerPhone: zidOrder.customer?.phone || zidOrder.phone,
    customerName: zidOrder.customer?.name || zidOrder.name,
    totalAmount: Math.round((zidOrder.total || 0) * 100),
    status: mapZidOrderStatus(zidOrder.status),
    items: JSON.stringify(zidOrder.items || zidOrder.products || []),
    source: 'zid',
  };

  if (existing[0]) {
    await db.update(orders)
      .set(orderData)
      .where(eq(orders.id, existing[0].id));
  } else {
    await db.insert(orders).values(orderData);
  }
}

/**
 * Update product inventory from Zid
 */
export async function updateProductInventoryFromZid(merchantId: number, payload: any): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(products)
    .set({ stock: payload.quantity || payload.stock || 0 })
    .where(and(
      eq(products.merchantId, merchantId),
      eq(products.externalId, String(payload.product_id))
    ));
}

/**
 * Map Zid order status to internal status
 */
function mapZidOrderStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'pending': 'pending',
    'processing': 'processing',
    'shipped': 'shipped',
    'delivered': 'delivered',
    'cancelled': 'cancelled',
    'refunded': 'refunded',
  };
  return statusMap[status?.toLowerCase()] || 'pending';
}

/**
 * Upsert appointment from Calendly
 */
export async function upsertAppointmentFromCalendly(merchantId: number, calendlyEvent: any): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const eventUri = calendlyEvent.uri || calendlyEvent.payload?.event?.uri;

  // Check if appointment exists by external ID
  const existing = await db.select()
    .from(appointments)
    .where(and(
      eq(appointments.merchantId, merchantId),
      eq(appointments.externalId, eventUri)
    ))
    .limit(1);

  const event = calendlyEvent.payload?.event || calendlyEvent;
  const invitee = calendlyEvent.payload?.invitee;

  const appointmentData = {
    merchantId,
    externalId: eventUri,
    customerPhone: invitee?.phone_number || '',
    customerName: invitee?.name || event.name,
    customerEmail: invitee?.email,
    startTime: event.start_time,
    endTime: event.end_time,
    status: 'confirmed',
    notes: event.location?.location || '',
    source: 'calendly',
  };

  if (existing[0]) {
    await db.update(appointments)
      .set(appointmentData)
      .where(eq(appointments.id, existing[0].id));
  } else {
    await db.insert(appointments).values(appointmentData);
  }
}

/**
 * Cancel appointment from Calendly
 */
export async function cancelAppointmentFromCalendly(merchantId: number, payload: any): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const eventUri = payload.payload?.event?.uri;

  await db.update(appointments)
    .set({ status: 'cancelled' })
    .where(and(
      eq(appointments.merchantId, merchantId),
      eq(appointments.externalId, eventUri)
    ));
}

/**
 * Get appointment stats by merchant
 */
export async function getAppointmentStatsByMerchant(merchantId: number): Promise<{
  total: number;
  upcoming: number;
  eventTypes: number;
  remindersSent: number;
}> {
  const db = await getDb();
  if (!db) return { total: 0, upcoming: 0, eventTypes: 0, remindersSent: 0 };

  const now = new Date().toISOString();

  const totalResult = await db.select({ count: sql<number>`count(*)` })
    .from(appointments)
    .where(eq(appointments.merchantId, merchantId));

  const upcomingResult = await db.select({ count: sql<number>`count(*)` })
    .from(appointments)
    .where(and(
      eq(appointments.merchantId, merchantId),
      gte(appointments.startTime, now),
      eq(appointments.status, 'confirmed')
    ));

  const reminderResult = await db.select({ count: sql<number>`count(*)` })
    .from(appointments)
    .where(and(
      eq(appointments.merchantId, merchantId),
      eq(appointments.reminder24hSent, 1)
    ));

  return {
    total: Number(totalResult[0]?.count) || 0,
    upcoming: Number(upcomingResult[0]?.count) || 0,
    eventTypes: 0, // This would need to be fetched from Calendly API
    remindersSent: Number(reminderResult[0]?.count) || 0,
  };
}

/**
 * Get product count by merchant
 */
export async function getProductCountByMerchant(merchantId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.merchantId, merchantId));

  return Number(result[0]?.count) || 0;
}

/**
 * Get order count by merchant
 */
export async function getOrderCountByMerchant(merchantId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(eq(orders.merchantId, merchantId));

  return Number(result[0]?.count) || 0;
}

/**
 * Get customer count by merchant
 */
export async function getCustomerCountByMerchant(merchantId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Count unique customers from conversations
  const result = await db.select({ count: sql<number>`count(distinct ${conversations.customerPhone})` })
    .from(conversations)
    .where(eq(conversations.merchantId, merchantId));

  return Number(result[0]?.count) || 0;
}

/**
 * Get sync logs by merchant and type
 */
export async function getSyncLogsByMerchant(merchantId: number, typePrefix: string, limit: number = 10): Promise<SyncLog[]> {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(syncLogs)
    .where(and(
      eq(syncLogs.merchantId, merchantId),
      sql`${syncLogs.type} LIKE ${typePrefix + '%'}`
    ))
    .orderBy(desc(syncLogs.createdAt))
    .limit(limit);
}



// ============================================
// Customer Management Functions
// ============================================

/**
 * Get all customers for a merchant with their stats
 */
export async function getCustomersByMerchant(merchantId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  // Get unique customers from conversations with their latest interaction
  const customersData = await db
    .select({
      customerPhone: conversations.customerPhone,
      customerName: conversations.customerName,
      lastMessageAt: sql<Date>`MAX(${conversations.lastMessageAt})`,
      totalMessages: sql<number>`COUNT(DISTINCT ${conversations.id})`,
    })
    .from(conversations)
    .where(eq(conversations.merchantId, merchantId))
    .groupBy(conversations.customerPhone, conversations.customerName);

  // Enrich with order data
  const enrichedCustomers = await Promise.all(
    customersData.map(async (customer) => {
      // Get orders count and total spent
      const orderStats = await db
        .select({
          orderCount: sql<number>`COUNT(*)`,
          totalSpent: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.merchantId, merchantId),
            eq(orders.customerPhone, customer.customerPhone)
          )
        );

      // Get loyalty points
      const loyaltyData = await db
        .select()
        .from(loyaltyPoints)
        .where(
          and(
            eq(loyaltyPoints.merchantId, merchantId),
            eq(loyaltyPoints.customerPhone, customer.customerPhone)
          )
        )
        .limit(1);

      return {
        ...customer,
        orderCount: Number(orderStats[0]?.orderCount) || 0,
        totalSpent: Number(orderStats[0]?.totalSpent) || 0,
        loyaltyPoints: loyaltyData[0]?.points || 0,
        status: determineCustomerStatus(customer.lastMessageAt),
      };
    })
  );

  return enrichedCustomers.sort((a, b) =>
    new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

/**
 * Determine customer status based on last interaction
 */
function determineCustomerStatus(lastMessageAt: Date): 'active' | 'inactive' | 'new' {
  const now = new Date();
  const daysSinceLastMessage = Math.floor(
    (now.getTime() - new Date(lastMessageAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceLastMessage <= 7) return 'active';
  if (daysSinceLastMessage <= 30) return 'new';
  return 'inactive';
}

/**
 * Get customer by phone for a merchant
 */
export async function getCustomerByPhone(merchantId: number, customerPhone: string): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;

  // Get customer basic info from conversations
  const customerConv = await db
    .select({
      customerPhone: conversations.customerPhone,
      customerName: conversations.customerName,
      lastMessageAt: sql<Date>`MAX(${conversations.lastMessageAt})`,
      firstMessageAt: sql<Date>`MIN(${conversations.createdAt})`,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.merchantId, merchantId),
        eq(conversations.customerPhone, customerPhone)
      )
    )
    .groupBy(conversations.customerPhone, conversations.customerName)
    .limit(1);

  if (!customerConv[0]) return null;

  // Get orders
  const customerOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        eq(orders.customerPhone, customerPhone)
      )
    )
    .orderBy(desc(orders.createdAt));

  // Get order stats
  const orderStats = await db
    .select({
      orderCount: sql<number>`COUNT(*)`,
      totalSpent: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.merchantId, merchantId),
        eq(orders.customerPhone, customerPhone)
      )
    );

  // Get loyalty points
  const loyaltyData = await db
    .select()
    .from(loyaltyPoints)
    .where(
      and(
        eq(loyaltyPoints.merchantId, merchantId),
        eq(loyaltyPoints.customerPhone, customerPhone)
      )
    )
    .limit(1);

  // Get conversations
  const customerConversations = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.merchantId, merchantId),
        eq(conversations.customerPhone, customerPhone)
      )
    )
    .orderBy(desc(conversations.lastMessageAt));

  return {
    ...customerConv[0],
    orderCount: Number(orderStats[0]?.orderCount) || 0,
    totalSpent: Number(orderStats[0]?.totalSpent) || 0,
    loyaltyPoints: loyaltyData[0]?.points || 0,
    status: determineCustomerStatus(customerConv[0].lastMessageAt),
    orders: customerOrders,
    conversations: customerConversations,
  };
}

/**
 * Get customer statistics for a merchant
 */
export async function getCustomerStats(merchantId: number): Promise<{
  total: number;
  active: number;
  new: number;
  inactive: number;
}> {
  const db = await getDb();
  if (!db) return { total: 0, active: 0, new: 0, inactive: 0 };

  const customers = await getCustomersByMerchant(merchantId);

  return {
    total: customers.length,
    active: customers.filter(c => c.status === 'active').length,
    new: customers.filter(c => c.status === 'new').length,
    inactive: customers.filter(c => c.status === 'inactive').length,
  };
}

/**
 * Search customers by name or phone
 */
export async function searchCustomers(
  merchantId: number,
  query: string
): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const allCustomers = await getCustomersByMerchant(merchantId);

  return allCustomers.filter(
    (customer) =>
      customer.customerName?.toLowerCase().includes(query.toLowerCase()) ||
      customer.customerPhone.includes(query)
  );
}

// ============================================
// Website Analysis Functions
// ============================================

/**
 * Create a new website analysis
 */
export async function createWebsiteAnalysis(data: {
  merchantId: number;
  url: string;
  title?: string;
  description?: string;
  industry?: string;
  language?: string;
  seoScore?: number;
  seoIssues?: string[];
  metaTags?: any;
  performanceScore?: number;
  loadTime?: number;
  pageSize?: number;
  uxScore?: number;
  mobileOptimized?: boolean;
  hasContactInfo?: boolean;
  hasWhatsapp?: boolean;
  contentQuality?: number;
  wordCount?: number;
  imageCount?: number;
  videoCount?: number;
  overallScore?: number;
  status?: 'pending' | 'analyzing' | 'completed' | 'failed';
  errorMessage?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const result = await db.insert(websiteAnalyses).values({
    merchantId: data.merchantId,
    url: data.url,
    title: data.title,
    description: data.description,
    industry: data.industry,
    language: data.language,
    seoScore: data.seoScore || 0,
    seoIssues: data.seoIssues ? JSON.stringify(data.seoIssues) : null,
    metaTags: data.metaTags ? JSON.stringify(data.metaTags) : null,
    performanceScore: data.performanceScore || 0,
    loadTime: data.loadTime,
    pageSize: data.pageSize,
    uxScore: data.uxScore || 0,
    mobileOptimized: data.mobileOptimized ? 1 : 0,
    hasContactInfo: data.hasContactInfo ? 1 : 0,
    hasWhatsapp: data.hasWhatsapp ? 1 : 0,
    contentQuality: data.contentQuality || 0,
    wordCount: data.wordCount || 0,
    imageCount: data.imageCount || 0,
    videoCount: data.videoCount || 0,
    overallScore: data.overallScore || 0,
    status: data.status || 'pending',
    errorMessage: data.errorMessage,
    analyzedAt: data.status === 'completed' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
  });

  return result[0].insertId;
}

/**
 * Update website analysis
 */
export async function updateWebsiteAnalysis(
  id: number,
  data: Partial<{
    title: string;
    description: string;
    industry: string;
    language: string;
    seoScore: number;
    seoIssues: string[];
    metaTags: any;
    performanceScore: number;
    loadTime: number;
    pageSize: number;
    uxScore: number;
    mobileOptimized: boolean;
    hasContactInfo: boolean;
    hasWhatsapp: boolean;
    contentQuality: number;
    wordCount: number;
    imageCount: number;
    videoCount: number;
    overallScore: number;
    status: 'pending' | 'analyzing' | 'completed' | 'failed';
    errorMessage: string;
  }>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const updateData: any = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.industry !== undefined) updateData.industry = data.industry;
  if (data.language !== undefined) updateData.language = data.language;
  if (data.seoScore !== undefined) updateData.seoScore = data.seoScore;
  if (data.seoIssues !== undefined) updateData.seoIssues = JSON.stringify(data.seoIssues);
  if (data.metaTags !== undefined) updateData.metaTags = JSON.stringify(data.metaTags);
  if (data.performanceScore !== undefined) updateData.performanceScore = data.performanceScore;
  if (data.loadTime !== undefined) updateData.loadTime = data.loadTime;
  if (data.pageSize !== undefined) updateData.pageSize = data.pageSize;
  if (data.uxScore !== undefined) updateData.uxScore = data.uxScore;
  if (data.mobileOptimized !== undefined) updateData.mobileOptimized = data.mobileOptimized ? 1 : 0;
  if (data.hasContactInfo !== undefined) updateData.hasContactInfo = data.hasContactInfo ? 1 : 0;
  if (data.hasWhatsapp !== undefined) updateData.hasWhatsapp = data.hasWhatsapp ? 1 : 0;
  if (data.contentQuality !== undefined) updateData.contentQuality = data.contentQuality;
  if (data.wordCount !== undefined) updateData.wordCount = data.wordCount;
  if (data.imageCount !== undefined) updateData.imageCount = data.imageCount;
  if (data.videoCount !== undefined) updateData.videoCount = data.videoCount;
  if (data.overallScore !== undefined) updateData.overallScore = data.overallScore;
  if (data.status !== undefined) {
    updateData.status = data.status;
    if (data.status === 'completed') {
      updateData.analyzedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
  }
  if (data.errorMessage !== undefined) updateData.errorMessage = data.errorMessage;

  await db.update(websiteAnalyses).set(updateData).where(eq(websiteAnalyses.id, id));
}

/**
 * Get website analysis by ID
 */
export async function getWebsiteAnalysisById(id: number): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(websiteAnalyses).where(eq(websiteAnalyses.id, id));

  if (result.length === 0) return null;

  const analysis = result[0];
  return {
    ...analysis,
    seoIssues: analysis.seoIssues ? JSON.parse(analysis.seoIssues) : [],
    metaTags: analysis.metaTags ? JSON.parse(analysis.metaTags) : {},
    mobileOptimized: !!analysis.mobileOptimized,
    hasContactInfo: !!analysis.hasContactInfo,
    hasWhatsapp: !!analysis.hasWhatsapp,
  };
}

/**
 * Get all website analyses for a merchant
 */
export async function getWebsiteAnalysesByMerchant(merchantId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(websiteAnalyses)
    .where(eq(websiteAnalyses.merchantId, merchantId))
    .orderBy(desc(websiteAnalyses.createdAt));

  return result.map(analysis => ({
    ...analysis,
    seoIssues: analysis.seoIssues ? JSON.parse(analysis.seoIssues) : [],
    metaTags: analysis.metaTags ? JSON.parse(analysis.metaTags) : {},
    mobileOptimized: !!analysis.mobileOptimized,
    hasContactInfo: !!analysis.hasContactInfo,
    hasWhatsapp: !!analysis.hasWhatsapp,
  }));
}

/**
 * Delete website analysis
 */
export async function deleteWebsiteAnalysis(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  await db.delete(websiteAnalyses).where(eq(websiteAnalyses.id, id));
}

// ============================================
// Website Insights Functions
// ============================================

/**
 * Create website insight
 */
export async function createWebsiteInsight(data: {
  analysisId: number;
  merchantId: number;
  category: 'seo' | 'performance' | 'ux' | 'content' | 'marketing' | 'security';
  type: 'strength' | 'weakness' | 'opportunity' | 'threat' | 'recommendation';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  recommendation?: string;
  impact?: string;
  confidence: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const result = await db.insert(websiteInsights).values({
    analysisId: data.analysisId,
    merchantId: data.merchantId,
    category: data.category,
    type: data.type,
    priority: data.priority,
    title: data.title,
    description: data.description,
    recommendation: data.recommendation,
    impact: data.impact,
    aiGenerated: 1,
    confidence: data.confidence,
  });

  return result[0].insertId;
}

/**
 * Get insights by analysis ID
 */
export async function getInsightsByAnalysisId(analysisId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(websiteInsights)
    .where(eq(websiteInsights.analysisId, analysisId))
    .orderBy(desc(websiteInsights.priority), desc(websiteInsights.confidence));
}

/**
 * Get insights by merchant ID
 */
export async function getInsightsByMerchantId(merchantId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(websiteInsights)
    .where(eq(websiteInsights.merchantId, merchantId))
    .orderBy(desc(websiteInsights.createdAt));
}

// ============================================
// Extracted Products Functions
// ============================================

/**
 * Create extracted product
 */
export async function createExtractedProduct(data: {
  analysisId: number;
  merchantId: number;
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  productUrl?: string;
  category?: string;
  tags?: string[];
  inStock?: boolean;
  stockQuantity?: number;
  confidence: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const result = await db.insert(extractedProducts).values({
    analysisId: data.analysisId,
    merchantId: data.merchantId,
    name: data.name,
    description: data.description,
    price: data.price?.toString(),
    currency: data.currency || 'SAR',
    imageUrl: data.imageUrl,
    productUrl: data.productUrl,
    category: data.category,
    tags: data.tags ? JSON.stringify(data.tags) : null,
    inStock: data.inStock !== false ? 1 : 0,
    stockQuantity: data.stockQuantity,
    aiExtracted: 1,
    confidence: data.confidence,
  });

  return result[0].insertId;
}

/**
 * Get extracted products by analysis ID
 */
export async function getExtractedProductsByAnalysisId(analysisId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(extractedProducts)
    .where(eq(extractedProducts.analysisId, analysisId))
    .orderBy(desc(extractedProducts.confidence));

  return result.map(product => ({
    ...product,
    price: product.price ? parseFloat(product.price) : null,
    tags: product.tags ? JSON.parse(product.tags) : [],
    inStock: !!product.inStock,
  }));
}

// ============================================
// Competitor Analysis Functions
// ============================================

/**
 * Create competitor analysis
 */
export async function createCompetitorAnalysis(data: {
  merchantId: number;
  name: string;
  url: string;
  industry?: string;
  overallScore?: number;
  seoScore?: number;
  performanceScore?: number;
  uxScore?: number;
  contentScore?: number;
  avgPrice?: number;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  productCount?: number;
  strengths?: string[];
  weaknesses?: string[];
  opportunities?: string[];
  status?: 'pending' | 'analyzing' | 'completed' | 'failed';
  errorMessage?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const result = await db.insert(competitorAnalyses).values({
    merchantId: data.merchantId,
    name: data.name,
    url: data.url,
    industry: data.industry,
    overallScore: data.overallScore || 0,
    seoScore: data.seoScore || 0,
    performanceScore: data.performanceScore || 0,
    uxScore: data.uxScore || 0,
    contentScore: data.contentScore || 0,
    avgPrice: data.avgPrice?.toString(),
    minPrice: data.minPrice?.toString(),
    maxPrice: data.maxPrice?.toString(),
    currency: data.currency || 'SAR',
    productCount: data.productCount || 0,
    strengths: data.strengths ? JSON.stringify(data.strengths) : null,
    weaknesses: data.weaknesses ? JSON.stringify(data.weaknesses) : null,
    opportunities: data.opportunities ? JSON.stringify(data.opportunities) : null,
    status: data.status || 'pending',
    errorMessage: data.errorMessage,
    analyzedAt: data.status === 'completed' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
  });

  return result[0].insertId;
}

/**
 * Update competitor analysis
 */
export async function updateCompetitorAnalysis(
  id: number,
  data: Partial<{
    overallScore: number;
    seoScore: number;
    performanceScore: number;
    uxScore: number;
    contentScore: number;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    productCount: number;
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    status: 'pending' | 'analyzing' | 'completed' | 'failed';
    errorMessage: string;
  }>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const updateData: any = {};

  if (data.overallScore !== undefined) updateData.overallScore = data.overallScore;
  if (data.seoScore !== undefined) updateData.seoScore = data.seoScore;
  if (data.performanceScore !== undefined) updateData.performanceScore = data.performanceScore;
  if (data.uxScore !== undefined) updateData.uxScore = data.uxScore;
  if (data.contentScore !== undefined) updateData.contentScore = data.contentScore;
  if (data.avgPrice !== undefined) updateData.avgPrice = data.avgPrice.toString();
  if (data.minPrice !== undefined) updateData.minPrice = data.minPrice.toString();
  if (data.maxPrice !== undefined) updateData.maxPrice = data.maxPrice.toString();
  if (data.productCount !== undefined) updateData.productCount = data.productCount;
  if (data.strengths !== undefined) updateData.strengths = JSON.stringify(data.strengths);
  if (data.weaknesses !== undefined) updateData.weaknesses = JSON.stringify(data.weaknesses);
  if (data.opportunities !== undefined) updateData.opportunities = JSON.stringify(data.opportunities);
  if (data.status !== undefined) {
    updateData.status = data.status;
    if (data.status === 'completed') {
      updateData.analyzedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
  }
  if (data.errorMessage !== undefined) updateData.errorMessage = data.errorMessage;

  await db.update(competitorAnalyses).set(updateData).where(eq(competitorAnalyses.id, id));
}

/**
 * Get competitor analysis by ID
 */
export async function getCompetitorAnalysisById(id: number): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(competitorAnalyses).where(eq(competitorAnalyses.id, id));

  if (result.length === 0) return null;

  const competitor = result[0];
  return {
    ...competitor,
    avgPrice: competitor.avgPrice ? parseFloat(competitor.avgPrice) : null,
    minPrice: competitor.minPrice ? parseFloat(competitor.minPrice) : null,
    maxPrice: competitor.maxPrice ? parseFloat(competitor.maxPrice) : null,
    strengths: competitor.strengths ? JSON.parse(competitor.strengths) : [],
    weaknesses: competitor.weaknesses ? JSON.parse(competitor.weaknesses) : [],
    opportunities: competitor.opportunities ? JSON.parse(competitor.opportunities) : [],
  };
}

/**
 * Get all competitor analyses for a merchant
 */
export async function getCompetitorAnalysesByMerchant(merchantId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(competitorAnalyses)
    .where(eq(competitorAnalyses.merchantId, merchantId))
    .orderBy(desc(competitorAnalyses.createdAt));

  return result.map(competitor => ({
    ...competitor,
    avgPrice: competitor.avgPrice ? parseFloat(competitor.avgPrice) : null,
    minPrice: competitor.minPrice ? parseFloat(competitor.minPrice) : null,
    maxPrice: competitor.maxPrice ? parseFloat(competitor.maxPrice) : null,
    strengths: competitor.strengths ? JSON.parse(competitor.strengths) : [],
    weaknesses: competitor.weaknesses ? JSON.parse(competitor.weaknesses) : [],
    opportunities: competitor.opportunities ? JSON.parse(competitor.opportunities) : [],
  }));
}

/**
 * Delete competitor analysis
 */
export async function deleteCompetitorAnalysis(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  await db.delete(competitorAnalyses).where(eq(competitorAnalyses.id, id));
}

// ============================================
// Competitor Products Functions
// ============================================

/**
 * Create competitor product
 */
export async function createCompetitorProduct(data: {
  competitorId: number;
  merchantId: number;
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  productUrl?: string;
  category?: string;
  similarToMerchantProduct?: number;
  priceDifference?: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const result = await db.insert(competitorProducts).values({
    competitorId: data.competitorId,
    merchantId: data.merchantId,
    name: data.name,
    description: data.description,
    price: data.price?.toString(),
    currency: data.currency || 'SAR',
    imageUrl: data.imageUrl,
    productUrl: data.productUrl,
    category: data.category,
    similarToMerchantProduct: data.similarToMerchantProduct,
    priceDifference: data.priceDifference?.toString(),
  });

  return result[0].insertId;
}

/**
 * Get competitor products by competitor ID
 */
export async function getCompetitorProductsByCompetitorId(competitorId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(competitorProducts)
    .where(eq(competitorProducts.competitorId, competitorId));

  return result.map(product => ({
    ...product,
    price: product.price ? parseFloat(product.price) : null,
    priceDifference: product.priceDifference ? parseFloat(product.priceDifference) : null,
  }));
}


// ============================================
// Smart Website Analysis Functions
// ============================================

/**
 * Update merchant website analysis info
 */
export async function updateMerchantWebsiteInfo(data: {
  merchantId: number;
  websiteUrl?: string;
  platformType?: 'salla' | 'zid' | 'shopify' | 'woocommerce' | 'custom' | 'unknown';
  analysisStatus?: 'pending' | 'analyzing' | 'completed' | 'failed';
  lastAnalysisDate?: Date;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const updateData: any = {};
  if (data.websiteUrl !== undefined) updateData.websiteUrl = data.websiteUrl;
  if (data.platformType !== undefined) updateData.platformType = data.platformType;
  if (data.analysisStatus !== undefined) updateData.analysisStatus = data.analysisStatus;
  if (data.lastAnalysisDate !== undefined) updateData.lastAnalysisDate = data.lastAnalysisDate.toISOString();

  await db
    .update(merchants)
    .set(updateData)
    .where(eq(merchants.id, data.merchantId));
}

/**
 * Get merchant website analysis info
 */
export async function getMerchantWebsiteInfo(merchantId: number): Promise<{
  websiteUrl: string | null;
  platformType: string | null;
  analysisStatus: string | null;
  lastAnalysisDate: string | null;
} | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select({
      websiteUrl: merchants.websiteUrl,
      platformType: merchants.platformType,
      analysisStatus: merchants.analysisStatus,
      lastAnalysisDate: merchants.lastAnalysisDate,
    })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);

  return result[0] || null;
}

/**
 * Create discovered page
 */
export async function createDiscoveredPage(data: {
  merchantId: number;
  pageType: 'about' | 'shipping' | 'returns' | 'faq' | 'contact' | 'privacy' | 'terms' | 'other';
  title?: string;
  url: string;
  content?: string;
  isActive?: boolean;
  useInBot?: boolean;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const result = await db.insert(discoveredPages).values({
    merchantId: data.merchantId,
    pageType: data.pageType,
    title: data.title,
    url: data.url,
    content: data.content,
    isActive: data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1,
    useInBot: data.useInBot !== undefined ? (data.useInBot ? 1 : 0) : 1,
    discoveredAt: new Date().toISOString(),
  });

  return result[0].insertId;
}

/**
 * Get discovered pages by merchant ID
 */
export async function getDiscoveredPagesByMerchantId(merchantId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(discoveredPages)
    .where(eq(discoveredPages.merchantId, merchantId))
    .orderBy(discoveredPages.pageType);

  return result.map(page => ({
    ...page,
    isActive: page.isActive === 1,
    useInBot: page.useInBot === 1,
  }));
}

/**
 * Get discovered pages by type
 */
export async function getDiscoveredPagesByType(
  merchantId: number,
  pageType: 'about' | 'shipping' | 'returns' | 'faq' | 'contact' | 'privacy' | 'terms' | 'other'
): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(discoveredPages)
    .where(
      and(
        eq(discoveredPages.merchantId, merchantId),
        eq(discoveredPages.pageType, pageType)
      )
    );

  return result.map(page => ({
    ...page,
    isActive: page.isActive === 1,
    useInBot: page.useInBot === 1,
  }));
}

/**
 * Update discovered page
 */
export async function updateDiscoveredPage(
  pageId: number,
  data: {
    title?: string;
    url?: string;
    content?: string;
    isActive?: boolean;
    useInBot?: boolean;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const updateData: any = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.url !== undefined) updateData.url = data.url;
  if (data.content !== undefined) updateData.content = data.content;
  if (data.isActive !== undefined) updateData.isActive = data.isActive ? 1 : 0;
  if (data.useInBot !== undefined) updateData.useInBot = data.useInBot ? 1 : 0;

  await db
    .update(discoveredPages)
    .set(updateData)
    .where(eq(discoveredPages.id, pageId));
}

/**
 * Delete discovered page
 */
export async function deleteDiscoveredPage(pageId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  await db.delete(discoveredPages).where(eq(discoveredPages.id, pageId));
}

/**
 * Delete all discovered pages for merchant
 */
export async function deleteAllDiscoveredPages(merchantId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  await db.delete(discoveredPages).where(eq(discoveredPages.merchantId, merchantId));
}

/**
 * Create extracted FAQ
 */
export async function createExtractedFaq(data: {
  merchantId: number;
  pageId?: number;
  question: string;
  answer: string;
  category?: string;
  isActive?: boolean;
  useInBot?: boolean;
  priority?: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const result = await db.insert(extractedFaqs).values({
    merchantId: data.merchantId,
    pageId: data.pageId,
    question: data.question,
    answer: data.answer,
    category: data.category,
    isActive: data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1,
    useInBot: data.useInBot !== undefined ? (data.useInBot ? 1 : 0) : 1,
    priority: data.priority || 0,
    usageCount: 0,
    extractedAt: new Date().toISOString(),
  });

  return result[0].insertId;
}

/**
 * Get extracted FAQs by merchant ID
 */
export async function getExtractedFaqsByMerchantId(merchantId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(extractedFaqs)
    .where(eq(extractedFaqs.merchantId, merchantId))
    .orderBy(extractedFaqs.priority, extractedFaqs.category);

  return result.map(faq => ({
    ...faq,
    isActive: faq.isActive === 1,
    useInBot: faq.useInBot === 1,
  }));
}

/**
 * Get extracted FAQs by category
 */
export async function getExtractedFaqsByCategory(
  merchantId: number,
  category: string
): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(extractedFaqs)
    .where(
      and(
        eq(extractedFaqs.merchantId, merchantId),
        eq(extractedFaqs.category, category)
      )
    )
    .orderBy(extractedFaqs.priority);

  return result.map(faq => ({
    ...faq,
    isActive: faq.isActive === 1,
    useInBot: faq.useInBot === 1,
  }));
}

/**
 * Get active FAQs for bot (useInBot = true, isActive = true)
 */
export async function getActiveFaqsForBot(merchantId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(extractedFaqs)
    .where(
      and(
        eq(extractedFaqs.merchantId, merchantId),
        eq(extractedFaqs.isActive, 1),
        eq(extractedFaqs.useInBot, 1)
      )
    )
    .orderBy(extractedFaqs.priority);

  return result.map(faq => ({
    ...faq,
    isActive: faq.isActive === 1,
    useInBot: faq.useInBot === 1,
  }));
}

/**
 * Update extracted FAQ
 */
export async function updateExtractedFaq(
  faqId: number,
  data: {
    question?: string;
    answer?: string;
    category?: string;
    isActive?: boolean;
    useInBot?: boolean;
    priority?: number;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const updateData: any = {};
  if (data.question !== undefined) updateData.question = data.question;
  if (data.answer !== undefined) updateData.answer = data.answer;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.isActive !== undefined) updateData.isActive = data.isActive ? 1 : 0;
  if (data.useInBot !== undefined) updateData.useInBot = data.useInBot ? 1 : 0;
  if (data.priority !== undefined) updateData.priority = data.priority;

  await db
    .update(extractedFaqs)
    .set(updateData)
    .where(eq(extractedFaqs.id, faqId));
}

/**
 * Increment FAQ usage count
 */
export async function incrementFaqUsageCount(faqId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  await db
    .update(extractedFaqs)
    .set({
      usageCount: sql`${extractedFaqs.usageCount} + 1`,
      lastUsedAt: new Date().toISOString(),
    })
    .where(eq(extractedFaqs.id, faqId));
}

/**
 * Delete extracted FAQ
 */
export async function deleteExtractedFaq(faqId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  await db.delete(extractedFaqs).where(eq(extractedFaqs.id, faqId));
}

/**
 * Delete all extracted FAQs for merchant
 */
export async function deleteAllExtractedFaqs(merchantId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  await db.delete(extractedFaqs).where(eq(extractedFaqs.merchantId, merchantId));
}

/**
 * Search FAQs by question text
 */
export async function searchFaqsByQuestion(
  merchantId: number,
  searchQuery: string
): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(extractedFaqs)
    .where(
      and(
        eq(extractedFaqs.merchantId, merchantId),
        eq(extractedFaqs.isActive, 1),
        sql`${extractedFaqs.question} LIKE ${`%${searchQuery}%`}`
      )
    )
    .orderBy(extractedFaqs.priority)
    .limit(10);

  return result.map(faq => ({
    ...faq,
    isActive: faq.isActive === 1,
    useInBot: faq.useInBot === 1,
  }));
}

/**
 * Get analysis statistics
 */
export async function getAnalysisStats(merchantId: number): Promise<{
  totalPages: number;
  totalFaqs: number;
  pagesByType: Record<string, number>;
  faqsByCategory: Record<string, number>;
}> {
  const db = await getDb();
  if (!db) {
    return {
      totalPages: 0,
      totalFaqs: 0,
      pagesByType: {},
      faqsByCategory: {},
    };
  }

  // Get total pages
  const pages = await db
    .select()
    .from(discoveredPages)
    .where(eq(discoveredPages.merchantId, merchantId));

  // Get total FAQs
  const faqs = await db
    .select()
    .from(extractedFaqs)
    .where(eq(extractedFaqs.merchantId, merchantId));

  // Count pages by type
  const pagesByType: Record<string, number> = {};
  pages.forEach(page => {
    pagesByType[page.pageType] = (pagesByType[page.pageType] || 0) + 1;
  });

  // Count FAQs by category
  const faqsByCategory: Record<string, number> = {};
  faqs.forEach(faq => {
    const category = faq.category || 'general';
    faqsByCategory[category] = (faqsByCategory[category] || 0) + 1;
  });

  return {
    totalPages: pages.length,
    totalFaqs: faqs.length,
    pagesByType,
    faqsByCategory,
  };
}

// ==================== Zid Integration Database Functions ====================

/**
 * Get Zid settings for merchant
 */
export async function getZidSettings(merchantId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(zidSettings)
    .where(eq(zidSettings.merchantId, merchantId))
    .limit(1);

  return result[0] || null;
}

/**
 * Create or update Zid settings
 */
export async function upsertZidSettings(merchantId: number, settings: any) {
  const db = await getDb();
  if (!db) return null;

  const existing = await getZidSettings(merchantId);

  if (existing) {
    await db
      .update(zidSettings)
      .set({
        ...settings,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(zidSettings.id, existing.id));

    return { ...existing, ...settings };
  } else {
    const result = await db
      .insert(zidSettings)
      .values({
        merchantId,
        ...settings,
      });

    return { id: Number(result[0].insertId), merchantId, ...settings };
  }
}

/**
 * Save Zid product to database
 */
export async function saveZidProduct(merchantId: number, productData: any) {
  const db = await getDb();
  if (!db) return null;

  // Check if product exists
  const existing = await db
    .select()
    .from(zidProducts)
    .where(
      and(
        eq(zidProducts.merchantId, merchantId),
        eq(zidProducts.zidProductId, productData.zidProductId)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(zidProducts)
      .set({
        ...productData,
        lastSyncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(zidProducts.id, existing[0].id));

    return { ...existing[0], ...productData };
  } else {
    const result = await db
      .insert(zidProducts)
      .values({
        merchantId,
        ...productData,
        lastSyncedAt: new Date().toISOString(),
      });

    return { id: Number(result[0].insertId), merchantId, ...productData };
  }
}

/**
 * Get all Zid products for merchant
 */
export async function getZidProducts(merchantId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(zidProducts)
    .where(eq(zidProducts.merchantId, merchantId))
    .orderBy(desc(zidProducts.createdAt));
}

/**
 * Get Zid product by ID
 */
export async function getZidProductById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(zidProducts)
    .where(eq(zidProducts.id, id))
    .limit(1);

  return result[0] || null;
}

/**
 * Get Zid product by Zid product ID
 */
export async function getZidProductByZidId(merchantId: number, zidProductId: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(zidProducts)
    .where(
      and(
        eq(zidProducts.merchantId, merchantId),
        eq(zidProducts.zidProductId, zidProductId)
      )
    )
    .limit(1);

  return result[0] || null;
}

/**
 * Link Zid product to Sari product
 */
export async function linkZidProductToSariProduct(
  zidProductId: number,
  sariProductId: number
) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(zidProducts)
    .set({ sariProductId })
    .where(eq(zidProducts.id, zidProductId));
}

/**
 * Save Zid order to database
 */
export async function saveZidOrder(merchantId: number, orderData: any) {
  const db = await getDb();
  if (!db) return null;

  // Check if order exists
  const existing = await db
    .select()
    .from(zidOrders)
    .where(
      and(
        eq(zidOrders.merchantId, merchantId),
        eq(zidOrders.zidOrderId, orderData.zidOrderId)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(zidOrders)
      .set({
        ...orderData,
        lastSyncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(zidOrders.id, existing[0].id));

    return { ...existing[0], ...orderData };
  } else {
    const result = await db
      .insert(zidOrders)
      .values({
        merchantId,
        ...orderData,
        lastSyncedAt: new Date().toISOString(),
      });

    return { id: Number(result[0].insertId), merchantId, ...orderData };
  }
}

/**
 * Get all Zid orders for merchant
 */
export async function getZidOrders(merchantId: number, filters?: {
  status?: string;
  customerPhone?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db
    .select()
    .from(zidOrders)
    .where(eq(zidOrders.merchantId, merchantId));

  if (filters?.status) {
    query = query.where(eq(zidOrders.status, filters.status as any));
  }

  if (filters?.customerPhone) {
    query = query.where(eq(zidOrders.customerPhone, filters.customerPhone));
  }

  query = query.orderBy(desc(zidOrders.createdAt));

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  return await query;
}

/**
 * Get Zid order by ID
 */
export async function getZidOrderById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(zidOrders)
    .where(eq(zidOrders.id, id))
    .limit(1);

  return result[0] || null;
}

/**
 * Get Zid order by Zid order ID
 */
export async function getZidOrderByZidId(merchantId: number, zidOrderId: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(zidOrders)
    .where(
      and(
        eq(zidOrders.merchantId, merchantId),
        eq(zidOrders.zidOrderId, zidOrderId)
      )
    )
    .limit(1);

  return result[0] || null;
}

/**
 * Link Zid order to Sari order
 */
export async function linkZidOrderToSariOrder(
  zidOrderId: number,
  sariOrderId: number
) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(zidOrders)
    .set({ sariOrderId })
    .where(eq(zidOrders.id, zidOrderId));
}

/**
 * Save Zid webhook event
 */
export async function saveZidWebhook(merchantId: number, webhookData: {
  webhookId?: string;
  eventType: string;
  payload: string;
  status?: 'pending' | 'processed' | 'failed';
  ipAddress?: string;
  userAgent?: string;
}) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .insert(zidWebhooks)
    .values({
      merchantId,
      ...webhookData,
      status: webhookData.status || 'pending',
    });

  return { id: Number(result[0].insertId), merchantId, ...webhookData };
}

/**
 * Update Zid webhook status
 */
export async function updateZidWebhookStatus(
  webhookId: number,
  status: 'pending' | 'processed' | 'failed',
  errorMessage?: string
) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(zidWebhooks)
    .set({
      status,
      errorMessage,
      processedAt: new Date().toISOString(),
    })
    .where(eq(zidWebhooks.id, webhookId));
}

/**
 * Get Zid webhooks for merchant
 */
export async function getZidWebhooks(merchantId: number, filters?: {
  eventType?: string;
  status?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db
    .select()
    .from(zidWebhooks)
    .where(eq(zidWebhooks.merchantId, merchantId));

  if (filters?.eventType) {
    query = query.where(eq(zidWebhooks.eventType, filters.eventType));
  }

  if (filters?.status) {
    query = query.where(eq(zidWebhooks.status, filters.status as any));
  }

  query = query.orderBy(desc(zidWebhooks.createdAt));

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  return await query;
}

/**
 * Create Zid sync log
 */
export async function createZidSyncLog(merchantId: number, syncData: {
  syncType: 'products' | 'orders' | 'customers' | 'inventory';
  totalItems?: number;
}) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .insert(zidSyncLogs)
    .values({
      merchantId,
      syncType: syncData.syncType,
      status: 'in_progress',
      totalItems: syncData.totalItems || 0,
      processedItems: 0,
      successCount: 0,
      failedCount: 0,
      startedAt: new Date().toISOString(),
    });

  return { id: Number(result[0].insertId), merchantId, ...syncData };
}

/**
 * Update Zid sync log
 */
export async function updateZidSyncLog(
  syncLogId: number,
  updates: {
    status?: 'pending' | 'in_progress' | 'completed' | 'failed';
    processedItems?: number;
    successCount?: number;
    failedCount?: number;
    errorMessage?: string;
    syncDetails?: string;
  }
) {
  const db = await getDb();
  if (!db) return;

  const updateData: any = { ...updates };

  if (updates.status === 'completed' || updates.status === 'failed') {
    updateData.completedAt = new Date().toISOString();
  }

  await db
    .update(zidSyncLogs)
    .set(updateData)
    .where(eq(zidSyncLogs.id, syncLogId));
}

/**
 * Get Zid sync logs for merchant
 */
export async function getZidSyncLogs(merchantId: number, limit: number = 20) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(zidSyncLogs)
    .where(eq(zidSyncLogs.merchantId, merchantId))
    .orderBy(desc(zidSyncLogs.createdAt))
    .limit(limit);
}

/**
 * Get Zid integration stats
 */
export async function getZidIntegrationStats(merchantId: number) {
  const db = await getDb();
  if (!db) {
    return {
      totalProducts: 0,
      totalOrders: 0,
      totalWebhooks: 0,
      lastSync: null,
    };
  }

  const [productsCount, ordersCount, webhooksCount, lastSyncLog] = await Promise.all([
    db.select().from(zidProducts).where(eq(zidProducts.merchantId, merchantId)),
    db.select().from(zidOrders).where(eq(zidOrders.merchantId, merchantId)),
    db.select().from(zidWebhooks).where(eq(zidWebhooks.merchantId, merchantId)),
    db
      .select()
      .from(zidSyncLogs)
      .where(eq(zidSyncLogs.merchantId, merchantId))
      .orderBy(desc(zidSyncLogs.createdAt))
      .limit(1),
  ]);

  return {
    totalProducts: productsCount.length,
    totalOrders: ordersCount.length,
    totalWebhooks: webhooksCount.length,
    lastSync: lastSyncLog[0]?.createdAt || null,
  };
}

// ==================== WooCommerce Functions ====================

// WooCommerce Settings
export async function getWooCommerceSettings(merchantId: number) {
  return await db.select().from(woocommerceSettings).where(eq(woocommerceSettings.merchantId, merchantId)).limit(1).then(r => r[0] || null);
}

export async function createWooCommerceSettings(data: NewWooCommerceSettings) {
  const [result] = await db.insert(woocommerceSettings).values(data);
  return result.insertId;
}

export async function updateWooCommerceSettings(merchantId: number, data: Partial<NewWooCommerceSettings>) {
  await db.update(woocommerceSettings).set(data).where(eq(woocommerceSettings.merchantId, merchantId));
}

export async function deleteWooCommerceSettings(merchantId: number) {
  await db.delete(woocommerceSettings).where(eq(woocommerceSettings.merchantId, merchantId));
}

export async function updateWooCommerceConnectionStatus(merchantId: number, status: 'connected' | 'disconnected' | 'error', storeInfo?: { version?: string; name?: string; currency?: string }) {
  const updateData: any = {
    connectionStatus: status,
    lastTestAt: new Date().toISOString(),
  };

  if (storeInfo) {
    if (storeInfo.version) updateData.storeVersion = storeInfo.version;
    if (storeInfo.name) updateData.storeName = storeInfo.name;
    if (storeInfo.currency) updateData.storeCurrency = storeInfo.currency;
  }

  await db.update(woocommerceSettings).set(updateData).where(eq(woocommerceSettings.merchantId, merchantId));
}

// WooCommerce Products
export async function getWooCommerceProducts(merchantId: number, limit: number = 50, offset: number = 0) {
  return await db.select().from(woocommerceProducts).where(eq(woocommerceProducts.merchantId, merchantId)).limit(limit).offset(offset);
}

export async function getWooCommerceProductById(id: number) {
  return await db.select().from(woocommerceProducts).where(eq(woocommerceProducts.id, id)).limit(1).then(r => r[0] || null);
}

export async function getWooCommerceProductByWooId(merchantId: number, wooProductId: number) {
  return await db.select().from(woocommerceProducts)
    .where(and(
      eq(woocommerceProducts.merchantId, merchantId),
      eq(woocommerceProducts.wooProductId, wooProductId)
    ))
    .limit(1)
    .then(r => r[0] || null);
}

export async function createWooCommerceProduct(data: NewWooCommerceProduct) {
  const [result] = await db.insert(woocommerceProducts).values(data);
  return result.insertId;
}

export async function updateWooCommerceProduct(id: number, data: Partial<NewWooCommerceProduct>) {
  await db.update(woocommerceProducts).set(data).where(eq(woocommerceProducts.id, id));
}

export async function deleteWooCommerceProduct(id: number) {
  await db.delete(woocommerceProducts).where(eq(woocommerceProducts.id, id));
}

export async function deleteWooCommerceProductsByMerchant(merchantId: number) {
  await db.delete(woocommerceProducts).where(eq(woocommerceProducts.merchantId, merchantId));
}

export async function searchWooCommerceProducts(merchantId: number, searchTerm: string, limit: number = 20) {
  return await db.select().from(woocommerceProducts)
    .where(and(
      eq(woocommerceProducts.merchantId, merchantId),
      or(
        like(woocommerceProducts.name, `%${searchTerm}%`),
        like(woocommerceProducts.sku, `%${searchTerm}%`)
      )
    ))
    .limit(limit);
}

export async function getWooCommerceProductsStats(merchantId: number) {
  const allProducts = await db.select().from(woocommerceProducts).where(eq(woocommerceProducts.merchantId, merchantId));

  return {
    total: allProducts.length,
    inStock: allProducts.filter(p => p.stockStatus === 'instock').length,
    outOfStock: allProducts.filter(p => p.stockStatus === 'outofstock').length,
    onBackorder: allProducts.filter(p => p.stockStatus === 'onbackorder').length,
  };
}

// WooCommerce Orders
export async function getWooCommerceOrders(merchantId: number, limit: number = 50, offset: number = 0) {
  return await db.select().from(woocommerceOrders).where(eq(woocommerceOrders.merchantId, merchantId)).orderBy(desc(woocommerceOrders.orderDate)).limit(limit).offset(offset);
}

export async function getWooCommerceOrderById(id: number) {
  return await db.select().from(woocommerceOrders).where(eq(woocommerceOrders.id, id)).limit(1).then(r => r[0] || null);
}

export async function getWooCommerceOrderByWooId(merchantId: number, wooOrderId: number) {
  return await db.select().from(woocommerceOrders)
    .where(and(
      eq(woocommerceOrders.merchantId, merchantId),
      eq(woocommerceOrders.wooOrderId, wooOrderId)
    ))
    .limit(1)
    .then(r => r[0] || null);
}

export async function createWooCommerceOrder(data: NewWooCommerceOrder) {
  const [result] = await db.insert(woocommerceOrders).values(data);
  return result.insertId;
}

export async function updateWooCommerceOrder(id: number, data: Partial<NewWooCommerceOrder>) {
  await db.update(woocommerceOrders).set(data).where(eq(woocommerceOrders.id, id));
}

export async function deleteWooCommerceOrder(id: number) {
  await db.delete(woocommerceOrders).where(eq(woocommerceOrders.id, id));
}

export async function deleteWooCommerceOrdersByMerchant(merchantId: number) {
  await db.delete(woocommerceOrders).where(eq(woocommerceOrders.merchantId, merchantId));
}

export async function getWooCommerceOrdersByStatus(merchantId: number, status: string, limit: number = 50) {
  return await db.select().from(woocommerceOrders)
    .where(and(
      eq(woocommerceOrders.merchantId, merchantId),
      eq(woocommerceOrders.status, status)
    ))
    .orderBy(desc(woocommerceOrders.orderDate))
    .limit(limit);
}

export async function getWooCommerceOrdersStats(merchantId: number) {
  const allOrders = await db.select().from(woocommerceOrders).where(eq(woocommerceOrders.merchantId, merchantId));

  const statusCounts: Record<string, number> = {};
  let totalRevenue = 0;

  allOrders.forEach(order => {
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    totalRevenue += parseFloat(order.total.toString());
  });

  return {
    total: allOrders.length,
    statusCounts,
    totalRevenue: totalRevenue.toFixed(2),
  };
}

// WooCommerce Sync Logs
export async function createWooCommerceSyncLog(data: NewWooCommerceSyncLog) {
  const [result] = await db.insert(woocommerceSyncLogs).values(data);
  return result.insertId;
}

export async function updateWooCommerceSyncLog(id: number, data: Partial<NewWooCommerceSyncLog>) {
  await db.update(woocommerceSyncLogs).set(data).where(eq(woocommerceSyncLogs.id, id));
}

export async function getWooCommerceSyncLogs(merchantId: number, limit: number = 50) {
  return await db.select().from(woocommerceSyncLogs).where(eq(woocommerceSyncLogs.merchantId, merchantId)).orderBy(desc(woocommerceSyncLogs.createdAt)).limit(limit);
}

export async function getWooCommerceSyncLogById(id: number) {
  const db = await getDb();
  if (!db) return null;
  return await db.select().from(woocommerceSyncLogs).where(eq(woocommerceSyncLogs.id, id)).limit(1).then(r => r[0] || null);
}

export async function getLatestWooCommerceSyncLog(merchantId: number, syncType: 'products' | 'orders' | 'customers' | 'manual') {
  const db = await getDb();
  if (!db) return null;
  return await db.select().from(woocommerceSyncLogs)
    .where(and(
      eq(woocommerceSyncLogs.merchantId, merchantId),
      eq(woocommerceSyncLogs.syncType, syncType)
    ))
    .orderBy(desc(woocommerceSyncLogs.createdAt))
    .limit(1)
    .then(r => r[0] || null);
}

// WooCommerce Webhooks
export async function createWooCommerceWebhook(data: NewWooCommerceWebhook) {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.insert(woocommerceWebhooks).values(data);
  return result.insertId;
}

export async function updateWooCommerceWebhook(id: number, data: Partial<NewWooCommerceWebhook>) {
  await db.update(woocommerceWebhooks).set(data).where(eq(woocommerceWebhooks.id, id));
}

export async function getWooCommerceWebhooks(merchantId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(woocommerceWebhooks).where(eq(woocommerceWebhooks.merchantId, merchantId)).orderBy(desc(woocommerceWebhooks.createdAt)).limit(limit);
}

export async function getPendingWooCommerceWebhooks(merchantId: number, limit: number = 10) {
  return await db.select().from(woocommerceWebhooks)
    .where(and(
      eq(woocommerceWebhooks.merchantId, merchantId),
      eq(woocommerceWebhooks.status, 'pending')
    ))
    .orderBy(woocommerceWebhooks.createdAt)
    .limit(limit);
}

// Export db instance for direct access
export { _db as db };

// ============================================
// Template Translations Functions
// ============================================

export async function createTemplateTranslation(data: InsertTemplateTranslation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(templateTranslations).values(data);
  return result.insertId;
}

export async function updateTemplateTranslation(id: number, data: Partial<InsertTemplateTranslation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(templateTranslations).set(data).where(eq(templateTranslations.id, id));
}

export async function deleteTemplateTranslation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(templateTranslations).where(eq(templateTranslations.id, id));
}

export async function getTemplateTranslationsByTemplateId(templateId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(templateTranslations).where(eq(templateTranslations.template_id, templateId));
}

export async function getTemplateTranslation(templateId: number, language: 'ar' | 'en') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(templateTranslations)
    .where(and(
      eq(templateTranslations.template_id, templateId),
      eq(templateTranslations.language, language)
    ));
  return results[0];
}


export async function getBusinessTemplatesWithTranslations(language?: 'ar' | 'en') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const templates = await db.select().from(businessTemplates).where(eq(businessTemplates.is_active, 1));

  const templatesWithTranslations = await Promise.all(
    templates.map(async (template) => {
      const translations = await getTemplateTranslationsByTemplateId(template.id);

      // إذا كانت هناك لغة محددة، نستخدم الترجمة المناسبة
      if (language) {
        const translation = translations.find(t => t.language === language);
        if (translation) {
          return {
            ...template,
            templateName: translation.template_name,
            description: translation.description,
            suitableFor: translation.suitable_for,
            botPersonality: translation.bot_personality,
            translations
          };
        }
      }

      return {
        ...template,
        translations
      };
    })
  );

  return templatesWithTranslations;
}

export async function getBusinessTemplateByIdWithTranslations(id: number, language?: 'ar' | 'en') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const template = await getBusinessTemplateById(id);
  if (!template) return null;

  const translations = await getTemplateTranslationsByTemplateId(id);

  // إذا كانت هناك لغة محددة، نستخدم الترجمة المناسبة
  if (language) {
    const translation = translations.find(t => t.language === language);
    if (translation) {
      return {
        ...template,
        templateName: translation.template_name,
        description: translation.description,
        suitableFor: translation.suitable_for,
        botPersonality: translation.bot_personality,
        translations
      };
    }
  }

  return {
    ...template,
    translations
  };
}


// ============================================
// Subscription Plans Functions
// ============================================

export async function getAllSubscriptionPlans() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(subscriptionPlans).orderBy(subscriptionPlans.sortOrder);
}

export async function getActiveSubscriptionPlans() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(subscriptionPlans)
    .where(eq(subscriptionPlans.isActive, 1))
    .orderBy(subscriptionPlans.sortOrder);
}

export async function getSubscriptionPlanById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id));
  return results[0];
}

export async function createSubscriptionPlan(data: NewSubscriptionPlan) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(subscriptionPlans).values(data);
  return result.insertId;
}

export async function updateSubscriptionPlan(id: number, data: Partial<NewSubscriptionPlan>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(subscriptionPlans).set(data).where(eq(subscriptionPlans.id, id));
}

export async function deleteSubscriptionPlan(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, id));
}

export async function reorderSubscriptionPlans(planIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  for (let i = 0; i < planIds.length; i++) {
    await db.update(subscriptionPlans)
      .set({ sortOrder: i })
      .where(eq(subscriptionPlans.id, planIds[i]));
  }
}

// ============================================
// Subscription Addons Functions
// ============================================

export async function getAllSubscriptionAddons() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(subscriptionAddons);
}

export async function getActiveSubscriptionAddons() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(subscriptionAddons).where(eq(subscriptionAddons.isActive, 1));
}

export async function getSubscriptionAddonById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(subscriptionAddons).where(eq(subscriptionAddons.id, id));
  return results[0];
}

export async function createSubscriptionAddon(data: NewSubscriptionAddon) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(subscriptionAddons).values(data);
  return result.insertId;
}

export async function updateSubscriptionAddon(id: number, data: Partial<NewSubscriptionAddon>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(subscriptionAddons).set(data).where(eq(subscriptionAddons.id, id));
}

export async function deleteSubscriptionAddon(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(subscriptionAddons).where(eq(subscriptionAddons.id, id));
}

// ============================================
// Merchant Subscriptions Functions
// ============================================

export async function getMerchantCurrentSubscription(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(merchantSubscriptions)
    .where(and(
      eq(merchantSubscriptions.merchantId, merchantId),
      or(
        eq(merchantSubscriptions.status, 'trial'),
        eq(merchantSubscriptions.status, 'active')
      )
    ))
    .orderBy(desc(merchantSubscriptions.createdAt))
    .limit(1);
  return results[0];
}

export async function getMerchantSubscriptionById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(merchantSubscriptions).where(eq(merchantSubscriptions.id, id));
  return results[0];
}

export async function getAllMerchantSubscriptions(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(merchantSubscriptions)
    .where(eq(merchantSubscriptions.merchantId, merchantId))
    .orderBy(desc(merchantSubscriptions.createdAt));
}

export async function createMerchantSubscription(data: NewMerchantSubscription) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(merchantSubscriptions).values(data);
  return result.insertId;
}

export async function updateMerchantSubscription(id: number, data: Partial<NewMerchantSubscription>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(merchantSubscriptions).set(data).where(eq(merchantSubscriptions.id, id));
}

export async function cancelMerchantSubscription(id: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(merchantSubscriptions)
    .set({
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason,
    })
    .where(eq(merchantSubscriptions.id, id));
}

export async function extendMerchantSubscription(id: number, days: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const subscription = await getMerchantSubscriptionById(id);
  if (!subscription) throw new Error("Subscription not found");

  const currentEndDate = new Date(subscription.endDate);
  const newEndDate = new Date(currentEndDate.getTime() + days * 24 * 60 * 60 * 1000);

  await db.update(merchantSubscriptions)
    .set({ endDate: newEndDate.toISOString() })
    .where(eq(merchantSubscriptions.id, id));
}

export async function getExpiredSubscriptions() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = new Date().toISOString();
  return await db.select().from(merchantSubscriptions)
    .where(and(
      or(
        eq(merchantSubscriptions.status, 'trial'),
        eq(merchantSubscriptions.status, 'active')
      ),
      lt(merchantSubscriptions.endDate, now)
    ));
}

export async function getExpiringSubscriptions(daysBeforeExpiry: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const targetDate = new Date(now.getTime() + daysBeforeExpiry * 24 * 60 * 60 * 1000);

  return await db.select().from(merchantSubscriptions)
    .where(and(
      or(
        eq(merchantSubscriptions.status, 'trial'),
        eq(merchantSubscriptions.status, 'active')
      ),
      gte(merchantSubscriptions.endDate, now.toISOString()),
      lte(merchantSubscriptions.endDate, targetDate.toISOString())
    ));
}

export async function getMerchantSubscriptionStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const totalSubscriptions = await db.select({ count: sql<number>`count(*)` })
    .from(merchantSubscriptions);

  const activeSubscriptions = await db.select({ count: sql<number>`count(*)` })
    .from(merchantSubscriptions)
    .where(eq(merchantSubscriptions.status, 'active'));

  const trialSubscriptions = await db.select({ count: sql<number>`count(*)` })
    .from(merchantSubscriptions)
    .where(eq(merchantSubscriptions.status, 'trial'));

  const expiredSubscriptions = await db.select({ count: sql<number>`count(*)` })
    .from(merchantSubscriptions)
    .where(eq(merchantSubscriptions.status, 'expired'));

  return {
    total: totalSubscriptions[0]?.count || 0,
    active: activeSubscriptions[0]?.count || 0,
    trial: trialSubscriptions[0]?.count || 0,
    expired: expiredSubscriptions[0]?.count || 0,
  };
}

export async function checkMerchantSubscriptionStatus(merchantId: number): Promise<boolean> {
  const subscription = await getMerchantCurrentSubscription(merchantId);
  if (!subscription) return false;

  const now = new Date();
  const endDate = new Date(subscription.endDate);

  return now <= endDate;
}

export async function getMerchantDaysRemaining(merchantId: number): Promise<number> {
  const subscription = await getMerchantCurrentSubscription(merchantId);
  if (!subscription) return 0;

  const now = new Date();
  const endDate = new Date(subscription.endDate);
  const diff = endDate.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  return Math.max(0, days);
}

// ============================================
// Merchant Addons Functions
// ============================================

export async function getMerchantAddons(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(merchantAddons)
    .where(eq(merchantAddons.merchantId, merchantId))
    .orderBy(desc(merchantAddons.createdAt));
}

export async function getMerchantAddonById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(merchantAddons).where(eq(merchantAddons.id, id));
  return results[0];
}

export async function createMerchantAddon(data: NewMerchantAddon) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(merchantAddons).values(data);
  return result.insertId;
}

export async function updateMerchantAddon(id: number, data: Partial<NewMerchantAddon>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(merchantAddons).set(data).where(eq(merchantAddons.id, id));
}

export async function cancelMerchantAddon(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(merchantAddons)
    .set({ isActive: 0 })
    .where(eq(merchantAddons.id, id));
}

export async function getMerchantActiveAddons(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(merchantAddons)
    .where(and(
      eq(merchantAddons.merchantId, merchantId),
      eq(merchantAddons.isActive, 1)
    ));
}

// ============================================
// Payment Transactions Functions
// ============================================

export async function getAllPaymentTransactions() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(paymentTransactions).orderBy(desc(paymentTransactions.createdAt));
}

export async function getPaymentTransactionById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, id));
  return results[0];
}

export async function getMerchantPaymentTransactions(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(paymentTransactions)
    .where(eq(paymentTransactions.merchantId, merchantId))
    .orderBy(desc(paymentTransactions.createdAt));
}

export async function createPaymentTransaction(data: NewPaymentTransaction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(paymentTransactions).values(data);
  return result.insertId;
}

export async function updatePaymentTransaction(id: number, data: Partial<NewPaymentTransaction>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(paymentTransactions).set(data).where(eq(paymentTransactions.id, id));
}

export async function getPaymentTransactionByTapChargeId(tapChargeId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(paymentTransactions)
    .where(eq(paymentTransactions.tapChargeId, tapChargeId));
  return results[0];
}

export async function getPaymentStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const totalTransactions = await db.select({ count: sql<number>`count(*)` })
    .from(paymentTransactions);

  const completedTransactions = await db.select({ count: sql<number>`count(*)` })
    .from(paymentTransactions)
    .where(eq(paymentTransactions.status, 'completed'));

  const failedTransactions = await db.select({ count: sql<number>`count(*)` })
    .from(paymentTransactions)
    .where(eq(paymentTransactions.status, 'failed'));

  const totalRevenue = await db.select({ sum: sql<number>`sum(amount)` })
    .from(paymentTransactions)
    .where(eq(paymentTransactions.status, 'completed'));

  return {
    total: totalTransactions[0]?.count || 0,
    completed: completedTransactions[0]?.count || 0,
    failed: failedTransactions[0]?.count || 0,
    revenue: totalRevenue[0]?.sum || 0,
  };
}

export async function getRevenueStats(startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let query = db.select({
    date: sql<string>`DATE(created_at)`,
    revenue: sql<number>`sum(amount)`,
    count: sql<number>`count(*)`
  })
    .from(paymentTransactions)
    .where(eq(paymentTransactions.status, 'completed'));

  if (startDate && endDate) {
    query = query.where(and(
      gte(paymentTransactions.createdAt, startDate),
      lte(paymentTransactions.createdAt, endDate)
    ));
  }

  return await query.groupBy(sql`DATE(created_at)`).orderBy(sql`DATE(created_at)`);
}

// ============================================
// Tap Settings Functions
// ============================================

export async function getTapSettings() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(tapSettings).limit(1);
  return results[0];
}

export async function createTapSettings(data: NewTapSettings) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(tapSettings).values(data);
  return result.insertId;
}

export async function updateTapSettings(id: number, data: Partial<NewTapSettings>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tapSettings).set(data).where(eq(tapSettings.id, id));
}

export async function deleteTapSettings(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(tapSettings).where(eq(tapSettings.id, id));
}

// ============================================
// Merchant Subscription Status Updates
// ============================================

export async function updateMerchantSubscriptionStatus(
  merchantId: number,
  status: 'none' | 'trial' | 'active' | 'expired'
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(merchants)
    .set({ subscriptionStatus: status })
    .where(eq(merchants.id, merchantId));
}

export async function updateMerchantCustomerLimit(merchantId: number, maxCustomers: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(merchants)
    .set({ maxCustomersAllowed: maxCustomers })
    .where(eq(merchants.id, merchantId));
}

export async function incrementMerchantCustomerCount(merchantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(merchants)
    .set({ currentCustomersCount: sql`current_customers_count + 1` })
    .where(eq(merchants.id, merchantId));
}

// ============================================
// Notification Records Functions
// ============================================

/**
 * Get notification record by key
 */
export async function getNotificationByKey(notificationKey: string) {
  const result = await db
    .select()
    .from(schema.notificationRecords)
    .where(eq(schema.notificationRecords.notificationKey, notificationKey))
    .limit(1);
  return result[0] || null;
}

/**
 * Create notification record
 */
export async function createNotificationRecord(data: {
  merchantId: number;
  notificationKey: string;
  type: string;
  message: string;
  sentAt: Date;
}) {
  const result = await db.insert(schema.notificationRecords).values({
    merchantId: data.merchantId,
    notificationKey: data.notificationKey,
    type: data.type,
    message: data.message,
    sentAt: data.sentAt.toISOString(),
  });
  return result[0].insertId;
}

/**
 * Get all notification records for a merchant
 */
export async function getNotificationRecordsByMerchant(merchantId: number) {
  return await db
    .select()
    .from(schema.notificationRecords)
    .where(eq(schema.notificationRecords.merchantId, merchantId))
    .orderBy(desc(schema.notificationRecords.sentAt));
}

/**
 * Delete old notification records (cleanup)
 */
export async function deleteOldNotificationRecords(daysOld: number = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  await db
    .delete(schema.notificationRecords)
    .where(lt(schema.notificationRecords.sentAt, cutoffDate.toISOString()));
}

// ============================================
// Discount Coupons Functions
// ============================================

/**
 * Create discount coupon
 */
export async function createDiscountCoupon(data: {
  code: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  validFrom: Date;
  validUntil: Date;
  maxUsageCount?: number;
  maxUsagePerMerchant?: number;
  applicablePlanIds?: number[];
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.insert(schema.discountCoupons).values({
    code: data.code,
    description: data.description || null,
    discountType: data.discountType,
    discountValue: data.discountValue.toString(),
    minPurchaseAmount: data.minPurchaseAmount?.toString() || null,
    maxDiscountAmount: data.maxDiscountAmount?.toString() || null,
    validFrom: data.validFrom.toISOString(),
    validUntil: data.validUntil.toISOString(),
    maxUsageCount: data.maxUsageCount || null,
    currentUsageCount: 0,
    maxUsagePerMerchant: data.maxUsagePerMerchant || 1,
    applicablePlanIds: data.applicablePlanIds ? JSON.stringify(data.applicablePlanIds) : null,
    isActive: 1,
    createdBy: data.createdBy || null,
  });

  return Number(result[0].insertId);
}

/**
 * Get all discount coupons
 */
export async function getAllDiscountCoupons() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(schema.discountCoupons).orderBy(desc(schema.discountCoupons.createdAt));
}

/**
 * Get active discount coupons
 */
export async function getActiveDiscountCoupons() {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  return await db
    .select()
    .from(schema.discountCoupons)
    .where(
      and(
        eq(schema.discountCoupons.isActive, 1),
        lte(schema.discountCoupons.validFrom, now.toISOString()),
        gte(schema.discountCoupons.validUntil, now.toISOString())
      )
    );
}

/**
 * Get discount coupon by code
 */
export async function getDiscountCouponByCode(code: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(schema.discountCoupons)
    .where(eq(schema.discountCoupons.code, code))
    .limit(1);

  return result[0] || null;
}

/**
 * Get discount coupon by ID
 */
export async function getDiscountCouponById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(schema.discountCoupons)
    .where(eq(schema.discountCoupons.id, id))
    .limit(1);

  return result[0] || null;
}

/**
 * Update discount coupon
 */
export async function updateDiscountCoupon(id: number, data: Partial<{
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minPurchaseAmount: number;
  maxDiscountAmount: number;
  validFrom: Date;
  validUntil: Date;
  maxUsageCount: number;
  maxUsagePerMerchant: number;
  applicablePlanIds: number[];
  isActive: number;
}>) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const updateData: any = {};
  if (data.description !== undefined) updateData.description = data.description;
  if (data.discountType !== undefined) updateData.discountType = data.discountType;
  if (data.discountValue !== undefined) updateData.discountValue = data.discountValue.toString();
  if (data.minPurchaseAmount !== undefined) updateData.minPurchaseAmount = data.minPurchaseAmount.toString();
  if (data.maxDiscountAmount !== undefined) updateData.maxDiscountAmount = data.maxDiscountAmount.toString();
  if (data.validFrom !== undefined) updateData.validFrom = data.validFrom.toISOString();
  if (data.validUntil !== undefined) updateData.validUntil = data.validUntil.toISOString();
  if (data.maxUsageCount !== undefined) updateData.maxUsageCount = data.maxUsageCount;
  if (data.maxUsagePerMerchant !== undefined) updateData.maxUsagePerMerchant = data.maxUsagePerMerchant;
  if (data.applicablePlanIds !== undefined) updateData.applicablePlanIds = JSON.stringify(data.applicablePlanIds);
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  await db.update(schema.discountCoupons).set(updateData).where(eq(schema.discountCoupons.id, id));
}

/**
 * Deactivate discount coupon
 */
export async function deactivateDiscountCoupon(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.update(schema.discountCoupons).set({ isActive: 0 }).where(eq(schema.discountCoupons.id, id));
}

/**
 * Increment coupon usage count
 */
export async function incrementCouponUsage(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db
    .update(schema.discountCoupons)
    .set({ currentUsageCount: sql`${schema.discountCoupons.currentUsageCount} + 1` })
    .where(eq(schema.discountCoupons.id, id));
}

/**
 * Get coupon usage count by merchant
 */
export async function getCouponUsageCountByMerchant(couponId: number, merchantId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.couponUsageLog)
    .where(
      and(
        eq(schema.couponUsageLog.couponId, couponId),
        eq(schema.couponUsageLog.merchantId, merchantId)
      )
    );

  return Number(result[0]?.count || 0);
}

/**
 * Log coupon usage
 */
export async function logCouponUsage(data: {
  couponId: number;
  merchantId: number;
  subscriptionId?: number;
  planId?: number;
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.insert(schema.couponUsageLog).values({
    couponId: data.couponId,
    merchantId: data.merchantId,
    subscriptionId: data.subscriptionId || null,
    planId: data.planId || null,
    originalPrice: data.originalPrice.toString(),
    discountAmount: data.discountAmount.toString(),
    finalPrice: data.finalPrice.toString(),
  });

  return Number(result[0].insertId);
}

/**
 * Get coupon usage statistics
 */
export async function getCouponUsageStats(couponId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select({
      totalUsage: sql<number>`count(*)`,
      totalRevenue: sql<number>`sum(${schema.couponUsageLog.finalPrice})`,
      totalDiscount: sql<number>`sum(${schema.couponUsageLog.discountAmount})`,
    })
    .from(schema.couponUsageLog)
    .where(eq(schema.couponUsageLog.couponId, couponId));

  return result[0] || null;
}

/**
 * Get all coupon usage logs
 */
export async function getAllCouponUsageLogs() {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(schema.couponUsageLog)
    .orderBy(desc(schema.couponUsageLog.usedAt));
}

/**
 * Get coupon usage logs by coupon ID
 */
export async function getCouponUsageLogsByCoupon(couponId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(schema.couponUsageLog)
    .where(eq(schema.couponUsageLog.couponId, couponId))
    .orderBy(desc(schema.couponUsageLog.usedAt));
}

// ============================================
// Usage Statistics Functions
// ============================================

/**
 * Get current usage for a merchant
 */
export async function getMerchantCurrentUsage(merchantId: number) {
  const db = await getDb();
  if (!db) return null;

  // Get subscription and plan
  const subscription = await getMerchantCurrentSubscription(merchantId);
  if (!subscription) return null;

  const plan = await getSubscriptionPlanById(subscription.planId);
  if (!plan) return null;

  // Get current counts
  const customerCount = await getCustomerCountByMerchant(merchantId);
  const whatsappNumbers = await getWhatsAppInstancesByMerchantId(merchantId);
  const products = await getProductsByMerchantId(merchantId);

  // Get campaigns this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const campaigns = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.campaigns)
    .where(
      and(
        eq(schema.campaigns.merchantId, merchantId),
        gte(schema.campaigns.createdAt, startOfMonth.toISOString())
      )
    );

  const campaignCount = Number(campaigns[0]?.count || 0);

  // Get AI messages this month (approximate from messages table)
  const messages = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.merchantId, merchantId),
        eq(schema.messages.direction, 'outgoing'),
        gte(schema.messages.timestamp, startOfMonth.toISOString())
      )
    );

  const aiMessageCount = Number(messages[0]?.count || 0);

  return {
    customers: {
      current: customerCount,
      max: plan.maxCustomers,
      percentage: (customerCount / plan.maxCustomers) * 100,
    },
    whatsappNumbers: {
      current: whatsappNumbers.length,
      max: plan.maxWhatsAppNumbers,
      percentage: (whatsappNumbers.length / plan.maxWhatsAppNumbers) * 100,
    },
    products: {
      current: products.length,
      max: plan.maxProducts,
      percentage: (products.length / plan.maxProducts) * 100,
    },
    campaigns: {
      current: campaignCount,
      max: plan.maxCampaignsPerMonth,
      percentage: (campaignCount / plan.maxCampaignsPerMonth) * 100,
    },
    aiMessages: {
      current: aiMessageCount,
      max: plan.aiMessagesPerMonth,
      percentage: (aiMessageCount / plan.aiMessagesPerMonth) * 100,
    },
    plan: {
      id: plan.id,
      name: plan.name,
      billingCycle: plan.billingCycle,
    },
  };
}

/**
 * Get usage history for a merchant (last 6 months)
 */
export async function getMerchantUsageHistory(merchantId: number) {
  const db = await getDb();
  if (!db) return [];

  const history = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

    // Get campaigns for this month
    const campaigns = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.campaigns)
      .where(
        and(
          eq(schema.campaigns.merchantId, merchantId),
          gte(schema.campaigns.createdAt, monthDate.toISOString()),
          lt(schema.campaigns.createdAt, nextMonthDate.toISOString())
        )
      );

    // Get messages for this month
    const messages = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.merchantId, merchantId),
          eq(schema.messages.direction, 'outgoing'),
          gte(schema.messages.timestamp, monthDate.toISOString()),
          lt(schema.messages.timestamp, nextMonthDate.toISOString())
        )
      );

    history.push({
      month: monthDate.toISOString().substring(0, 7), // YYYY-MM
      campaigns: Number(campaigns[0]?.count || 0),
      messages: Number(messages[0]?.count || 0),
    });
  }

  return history;
}

// ============================================
// Subscription Reports Functions (Admin)
// ============================================

/**
 * Get subscription overview statistics
 */
export async function getSubscriptionOverview() {
  const db = await getDb();
  if (!db) return null;

  // Total subscriptions
  const totalSubs = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.subscriptions);

  // Active subscriptions
  const activeSubs = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, 'active'));

  // Trial subscriptions
  const trialSubs = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, 'trial'));

  // Expired subscriptions
  const expiredSubs = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, 'expired'));

  // Total revenue (from payment transactions)
  const revenue = await db
    .select({ total: sql<number>`sum(${schema.paymentTransactions.amount})` })
    .from(schema.paymentTransactions)
    .where(eq(schema.paymentTransactions.status, 'completed'));

  return {
    total: Number(totalSubs[0]?.count || 0),
    active: Number(activeSubs[0]?.count || 0),
    trial: Number(trialSubs[0]?.count || 0),
    expired: Number(expiredSubs[0]?.count || 0),
    totalRevenue: Number(revenue[0]?.total || 0),
  };
}

/**
 * Get subscription conversion rate (trial to paid)
 */
export async function getSubscriptionConversionRate() {
  const db = await getDb();
  if (!db) return { rate: 0, trialCount: 0, convertedCount: 0 };

  // Count merchants who started with trial
  const trialMerchants = await db
    .select({ merchantId: schema.subscriptions.merchantId })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, 'trial'))
    .groupBy(schema.subscriptions.merchantId);

  // Count merchants who converted to paid
  const convertedMerchants = await db
    .select({ merchantId: schema.subscriptions.merchantId })
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.status, 'active'),
        sql`EXISTS (
          SELECT 1 FROM ${schema.subscriptions} s2 
          WHERE s2.merchant_id = ${schema.subscriptions.merchantId} 
          AND s2.status = 'trial'
        )`
      )
    )
    .groupBy(schema.subscriptions.merchantId);

  const trialCount = trialMerchants.length;
  const convertedCount = convertedMerchants.length;
  const rate = trialCount > 0 ? (convertedCount / trialCount) * 100 : 0;

  return { rate, trialCount, convertedCount };
}

/**
 * Get upgrade/downgrade statistics
 */
export async function getUpgradeDowngradeStats() {
  const db = await getDb();
  if (!db) return { upgrades: 0, downgrades: 0 };

  // This would require tracking plan changes in a separate table
  // For now, return placeholder
  return { upgrades: 0, downgrades: 0 };
}

/**
 * Get cancellation statistics
 */
export async function getCancellationStats() {
  const db = await getDb();
  if (!db) return { total: 0, thisMonth: 0, reasons: [] };

  // Total cancelled
  const total = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, 'cancelled'));

  // This month cancelled
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const thisMonth = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.status, 'cancelled'),
        gte(schema.subscriptions.updatedAt, startOfMonth.toISOString())
      )
    );

  return {
    total: Number(total[0]?.count || 0),
    thisMonth: Number(thisMonth[0]?.count || 0),
    reasons: [], // Would need a cancellation_reasons table
  };
}

/**
 * Get monthly revenue statistics (last 12 months)
 */
export async function getMonthlyRevenueStats() {
  const db = await getDb();
  if (!db) return [];

  const revenue = [];
  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

    const monthRevenue = await db
      .select({ total: sql<number>`sum(${schema.paymentTransactions.amount})` })
      .from(schema.paymentTransactions)
      .where(
        and(
          eq(schema.paymentTransactions.status, 'completed'),
          gte(schema.paymentTransactions.createdAt, monthDate.toISOString()),
          lt(schema.paymentTransactions.createdAt, nextMonthDate.toISOString())
        )
      );

    revenue.push({
      month: monthDate.toISOString().substring(0, 7), // YYYY-MM
      revenue: Number(monthRevenue[0]?.total || 0),
    });
  }

  return revenue;
}

/**
 * Get subscription distribution by plan
 */
export async function getSubscriptionDistributionByPlan() {
  const db = await getDb();
  if (!db) return [];

  const distribution = await db
    .select({
      planId: schema.subscriptions.planId,
      count: sql<number>`count(*)`,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, 'active'))
    .groupBy(schema.subscriptions.planId);

  // Get plan names
  const result = [];
  for (const item of distribution) {
    const plan = await getSubscriptionPlanById(item.planId);
    if (plan) {
      result.push({
        planId: item.planId,
        planName: plan.name,
        count: Number(item.count),
      });
    }
  }

  return result;
}

// Note: Invoice functions are defined earlier in this file (lines ~1483-1520)
// The getInvoiceStats function below is additional functionality

/**
 * Get invoice statistics
 */
export async function getInvoiceStats() {
  const db = await getDb();
  if (!db) return { total: 0, paid: 0, pending: 0, cancelled: 0, totalAmount: 0, paidAmount: 0 };

  const allInvoices = await db
    .select({
      status: invoices.status,
      amount: invoices.amount,
    })
    .from(invoices);

  const stats = {
    total: allInvoices.length,
    paid: allInvoices.filter(i => i.status === 'paid').length,
    pending: allInvoices.filter(i => i.status === 'sent' || i.status === 'draft').length,
    cancelled: allInvoices.filter(i => i.status === 'cancelled').length,
    totalAmount: allInvoices.reduce((sum, i) => sum + (i.amount || 0), 0),
    paidAmount: allInvoices
      .filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + (i.amount || 0), 0),
  };

  return stats;
}

