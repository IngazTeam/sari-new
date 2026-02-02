/**
 * @fileoverview تعريفات TypeScript الشاملة للمشروع
 * يحتوي على Types مشتركة بين Frontend و Backend
 */

// ============================================
// 🔐 Auth Types
// ============================================

export type UserRole = 'admin' | 'merchant' | 'user';

export interface User {
    id: number;
    email: string;
    phone?: string;
    role: UserRole;
    isActive: boolean;
    createdAt: Date;
    updatedAt?: Date;
}

export interface AuthSession {
    userId: number;
    role: UserRole;
    merchantId?: number;
    expiresAt: Date;
}

export interface LoginCredentials {
    email: string;
    password: string;
    rememberMe?: boolean;
}

export interface RegisterData {
    email: string;
    password: string;
    phone: string;
    businessName: string;
}

// ============================================
// 🏪 Merchant Types
// ============================================

export type MerchantStatus = 'pending' | 'active' | 'suspended' | 'archived';

export interface Merchant {
    id: number;
    userId: number;
    businessName: string;
    businessNameEn?: string;
    phone: string;
    email?: string;
    address?: string;
    city?: string;
    country: string;
    status: MerchantStatus;
    logoUrl?: string;
    websiteUrl?: string;
    description?: string;
    currency: string;
    timezone: string;
    createdAt: Date;
    updatedAt?: Date;
}

export interface MerchantSettings {
    merchantId: number;
    autoReply: boolean;
    workingHoursEnabled: boolean;
    workingHoursStart?: string;
    workingHoursEnd?: string;
    welcomeMessage?: string;
    awayMessage?: string;
    language: 'ar' | 'en' | 'both';
}

// ============================================
// 📦 Product Types
// ============================================

export interface Product {
    id: number;
    merchantId: number;
    name: string;
    nameEn?: string;
    description?: string;
    descriptionEn?: string;
    price: number;
    discountPrice?: number;
    currency: string;
    quantity: number;
    sku?: string;
    category?: string;
    imageUrl?: string;
    images?: string[];
    isActive: boolean;
    createdAt: Date;
    updatedAt?: Date;
}

export interface ProductCreateInput {
    name: string;
    description?: string;
    price: number;
    quantity?: number;
    category?: string;
    imageUrl?: string;
}

export interface ProductUpdateInput extends Partial<ProductCreateInput> {
    id: number;
}

export interface ProductFilter {
    search?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    page?: number;
    limit?: number;
}

// ============================================
// 💬 Conversation Types
// ============================================

export type ConversationStatus = 'active' | 'pending' | 'closed' | 'archived';
export type MessageSender = 'customer' | 'sari' | 'merchant';
export type MessageType = 'text' | 'image' | 'voice' | 'document' | 'location';

export interface Conversation {
    id: number;
    merchantId: number;
    customerPhone: string;
    customerName?: string;
    status: ConversationStatus;
    lastMessageAt?: Date;
    unreadCount: number;
    tags?: string[];
    assignedTo?: number;
    createdAt: Date;
    updatedAt?: Date;
}

export interface Message {
    id: number;
    conversationId: number;
    content: string;
    sender: MessageSender;
    type: MessageType;
    mediaUrl?: string;
    isRead: boolean;
    sentAt: Date;
    deliveredAt?: Date;
    readAt?: Date;
}

export interface SendMessageInput {
    conversationId: number;
    content: string;
    type?: MessageType;
    mediaUrl?: string;
}

// ============================================
// 📢 Campaign Types
// ============================================

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'completed' | 'paused' | 'cancelled';
export type CampaignType = 'promotional' | 'reminder' | 'notification' | 'birthday' | 'occasion';

export interface Campaign {
    id: number;
    merchantId: number;
    name: string;
    message: string;
    type: CampaignType;
    status: CampaignStatus;
    targetAudience: 'all' | 'segment' | 'custom';
    recipientCount: number;
    sentCount: number;
    deliveredCount: number;
    readCount: number;
    scheduledAt?: Date;
    startedAt?: Date;
    completedAt?: Date;
    createdAt: Date;
}

export interface CampaignCreateInput {
    name: string;
    message: string;
    type?: CampaignType;
    targetAudience?: 'all' | 'segment' | 'custom';
    customerIds?: number[];
    scheduledAt?: Date;
}

export interface CampaignStats {
    totalRecipients: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    deliveryRate: number;
    readRate: number;
}

// ============================================
// 📊 Analytics Types
// ============================================

export interface DashboardStats {
    totalConversations: number;
    totalMessages: number;
    totalProducts: number;
    totalOrders: number;
    totalRevenue: number;
    newCustomersToday: number;
    messagesThisWeek: number;
    conversionRate: number;
}

export interface AnalyticsOverview {
    period: 'day' | 'week' | 'month' | 'year';
    startDate: Date;
    endDate: Date;
    metrics: {
        conversations: number;
        messages: number;
        orders: number;
        revenue: number;
    };
    comparison?: {
        conversationsChange: number;
        messagesChange: number;
        ordersChange: number;
        revenueChange: number;
    };
}

export interface ChartData {
    label: string;
    value: number;
    date?: Date;
}

export interface MessageAnalytics {
    totalMessages: number;
    incomingMessages: number;
    outgoingMessages: number;
    averageResponseTime: number; // in seconds
    peakHours: { hour: number; count: number }[];
}

// ============================================
// 💳 Subscription Types
// ============================================

export type PlanType = 'B1' | 'B2' | 'B3' | 'enterprise' | 'trial';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'paused';

