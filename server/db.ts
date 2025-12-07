import { eq, and, desc, gte, lte, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
  WhatsappConnection,
  InsertWhatsappConnection,
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
  connection: InsertWhatsappConnection
): Promise<WhatsappConnection | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.insert(whatsappConnections).values(connection);
  const insertedId = Number(result[0].insertId);

  return getWhatsappConnectionById(insertedId);
}

export async function getWhatsappConnectionById(id: number): Promise<WhatsappConnection | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(whatsappConnections).where(eq(whatsappConnections.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getWhatsappConnectionByMerchantId(merchantId: number): Promise<WhatsappConnection | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(whatsappConnections)
    .where(eq(whatsappConnections.merchantId, merchantId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateWhatsappConnection(id: number, data: Partial<InsertWhatsappConnection>): Promise<void> {
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
      .where(and(eq(analytics.merchantId, merchantId), gte(analytics.date, startDate), lte(analytics.date, endDate)))
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
  reviewedBy: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(whatsappConnectionRequests).set({
    status: 'approved',
    reviewedBy,
    reviewedAt: new Date(),
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

export async function getReferralCodeByCustomerId(merchantId: number, customerId: number): Promise<ReferralCode | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(referralCodes).where(
    and(
      eq(referralCodes.merchantId, merchantId),
      eq(referralCodes.customerId, customerId)
    )
  ).limit(1);
  
  return result[0];
}

export async function incrementReferralCount(code: string, rewardValue: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const referralCode = await getReferralCodeByCode(code);
  if (!referralCode) return;

  await db.update(referralCodes).set({
    referralCount: referralCode.referralCount + 1,
    totalRewards: referralCode.totalRewards + rewardValue,
    updatedAt: new Date()
  }).where(eq(referralCodes.id, referralCode.id));
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
