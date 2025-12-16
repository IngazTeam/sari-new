import { mysqlTable, mysqlSchema, AnyMySqlColumn, foreignKey, int, varchar, text, mysqlEnum, timestamp, index, date, tinyint } from "drizzle-orm/mysql-core"
import { sql, InferSelectType, InferInsertType } from "drizzle-orm"

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
	language: mysqlEnum(['ar','en','both']).default('ar').notNull(),
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
});

export const messages = mysqlTable("messages", {
	id: int().autoincrement().notNull(),
	conversationId: int().notNull(),
	direction: mysqlEnum(['incoming','outgoing']).notNull(),
	messageType: mysqlEnum(['text','voice','image']).default('text').notNull(),
	content: text().notNull(),
	voiceUrl: varchar({ length: 500 }),
	imageUrl: varchar({ length: 500 }),
	isProcessed: tinyint().default(0).notNull(),
	aiResponse: text(),
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
	status: mysqlEnum(['active','expired','cancelled','pending']).default('pending').notNull(),
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

	// Type definitions
export type User = InferSelectType<typeof users>;
export type InsertUser = InferInsertType<typeof users>;
export type Merchant = InferSelectType<typeof merchants>;
export type InsertMerchant = InferInsertType<typeof merchants>;
export type Plan = InferSelectType<typeof plans>;
export type InsertPlan = InferInsertType<typeof plans>;
export type Subscription = InferSelectType<typeof subscriptions>;
export type InsertSubscription = InferInsertType<typeof subscriptions>;
export type WhatsAppConnection = InferSelectType<typeof whatsappConnections>;
export type InsertWhatsAppConnection = InferInsertType<typeof whatsappConnections>;
export type WhatsAppConnectionRequest = InferSelectType<typeof whatsappConnectionRequests>;
export type InsertWhatsAppConnectionRequest = InferInsertType<typeof whatsappConnectionRequests>;
export type Product = InferSelectType<typeof products>;
export type InsertProduct = InferInsertType<typeof products>;
export type Conversation = InferSelectType<typeof conversations>;
export type InsertConversation = InferInsertType<typeof conversations>;
export type Message = InferSelectType<typeof messages>;
export type InsertMessage = InferInsertType<typeof messages>;
export type Campaign = InferSelectType<typeof campaigns>;
export type InsertCampaign = InferInsertType<typeof campaigns>;
export type CampaignLog = InferSelectType<typeof campaignLogs>;
export type InsertCampaignLog = InferInsertType<typeof campaignLogs>;
export type SupportTicket = InferSelectType<typeof supportTickets>;
export type InsertSupportTicket = InferInsertType<typeof supportTickets>;
export type Analytics = InferSelectType<typeof analytics>;
export type InsertAnalytics = InferInsertType<typeof analytics>;
export type Notification = InferSelectType<typeof notifications>;
export type InsertNotification = InferInsertType<typeof notifications>;
export type Payment = InferSelectType<typeof payments>;
export type InsertPayment = InferInsertType<typeof payments>;
export type PlanChangeLog = InferSelectType<typeof planChangeLogs>;
export type InsertPlanChangeLog = InferInsertType<typeof planChangeLogs>;
export type PaymentGateway = InferSelectType<typeof paymentGateways>;
export type InsertPaymentGateway = InferInsertType<typeof paymentGateways>;
export type Invoice = InferSelectType<typeof invoices>;
export type InsertInvoice = InferInsertType<typeof invoices>;
export type SallaConnection = InferSelectType<typeof sallaConnections>;
export type InsertSallaConnection = InferInsertType<typeof sallaConnections>;
export type SyncLog = InferSelectType<typeof syncLogs>;
export type InsertSyncLog = InferInsertType<typeof syncLogs>;
export type Order = InferSelectType<typeof orders>;
export type InsertOrder = InferInsertType<typeof orders>;
export type DiscountCode = InferSelectType<typeof discountCodes>;
export type InsertDiscountCode = InferInsertType<typeof discountCodes>;
export type ReferralCode = InferSelectType<typeof referralCodes>;
export type InsertReferralCode = InferInsertType<typeof referralCodes>;
export type Referral = InferSelectType<typeof referrals>;
export type InsertReferral = InferInsertType<typeof referrals>;
export type Reward = InferSelectType<typeof rewards>;
export type InsertReward = InferInsertType<typeof rewards>;
export type AbandonedCart = InferSelectType<typeof abandonedCarts>;
export type InsertAbandonedCart = InferInsertType<typeof abandonedCarts>;
export type AutomationRule = InferSelectType<typeof automationRules>;
export type InsertAutomationRule = InferInsertType<typeof automationRules>;
export type CustomerReview = InferSelectType<typeof customerReviews>;
export type InsertCustomerReview = InferInsertType<typeof customerReviews>;
export type OrderTrackingLog = InferSelectType<typeof orderTrackingLogs>;
export type InsertOrderTrackingLog = InferInsertType<typeof orderTrackingLogs>;
export type OccasionCampaign = InferSelectType<typeof occasionCampaigns>;
export type InsertOccasionCampaign = InferInsertType<typeof occasionCampaigns>;
export type WhatsAppInstance = InferSelectType<typeof whatsappInstances>;
export type InsertWhatsAppInstance = InferInsertType<typeof whatsappInstances>;
export type WhatsAppRequest = InferSelectType<typeof whatsappRequests>;
export type InsertWhatsAppRequest = InferInsertType<typeof whatsappRequests>;
export type SeoPage = InferSelectType<typeof seoPages>;
export type InsertSeoPage = InferInsertType<typeof seoPages>;
export type SeoKeyword = InferSelectType<typeof seoKeywords>;
export type InsertSeoKeyword = InferInsertType<typeof seoKeywords>;
export type SeoRanking = InferSelectType<typeof seoRankings>;
export type InsertSeoRanking = InferInsertType<typeof seoRankings>;
export type SeoBacklink = InferSelectType<typeof seoBacklinks>;
export type InsertSeoBacklink = InferInsertType<typeof seoBacklinks>;
export type SeoPerformanceAlert = InferSelectType<typeof seoPerformanceAlerts>;
export type InsertSeoPerformanceAlert = InferInsertType<typeof seoPerformanceAlerts>;
export type SeoRecommendation = InferSelectType<typeof seoRecommendations>;
export type InsertSeoRecommendation = InferInsertType<typeof seoRecommendations>;
export type SeoSitemap = InferSelectType<typeof seoSitemaps>;
export type InsertSeoSitemap = InferInsertType<typeof seoSitemaps>;
export type EmailVerificationToken = InferSelectType<typeof emailVerificationTokens>;
export type InsertEmailVerificationToken = InferInsertType<typeof emailVerificationTokens>;
