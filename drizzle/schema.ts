import { mysqlTable, mysqlEnum, int, varchar, text, timestamp, tinyint, decimal, date, index, uniqueIndex, InferSelectModel, InferInsertModel } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const abTestResults = mysqlTable("ab_test_results", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" } ),
	testName: varchar("test_name", { length: 255 }).notNull(),
	keyword: varchar({ length: 255 }).notNull(),
	variantAId: int("variant_a_id").references(() => quickResponses.id, { onDelete: "cascade" } ),
	variantAText: text("variant_a_text").notNull(),
	variantAUsageCount: int("variant_a_usage_count").default(0).notNull(),
	variantASuccessCount: int("variant_a_success_count").default(0).notNull(),
	variantBId: int("variant_b_id").references(() => quickResponses.id, { onDelete: "cascade" } ),
	variantBText: text("variant_b_text").notNull(),
	variantBUsageCount: int("variant_b_usage_count").default(0).notNull(),
	variantBSuccessCount: int("variant_b_success_count").default(0).notNull(),
	status: mysqlEnum(['running','completed','paused']).default('running').notNull(),
	winner: mysqlEnum(['variant_a','variant_b','no_winner']),
	confidenceLevel: int("confidence_level").default(0).notNull(),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const abandonedCarts = mysqlTable("abandoned_carts", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	customerPhone: varchar({ length: 20 }).notNull(),
	customerName: varchar({ length: 255 }),
	items: text().notNull(),
	totalAmount: int().notNull(),
	reminderSent: tinyint().default(0).notNull(),
	reminderSentAt: timestamp({ mode: 'string' }),
	recovered: tinyint().default(0).notNull(),
	recoveredAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const analytics = mysqlTable("analytics", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	date: timestamp({ mode: 'string' }).notNull(),
	conversationsCount: int().default(0).notNull(),
	messagesCount: int().default(0).notNull(),
	voiceMessagesCount: int().default(0).notNull(),
	campaignsSent: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const automationRules = mysqlTable("automation_rules", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	type: mysqlEnum(['abandoned_cart','review_request','order_tracking','gift_notification','holiday_greeting','winback']).notNull(),
	isEnabled: tinyint().default(1).notNull(),
	settings: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const botSettings = mysqlTable("bot_settings", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" } ),
	autoReplyEnabled: tinyint("auto_reply_enabled").default(1).notNull(),
	workingHoursEnabled: tinyint("working_hours_enabled").default(0).notNull(),
	workingHoursStart: varchar("working_hours_start", { length: 5 }).default('09:00'),
	workingHoursEnd: varchar("working_hours_end", { length: 5 }).default('18:00'),
	workingDays: varchar("working_days", { length: 50 }).default('1,2,3,4,5'),
	welcomeMessage: text("welcome_message"),
	outOfHoursMessage: text("out_of_hours_message"),
	responseDelay: int("response_delay").default(2),
	maxResponseLength: int("max_response_length").default(200),
	tone: mysqlEnum(['friendly','professional','casual']).default('friendly').notNull(),
	language: mysqlEnum(['ar','en','fr','tr','es','it','both']).default('ar').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("bot_settings_merchant_id_unique").on(table.merchantId),
]);

export const campaignLogs = mysqlTable("campaignLogs", {
	id: int().autoincrement().notNull(),
	campaignId: int().notNull(),
	customerId: int(),
	customerPhone: varchar({ length: 20 }).notNull(),
	customerName: varchar({ length: 255 }),
	status: mysqlEnum(['success','failed','pending']).default('pending').notNull(),
	errorMessage: text(),
	sentAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const campaigns = mysqlTable("campaigns", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	name: varchar({ length: 255 }).notNull(),
	message: text().notNull(),
	imageUrl: varchar({ length: 500 }),
	targetAudience: text(),
	status: mysqlEnum(['draft','scheduled','sending','completed','failed']).default('draft').notNull(),
	scheduledAt: timestamp({ mode: 'string' }),
	sentCount: int().default(0).notNull(),
	totalRecipients: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const conversations = mysqlTable("conversations", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	customerPhone: varchar({ length: 20 }).notNull(),
	customerName: varchar({ length: 255 }),
	status: mysqlEnum(['active','closed','archived']).default('active').notNull(),
	lastMessageAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastActivityAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	purchaseCount: int().default(0).notNull(),
	totalSpent: int().default(0).notNull(),
});

export const customerReviews = mysqlTable("customer_reviews", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	orderId: int().notNull(),
	customerPhone: varchar({ length: 20 }).notNull(),
	customerName: varchar({ length: 255 }),
	rating: int().notNull(),
	comment: text(),
	productId: int(),
	isPublic: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	merchantReply: text(),
	repliedAt: timestamp({ mode: 'string' }),
});

export const discountCodes = mysqlTable("discount_codes", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	code: varchar({ length: 50 }).notNull(),
	type: mysqlEnum(['percentage','fixed']).notNull(),
	value: int().notNull(),
	minOrderAmount: int().default(0),
	maxUses: int(),
	usedCount: int().default(0).notNull(),
	expiresAt: timestamp({ mode: 'string' }),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("discount_codes_code_unique").on(table.code),
]);

export const invoices = mysqlTable("invoices", {
	id: int().autoincrement().notNull(),
	invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
	paymentId: int("payment_id").notNull(),
	merchantId: int("merchant_id").notNull(),
	subscriptionId: int("subscription_id"),
	amount: int().notNull(),
	currency: varchar({ length: 10 }).default('SAR').notNull(),
	status: mysqlEnum(['draft','sent','paid','cancelled']).default('paid').notNull(),
	pdfPath: text("pdf_path"),
	pdfUrl: text("pdf_url"),
	emailSent: tinyint("email_sent").default(0).notNull(),
	emailSentAt: timestamp("email_sent_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("invoices_invoice_number_unique").on(table.invoiceNumber),
]);

export const keywordAnalysis = mysqlTable("keyword_analysis", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" } ),
	keyword: varchar({ length: 255 }).notNull(),
	category: mysqlEnum(['product','price','shipping','complaint','question','other']).notNull(),
	frequency: int().default(1).notNull(),
	sampleMessages: text("sample_messages"),
	suggestedResponse: text("suggested_response"),
	status: mysqlEnum(['new','reviewed','response_created','ignored']).default('new').notNull(),
	firstSeenAt: timestamp("first_seen_at", { mode: 'string' }).defaultNow().notNull(),
	lastSeenAt: timestamp("last_seen_at", { mode: 'string' }).defaultNow().notNull(),
	reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const limitedTimeOffers = mysqlTable("limited_time_offers", {
	id: int().autoincrement().notNull(),
	title: varchar({ length: 255 }).notNull(),
	titleAr: varchar("title_ar", { length: 255 }).notNull(),
	description: text().notNull(),
	descriptionAr: text("description_ar").notNull(),
	discountPercentage: int("discount_percentage"),
	discountAmount: int("discount_amount"),
	durationMinutes: int("duration_minutes").notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const merchants = mysqlTable("merchants", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	businessName: varchar({ length: 255 }).notNull(),
	phone: varchar({ length: 20 }),
	status: mysqlEnum(['active','suspended','pending']).default('pending').notNull(),
	subscriptionId: int(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	autoReplyEnabled: tinyint().default(1).notNull(),
	onboardingCompleted: tinyint().default(0).notNull(),
	onboardingStep: int().default(0).notNull(),
	onboardingCompletedAt: timestamp({ mode: 'string' }),
	currency: mysqlEnum(['SAR','USD']).default('SAR').notNull(),
	// Setup Wizard fields
	businessType: mysqlEnum(['store','services','both']),
	setupCompleted: tinyint().default(0).notNull(),
	setupCompletedAt: timestamp({ mode: 'string' }),
	address: varchar({ length: 500 }),
	description: text(),
	workingHoursType: mysqlEnum(['24_7','weekdays','custom']).default('weekdays'),
	workingHours: text(), // JSON: {"saturday": {"start": "09:00", "end": "18:00"}}
	// Smart Website Analysis fields
	websiteUrl: varchar("website_url", { length: 500 }),
	platformType: mysqlEnum("platform_type", ['salla', 'zid', 'shopify', 'woocommerce', 'custom', 'unknown']),
	lastAnalysisDate: timestamp("last_analysis_date", { mode: 'string' }),
	analysisStatus: mysqlEnum("analysis_status", ['pending', 'analyzing', 'completed', 'failed']).default('pending'),
	// Subscription fields
	currentSubscriptionId: int("current_subscription_id"),
	subscriptionStatus: mysqlEnum("subscription_status", ['none', 'trial', 'active', 'expired']).default('none'),
	trialStartedAt: timestamp("trial_started_at", { mode: 'string' }),
	trialEndsAt: timestamp("trial_ends_at", { mode: 'string' }),
	maxCustomersAllowed: int("max_customers_allowed").default(0),
	currentCustomersCount: int("current_customers_count").default(0),
});

export const messages = mysqlTable("messages", {
	id: int().autoincrement().notNull(),
	conversationId: int().notNull(),
	direction: mysqlEnum(['incoming','outgoing']).notNull(),
	messageType: mysqlEnum(['text','voice','image','document']).default('text').notNull(),
	content: text().notNull(),
	voiceUrl: varchar({ length: 500 }),
	imageUrl: varchar({ length: 500 }),
	mediaUrl: varchar({ length: 500 }),
	isProcessed: tinyint().default(0).notNull(),
	aiResponse: text(),
	externalId: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const notificationTemplates = mysqlTable("notification_templates", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" } ),
	status: varchar({ length: 50 }).notNull(),
	template: text().notNull(),
	enabled: tinyint().default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const notifications = mysqlTable("notifications", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	type: mysqlEnum(['info','success','warning','error']).default('info').notNull(),
	title: varchar({ length: 255 }).notNull(),
	message: text().notNull(),
	link: varchar({ length: 500 }),
	isRead: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const occasionCampaigns = mysqlTable("occasion_campaigns", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	occasionType: mysqlEnum(['ramadan','eid_fitr','eid_adha','national_day','new_year','hijri_new_year']).notNull(),
	year: int().notNull(),
	enabled: tinyint().default(1).notNull(),
	discountCode: varchar({ length: 50 }),
	discountPercentage: int().default(15).notNull(),
	messageTemplate: text(),
	sentAt: timestamp({ mode: 'string' }),
	recipientCount: int().default(0).notNull(),
	status: mysqlEnum(['pending','sent','failed']).default('pending').notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const orderNotifications = mysqlTable("order_notifications", {
	id: int().autoincrement().notNull(),
	orderId: int("order_id").notNull().references(() => orders.id, { onDelete: "cascade" } ),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" } ),
	customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
	status: varchar({ length: 50 }).notNull(),
	message: text().notNull(),
	sent: tinyint().default(0),
	sentAt: timestamp("sent_at", { mode: 'string' }),
	error: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const orderTrackingLogs = mysqlTable("order_tracking_logs", {
	id: int().autoincrement().notNull(),
	orderId: int().notNull(),
	oldStatus: varchar({ length: 50 }).notNull(),
	newStatus: varchar({ length: 50 }).notNull(),
	trackingNumber: varchar({ length: 255 }),
	notificationSent: tinyint().default(0).notNull(),
	notificationMessage: text(),
	errorMessage: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const orders = mysqlTable("orders", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	sallaOrderId: varchar({ length: 100 }),
	orderNumber: varchar({ length: 100 }),
	customerPhone: varchar({ length: 20 }).notNull(),
	customerName: varchar({ length: 255 }).notNull(),
	customerEmail: varchar({ length: 255 }),
	address: text(),
	city: varchar({ length: 100 }),
	items: text().notNull(),
	totalAmount: int().notNull(),
	currency: mysqlEnum(['SAR','USD']).default('SAR').notNull(),
	discountCode: varchar({ length: 50 }),
	status: mysqlEnum(['pending','paid','processing','shipped','delivered','cancelled']).default('pending').notNull(),
	paymentUrl: text(),
	trackingNumber: varchar({ length: 100 }),
	notes: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	isGift: tinyint().default(0).notNull(),
	giftRecipientName: varchar({ length: 255 }),
	giftMessage: text(),
	reviewRequested: tinyint().default(0).notNull(),
	reviewRequestedAt: timestamp({ mode: 'string' }),
});

export const passwordResetAttempts = mysqlTable("password_reset_attempts", {
	id: int().autoincrement().notNull(),
	email: varchar({ length: 320 }).notNull(),
	attemptedAt: timestamp("attempted_at", { mode: 'string' }).defaultNow().notNull(),
	ipAddress: varchar("ip_address", { length: 45 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const passwordResetTokens = mysqlTable("password_reset_tokens", {
	id: int().autoincrement().notNull(),
	userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" } ),
	email: varchar({ length: 320 }).notNull(),
	token: varchar({ length: 255 }).notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	used: tinyint().default(0).notNull(),
	usedAt: timestamp("used_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("password_reset_tokens_token_unique").on(table.token),
]);

export const paymentGateways = mysqlTable("payment_gateways", {
	id: int().autoincrement().notNull(),
	gateway: mysqlEnum(['tap','paypal']).notNull(),
	isEnabled: tinyint().default(0).notNull(),
	publicKey: text(),
	secretKey: text(),
	webhookSecret: text(),
	testMode: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("payment_gateways_gateway_unique").on(table.gateway),
]);

export const payments = mysqlTable("payments", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	subscriptionId: int().notNull(),
	amount: int().notNull(),
	currency: varchar({ length: 3 }).default('SAR').notNull(),
	paymentMethod: mysqlEnum(['tap','paypal','link']).notNull(),
	transactionId: varchar({ length: 255 }),
	status: mysqlEnum(['pending','completed','failed','refunded']).default('pending').notNull(),
	paidAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const planChangeLogs = mysqlTable("planChangeLogs", {
	id: int().autoincrement().notNull(),
	planId: int().notNull(),
	changedBy: int().notNull(),
	fieldName: varchar({ length: 100 }).notNull(),
	oldValue: text(),
	newValue: text().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const plans = mysqlTable("plans", {
	id: int().autoincrement().notNull(),
	name: varchar({ length: 100 }).notNull(),
	nameAr: varchar({ length: 100 }).notNull(),
	priceMonthly: int().notNull(),
	conversationLimit: int().notNull(),
	voiceMessageLimit: int().notNull(),
	features: text(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const products = mysqlTable("products", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	name: varchar({ length: 255 }).notNull(),
	nameAr: varchar({ length: 255 }),
	description: text(),
	descriptionAr: text(),
	price: int().notNull(),
	currency: mysqlEnum(['SAR','USD']).default('SAR').notNull(),
	imageUrl: varchar({ length: 500 }),
	productUrl: varchar({ length: 500 }),
	category: varchar({ length: 100 }),
	isActive: tinyint().default(1).notNull(),
	stock: int().default(0),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	sallaProductId: varchar({ length: 100 }),
	lastSyncedAt: timestamp({ mode: 'string' }),
});

export const quickResponses = mysqlTable("quick_responses", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" } ),
	trigger: varchar({ length: 255 }).notNull(),
	keywords: text(),
	response: text().notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	priority: int().default(0).notNull(),
	useCount: int("use_count").default(0).notNull(),
	lastUsedAt: timestamp("last_used_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const referralCodes = mysqlTable("referral_codes", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	code: varchar({ length: 50 }).notNull(),
	referralCount: int().default(0).notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	referrerPhone: varchar({ length: 20 }).notNull(),
	referrerName: varchar({ length: 255 }).notNull(),
	rewardGiven: tinyint().default(0).notNull(),
},
(table) => [
	index("referral_codes_code_unique").on(table.code),
]);

export const referrals = mysqlTable("referrals", {
	id: int().autoincrement().notNull(),
	referralCodeId: int().notNull(),
	referredPhone: varchar({ length: 20 }).notNull(),
	referredName: varchar({ length: 255 }).notNull(),
	orderCompleted: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const rewards = mysqlTable("rewards", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	referralId: int().notNull(),
	rewardType: mysqlEnum(['discount_10','free_month','analytics_upgrade']).notNull(),
	status: mysqlEnum(['pending','claimed','expired']).default('pending').notNull(),
	claimedAt: timestamp({ mode: 'string' }),
	expiresAt: timestamp({ mode: 'string' }).notNull(),
	description: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const sallaConnections = mysqlTable("salla_connections", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	storeUrl: varchar({ length: 255 }).notNull(),
	accessToken: text().notNull(),
	syncStatus: mysqlEnum(['active','syncing','error','paused']).default('active').notNull(),
	lastSyncAt: timestamp({ mode: 'string' }),
	syncErrors: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("salla_connections_merchantId_unique").on(table.merchantId),
]);

export const sariPersonalitySettings = mysqlTable("sari_personality_settings", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" } ),
	tone: mysqlEnum(['friendly','professional','casual','enthusiastic']).default('friendly').notNull(),
	style: mysqlEnum(['saudi_dialect','formal_arabic','english','bilingual']).default('saudi_dialect').notNull(),
	emojiUsage: mysqlEnum("emoji_usage", ['none','minimal','moderate','frequent']).default('moderate').notNull(),
	customInstructions: text("custom_instructions"),
	brandVoice: text("brand_voice"),
	maxResponseLength: int("max_response_length").default(200).notNull(),
	responseDelay: int("response_delay").default(2).notNull(),
	customGreeting: text("custom_greeting"),
	customFarewell: text("custom_farewell"),
	recommendationStyle: mysqlEnum("recommendation_style", ['direct','consultative','enthusiastic']).default('consultative').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("sari_personality_settings_merchant_id_unique").on(table.merchantId),
]);

export const scheduledMessages = mysqlTable("scheduled_messages", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" } ),
	title: varchar({ length: 255 }).notNull(),
	message: text().notNull(),
	dayOfWeek: int("day_of_week").notNull(),
	time: varchar({ length: 5 }).notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	lastSentAt: timestamp("last_sent_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const sentimentAnalysis = mysqlTable("sentiment_analysis", {
	id: int().autoincrement().notNull(),
	messageId: int("message_id").notNull().references(() => messages.id, { onDelete: "cascade" } ),
	conversationId: int("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" } ),
	sentiment: mysqlEnum(['positive','negative','neutral','angry','happy','sad','frustrated']).notNull(),
	confidence: int().notNull(),
	keywords: text(),
	reasoning: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const signupPromptTestResults = mysqlTable("signup_prompt_test_results", {
	id: int().autoincrement().notNull(),
	sessionId: varchar("session_id", { length: 255 }).notNull(),
	variantId: varchar("variant_id", { length: 50 }).notNull(),
	shown: tinyint().default(0).notNull(),
	clicked: tinyint().default(0).notNull(),
	converted: tinyint().default(0).notNull(),
	dismissedAt: timestamp("dismissed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const signupPromptVariants = mysqlTable("signup_prompt_variants", {
	id: int().autoincrement().notNull(),
	variantId: varchar("variant_id", { length: 50 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text().notNull(),
	ctaText: varchar("cta_text", { length: 100 }).notNull(),
	offerText: text("offer_text"),
	showOffer: tinyint("show_offer").default(0).notNull(),
	messageThreshold: int("message_threshold").notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("signup_prompt_variants_variant_id_unique").on(table.variantId),
]);

export const subscriptions = mysqlTable("subscriptions", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	planId: int().notNull(),
	status: mysqlEnum(['active','expired','cancelled','pending','trial']).default('pending').notNull(),
	conversationsUsed: int().default(0).notNull(),
	voiceMessagesUsed: int().default(0).notNull(),
	startDate: timestamp({ mode: 'string' }).notNull(),
	endDate: timestamp({ mode: 'string' }).notNull(),
	autoRenew: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	messagesUsed: int().default(0).notNull(),
	lastResetAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const supportTickets = mysqlTable("supportTickets", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	subject: varchar({ length: 255 }).notNull(),
	message: text().notNull(),
	status: mysqlEnum(['open','in_progress','resolved','closed']).default('open').notNull(),
	priority: mysqlEnum(['low','medium','high','urgent']).default('medium').notNull(),
	adminResponse: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const syncLogs = mysqlTable("sync_logs", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	syncType: mysqlEnum(['full_sync','stock_sync','single_product']).notNull(),
	status: mysqlEnum(['success','failed','in_progress']).notNull(),
	itemsSynced: int().default(0).notNull(),
	errors: text(),
	startedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp({ mode: 'string' }),
});

export const testConversations = mysqlTable("testConversations", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	startedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	endedAt: timestamp({ mode: 'string' }),
	messageCount: int().default(0).notNull(),
	hasDeal: tinyint().default(0).notNull(),
	dealValue: int(),
	dealMarkedAt: timestamp({ mode: 'string' }),
	satisfactionRating: int(),
	npsScore: int(),
	wasCompleted: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const testDeals = mysqlTable("testDeals", {
	id: int().autoincrement().notNull(),
	conversationId: int(),
	merchantId: int().notNull(),
	dealValue: int().notNull(),
	timeToConversion: int(),
	messageCount: int().notNull(),
	markedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	wasCompleted: tinyint().default(0).notNull(),
	completedAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const testMessages = mysqlTable("testMessages", {
	id: int().autoincrement().notNull(),
	conversationId: int().notNull(),
	sender: mysqlEnum(['user','sari']).notNull(),
	content: text().notNull(),
	sentAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	responseTime: int(),
	rating: mysqlEnum(['positive','negative']),
	ratedAt: timestamp({ mode: 'string' }),
	productsRecommended: text(),
	wasClicked: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const testMetricsDaily = mysqlTable("testMetricsDaily", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	date: date({ mode: 'string' }).notNull(),
	totalConversations: int().default(0).notNull(),
	totalDeals: int().default(0).notNull(),
	conversionRate: int().default(0).notNull(),
	totalRevenue: int().default(0).notNull(),
	avgDealValue: int().default(0).notNull(),
	avgResponseTime: int().default(0).notNull(),
	avgConversationLength: int().default(0).notNull(),
	avgTimeToConversion: int().default(0).notNull(),
	totalMessages: int().default(0).notNull(),
	positiveRatings: int().default(0).notNull(),
	negativeRatings: int().default(0).notNull(),
	satisfactionRate: int().default(0).notNull(),
	completedConversations: int().default(0).notNull(),
	engagementRate: int().default(0).notNull(),
	returningUsers: int().default(0).notNull(),
	productClicks: int().default(0).notNull(),
	completedOrders: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const trySariAnalytics = mysqlTable("trySariAnalytics", {
	id: int().autoincrement().notNull(),
	sessionId: varchar({ length: 255 }).notNull(),
	messageCount: int().default(0).notNull(),
	exampleUsed: varchar({ length: 255 }),
	convertedToSignup: tinyint().default(0).notNull(),
	signupPromptShown: tinyint().default(0).notNull(),
	ipAddress: varchar({ length: 45 }),
	userAgent: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const users = mysqlTable("users", {
	id: int().autoincrement().notNull(),
	openId: varchar({ length: 64 }).notNull(),
	name: text(),
	email: varchar({ length: 320 }),
	loginMethod: varchar({ length: 64 }),
	role: mysqlEnum(['user','admin']).default('user').notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }).defaultNow().notNull(),
	password: varchar({ length: 255 }),
	// Trial period fields
	trialStartDate: timestamp('trial_start_date', { mode: 'string' }),
	trialEndDate: timestamp('trial_end_date', { mode: 'string' }),
	isTrialActive: tinyint('is_trial_active').default(0).notNull(),
	whatsappConnected: tinyint('whatsapp_connected').default(0).notNull(),
},
(table) => [
	index("users_openId_unique").on(table.openId),
]);



export const weeklySentimentReports = mysqlTable("weekly_sentiment_reports", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" } ),
	weekStartDate: timestamp("week_start_date", { mode: 'string' }).notNull(),
	weekEndDate: timestamp("week_end_date", { mode: 'string' }).notNull(),
	totalConversations: int("total_conversations").default(0).notNull(),
	positiveCount: int("positive_count").default(0).notNull(),
	negativeCount: int("negative_count").default(0).notNull(),
	neutralCount: int("neutral_count").default(0).notNull(),
	positivePercentage: int("positive_percentage").default(0).notNull(),
	negativePercentage: int("negative_percentage").default(0).notNull(),
	satisfactionScore: int("satisfaction_score").default(0).notNull(),
	topKeywords: text("top_keywords"),
	topComplaints: text("top_complaints"),
	recommendations: text(),
	emailSent: tinyint("email_sent").default(0).notNull(),
	emailSentAt: timestamp("email_sent_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const whatsappConnections = mysqlTable("whatsappConnections", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	phoneNumber: varchar({ length: 20 }),
	instanceId: varchar({ length: 255 }),
	apiToken: varchar({ length: 255 }),
	status: mysqlEnum(['connected','disconnected','pending','error']).default('pending').notNull(),
	qrCode: text(),
	lastConnected: timestamp({ mode: 'string' }),
	errorMessage: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("whatsappConnections_merchantId_unique").on(table.merchantId),
]);

export const whatsappConnectionRequests = mysqlTable("whatsapp_connection_requests", {
	id: int().autoincrement().notNull(),
	merchantId: int().notNull(),
	countryCode: varchar({ length: 10 }).notNull(),
	phoneNumber: varchar({ length: 20 }).notNull(),
	fullNumber: varchar({ length: 30 }).notNull(),
	status: mysqlEnum(['pending','approved','rejected','connected']).default('pending').notNull(),
	rejectionReason: text(),
	reviewedBy: int(),
	reviewedAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	instanceId: varchar({ length: 255 }),
	apiToken: varchar({ length: 255 }),
	apiUrl: varchar({ length: 255 }).default('https://api.green-api.com'),
	connectedAt: timestamp({ mode: 'string' }),
});

export const whatsappInstances = mysqlTable("whatsapp_instances", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" } ),
	instanceId: varchar("instance_id", { length: 255 }).notNull(),
	token: text().notNull(),
	apiUrl: varchar("api_url", { length: 255 }).default('https://api.green-api.com'),
	phoneNumber: varchar("phone_number", { length: 20 }),
	webhookUrl: text("webhook_url"),
	status: mysqlEnum(['active','inactive','pending','expired']).default('pending').notNull(),
	isPrimary: tinyint("is_primary").default(0).notNull(),
	lastSyncAt: timestamp("last_sync_at", { mode: 'string' }),
	connectedAt: timestamp("connected_at", { mode: 'string' }),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	metadata: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const whatsappRequests = mysqlTable("whatsapp_requests", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" } ),
	phoneNumber: varchar("phone_number", { length: 20 }),
	businessName: varchar("business_name", { length: 255 }),
	status: mysqlEnum(['pending','approved','rejected','completed']).default('pending').notNull(),
	instanceId: varchar("instance_id", { length: 100 }),
	token: text(),
	apiUrl: varchar("api_url", { length: 255 }).default('https://api.green-api.com'),
	qrCodeUrl: text("qr_code_url"),
	qrCodeExpiresAt: timestamp("qr_code_expires_at", { mode: 'string' }),
	connectedAt: timestamp("connected_at", { mode: 'string' }),
	reviewedBy: int("reviewed_by"),
	reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
	adminNotes: text("admin_notes"),
	rejectionReason: text("rejection_reason"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});


// ============================================
// SEO System Tables
// ============================================


// ============================================
// Password Reset System
// ============================================

export const seoPages = mysqlTable("seo_pages", {
	id: int().autoincrement().notNull(),
	pageSlug: varchar("page_slug", { length: 255 }).notNull().unique(),
	pageTitle: varchar("page_title", { length: 255 }).notNull(),
	pageDescription: text("page_description").notNull(),
	keywords: text("keywords"),
	author: varchar({ length: 255 }),
	canonicalUrl: varchar("canonical_url", { length: 500 }),
	isIndexed: tinyint("is_indexed").default(1).notNull(),
	isPriority: tinyint("is_priority").default(0).notNull(),
	changeFrequency: mysqlEnum("change_frequency", ['always','hourly','daily','weekly','monthly','yearly','never']).default('weekly'),
	priority: varchar({ length: 3 }).default('0.5'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoMetaTags = mysqlTable("seo_meta_tags", {
	id: int().autoincrement().notNull(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	metaName: varchar("meta_name", { length: 100 }).notNull(),
	metaContent: text("meta_content").notNull(),
	metaProperty: varchar("meta_property", { length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoOpenGraph = mysqlTable("seo_open_graph", {
	id: int().autoincrement().notNull(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	ogTitle: varchar("og_title", { length: 255 }).notNull(),
	ogDescription: text("og_description").notNull(),
	ogImage: varchar("og_image", { length: 500 }),
	ogImageAlt: varchar("og_image_alt", { length: 255 }),
	ogImageWidth: int("og_image_width").default(1200),
	ogImageHeight: int("og_image_height").default(630),
	ogType: varchar("og_type", { length: 50 }).default('website'),
	ogUrl: varchar("og_url", { length: 500 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoTwitterCards = mysqlTable("seo_twitter_cards", {
	id: int().autoincrement().notNull(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	twitterCardType: varchar("twitter_card_type", { length: 50 }).default('summary_large_image'),
	twitterTitle: varchar("twitter_title", { length: 255 }).notNull(),
	twitterDescription: text("twitter_description").notNull(),
	twitterImage: varchar("twitter_image", { length: 500 }),
	twitterImageAlt: varchar("twitter_image_alt", { length: 255 }),
	twitterCreator: varchar("twitter_creator", { length: 100 }),
	twitterSite: varchar("twitter_site", { length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoStructuredData = mysqlTable("seo_structured_data", {
	id: int().autoincrement().notNull(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	schemaType: varchar("schema_type", { length: 100 }).notNull(),
	schemaData: text("schema_data").notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoTrackingCodes = mysqlTable("seo_tracking_codes", {
	id: int().autoincrement().notNull(),
	pageId: int("page_id"),
	trackingType: mysqlEnum("tracking_type", ['google_analytics','google_tag_manager','facebook_pixel','snapchat_pixel','tiktok_pixel','custom']).notNull(),
	trackingId: varchar("tracking_id", { length: 255 }).notNull(),
	trackingCode: text("tracking_code"),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoAnalytics = mysqlTable("seo_analytics", {
	id: int().autoincrement().notNull(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	date: timestamp({ mode: 'string' }).notNull(),
	visitors: int().default(0).notNull(),
	pageViews: int("page_views").default(0).notNull(),
	bounceRate: varchar({ length: 10 }).default('0'),
	avgSessionDuration: varchar("avg_session_duration", { length: 20 }).default('0'),
	conversions: int().default(0).notNull(),
	conversionRate: varchar("conversion_rate", { length: 10 }).default('0'),
	trafficSource: mysqlEnum("traffic_source", ['organic','direct','social','referral','paid','other']).default('organic'),
	device: mysqlEnum(['desktop','mobile','tablet']).default('desktop'),
	country: varchar({ length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const seoKeywordsAnalysis = mysqlTable("seo_keywords_analysis", {
	id: int().autoincrement().notNull(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	keyword: varchar({ length: 255 }).notNull(),
	searchVolume: int("search_volume").default(0).notNull(),
	difficulty: int("difficulty").default(0).notNull(),
	currentRank: int("current_rank").default(0),
	targetRank: int("target_rank").default(1),
	competitorCount: int("competitor_count").default(0).notNull(),
	trend: varchar({ length: 50 }).default('stable'),
	lastUpdated: timestamp("last_updated", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const seoBacklinks = mysqlTable("seo_backlinks", {
	id: int().autoincrement().notNull(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	sourceUrl: varchar("source_url", { length: 500 }).notNull(),
	sourceDomain: varchar("source_domain", { length: 255 }).notNull(),
	anchorText: varchar("anchor_text", { length: 255 }),
	linkType: mysqlEnum("link_type", ['dofollow','nofollow']).default('dofollow'),
	domainAuthority: int("domain_authority").default(0),
	spamScore: int("spam_score").default(0),
	lastFound: timestamp("last_found", { mode: 'string' }).defaultNow().notNull(),
	status: mysqlEnum(['active','lost','pending']).default('active').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoPerformanceAlerts = mysqlTable("seo_performance_alerts", {
	id: int().autoincrement().notNull(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	alertType: mysqlEnum("alert_type", ['ranking_drop','traffic_drop','broken_link','slow_page','low_ctr','high_bounce_rate']).notNull(),
	severity: mysqlEnum(['low','medium','high','critical']).default('medium').notNull(),
	message: text().notNull(),
	metric: varchar({ length: 100 }),
	previousValue: varchar("previous_value", { length: 100 }),
	currentValue: varchar("current_value", { length: 100 }),
	threshold: varchar({ length: 100 }),
	isResolved: tinyint("is_resolved").default(0).notNull(),
	resolvedAt: timestamp("resolved_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoRecommendations = mysqlTable("seo_recommendations", {
	id: int().autoincrement().notNull(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	recommendationType: mysqlEnum("recommendation_type", ['keyword_optimization','content_improvement','technical_seo','link_building','user_experience','performance']).notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text().notNull(),
	priority: mysqlEnum(['low','medium','high','critical']).default('medium').notNull(),
	estimatedImpact: varchar("estimated_impact", { length: 100 }),
	implementationDifficulty: mysqlEnum("implementation_difficulty", ['easy','medium','hard']).default('medium'),
	status: mysqlEnum(['pending','in_progress','completed','dismissed']).default('pending').notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoSitemaps = mysqlTable("seo_sitemaps", {
	id: int().autoincrement().notNull(),
	sitemapType: mysqlEnum("sitemap_type", ['xml','image','video','news']).default('xml').notNull(),
	url: varchar({ length: 500 }).notNull(),
	lastModified: timestamp("last_modified", { mode: 'string' }).defaultNow().notNull(),
	entryCount: int("entry_count").default(0).notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	});

	export const googleOAuthSettings = mysqlTable("google_oauth_settings", {
		id: int().autoincrement().notNull().primaryKey(),
		clientId: varchar({ length: 500 }).notNull().unique(),
		clientSecret: varchar({ length: 500 }).notNull(),
		isEnabled: tinyint("is_enabled").default(1).notNull(),
		createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	});

	export const emailVerificationTokens = mysqlTable("email_verification_tokens", {
	id: int().autoincrement().notNull(),
	userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
	email: varchar({ length: 255 }).notNull(),
	token: varchar({ length: 255 }).notNull().unique(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	isUsed: tinyint("is_used").default(0).notNull(),
	usedAt: timestamp("used_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

// Setup Wizard Tables
export const businessTemplates = mysqlTable("business_templates", {
	id: int().autoincrement().notNull().primaryKey(),
	business_type: mysqlEnum('business_type', ['store','services','both']).notNull(),
	template_name: varchar("template_name", { length: 255 }).notNull(),
	icon: varchar({ length: 50 }),
	services: text(), // JSON array
	products: text(), // JSON array
	working_hours: text("working_hours"), // JSON object
	bot_personality: text("bot_personality"), // JSON object
	settings: text(), // JSON object
	description: text(),
	suitable_for: text("suitable_for"),
	is_active: tinyint("is_active").default(1).notNull(),
	usage_count: int("usage_count").default(0).notNull(),
	default_language: mysqlEnum('default_language', ['ar', 'en']).default('ar').notNull(),
	created_at: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const templateTranslations = mysqlTable("template_translations", {
	id: int().autoincrement().notNull().primaryKey(),
	template_id: int("template_id").notNull().references(() => businessTemplates.id, { onDelete: "cascade" }),
	language: mysqlEnum(['ar', 'en']).notNull(),
	template_name: varchar("template_name", { length: 255 }).notNull(),
	description: text(),
	suitable_for: text("suitable_for"),
	bot_personality: text("bot_personality"), // JSON object
	created_at: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("template_translations_template_id_idx").on(table.template_id),
	index("template_translations_language_idx").on(table.language),
]);

export const services = mysqlTable("services", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	category: varchar({ length: 100 }),
	categoryId: int("category_id").references(() => serviceCategories.id, { onDelete: "set null" }),
	// Pricing
	priceType: mysqlEnum("price_type", ['fixed','variable','custom']).default('fixed').notNull(),
	basePrice: int("base_price"), // in cents
	minPrice: int("min_price"), // in cents
	maxPrice: int("max_price"), // in cents
	// Time
	durationMinutes: int("duration_minutes").notNull(),
	bufferTimeMinutes: int("buffer_time_minutes").default(0).notNull(),
	// Booking
	requiresAppointment: tinyint("requires_appointment").default(1).notNull(),
	maxBookingsPerDay: int("max_bookings_per_day"),
	advanceBookingDays: int("advance_booking_days").default(30).notNull(),
	// Staff
	staffIds: text("staff_ids"), // JSON array
	// Status
	isActive: tinyint("is_active").default(1).notNull(),
	displayOrder: int("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const serviceCategories = mysqlTable("service_categories", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	name: varchar({ length: 255 }).notNull(),
	nameEn: varchar("name_en", { length: 255 }),
	description: text(),
	icon: varchar({ length: 100 }), // emoji or icon name
	color: varchar({ length: 20 }), // hex color
	displayOrder: int("display_order").default(0).notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const servicePackages = mysqlTable("service_packages", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	serviceIds: text("service_ids"), // JSON array
	originalPrice: int("original_price"), // in cents
	packagePrice: int("package_price"), // in cents
	discountPercentage: int("discount_percentage"),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const staffMembers = mysqlTable("staff_members", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	name: varchar({ length: 255 }).notNull(),
	phone: varchar({ length: 20 }),
	email: varchar({ length: 255 }),
	role: varchar({ length: 100 }),
	specialization: varchar({ length: 255 }), // التخصص
	workingHours: text("working_hours"), // JSON object
	isActive: tinyint("is_active").default(1).notNull(),
	googleCalendarId: varchar("google_calendar_id", { length: 255 }),
	serviceIds: text("service_ids"), // JSON array of service IDs
	avatar: varchar({ length: 500 }), // صورة الموظف
	bio: text(), // نبذة عن الموظف
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const appointments = mysqlTable("appointments", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
	customerName: varchar("customer_name", { length: 255 }),
	serviceId: int("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
	staffId: int("staff_id").references(() => staffMembers.id, { onDelete: "set null" }),
	appointmentDate: timestamp("appointment_date", { mode: 'string' }).notNull(),
	startTime: varchar("start_time", { length: 5 }).notNull(), // HH:MM
	endTime: varchar("end_time", { length: 5 }).notNull(), // HH:MM
	status: mysqlEnum(['pending','confirmed','cancelled','completed','no_show']).default('pending').notNull(),
	googleEventId: varchar("google_event_id", { length: 255 }),
	reminder24hSent: tinyint("reminder_24h_sent").default(0).notNull(),
	reminder1hSent: tinyint("reminder_1h_sent").default(0).notNull(),
	notes: text(),
	cancellationReason: text("cancellation_reason"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const serviceReviews = mysqlTable("service_reviews", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	serviceId: int("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
	customerName: varchar("customer_name", { length: 255 }),
	rating: int().notNull(), // 1-5
	comment: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

// ============================================
// Bookings System Tables
// ============================================

export const bookings = mysqlTable("bookings", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	serviceId: int("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
	customerName: varchar("customer_name", { length: 255 }),
	customerEmail: varchar("customer_email", { length: 255 }),
	staffId: int("staff_id").references(() => staffMembers.id, { onDelete: "set null" }),
	// Booking Details
	bookingDate: date("booking_date").notNull(),
	startTime: varchar("start_time", { length: 5 }).notNull(), // HH:MM
	endTime: varchar("end_time", { length: 5 }).notNull(), // HH:MM
	durationMinutes: int("duration_minutes").notNull(),
	// Status
	status: mysqlEnum(['pending','confirmed','in_progress','completed','cancelled','no_show']).default('pending').notNull(),
	paymentStatus: mysqlEnum("payment_status", ['unpaid','paid','refunded']).default('unpaid').notNull(),
	// Pricing
	basePrice: int("base_price").notNull(), // in cents
	discountAmount: int("discount_amount").default(0).notNull(),
	finalPrice: int("final_price").notNull(),
	// Integration
	googleEventId: varchar("google_event_id", { length: 255 }),
	// Reminders
	reminder24hSent: tinyint("reminder_24h_sent").default(0).notNull(),
	reminder1hSent: tinyint("reminder_1h_sent").default(0).notNull(),
	// Notes
	notes: text(),
	cancellationReason: text("cancellation_reason"),
	cancelledBy: mysqlEnum("cancelled_by", ['customer','merchant','system']),
	// Source
	bookingSource: mysqlEnum("booking_source", ['whatsapp','website','phone','walk_in']).default('whatsapp').notNull(),
	// Timestamps
	confirmedAt: timestamp("confirmed_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	cancelledAt: timestamp("cancelled_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const bookingTimeSlots = mysqlTable("booking_time_slots", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	serviceId: int("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
	staffId: int("staff_id").references(() => staffMembers.id, { onDelete: "cascade" }),
	// Time Slot
	slotDate: date("slot_date").notNull(),
	startTime: varchar("start_time", { length: 5 }).notNull(), // HH:MM
	endTime: varchar("end_time", { length: 5 }).notNull(), // HH:MM
	// Availability
	isAvailable: tinyint("is_available").default(1).notNull(),
	isBlocked: tinyint("is_blocked").default(0).notNull(),
	blockReason: text("block_reason"),
	// Capacity
	maxBookings: int("max_bookings").default(1).notNull(),
	currentBookings: int("current_bookings").default(0).notNull(),
	// Timestamps
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const bookingReviews = mysqlTable("booking_reviews", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	bookingId: int("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
	serviceId: int("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
	staffId: int("staff_id").references(() => staffMembers.id, { onDelete: "set null" }),
	customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
	customerName: varchar("customer_name", { length: 255 }),
	// Rating
	overallRating: int("overall_rating").notNull(), // 1-5
	serviceQuality: int("service_quality"), // 1-5
	professionalism: int("professionalism"), // 1-5
	valueForMoney: int("value_for_money"), // 1-5
	// Review
	comment: text(),
	isPublic: tinyint("is_public").default(1).notNull(),
	isVerified: tinyint("is_verified").default(1).notNull(),
	// Merchant Response
	merchantReply: text("merchant_reply"),
	repliedAt: timestamp("replied_at", { mode: 'string' }),
	// Timestamps
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const setupWizardProgress = mysqlTable("setup_wizard_progress", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }).unique(),
	currentStep: int("current_step").default(1).notNull(),
	completedSteps: text("completed_steps"), // JSON array [1, 2, 3]
	wizardData: text("wizard_data"), // JSON object with temporary data
	isCompleted: tinyint("is_completed").default(0).notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

// Platform Integrations (Zid, Calendly, etc.)
export const platformIntegrations = mysqlTable("platform_integrations", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	platformType: mysqlEnum("platform_type", ['zid', 'calendly', 'shopify', 'woocommerce']).notNull(),
	storeName: varchar("store_name", { length: 255 }),
	storeUrl: varchar("store_url", { length: 500 }),
	accessToken: text("access_token"), // encrypted
	refreshToken: text("refresh_token"), // encrypted
	isActive: tinyint("is_active").default(1).notNull(),
	settings: text(), // JSON settings
	lastSyncAt: timestamp("last_sync_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const googleIntegrations = mysqlTable("google_integrations", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	integrationType: mysqlEnum("integration_type", ['calendar','sheets']).notNull(),
	credentials: text(), // encrypted JSON
	calendarId: varchar("calendar_id", { length: 255 }),
	sheetId: varchar("sheet_id", { length: 255 }),
	isActive: tinyint("is_active").default(1).notNull(),
	lastSync: timestamp("last_sync", { mode: 'string' }),
	settings: text(), // JSON object
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

// ============================================
// Zid Integration Tables
// ============================================

export const zidSettings = mysqlTable("zid_settings", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// OAuth Credentials
	clientId: varchar("client_id", { length: 255 }),
	clientSecret: text("client_secret"), // encrypted
	accessToken: text("access_token"), // encrypted
	managerToken: text("manager_token"), // encrypted (X-Manager-Token)
	refreshToken: text("refresh_token"), // encrypted
	
	// Store Info
	storeId: varchar("store_id", { length: 255 }),
	storeName: varchar("store_name", { length: 255 }),
	storeUrl: varchar("store_url", { length: 500 }),
	
	// Settings
	isActive: tinyint("is_active").default(1).notNull(),
	autoSyncProducts: tinyint("auto_sync_products").default(1).notNull(),
	autoSyncOrders: tinyint("auto_sync_orders").default(1).notNull(),
	autoSyncCustomers: tinyint("auto_sync_customers").default(0).notNull(),
	
	// Sync Status
	lastProductSync: timestamp("last_product_sync", { mode: 'string' }),
	lastOrderSync: timestamp("last_order_sync", { mode: 'string' }),
	lastCustomerSync: timestamp("last_customer_sync", { mode: 'string' }),
	
	// Token Expiry
	tokenExpiresAt: timestamp("token_expires_at", { mode: 'string' }),
	
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const zidSyncLogs = mysqlTable("zid_sync_logs", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// Sync Info
	syncType: mysqlEnum("sync_type", ['products','orders','customers','inventory']).notNull(),
	status: mysqlEnum(['pending','in_progress','completed','failed']).default('pending').notNull(),
	
	// Statistics
	totalItems: int("total_items").default(0).notNull(),
	processedItems: int("processed_items").default(0).notNull(),
	successCount: int("success_count").default(0).notNull(),
	failedCount: int("failed_count").default(0).notNull(),
	
	// Details
	errorMessage: text("error_message"),
	syncDetails: text("sync_details"), // JSON
	
	// Timing
	startedAt: timestamp("started_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

	// Type definitions
export type User = InferSelectModel<typeof users>;
export type InsertUser = InferInsertModel<typeof users>;
export type Merchant = InferSelectModel<typeof merchants>;
export type InsertMerchant = InferInsertModel<typeof merchants>;
export type Plan = InferSelectModel<typeof plans>;
export type InsertPlan = InferInsertModel<typeof plans>;
export type Subscription = InferSelectModel<typeof subscriptions>;
export type InsertSubscription = InferInsertModel<typeof subscriptions>;
export type WhatsAppConnection = InferSelectModel<typeof whatsappConnections>;
export type InsertWhatsAppConnection = InferInsertModel<typeof whatsappConnections>;
export type WhatsAppConnectionRequest = InferSelectModel<typeof whatsappConnectionRequests>;
export type InsertWhatsAppConnectionRequest = InferInsertModel<typeof whatsappConnectionRequests>;
export type Product = InferSelectModel<typeof products>;
export type InsertProduct = InferInsertModel<typeof products>;
export type Conversation = InferSelectModel<typeof conversations>;
export type InsertConversation = InferInsertModel<typeof conversations>;
export type Message = InferSelectModel<typeof messages>;
export type InsertMessage = InferInsertModel<typeof messages>;
export type Campaign = InferSelectModel<typeof campaigns>;
export type InsertCampaign = InferInsertModel<typeof campaigns>;
export type CampaignLog = InferSelectModel<typeof campaignLogs>;
export type InsertCampaignLog = InferInsertModel<typeof campaignLogs>;
export type SupportTicket = InferSelectModel<typeof supportTickets>;
export type InsertSupportTicket = InferInsertModel<typeof supportTickets>;
export type Analytics = InferSelectModel<typeof analytics>;
export type InsertAnalytics = InferInsertModel<typeof analytics>;
export type Notification = InferSelectModel<typeof notifications>;
export type InsertNotification = InferInsertModel<typeof notifications>;
export type Payment = InferSelectModel<typeof payments>;
export type InsertPayment = InferInsertModel<typeof payments>;
export type PlanChangeLog = InferSelectModel<typeof planChangeLogs>;
export type InsertPlanChangeLog = InferInsertModel<typeof planChangeLogs>;
export type PaymentGateway = InferSelectModel<typeof paymentGateways>;
export type InsertPaymentGateway = InferInsertModel<typeof paymentGateways>;
export type Invoice = InferSelectModel<typeof invoices>;
export type InsertInvoice = InferInsertModel<typeof invoices>;
export type SallaConnection = InferSelectModel<typeof sallaConnections>;
export type InsertSallaConnection = InferInsertModel<typeof sallaConnections>;
export type SyncLog = InferSelectModel<typeof syncLogs>;
export type InsertSyncLog = InferInsertModel<typeof syncLogs>;
export type Order = InferSelectModel<typeof orders>;
export type InsertOrder = InferInsertModel<typeof orders>;
export type DiscountCode = InferSelectModel<typeof discountCodes>;
export type InsertDiscountCode = InferInsertModel<typeof discountCodes>;
export type ReferralCode = InferSelectModel<typeof referralCodes>;
export type InsertReferralCode = InferInsertModel<typeof referralCodes>;
export type Referral = InferSelectModel<typeof referrals>;
export type InsertReferral = InferInsertModel<typeof referrals>;
export type Reward = InferSelectModel<typeof rewards>;
export type InsertReward = InferInsertModel<typeof rewards>;
export type AbandonedCart = InferSelectModel<typeof abandonedCarts>;
export type InsertAbandonedCart = InferInsertModel<typeof abandonedCarts>;
export type AutomationRule = InferSelectModel<typeof automationRules>;
export type InsertAutomationRule = InferInsertModel<typeof automationRules>;
export type CustomerReview = InferSelectModel<typeof customerReviews>;
export type InsertCustomerReview = InferInsertModel<typeof customerReviews>;
export type OrderTrackingLog = InferSelectModel<typeof orderTrackingLogs>;
export type InsertOrderTrackingLog = InferInsertModel<typeof orderTrackingLogs>;
export type OccasionCampaign = InferSelectModel<typeof occasionCampaigns>;
export type InsertOccasionCampaign = InferInsertModel<typeof occasionCampaigns>;
export type WhatsAppInstance = InferSelectModel<typeof whatsappInstances>;
export type InsertWhatsAppInstance = InferInsertModel<typeof whatsappInstances>;
export type WhatsAppRequest = InferSelectModel<typeof whatsappRequests>;
export type InsertWhatsAppRequest = InferInsertModel<typeof whatsappRequests>;
export type SeoPage = InferSelectModel<typeof seoPages>;
export type InsertSeoPage = InferInsertModel<typeof seoPages>;
export type SeoKeyword = InferSelectModel<typeof seoKeywordsAnalysis>;
export type InsertSeoKeyword = InferInsertModel<typeof seoKeywordsAnalysis>;
export type SeoRanking = InferSelectModel<typeof seoRankingHistory>;
export type InsertSeoRanking = InferInsertModel<typeof seoRankingHistory>;
export type SeoBacklink = InferSelectModel<typeof seoBacklinks>;
export type InsertSeoBacklink = InferInsertModel<typeof seoBacklinks>;
export type SeoPerformanceAlert = InferSelectModel<typeof seoPerformanceAlerts>;
export type InsertSeoPerformanceAlert = InferInsertModel<typeof seoPerformanceAlerts>;
export type SeoRecommendation = InferSelectModel<typeof seoRecommendations>;
export type InsertSeoRecommendation = InferInsertModel<typeof seoRecommendations>;
export type SeoSitemap = InferSelectModel<typeof seoSitemaps>;
export type InsertSeoSitemap = InferInsertModel<typeof seoSitemaps>;
export type EmailVerificationToken = InferSelectModel<typeof emailVerificationTokens>;
export type InsertEmailVerificationToken = InferInsertModel<typeof emailVerificationTokens>;
export type GoogleOAuthSettings = InferSelectModel<typeof googleOAuthSettings>;
export type InsertGoogleOAuthSettings = InferInsertModel<typeof googleOAuthSettings>;
export type BusinessTemplate = InferSelectModel<typeof businessTemplates>;
export type InsertBusinessTemplate = InferInsertModel<typeof businessTemplates>;
export type TemplateTranslation = InferSelectModel<typeof templateTranslations>;
export type InsertTemplateTranslation = InferInsertModel<typeof templateTranslations>;
export type Service = InferSelectModel<typeof services>;
export type InsertService = InferInsertModel<typeof services>;
export type ServicePackage = InferSelectModel<typeof servicePackages>;
export type InsertServicePackage = InferInsertModel<typeof servicePackages>;
export type StaffMember = InferSelectModel<typeof staffMembers>;
export type InsertStaffMember = InferInsertModel<typeof staffMembers>;
export type Appointment = InferSelectModel<typeof appointments>;
export type InsertAppointment = InferInsertModel<typeof appointments>;
export type ServiceReview = InferSelectModel<typeof serviceReviews>;
export type InsertServiceReview = InferInsertModel<typeof serviceReviews>;
export type Booking = InferSelectModel<typeof bookings>;
export type InsertBooking = InferInsertModel<typeof bookings>;
export type BookingTimeSlot = InferSelectModel<typeof bookingTimeSlots>;
export type InsertBookingTimeSlot = InferInsertModel<typeof bookingTimeSlots>;
export type BookingReview = InferSelectModel<typeof bookingReviews>;
export type InsertBookingReview = InferInsertModel<typeof bookingReviews>;
export type SetupWizardProgress = InferSelectModel<typeof setupWizardProgress>;
export type InsertSetupWizardProgress = InferInsertModel<typeof setupWizardProgress>;
export type GoogleIntegration = InferSelectModel<typeof googleIntegrations>;
export type InsertGoogleIntegration = InferInsertModel<typeof googleIntegrations>;
export type ZidSettings = InferSelectModel<typeof zidSettings>;
export type InsertZidSettings = InferInsertModel<typeof zidSettings>;
export type ZidSyncLog = InferSelectModel<typeof zidSyncLogs>;
export type InsertZidSyncLog = InferInsertModel<typeof zidSyncLogs>;
export type PlatformIntegration = InferSelectModel<typeof platformIntegrations>;
export type InsertPlatformIntegration = InferInsertModel<typeof platformIntegrations>;

// ============================================
// Payment System Tables - Tap Payments Integration
// ============================================

// جدول معاملات الدفع الخاصة بالطلبات والحجوزات
export const orderPayments = mysqlTable("order_payments", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// ربط مع الطلب أو الحجز
	orderId: int("order_id").references(() => orders.id, { onDelete: "set null" }),
	bookingId: int("booking_id").references(() => bookings.id, { onDelete: "set null" }),
	
	// معلومات العميل
	customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
	customerName: varchar("customer_name", { length: 255 }),
	customerEmail: varchar("customer_email", { length: 255 }),
	
	// معلومات الدفع
	amount: int().notNull(), // بالهللات (cents)
	currency: varchar({ length: 3 }).default('SAR').notNull(),
	
	// Tap Payments Integration
	tapChargeId: varchar("tap_charge_id", { length: 255 }), // معرف المعاملة من Tap
	tapPaymentUrl: text("tap_payment_url"), // رابط الدفع
	
	// حالة الدفع
	status: mysqlEnum(['pending','authorized','captured','failed','cancelled','refunded']).default('pending').notNull(),
	paymentMethod: varchar("payment_method", { length: 50 }), // card, knet, benefit, etc.
	
	// تفاصيل إضافية
	description: text(),
	metadata: text(), // JSON string للبيانات الإضافية
	
	// Timestamps
	authorizedAt: timestamp("authorized_at", { mode: 'string' }),
	capturedAt: timestamp("captured_at", { mode: 'string' }),
	failedAt: timestamp("failed_at", { mode: 'string' }),
	refundedAt: timestamp("refunded_at", { mode: 'string' }),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	
	// Webhook & Error Handling
	lastWebhookAt: timestamp("last_webhook_at", { mode: 'string' }),
	errorMessage: text("error_message"),
	errorCode: varchar("error_code", { length: 50 }),
	
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("order_payments_tap_charge_id_idx").on(table.tapChargeId),
	index("order_payments_merchant_id_idx").on(table.merchantId),
	index("order_payments_order_id_idx").on(table.orderId),
	index("order_payments_booking_id_idx").on(table.bookingId),
]);

// جدول روابط الدفع السريعة
export const paymentLinks = mysqlTable("payment_links", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// معلومات الرابط
	linkId: varchar("link_id", { length: 100 }).notNull(), // معرف فريد للرابط
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	
	// معلومات المبلغ
	amount: int().notNull(), // بالهللات
	currency: varchar({ length: 3 }).default('SAR').notNull(),
	isFixedAmount: tinyint("is_fixed_amount").default(1).notNull(), // هل المبلغ ثابت أم متغير
	minAmount: int("min_amount"), // الحد الأدنى للمبلغ المتغير
	maxAmount: int("max_amount"), // الحد الأقصى للمبلغ المتغير
	
	// Tap Integration
	tapPaymentUrl: text("tap_payment_url").notNull(),
	tapChargeId: varchar("tap_charge_id", { length: 255 }),
	
	// إعدادات الرابط
	maxUsageCount: int("max_usage_count"), // عدد مرات الاستخدام المسموح (null = غير محدود)
	usageCount: int("usage_count").default(0).notNull(), // عدد مرات الاستخدام الفعلي
	expiresAt: timestamp("expires_at", { mode: 'string' }), // تاريخ انتهاء الرابط
	
	// الحالة
	status: mysqlEnum(['active','expired','disabled','completed']).default('active').notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	
	// ربط مع الطلبات/الحجوزات
	orderId: int("order_id").references(() => orders.id, { onDelete: "set null" }),
	bookingId: int("booking_id").references(() => bookings.id, { onDelete: "set null" }),
	
	// إحصائيات
	totalCollected: int("total_collected").default(0).notNull(), // إجمالي المبالغ المحصلة
	successfulPayments: int("successful_payments").default(0).notNull(),
	failedPayments: int("failed_payments").default(0).notNull(),
	
	// Metadata
	metadata: text(), // JSON string
	
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("payment_links_link_id_unique").on(table.linkId),
	index("payment_links_merchant_id_idx").on(table.merchantId),
]);

// جدول عمليات الاسترجاع
export const paymentRefunds = mysqlTable("payment_refunds", {
	id: int().autoincrement().notNull().primaryKey(),
	paymentId: int("payment_id").notNull().references(() => orderPayments.id, { onDelete: "cascade" }),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// معلومات الاسترجاع
	amount: int().notNull(), // المبلغ المسترجع
	currency: varchar({ length: 3 }).default('SAR').notNull(),
	reason: text().notNull(),
	
	// Tap Integration
	tapRefundId: varchar("tap_refund_id", { length: 255 }),
	
	// الحالة
	status: mysqlEnum(['pending','completed','failed']).default('pending').notNull(),
	
	// تفاصيل
	processedBy: int("processed_by"), // معرف المستخدم الذي قام بالاسترجاع
	errorMessage: text("error_message"),
	
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("payment_refunds_payment_id_idx").on(table.paymentId),
	index("payment_refunds_tap_refund_id_idx").on(table.tapRefundId),
]);

// Type exports
export type OrderPayment = InferSelectModel<typeof orderPayments>;
export type NewOrderPayment = InferInsertModel<typeof orderPayments>;
export type PaymentLink = InferSelectModel<typeof paymentLinks>;
export type NewPaymentLink = InferInsertModel<typeof paymentLinks>;
export type PaymentRefund = InferSelectModel<typeof paymentRefunds>;
export type NewPaymentRefund = InferInsertModel<typeof paymentRefunds>;

// ==================== Loyalty System Tables ====================

export const loyaltySettings = mysqlTable("loyalty_settings", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	isEnabled: tinyint("is_enabled").default(1).notNull(),
	pointsPerCurrency: int("points_per_currency").default(1).notNull(), // كم نقطة لكل 1 ريال
	currencyPerPoint: int("currency_per_point").default(10).notNull(), // كم ريال لكل 1 نقطة عند الاستبدال
	enableReferralBonus: tinyint("enable_referral_bonus").default(1).notNull(),
	referralBonusPoints: int("referral_bonus_points").default(50).notNull(),
	enableReviewBonus: tinyint("enable_review_bonus").default(1).notNull(),
	reviewBonusPoints: int("review_bonus_points").default(10).notNull(),
	enableBirthdayBonus: tinyint("enable_birthday_bonus").default(0).notNull(),
	birthdayBonusPoints: int("birthday_bonus_points").default(20).notNull(),
	pointsExpiryDays: int("points_expiry_days").default(365).notNull(), // مدة صلاحية النقاط بالأيام (0 = لا تنتهي)
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("loyalty_settings_merchant_id_unique").on(table.merchantId),
]);

export const loyaltyTiers = mysqlTable("loyalty_tiers", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	name: varchar({ length: 100 }).notNull(), // برونزي، فضي، ذهبي
	nameAr: varchar("name_ar", { length: 100 }).notNull(),
	minPoints: int("min_points").notNull(), // الحد الأدنى من النقاط للوصول لهذا المستوى
	discountPercentage: int("discount_percentage").default(0).notNull(), // نسبة الخصم لهذا المستوى
	freeShipping: tinyint("free_shipping").default(0).notNull(),
	priority: int().default(0).notNull(), // أولوية في الخدمة
	color: varchar({ length: 20 }).default('#CD7F32').notNull(), // لون المستوى
	icon: varchar({ length: 50 }).default('🥉').notNull(),
	benefits: text(), // JSON للمزايا الإضافية
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const loyaltyPoints = mysqlTable("loyalty_points", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
	customerName: varchar("customer_name", { length: 255 }),
	totalPoints: int("total_points").default(0).notNull(), // إجمالي النقاط الحالية
	lifetimePoints: int("lifetime_points").default(0).notNull(), // إجمالي النقاط التي حصل عليها على الإطلاق
	currentTierId: int("current_tier_id").references(() => loyaltyTiers.id),
	lastPointsEarnedAt: timestamp("last_points_earned_at", { mode: 'string' }),
	lastPointsRedeemedAt: timestamp("last_points_redeemed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("loyalty_points_merchant_customer_unique").on(table.merchantId, table.customerPhone),
]);

export const loyaltyTransactions = mysqlTable("loyalty_transactions", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
	type: mysqlEnum(['earn','redeem','expire','adjustment']).notNull(),
	points: int().notNull(), // موجب للكسب، سالب للاستبدال/الانتهاء
	reason: varchar({ length: 255 }).notNull(), // سبب الحركة
	reasonAr: varchar("reason_ar", { length: 255 }).notNull(),
	orderId: int("order_id").references(() => orders.id, { onDelete: "set null" }),
	rewardId: int("reward_id").references(() => loyaltyRewards.id, { onDelete: "set null" }),
	redemptionId: int("redemption_id").references(() => loyaltyRedemptions.id, { onDelete: "set null" }),
	balanceBefore: int("balance_before").notNull(),
	balanceAfter: int("balance_after").notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }), // تاريخ انتهاء النقاط
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("loyalty_transactions_customer_idx").on(table.merchantId, table.customerPhone),
	index("loyalty_transactions_order_idx").on(table.orderId),
]);

export const loyaltyRewards = mysqlTable("loyalty_rewards", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	title: varchar({ length: 255 }).notNull(),
	titleAr: varchar("title_ar", { length: 255 }).notNull(),
	description: text(),
	descriptionAr: text("description_ar"),
	type: mysqlEnum(['discount','free_product','free_shipping','gift']).notNull(),
	pointsCost: int("points_cost").notNull(), // كم نقطة مطلوبة للحصول على المكافأة
	discountAmount: int("discount_amount"), // قيمة الخصم (بالريال أو نسبة مئوية)
	discountType: mysqlEnum(['fixed','percentage']), // نوع الخصم
	productId: int("product_id").references(() => products.id, { onDelete: "set null" }), // للمنتج المجاني
	maxRedemptions: int("max_redemptions"), // الحد الأقصى لعدد مرات الاستبدال (null = غير محدود)
	currentRedemptions: int("current_redemptions").default(0).notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	validFrom: timestamp("valid_from", { mode: 'string' }),
	validUntil: timestamp("valid_until", { mode: 'string' }),
	imageUrl: varchar("image_url", { length: 500 }),
	termsAndConditions: text("terms_and_conditions"),
	termsAndConditionsAr: text("terms_and_conditions_ar"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const loyaltyRedemptions = mysqlTable("loyalty_redemptions", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
	customerName: varchar("customer_name", { length: 255 }),
	rewardId: int("reward_id").notNull().references(() => loyaltyRewards.id, { onDelete: "cascade" }),
	pointsSpent: int("points_spent").notNull(),
	status: mysqlEnum(['pending','approved','used','cancelled','expired']).default('pending').notNull(),
	orderId: int("order_id").references(() => orders.id, { onDelete: "set null" }), // الطلب الذي استخدمت فيه المكافأة
	usedAt: timestamp("used_at", { mode: 'string' }),
	expiresAt: timestamp("expires_at", { mode: 'string' }), // تاريخ انتهاء صلاحية المكافأة المستبدلة
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("loyalty_redemptions_customer_idx").on(table.merchantId, table.customerPhone),
	index("loyalty_redemptions_reward_idx").on(table.rewardId),
]);

// Type exports for Loyalty System
export type LoyaltySettings = InferSelectModel<typeof loyaltySettings>;
export type InsertLoyaltySettings = InferInsertModel<typeof loyaltySettings>;
export type LoyaltyTier = InferSelectModel<typeof loyaltyTiers>;
export type InsertLoyaltyTier = InferInsertModel<typeof loyaltyTiers>;
export type LoyaltyPoints = InferSelectModel<typeof loyaltyPoints>;
export type InsertLoyaltyPoints = InferInsertModel<typeof loyaltyPoints>;
export type LoyaltyTransaction = InferSelectModel<typeof loyaltyTransactions>;
export type InsertLoyaltyTransaction = InferInsertModel<typeof loyaltyTransactions>;
export type LoyaltyReward = InferSelectModel<typeof loyaltyRewards>;
export type InsertLoyaltyReward = InferInsertModel<typeof loyaltyRewards>;
export type LoyaltyRedemption = InferSelectModel<typeof loyaltyRedemptions>;
export type InsertLoyaltyRedemption = InferInsertModel<typeof loyaltyRedemptions>;


// ==================== Merchant Payment Settings ====================

export const merchantPaymentSettings = mysqlTable("merchant_payment_settings", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }).unique(),
	
	// Tap Payment Settings
	tapEnabled: tinyint("tap_enabled").default(0).notNull(),
	tapPublicKey: text("tap_public_key"),
	tapSecretKey: text("tap_secret_key"),
	tapTestMode: tinyint("tap_test_mode").default(1).notNull(), // 1 = sandbox, 0 = live
	
	// Payment Preferences
	autoSendPaymentLink: tinyint("auto_send_payment_link").default(1).notNull(), // إرسال رابط الدفع تلقائياً مع الطلبات
	paymentLinkMessage: text("payment_link_message"), // رسالة مخصصة مع رابط الدفع
	
	// Currency Settings
	defaultCurrency: varchar("default_currency", { length: 3 }).default('SAR').notNull(),
	
	// Webhook Settings
	tapWebhookSecret: text("tap_webhook_secret"),
	webhookUrl: text("webhook_url"), // URL لاستقبال تأكيدات الدفع
	
	// Status
	isVerified: tinyint("is_verified").default(0).notNull(), // تم التحقق من صلاحية المفاتيح
	lastVerifiedAt: timestamp("last_verified_at", { mode: 'string' }),
	
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

// Type exports for Merchant Payment Settings
export type MerchantPaymentSettings = InferSelectModel<typeof merchantPaymentSettings>;
export type InsertMerchantPaymentSettings = InferInsertModel<typeof merchantPaymentSettings>;

// ============================================
// Website Analysis Tables
// ============================================

export const websiteAnalyses = mysqlTable("website_analyses", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	url: varchar({ length: 500 }).notNull(),
	title: varchar({ length: 500 }),
	description: text(),
	industry: varchar({ length: 100 }),
	language: varchar({ length: 10 }),
	
	// SEO Analysis
	seoScore: int("seo_score").default(0).notNull(),
	seoIssues: text("seo_issues"), // JSON array
	metaTags: text("meta_tags"), // JSON object
	
	// Performance Analysis
	performanceScore: int("performance_score").default(0).notNull(),
	loadTime: int("load_time"), // milliseconds
	pageSize: int("page_size"), // bytes
	
	// UX Analysis
	uxScore: int("ux_score").default(0).notNull(),
	mobileOptimized: tinyint("mobile_optimized").default(0).notNull(),
	hasContactInfo: tinyint("has_contact_info").default(0).notNull(),
	hasWhatsapp: tinyint("has_whatsapp").default(0).notNull(),
	
	// Content Analysis
	contentQuality: int("content_quality").default(0).notNull(),
	wordCount: int("word_count").default(0).notNull(),
	imageCount: int("image_count").default(0).notNull(),
	videoCount: int("video_count").default(0).notNull(),
	
	// Overall Score
	overallScore: int("overall_score").default(0).notNull(),
	
	// Status
	status: mysqlEnum(['pending', 'analyzing', 'completed', 'failed']).default('pending').notNull(),
	errorMessage: text("error_message"),
	
	// Timestamps
	analyzedAt: timestamp("analyzed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("website_analyses_merchant_id_idx").on(table.merchantId),
	index("website_analyses_url_idx").on(table.url),
]);

export const websiteInsights = mysqlTable("website_insights", {
	id: int().autoincrement().notNull(),
	analysisId: int("analysis_id").notNull().references(() => websiteAnalyses.id, { onDelete: "cascade" }),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// Insight Details
	category: mysqlEnum(['seo', 'performance', 'ux', 'content', 'marketing', 'security']).notNull(),
	type: mysqlEnum(['strength', 'weakness', 'opportunity', 'threat', 'recommendation']).notNull(),
	priority: mysqlEnum(['low', 'medium', 'high', 'critical']).default('medium').notNull(),
	
	title: varchar({ length: 500 }).notNull(),
	description: text().notNull(),
	recommendation: text(),
	impact: text(), // Expected impact of implementing the recommendation
	
	// AI Generated
	aiGenerated: tinyint("ai_generated").default(1).notNull(),
	confidence: int().default(0).notNull(), // 0-100
	
	// Timestamps
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("website_insights_analysis_id_idx").on(table.analysisId),
	index("website_insights_merchant_id_idx").on(table.merchantId),
	index("website_insights_category_idx").on(table.category),
]);

export const extractedProducts = mysqlTable("extracted_products", {
	id: int().autoincrement().notNull(),
	analysisId: int("analysis_id").notNull().references(() => websiteAnalyses.id, { onDelete: "cascade" }),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// Product Details
	name: varchar({ length: 500 }).notNull(),
	description: text(),
	price: decimal({ precision: 10, scale: 2 }),
	currency: varchar({ length: 10 }).default('SAR'),
	imageUrl: varchar("image_url", { length: 500 }),
	productUrl: varchar("product_url", { length: 500 }),
	
	// Categories
	category: varchar({ length: 255 }),
	tags: text(), // JSON array
	
	// Availability
	inStock: tinyint("in_stock").default(1).notNull(),
	stockQuantity: int("stock_quantity"),
	
	// AI Extracted
	aiExtracted: tinyint("ai_extracted").default(1).notNull(),
	confidence: int().default(0).notNull(), // 0-100
	
	// Timestamps
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("extracted_products_analysis_id_idx").on(table.analysisId),
	index("extracted_products_merchant_id_idx").on(table.merchantId),
]);

export const competitorAnalyses = mysqlTable("competitor_analyses", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// Competitor Details
	name: varchar({ length: 255 }).notNull(),
	url: varchar({ length: 500 }).notNull(),
	industry: varchar({ length: 100 }),
	
	// Analysis Scores
	overallScore: int("overall_score").default(0).notNull(),
	seoScore: int("seo_score").default(0).notNull(),
	performanceScore: int("performance_score").default(0).notNull(),
	uxScore: int("ux_score").default(0).notNull(),
	contentScore: int("content_score").default(0).notNull(),
	
	// Pricing Analysis
	avgPrice: decimal("avg_price", { precision: 10, scale: 2 }),
	minPrice: decimal("min_price", { precision: 10, scale: 2 }),
	maxPrice: decimal("max_price", { precision: 10, scale: 2 }),
	currency: varchar({ length: 10 }).default('SAR'),
	
	// Product Count
	productCount: int("product_count").default(0).notNull(),
	
	// Strengths & Weaknesses
	strengths: text(), // JSON array
	weaknesses: text(), // JSON array
	opportunities: text(), // JSON array
	
	// Status
	status: mysqlEnum(['pending', 'analyzing', 'completed', 'failed']).default('pending').notNull(),
	errorMessage: text("error_message"),
	
	// Timestamps
	analyzedAt: timestamp("analyzed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("competitor_analyses_merchant_id_idx").on(table.merchantId),
	index("competitor_analyses_url_idx").on(table.url),
]);

export const competitorProducts = mysqlTable("competitor_products", {
	id: int().autoincrement().notNull(),
	competitorId: int("competitor_id").notNull().references(() => competitorAnalyses.id, { onDelete: "cascade" }),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// Product Details
	name: varchar({ length: 500 }).notNull(),
	description: text(),
	price: decimal({ precision: 10, scale: 2 }),
	currency: varchar({ length: 10 }).default('SAR'),
	imageUrl: varchar("image_url", { length: 500 }),
	productUrl: varchar("product_url", { length: 500 }),
	
	// Categories
	category: varchar({ length: 255 }),
	
	// Comparison with merchant's products
	similarToMerchantProduct: int("similar_to_merchant_product").references(() => products.id, { onDelete: "set null" }),
	priceDifference: decimal("price_difference", { precision: 10, scale: 2 }), // Positive = competitor more expensive
	
	// Timestamps
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("competitor_products_competitor_id_idx").on(table.competitorId),
	index("competitor_products_merchant_id_idx").on(table.merchantId),
]);

// ============================================
// Smart Website Analysis Tables
// ============================================

export const discoveredPages = mysqlTable("discovered_pages", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// Page Information
	pageType: mysqlEnum("page_type", ['about', 'shipping', 'returns', 'faq', 'contact', 'privacy', 'terms', 'other']).notNull(),
	title: varchar({ length: 500 }),
	url: varchar({ length: 1000 }).notNull(),
	content: text(), // Extracted text content
	
	// Metadata
	isActive: tinyint("is_active").default(1).notNull(),
	useInBot: tinyint("use_in_bot").default(1).notNull(), // Whether to use this page in bot responses
	
	// Timestamps
	discoveredAt: timestamp("discovered_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("discovered_pages_merchant_id_idx").on(table.merchantId),
	index("discovered_pages_page_type_idx").on(table.pageType),
]);

export const extractedFaqs = mysqlTable("extracted_faqs", {
	id: int().autoincrement().notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	pageId: int("page_id").references(() => discoveredPages.id, { onDelete: "set null" }), // Source page
	
	// FAQ Content
	question: text().notNull(),
	answer: text().notNull(),
	category: varchar({ length: 255 }), // e.g., "shipping", "returns", "payment"
	
	// Metadata
	isActive: tinyint("is_active").default(1).notNull(),
	useInBot: tinyint("use_in_bot").default(1).notNull(), // Whether to use this FAQ in bot responses
	priority: int().default(0).notNull(), // Higher priority FAQs shown first
	
	// Usage Stats
	usageCount: int("usage_count").default(0).notNull(), // How many times this FAQ was used in bot responses
	lastUsedAt: timestamp("last_used_at", { mode: 'string' }),
	
	// Timestamps
	extractedAt: timestamp("extracted_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("extracted_faqs_merchant_id_idx").on(table.merchantId),
	index("extracted_faqs_category_idx").on(table.category),
	index("extracted_faqs_page_id_idx").on(table.pageId),
]);

// Type exports for the new tables
export type DiscoveredPage = InferSelectModel<typeof discoveredPages>;
export type NewDiscoveredPage = InferInsertModel<typeof discoveredPages>;
export type ExtractedFaq = InferSelectModel<typeof extractedFaqs>;
export type NewExtractedFaq = InferInsertModel<typeof extractedFaqs>;

// ==================== Zid Integration Tables ====================

export const zidProducts = mysqlTable("zid_products", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// Zid Product Info
	zidProductId: varchar("zid_product_id", { length: 255 }).notNull(),
	zidSku: varchar("zid_sku", { length: 255 }),
	
	// Product Details
	nameAr: varchar("name_ar", { length: 500 }),
	nameEn: varchar("name_en", { length: 500 }),
	descriptionAr: text("description_ar"),
	descriptionEn: text("description_en"),
	
	// Pricing
	price: decimal({ precision: 10, scale: 2 }).notNull(),
	salePrice: decimal("sale_price", { precision: 10, scale: 2 }),
	currency: varchar({ length: 3 }).default('SAR').notNull(),
	
	// Inventory
	quantity: int().default(0).notNull(),
	isInStock: tinyint("is_in_stock").default(1).notNull(),
	
	// Images
	mainImage: varchar("main_image", { length: 1000 }),
	images: text(), // JSON array of image URLs
	
	// Categories
	categoryId: varchar("category_id", { length: 255 }),
	categoryName: varchar("category_name", { length: 255 }),
	
	// Status
	isActive: tinyint("is_active").default(1).notNull(),
	isPublished: tinyint("is_published").default(1).notNull(),
	
	// Linked to Sari Product
	sariProductId: int("sari_product_id").references(() => products.id, { onDelete: "set null" }),
	
	// Sync Info
	lastSyncedAt: timestamp("last_synced_at", { mode: 'string' }),
	zidData: text("zid_data"), // Full JSON response from Zid API
	
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("zid_products_merchant_id_idx").on(table.merchantId),
	index("zid_products_zid_product_id_idx").on(table.zidProductId),
	index("zid_products_sari_product_id_idx").on(table.sariProductId),
]);

export const zidOrders = mysqlTable("zid_orders", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// Zid Order Info
	zidOrderId: varchar("zid_order_id", { length: 255 }).notNull(),
	zidOrderNumber: varchar("zid_order_number", { length: 255 }),
	
	// Customer Info
	customerName: varchar("customer_name", { length: 255 }),
	customerEmail: varchar("customer_email", { length: 255 }),
	customerPhone: varchar("customer_phone", { length: 50 }),
	
	// Order Details
	totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
	currency: varchar({ length: 3 }).default('SAR').notNull(),
	status: mysqlEnum(['pending','processing','completed','cancelled','refunded']).default('pending').notNull(),
	paymentStatus: mysqlEnum("payment_status", ['pending','paid','failed','refunded']).default('pending').notNull(),
	
	// Items
	items: text().notNull(), // JSON array of order items
	
	// Shipping
	shippingAddress: text("shipping_address"), // JSON
	shippingMethod: varchar("shipping_method", { length: 255 }),
	shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 }),
	
	// Linked to Sari Order
	sariOrderId: int("sari_order_id").references(() => orders.id, { onDelete: "set null" }),
	
	// Dates
	orderDate: timestamp("order_date", { mode: 'string' }),
	lastSyncedAt: timestamp("last_synced_at", { mode: 'string' }),
	zidData: text("zid_data"), // Full JSON response from Zid API
	
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("zid_orders_merchant_id_idx").on(table.merchantId),
	index("zid_orders_zid_order_id_idx").on(table.zidOrderId),
	index("zid_orders_sari_order_id_idx").on(table.sariOrderId),
	index("zid_orders_customer_phone_idx").on(table.customerPhone),
]);

export const zidWebhooks = mysqlTable("zid_webhooks", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// Webhook Info
	webhookId: varchar("webhook_id", { length: 255 }),
	eventType: varchar("event_type", { length: 100 }).notNull(), // order.created, product.updated, etc.
	
	// Payload
	payload: text().notNull(), // Full JSON payload
	
	// Processing
	status: mysqlEnum(['pending','processed','failed']).default('pending').notNull(),
	processedAt: timestamp("processed_at", { mode: 'string' }),
	errorMessage: text("error_message"),
	
	// Metadata
	ipAddress: varchar("ip_address", { length: 50 }),
	userAgent: varchar("user_agent", { length: 500 }),
	
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("zid_webhooks_merchant_id_idx").on(table.merchantId),
	index("zid_webhooks_event_type_idx").on(table.eventType),
	index("zid_webhooks_status_idx").on(table.status),
]);

// Type exports for Zid tables
export type ZidProduct = InferSelectModel<typeof zidProducts>;
export type NewZidProduct = InferInsertModel<typeof zidProducts>;
export type ZidOrder = InferSelectModel<typeof zidOrders>;
export type NewZidOrder = InferInsertModel<typeof zidOrders>;
export type ZidWebhook = InferSelectModel<typeof zidWebhooks>;
export type NewZidWebhook = InferInsertModel<typeof zidWebhooks>;

// ==================== WooCommerce Integration Tables ====================

export const woocommerceSettings = mysqlTable("woocommerce_settings", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// Connection Details
	storeUrl: varchar("store_url", { length: 500 }).notNull(),
	consumerKey: varchar("consumer_key", { length: 500 }).notNull(),
	consumerSecret: varchar("consumer_secret", { length: 500 }).notNull(),
	
	// Status
	isActive: tinyint("is_active").default(1).notNull(),
	lastSyncAt: timestamp("last_sync_at", { mode: 'string' }),
	lastTestAt: timestamp("last_test_at", { mode: 'string' }),
	connectionStatus: mysqlEnum(['connected','disconnected','error']).default('disconnected').notNull(),
	
	// Sync Settings
	autoSyncProducts: tinyint("auto_sync_products").default(1).notNull(),
	autoSyncOrders: tinyint("auto_sync_orders").default(1).notNull(),
	autoSyncCustomers: tinyint("auto_sync_customers").default(0).notNull(),
	syncInterval: int("sync_interval").default(60).notNull(), // minutes
	
	// Metadata
	storeVersion: varchar("store_version", { length: 50 }),
	storeName: varchar("store_name", { length: 255 }),
	storeCurrency: varchar("store_currency", { length: 10 }),
	
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("woocommerce_settings_merchant_id_idx").on(table.merchantId),
	uniqueIndex("woocommerce_settings_merchant_unique").on(table.merchantId),
]);

export const woocommerceProducts = mysqlTable("woocommerce_products", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	productId: int("product_id").references(() => products.id, { onDelete: "cascade" }), // Link to local product
	
	// WooCommerce IDs
	wooProductId: int("woo_product_id").notNull(), // WooCommerce product ID
	wooVariationId: int("woo_variation_id"), // For product variations
	
	// Product Info
	name: varchar({ length: 500 }).notNull(),
	slug: varchar({ length: 500 }).notNull(),
	sku: varchar({ length: 255 }),
	price: decimal({ precision: 10, scale: 2 }).notNull(),
	regularPrice: decimal("regular_price", { precision: 10, scale: 2 }),
	salePrice: decimal("sale_price", { precision: 10, scale: 2 }),
	
	// Stock
	stockStatus: mysqlEnum("stock_status", ['instock','outofstock','onbackorder']).default('instock').notNull(),
	stockQuantity: int("stock_quantity"),
	manageStock: tinyint("manage_stock").default(0).notNull(),
	
	// Details
	description: text(),
	shortDescription: text("short_description"),
	imageUrl: varchar("image_url", { length: 1000 }),
	categories: text(), // JSON array of category IDs
	
	// Sync
	lastSyncAt: timestamp("last_sync_at", { mode: 'string' }).defaultNow().notNull(),
	syncStatus: mysqlEnum("sync_status", ['synced','pending','error']).default('synced').notNull(),
	
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("woocommerce_products_merchant_id_idx").on(table.merchantId),
	index("woocommerce_products_product_id_idx").on(table.productId),
	index("woocommerce_products_woo_product_id_idx").on(table.wooProductId),
	uniqueIndex("woocommerce_products_merchant_woo_unique").on(table.merchantId, table.wooProductId),
]);

export const woocommerceOrders = mysqlTable("woocommerce_orders", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	orderId: int("order_id").references(() => orders.id, { onDelete: "cascade" }), // Link to local order
	
	// WooCommerce Order ID
	wooOrderId: int("woo_order_id").notNull(),
	
	// Order Info
	orderNumber: varchar("order_number", { length: 100 }).notNull(),
	status: varchar({ length: 50 }).notNull(), // pending, processing, completed, etc.
	currency: varchar({ length: 10 }).notNull(),
	total: decimal({ precision: 10, scale: 2 }).notNull(),
	subtotal: decimal({ precision: 10, scale: 2 }).notNull(),
	totalTax: decimal("total_tax", { precision: 10, scale: 2 }),
	shippingTotal: decimal("shipping_total", { precision: 10, scale: 2 }),
	discountTotal: decimal("discount_total", { precision: 10, scale: 2 }),
	
	// Customer Info
	customerEmail: varchar("customer_email", { length: 255 }),
	customerPhone: varchar("customer_phone", { length: 50 }),
	customerName: varchar("customer_name", { length: 255 }),
	
	// Billing
	billingAddress: text("billing_address"), // JSON
	shippingAddress: text("shipping_address"), // JSON
	
	// Items
	lineItems: text("line_items").notNull(), // JSON array
	
	// Payment
	paymentMethod: varchar("payment_method", { length: 100 }),
	paymentMethodTitle: varchar("payment_method_title", { length: 255 }),
	transactionId: varchar("transaction_id", { length: 255 }),
	
	// Dates
	orderDate: timestamp("order_date", { mode: 'string' }).notNull(),
	paidDate: timestamp("paid_date", { mode: 'string' }),
	completedDate: timestamp("completed_date", { mode: 'string' }),
	
	// Sync
	lastSyncAt: timestamp("last_sync_at", { mode: 'string' }).defaultNow().notNull(),
	syncStatus: mysqlEnum("sync_status", ['synced','pending','error']).default('synced').notNull(),
	
	// Metadata
	customerNote: text("customer_note"),
	
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("woocommerce_orders_merchant_id_idx").on(table.merchantId),
	index("woocommerce_orders_order_id_idx").on(table.orderId),
	index("woocommerce_orders_woo_order_id_idx").on(table.wooOrderId),
	index("woocommerce_orders_status_idx").on(table.status),
	uniqueIndex("woocommerce_orders_merchant_woo_unique").on(table.merchantId, table.wooOrderId),
]);

export const woocommerceSyncLogs = mysqlTable("woocommerce_sync_logs", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// Sync Info
	syncType: mysqlEnum("sync_type", ['products','orders','customers','manual']).notNull(),
	direction: mysqlEnum(['import','export','bidirectional']).notNull(),
	
	// Results
	status: mysqlEnum(['success','partial','failed']).notNull(),
	itemsProcessed: int("items_processed").default(0).notNull(),
	itemsSuccess: int("items_success").default(0).notNull(),
	itemsFailed: int("items_failed").default(0).notNull(),
	
	// Details
	errorMessage: text("error_message"),
	details: text(), // JSON with more info
	
	// Timing
	startedAt: timestamp("started_at", { mode: 'string' }).notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	duration: int(), // seconds
	
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("woocommerce_sync_logs_merchant_id_idx").on(table.merchantId),
	index("woocommerce_sync_logs_sync_type_idx").on(table.syncType),
	index("woocommerce_sync_logs_status_idx").on(table.status),
]);

export const woocommerceWebhooks = mysqlTable("woocommerce_webhooks", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	
	// Webhook Info
	webhookId: varchar("webhook_id", { length: 255 }),
	eventType: varchar("event_type", { length: 100 }).notNull(), // order.created, product.updated, etc.
	topic: varchar({ length: 100 }).notNull(), // order.created, product.updated, etc.
	
	// Payload
	payload: text().notNull(), // Full JSON payload
	
	// Processing
	status: mysqlEnum(['pending','processed','failed']).default('pending').notNull(),
	processedAt: timestamp("processed_at", { mode: 'string' }),
	errorMessage: text("error_message"),
	
	// Metadata
	ipAddress: varchar("ip_address", { length: 50 }),
	userAgent: varchar("user_agent", { length: 500 }),
	signature: varchar({ length: 500 }), // For webhook verification
	
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => [
	index("woocommerce_webhooks_merchant_id_idx").on(table.merchantId),
	index("woocommerce_webhooks_event_type_idx").on(table.eventType),
	index("woocommerce_webhooks_status_idx").on(table.status),
]);

// Type exports for WooCommerce tables
export type WooCommerceSettings = InferSelectModel<typeof woocommerceSettings>;
export type NewWooCommerceSettings = InferInsertModel<typeof woocommerceSettings>;
export type WooCommerceProduct = InferSelectModel<typeof woocommerceProducts>;
export type NewWooCommerceProduct = InferInsertModel<typeof woocommerceProducts>;
export type WooCommerceOrder = InferSelectModel<typeof woocommerceOrders>;
export type NewWooCommerceOrder = InferInsertModel<typeof woocommerceOrders>;
export type WooCommerceSyncLog = InferSelectModel<typeof woocommerceSyncLogs>;
export type NewWooCommerceSyncLog = InferInsertModel<typeof woocommerceSyncLogs>;
export type WooCommerceWebhook = InferSelectModel<typeof woocommerceWebhooks>;
export type NewWooCommerceWebhook = InferInsertModel<typeof woocommerceWebhooks>;
// Email Templates Table
export const emailTemplates = mysqlTable("email_templates", {
	id: int().autoincrement().notNull().primaryKey(),
	name: varchar({ length: 100 }).notNull().unique(), // Template identifier (e.g., 'new_order', 'order_status_changed')
	displayName: varchar("display_name", { length: 255 }).notNull(), // Human-readable name
	subject: varchar({ length: 500 }).notNull(),
	htmlContent: text("html_content").notNull(),
	textContent: text("text_content").notNull(),
	variables: text(), // JSON array of available variables
	description: text(), // Template description
	isCustom: tinyint("is_custom").default(0).notNull(), // 0 = default, 1 = custom
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("email_templates_name_idx").on(table.name),
]);

export type EmailTemplate = InferSelectModel<typeof emailTemplates>;
export type NewEmailTemplate = InferInsertModel<typeof emailTemplates>;

export * from "./schema_smtp";
export * from "./schema_push";
export * from "./schema_notifications";
export * from "./schema_subscriptions";
export * from "./schema_coupons";