export interface Plan {
    id: number;
    name: string;
    nameEn: string;
    type: PlanType;
    price: number;
    currency: string;
    conversationLimit: number;
    voiceMessagesLimit: number;
    aiMessagesLimit: number;
    features: string[];
    isPopular: boolean;
}

export interface Subscription {
    id: number;
    merchantId: number;
    planId: number;
    status: SubscriptionStatus;
    startDate: Date;
    endDate: Date;
    autoRenew: boolean;
    conversationsUsed: number;
    voiceMessagesUsed: number;
    aiMessagesUsed: number;
}

export interface UsageStats {
    conversations: { used: number; limit: number };
    voiceMessages: { used: number; limit: number };
    aiMessages: { used: number; limit: number };
    percentage: number;
}

// ============================================
// 📱 WhatsApp Types
// ============================================

export type WhatsAppConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface WhatsAppConnection {
    id: number;
    merchantId: number;
    instanceId: string;
    phone?: string;
    status: WhatsAppConnectionStatus;
    qrCode?: string;
    lastConnectedAt?: Date;
    createdAt: Date;
}

export interface WhatsAppMessage {
    chatId: string;
    message: string;
    mediaUrl?: string;
    quotedMessageId?: string;
}

// ============================================
// 🔧 API Response Types
// ============================================

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}

export interface ValidationError {
    field: string;
    message: string;
}

// ============================================
// 📋 Order Types
// ============================================

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface Order {
    id: number;
    merchantId: number;
    customerId?: number;
    customerPhone: string;
    customerName?: string;
    items: OrderItem[];
    subtotal: number;
    discount: number;
    shipping: number;
    total: number;
    currency: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    paymentMethod?: string;
    notes?: string;
    createdAt: Date;
    updatedAt?: Date;
}

export interface OrderItem {
    productId: number;
    productName: string;
    quantity: number;
    price: number;
    total: number;
}

// ============================================
// 👥 Customer Types
// ============================================

export interface Customer {
    id: number;
    merchantId: number;
    phone: string;
    name?: string;
    email?: string;
    totalOrders: number;
    totalSpent: number;
    lastOrderAt?: Date;
    tags?: string[];
    notes?: string;
    createdAt: Date;
}

export interface CustomerFilter {
    search?: string;
    hasOrders?: boolean;
    minSpent?: number;
    tags?: string[];
    page?: number;
    limit?: number;
}

// ============================================
// 🎁 Loyalty Types
// ============================================

export interface LoyaltyProgram {
    id: number;
    merchantId: number;
    isEnabled: boolean;
    pointsPerCurrency: number;
    minimumPointsToRedeem: number;
    pointValue: number;
}

export interface LoyaltyTier {
    id: number;
    programId: number;
    name: string;
    minPoints: number;
    discount: number;
    benefits: string[];
}

export interface CustomerLoyalty {
    customerId: number;
    points: number;
    tier: string;
    totalEarned: number;
    totalRedeemed: number;
}

// ============================================
// 🗓️ Booking Types
// ============================================

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface Booking {
    id: number;
    merchantId: number;
    serviceId: number;
    customerId?: number;
    customerName: string;
    customerPhone: string;
    staffId?: number;
    date: Date;
    startTime: string;
    endTime: string;
    status: BookingStatus;
    notes?: string;
    totalPrice: number;
    createdAt: Date;
}

export interface Service {
    id: number;
    merchantId: number;
    categoryId?: number;
    name: string;
    description?: string;
    duration: number; // in minutes
    price: number;
    isActive: boolean;
}

export interface Staff {
    id: number;
    merchantId: number;
    name: string;
    email?: string;
    phone?: string;
    role: string;
    services: number[];
    workingHours: WorkingHours;
}

export interface WorkingHours {
    [key: string]: { // day of week: 'sunday', 'monday', etc.
        isWorking: boolean;
        start?: string;
        end?: string;
        breaks?: { start: string; end: string }[];
    };
}

// ============================================
// 🔔 Notification Types
// ============================================

export type NotificationType =
    | 'order_created'
    | 'order_status_changed'
    | 'payment_received'
    | 'new_message'
    | 'campaign_completed'
    | 'subscription_expiring'
    | 'booking_reminder';

export interface Notification {
    id: number;
    merchantId: number;
    type: NotificationType;
    title: string;
    message: string;
    isRead: boolean;
    data?: Record<string, any>;
    createdAt: Date;
}

// ============================================
// 🌐 Integration Types
// ============================================

export type IntegrationProvider = 'salla' | 'zid' | 'woocommerce' | 'tap' | 'paypal';
export type IntegrationStatus = 'connected' | 'disconnected' | 'error';

export interface Integration {
    id: number;
    merchantId: number;
    provider: IntegrationProvider;
    status: IntegrationStatus;
    credentials?: Record<string, string>;
    settings?: Record<string, any>;
    lastSyncAt?: Date;
    createdAt: Date;
}

// ============================================
// 🔍 SEO Types
// ============================================

export interface SeoSettings {
    merchantId: number;
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    ogImage?: string;
    twitterCard?: string;
}

export interface PageSeo {
    path: string;
    title: string;
    description: string;
    canonicalUrl?: string;
}

// ============================================
// 📑 Report Types
// ============================================

export type ReportType = 'sales' | 'conversations' | 'campaigns' | 'products' | 'customers';
export type ReportFormat = 'pdf' | 'excel' | 'csv';

export interface ReportRequest {
    type: ReportType;
    format: ReportFormat;
    startDate: Date;
    endDate: Date;
    filters?: Record<string, any>;
}

export interface ScheduledReport {
    id: number;
    merchantId: number;
    type: ReportType;
    format: ReportFormat;
    schedule: 'daily' | 'weekly' | 'monthly';
    recipients: string[];
    isActive: boolean;
}
