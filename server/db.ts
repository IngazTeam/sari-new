import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
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
