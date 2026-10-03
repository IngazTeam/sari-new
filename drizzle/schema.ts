import { mysqlTable, mysqlEnum, int, bigint, varchar, char, text, mediumtext, timestamp, datetime, tinyint, decimal, date, index, uniqueIndex, primaryKey, foreignKey, check, json } from "drizzle-orm/mysql-core"
import { sql, InferSelectModel, InferInsertModel } from "drizzle-orm"
export * from './tenant-notification-schema';

export const aiBudgetPolicies = mysqlTable('ai_budget_policies', {
  scopeKey: varchar('scope_key', { length: 160 }).primaryKey(),
  version: varchar({ length: 80 }).notNull(),
  dailyLimitMicroUsd: bigint('daily_limit_micro_usd', { mode: 'number', unsigned: true }).notNull(),
  enabled: tinyint().default(1).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
export const aiPriceCards = mysqlTable('ai_price_cards', {
  provider: varchar({ length: 40 }).notNull(),
  model: varchar({ length: 128 }).notNull(),
  version: varchar({ length: 80 }).notNull(),
  inputMicroUsdPerMillion: bigint('input_micro_usd_per_million', { mode: 'number', unsigned: true }).notNull(),
  outputMicroUsdPerMillion: bigint('output_micro_usd_per_million', { mode: 'number', unsigned: true }).notNull(),
  flatMicroUsd: bigint('flat_micro_usd', { mode: 'number', unsigned: true }).default(0).notNull(),
  maxInputTokens: int('max_input_tokens', { unsigned: true }).notNull(),
  enabled: tinyint().default(1).notNull(),
}, table => [primaryKey({ columns: [table.provider, table.model] })]);
// Application-append-only audit, retained even when an administrator is deleted.
export const aiPriceCardRevisions = mysqlTable('ai_price_card_revisions', {
  id: int().autoincrement().primaryKey(),
  provider: varchar({ length: 40 }).notNull(), model: varchar({ length: 128 }).notNull(), version: varchar({ length: 80 }).notNull(),
  origin: mysqlEnum(['legacy', 'admin']).notNull(), actorId: int('actor_id'), reference: varchar({ length: 240 }),
  requestId: char('request_id', { length: 36 }), requestDigest: char('request_digest', { length: 64 }),
  snapshot: json().notNull(), snapshotDigest: char('snapshot_digest', { length: 64 }).notNull(),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
}, table => [
  uniqueIndex('uq_ai_price_revision').on(table.provider, table.model, table.version),
  uniqueIndex('uq_ai_price_request').on(table.requestId), index('idx_ai_price_history').on(table.provider, table.model, table.id),
  check('chk_ai_price_revision_origin', sql`(${table.origin}='legacy' AND ${table.actorId} IS NULL AND ${table.reference} IS NULL AND ${table.requestId} IS NULL AND ${table.requestDigest} IS NULL) OR (${table.origin}='admin' AND ${table.actorId}>0 AND ${table.actorId} IS NOT NULL AND ${table.reference} IS NOT NULL AND ${table.requestId} IS NOT NULL AND ${table.requestDigest} IS NOT NULL)`),
]);
export const aiBudgetPeriods = mysqlTable('ai_budget_periods', {
  scopeKey: varchar('scope_key', { length: 160 }).notNull(),
  periodStart: date('period_start', { mode: 'string' }).notNull(),
  policyVersion: varchar('policy_version', { length: 80 }).notNull(),
  limitMicroUsd: bigint('limit_micro_usd', { mode: 'number', unsigned: true }).notNull(),
  reservedMicroUsd: bigint('reserved_micro_usd', { mode: 'number', unsigned: true }).default(0).notNull(),
  spentMicroUsd: bigint('spent_micro_usd', { mode: 'number', unsigned: true }).default(0).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, table => [primaryKey({ columns: [table.scopeKey, table.periodStart] })]);
// Global daily threshold notifications survive settlement, restarts and audit retention.
export const aiBudgetAlerts = mysqlTable('ai_budget_alerts', {
  periodStart: date('period_start', { mode: 'string' }).notNull(),
  thresholdPercent: tinyint('threshold_percent', { unsigned: true }).notNull(),
  limitMicroUsd: bigint('limit_micro_usd', { mode: 'number', unsigned: true }).notNull(),
  spentMicroUsd: bigint('spent_micro_usd', { mode: 'number', unsigned: true }).notNull(),
  reservedMicroUsd: bigint('reserved_micro_usd', { mode: 'number', unsigned: true }).notNull(),
  observedAt: datetime('observed_at', { mode: 'string', fsp: 3 }).notNull(),
}, table => [primaryKey({ columns: [table.periodStart, table.thresholdPercent] }),
  check('chk_ai_budget_alert_threshold', sql`${table.thresholdPercent} IN (70,90)`),
  check('chk_ai_budget_alert_limit', sql`${table.limitMicroUsd}>0`),
]);
export const aiUsageReservations = mysqlTable('ai_usage_reservations', {
  usagePromptTokens:bigint('usage_prompt_tokens',{mode:'number',unsigned:true}),
  usageCompletionTokens:bigint('usage_completion_tokens',{mode:'number',unsigned:true}),
  usageReceivedAt:datetime('usage_received_at',{mode:'string',fsp:3}),
  settlementToken:char('settlement_token',{length:36}),settlementLeaseUntil:datetime('settlement_lease_until',{mode:'string',fsp:3}),
  settlementNextAt:datetime('settlement_next_at',{mode:'string',fsp:3}),settlementAttempts:int('settlement_attempts',{unsigned:true}).notNull().default(0),
  settlementLastError:varchar('settlement_last_error',{length:40}),
  requestId: varchar('request_id', { length: 160 }).notNull(),
  reconciliationReference: varchar('reconciliation_reference', { length: 160 }),
  reconciledBy: int('reconciled_by'),
  reservationKey: char('reservation_key', { length: 64 }).primaryKey(),
  scopeKey: varchar('scope_key', { length: 160 }).notNull(),
  periodStart: date('period_start', { mode: 'string' }).notNull(),
  fingerprint: char({ length: 64 }).notNull(),
  provider: varchar({ length: 40 }).notNull(),
  model: varchar({ length: 128 }).notNull(),
  taskType: varchar('task_type', { length: 96 }).notNull(),
  priceVersion: varchar('price_version', { length: 80 }).notNull(),
  inputRate: bigint('input_rate', { mode: 'number', unsigned: true }).notNull(),
  outputRate: bigint('output_rate', { mode: 'number', unsigned: true }).notNull(),
  flatMicroUsd: bigint('flat_micro_usd', { mode: 'number', unsigned: true }).default(0).notNull(),
  reservedMicroUsd: bigint('reserved_micro_usd', { mode: 'number', unsigned: true }).notNull(),
  settledMicroUsd: bigint('settled_micro_usd', { mode: 'number', unsigned: true }),
  state: mysqlEnum(['reserved', 'settled', 'released', 'unknown']).default('reserved').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, table => [
  index('idx_ai_reservation_scope_state').on(table.scopeKey, table.state, table.createdAt),
  index('idx_ai_settlement_due').on(table.state,table.settlementNextAt,table.reservationKey),
  check('chk_ai_usage_receipt',sql`(${table.usagePromptTokens} IS NULL AND ${table.usageCompletionTokens} IS NULL AND ${table.usageReceivedAt} IS NULL) OR (${table.usagePromptTokens} IS NOT NULL AND ${table.usageCompletionTokens} IS NOT NULL AND ${table.usageReceivedAt} IS NOT NULL AND ${table.usagePromptTokens}<=9007199254740991 AND ${table.usageCompletionTokens}<=9007199254740991)`),
  foreignKey({ name: 'fk_ai_reservation_period', columns: [table.scopeKey, table.periodStart], foreignColumns: [aiBudgetPeriods.scopeKey, aiBudgetPeriods.periodStart] }),
]);

export const abTestResults = mysqlTable("ab_test_results", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	testName: varchar("test_name", { length: 255 }).notNull(),
	keyword: varchar({ length: 255 }).notNull(),
	variantAId: int("variant_a_id").references(() => quickResponses.id, { onDelete: "cascade" }),
	variantAText: text("variant_a_text").notNull(),
	variantAUsageCount: int("variant_a_usage_count").default(0).notNull(),
	variantASuccessCount: int("variant_a_success_count").default(0).notNull(),
	variantBId: int("variant_b_id").references(() => quickResponses.id, { onDelete: "cascade" }),
	variantBText: text("variant_b_text").notNull(),
	variantBUsageCount: int("variant_b_usage_count").default(0).notNull(),
	variantBSuccessCount: int("variant_b_success_count").default(0).notNull(),
	status: mysqlEnum(['running', 'completed', 'paused']).default('running').notNull(),
	winner: mysqlEnum(['variant_a', 'variant_b', 'no_winner']),
	confidenceLevel: int("confidence_level").default(0).notNull(),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const abandonedCarts = mysqlTable("abandoned_carts", {
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar({ length: 50 }).notNull(),
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

export const abandonedCartReminders = mysqlTable('abandoned_cart_reminders', {
 id:int().autoincrement().primaryKey(), operationKey:char('operation_key',{length:36}).notNull(),
 merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}), actorId:int('actor_id').notNull(), cartId:int('cart_id').notNull().references(()=>abandonedCarts.id,{onDelete:'cascade'}),
 requestDigest:char('request_digest',{length:64}).notNull(),reviewRevision:char('review_revision',{length:64}).notNull(),cartRevision:char('cart_revision',{length:64}).notNull(),channelId:int('channel_id').notNull(),channelRevision:char('channel_revision',{length:64}).notNull(),
 discountId:int('discount_id'),discountRevision:char('discount_revision',{length:64}),locale:mysqlEnum(['ar','en']).notNull(),toPhone:varchar('to_phone',{length:16}).notNull(),messageText:text('message_text').notNull(),
 state:mysqlEnum(['reserved','dispatching','accepted','rejected','unknown','suppressed']).default('reserved').notNull(),quotaSubscriptionId:int('quota_subscription_id'),quotaPeriodStart:datetime('quota_period_start',{mode:'string',fsp:3}),quotaReserved:tinyint('quota_reserved').default(0).notNull(),expiresAt:datetime('expires_at',{mode:'string',fsp:3}).notNull(),
 createdAt:timestamp('created_at',{mode:'string',fsp:3}).defaultNow().notNull(),updatedAt:timestamp('updated_at',{mode:'string',fsp:3}).defaultNow().onUpdateNow().notNull(),
},table=>[uniqueIndex('uq_cart_reminder_operation').on(table.merchantId,table.operationKey),index('idx_cart_reminder_history').on(table.merchantId,table.cartId,table.id),check('chk_cart_reminder_quota',sql`(${table.quotaReserved}=0 AND ${table.quotaSubscriptionId} IS NULL AND ${table.quotaPeriodStart} IS NULL) OR (${table.quotaReserved}=1 AND ${table.quotaSubscriptionId} IS NOT NULL AND ${table.quotaPeriodStart} IS NOT NULL)`),check('chk_cart_reminder_discount',sql`(${table.discountId} IS NULL AND ${table.discountRevision} IS NULL) OR (${table.discountId} IS NOT NULL AND ${table.discountRevision} IS NOT NULL)`)]);

export const analytics = mysqlTable("analytics", {
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	date: timestamp({ mode: 'string' }).notNull(),
	conversationsCount: int().default(0).notNull(),
	messagesCount: int().default(0).notNull(),
	voiceMessagesCount: int().default(0).notNull(),
	campaignsSent: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const automationRules = mysqlTable("automation_rules", {
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	type: mysqlEnum(['abandoned_cart', 'review_request', 'order_tracking', 'gift_notification', 'holiday_greeting', 'winback']).notNull(),
	isEnabled: tinyint().default(1).notNull(),
	settings: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const botSettings = mysqlTable("bot_settings", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	autoReplyEnabled: tinyint("auto_reply_enabled").default(1).notNull(),
	workingHoursEnabled: tinyint("working_hours_enabled").default(0).notNull(),
	workingHoursStart: varchar("working_hours_start", { length: 5 }).default('09:00'),
	workingHoursEnd: varchar("working_hours_end", { length: 5 }).default('18:00'),
	workingDays: varchar("working_days", { length: 50 }).default('1,2,3,4,5'),
	welcomeMessage: text("welcome_message"),
	outOfHoursMessage: text("out_of_hours_message"),
	responseDelay: int("response_delay").default(2),
	maxResponseLength: int("max_response_length").default(200),
	tone: mysqlEnum(['friendly', 'professional', 'casual']).default('friendly').notNull(),
	language: mysqlEnum(['ar', 'en', 'fr', 'tr', 'es', 'it', 'both']).default('ar').notNull(),
	// Human Takeover settings
	takeoverTimeoutMinutes: int("takeover_timeout_minutes").default(15),
	takeoverResumeMessage: text("takeover_resume_message"),
	takeoverCommandsEnabled: tinyint("takeover_commands_enabled").default(1).notNull(),
	// Group settings
	groupMode: mysqlEnum("group_mode", ['disabled', 'mention_only', 'keyword_only', 'private_redirect']).default('disabled').notNull(),
	groupKeywords: text("group_keywords"),
	groupRedirectMessage: text("group_redirect_message"),
	// Auto-Discount authority — explicit customer request and reviewed merchant limits.
	autoDiscountEnabled: tinyint("auto_discount_enabled").default(0).notNull(),
	autoDiscountMaxPercent: int("auto_discount_max_percent").default(15),
	autoDiscountExpireHours: int("auto_discount_expire_hours").default(48),
	autoDiscountRevision: int("auto_discount_revision").default(0).notNull(),
	// Custom Instructions — free-form merchant instructions injected directly into AI prompt
	// Used for campaigns, special rules, sales scripts, etc.
	customInstructions: text("custom_instructions"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		index("bot_settings_merchant_id_unique").on(table.merchantId),
	]);

export const campaignLogs = mysqlTable("campaignLogs", {
	id: int().autoincrement().primaryKey(),
	campaignId: int().notNull(),
	campaignOutboxId: int("campaign_outbox_id").references(() => campaignDeliveryOutbox.id, { onDelete: "set null" }),
	customerId: int(),
	customerPhone: varchar({ length: 50 }).notNull(),
	customerName: varchar({ length: 255 }),
	status: mysqlEnum(['success', 'failed', 'pending']).default('pending').notNull(),
	errorMessage: text(),
	sentAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, table => [
	uniqueIndex("campaign_logs_outbox_unique").on(table.campaignOutboxId),
]);

export const campaigns = mysqlTable("campaigns", {
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	name: varchar({ length: 255 }).notNull(),
	message: text().notNull(),
	imageUrl: varchar({ length: 500 }),
	targetAudience: text(),
	status: mysqlEnum(['draft', 'scheduled', 'sending', 'completed', 'failed']).default('draft').notNull(),
	scheduledAt: timestamp({ mode: 'string' }),
	sentCount: int().default(0).notNull(),
	totalRecipients: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

// Durable recipient-level campaign dispatch. Message content and customer names
// remain on their canonical records; the outbox stores only the routing identity
// required for recovery and idempotent delivery.
export const campaignDeliveryOutbox = mysqlTable("campaign_delivery_outbox", {
	id: int().autoincrement().primaryKey(),
	campaignId: int("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerId: int("customer_id").references(() => conversations.id, { onDelete: "set null" }),
	customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
	status: mysqlEnum(['pending', 'processing', 'sent', 'failed', 'suppressed', 'manual_review']).default('pending').notNull(),
	attempts: int().default(0).notNull(),
	processingToken: varchar("processing_token", { length: 64 }),
	quotaSubscriptionId: int("quota_subscription_id"),
	quotaReserved: tinyint("quota_reserved").default(0).notNull(),
	quotaPeriodStart: datetime("quota_period_start", { mode: 'string', fsp: 3 }),
	availableAt: timestamp("available_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	claimedAt: timestamp("claimed_at", { mode: 'string', fsp: 3 }),
	sentAt: timestamp("sent_at", { mode: 'string', fsp: 3 }),
	lastError: varchar("last_error", { length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', fsp: 3 }).defaultNow().onUpdateNow().notNull(),
}, table => [
	uniqueIndex("campaign_delivery_outbox_campaign_phone_unique").on(table.campaignId, table.customerPhone),
	index("campaign_delivery_outbox_dispatch_idx").on(table.status, table.availableAt, table.id),
	index("campaign_delivery_outbox_campaign_status_idx").on(table.campaignId, table.status),
	index("campaign_delivery_outbox_merchant_created_idx").on(table.merchantId, table.createdAt),
	check("campaign_delivery_outbox_attempts_check", sql`${table.attempts} >= 0 AND ${table.attempts} <= 8`),
	check("campaign_delivery_outbox_quota_period_check", sql`${table.quotaReserved} = 1 OR ${table.quotaPeriodStart} IS NULL`),
	check("campaign_delivery_outbox_quota_check", sql`${table.quotaReserved} IN (0, 1) AND (${table.quotaReserved} = 0 OR ${table.quotaSubscriptionId} IS NOT NULL)`),
	check("campaign_delivery_outbox_processing_check", sql`(${table.status} = 'processing' AND ${table.processingToken} IS NOT NULL AND ${table.claimedAt} IS NOT NULL) OR (${table.status} <> 'processing' AND ${table.processingToken} IS NULL)`),
]);

// Database-coordinated provider admission across processes and server replicas.
export const campaignDispatchRateLimits = mysqlTable("campaign_dispatch_rate_limits", {
	merchantId: int("merchant_id").primaryKey().references(() => merchants.id, { onDelete: "cascade" }),
	windowStartedAt: timestamp("window_started_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	reservedCount: int("reserved_count").default(0).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', fsp: 3 }).defaultNow().onUpdateNow().notNull(),
}, table => [
	check("campaign_dispatch_rate_limits_count_check", sql`${table.reservedCount} >= 0 AND ${table.reservedCount} <= 10`),
]);

export const conversations = mysqlTable("conversations", {
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar({ length: 50 }).notNull(), // Was 20 — widened for group IDs like 'group_120363422829080314'
	customerName: varchar({ length: 255 }),
	status: mysqlEnum(['active', 'closed', 'archived']).default('active').notNull(),
	lastMessage: text(),
	lastMessageAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastActivityAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	purchaseCount: int().default(0).notNull(),
	totalSpent: int().default(0).notNull(),
	// Human Takeover fields
	humanTakeover: tinyint("human_takeover").default(0).notNull(),
	humanTakeoverAt: timestamp("human_takeover_at", { mode: 'string' }),
	humanExpiresAt: timestamp("human_expires_at", { mode: 'string' }),
	handoffVersion: int('handoff_version').default(0).notNull(),
	automationAfterMessageId: int('automation_after_message_id').default(0).notNull(),
	// Virtual Agent fields
	currentAgentId: int("current_agent_id"),
	agentHistory: text("agent_history"),
	// Sales Pipeline — persistent deal stage
	dealStage: varchar("deal_stage", { length: 30 }).default('new'),
	// P0: Loss tracking columns (match loss-detector.ts)
	lossReason: varchar("loss_reason", { length: 30 }),
	stalledSince: timestamp("stalled_since", { mode: 'string' }),
	paymentLinkSentAt: timestamp("payment_link_sent_at", { mode: 'string' }),
	supervisorIntervenedAt: timestamp("supervisor_intervened_at", { mode: 'string' }),
	supervisorReason: varchar("supervisor_reason", { length: 50 }),
});

export const customerReviews = mysqlTable("customer_reviews", {
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	orderId: int().notNull().references(() => orders.id, { onDelete: "cascade" }),
	customerPhone: varchar({ length: 50 }).notNull(),
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
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	code: varchar({ length: 50 }).notNull(),
	type: mysqlEnum(['percentage', 'fixed']).notNull(),
	value: int().notNull(),
	minOrderAmount: int().default(0),
	maxUses: int(),
	usedCount: int().default(0).notNull(),
	expiresAt: timestamp({ mode: 'string' }),
	isActive: tinyint().default(1).notNull(),
	isAutoGenerated: tinyint("is_auto_generated").default(0).notNull(),
	customerPhone: varchar("customer_phone", { length: 50 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		uniqueIndex("uq_discount_codes_merchant_code").on(table.merchantId, table.code),
	]);

export const invoices = mysqlTable("invoices", {
	id: int().autoincrement().primaryKey(),
	invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
	paymentId: int("payment_id").notNull(),
	merchantId: int("merchant_id").notNull(),
	subscriptionId: int("subscription_id"),
	amount: int().notNull(),
	currency: varchar({ length: 10 }).default('SAR').notNull(),
	status: mysqlEnum(['draft', 'sent', 'paid', 'cancelled']).default('paid').notNull(),
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
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	keyword: varchar({ length: 255 }).notNull(),
	category: mysqlEnum(['product', 'price', 'shipping', 'complaint', 'question', 'other']).notNull(),
	frequency: int().default(1).notNull(),
	sampleMessages: text("sample_messages"),
	suggestedResponse: text("suggested_response"),
	status: mysqlEnum(['new', 'reviewed', 'response_created', 'ignored']).default('new').notNull(),
	firstSeenAt: timestamp("first_seen_at", { mode: 'string' }).defaultNow().notNull(),
	lastSeenAt: timestamp("last_seen_at", { mode: 'string' }).defaultNow().notNull(),
	reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const limitedTimeOffers = mysqlTable("limited_time_offers", {
	id: int().autoincrement().primaryKey(),
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

export const merchantKnowledgeDocs = mysqlTable("merchant_knowledge_docs", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	fileType: mysqlEnum("file_type", ['pdf', 'docx', 'xlsx', 'text']).notNull(),
	fileUrl: text("file_url"),
	fileSize: int("file_size").notNull(),
	extractedText: mediumtext("extracted_text"),
	intakeRequestId: varchar('intake_request_id', { length: 36 }),
	extractionStatus: mysqlEnum("extraction_status", ['pending', 'processing', 'completed', 'failed']).default('pending').notNull(),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	index("idx_merchant_knowledge").on(table.merchantId),
	uniqueIndex('uq_knowledge_doc_intake').on(table.merchantId, table.intakeRequestId),
]);

export type MerchantKnowledgeDoc = InferSelectModel<typeof merchantKnowledgeDocs>;
export type InsertMerchantKnowledgeDoc = InferInsertModel<typeof merchantKnowledgeDocs>;

// Deliberately no section FK: the creation receipt must survive section deletion/reset.
export const knowledgeSectionCreations = mysqlTable('knowledge_section_creations', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  requestId: varchar('request_id', { length: 36 }).notNull(),
  inputHash: varchar('input_hash', { length: 64 }).notNull(),
  sectionId: int('section_id').notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
}, table => [uniqueIndex('uq_section_creation_request').on(table.merchantId, table.requestId)]);

// Page/section IDs intentionally have no FK: receipts survive deletion and never recreate records.
export const knowledgePagePreviews = mysqlTable('knowledge_page_previews', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  previewId: varchar('preview_id', { length: 36 }).notNull(),
  url: varchar({ length: 1000 }).notNull(),
  title: varchar({ length: 500 }).notNull(),
  content: text(),
  analysis: json().$type<import('../shared/knowledge-page-intake').PageClassification>(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  pageId: int('page_id'),
  sectionId: int('section_id'),
  expiresAt: datetime('expires_at', { mode: 'string', fsp: 3 }).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
}, table => [uniqueIndex('uq_page_preview').on(table.merchantId, table.previewId), index('idx_page_preview_expiry').on(table.merchantId, table.expiresAt)]);

export const knowledgeIntakeReceipts = mysqlTable('knowledge_intake_receipts', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  requestId: varchar('request_id', { length: 36 }).notNull(),
  inputHash: char('input_hash', { length: 64 }).notNull(),
  reviewId: varchar('review_id', { length: 36 }),
  reviewSnapshot: json('review_snapshot').$type<import('../shared/knowledge-intake').KnowledgeSavedReview>(),
  sectionLinks: json('section_links').$type<import('../shared/knowledge-section-links').KnowledgeSectionLinks>(),
  documentResult: json('document_result').$type<import('../shared/knowledge-document').KnowledgeDocumentResult>(),
  sourceDocumentId: int('source_document_id').references(() => merchantKnowledgeDocs.id, { onDelete: 'set null' }),
  executionToken: char('execution_token', { length: 36 }),
  leaseExpiresAt: timestamp('lease_expires_at', { mode: 'string' }),
  recoveredAt: timestamp('recovered_at', { mode: 'string' }),
  documentId: int('document_id').references(() => merchantKnowledgeDocs.id, { onDelete: 'set null' }),
  contentType: mysqlEnum('content_type', ['document', 'products', 'custom']).notNull(),
  state: mysqlEnum('state', ['processing', 'completed', 'empty', 'uncertain']).notNull(),
  outcome: json('outcome').$type<import('../shared/knowledge-intake').KnowledgeOutcome>(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex('uq_knowledge_intake_request').on(table.merchantId, table.requestId), index('idx_knowledge_intake_state').on(table.merchantId, table.state), index('idx_intake_source_document').on(table.merchantId, table.sourceDocumentId)]);

export const knowledgeIntakeReviews = mysqlTable('knowledge_intake_reviews', {
  reviewId: varchar('review_id', { length: 36 }).primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  inputHash: char('input_hash', { length: 64 }).notNull(),
  basisHash: char('basis_hash', { length: 64 }),
  plan: json('plan').$type<import('../shared/knowledge-plan').KnowledgePlan>(),
  analysis: json('analysis').$type<import('../shared/knowledge-intake').KnowledgeAnalysis>().notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { mode: 'string' }).notNull(),
}, table => [index('idx_knowledge_review_merchant').on(table.merchantId, table.expiresAt)]);

export const merchants = mysqlTable("merchants", {
	id: int().autoincrement().primaryKey(),
	userId: int().notNull().references(() => users.id, { onDelete: "cascade" }),
	businessName: varchar({ length: 255 }).notNull(),
	phone: varchar({ length: 20 }),
	status: mysqlEnum(['active', 'suspended', 'pending']).default('pending').notNull(),
	subscriptionId: int(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	autoReplyEnabled: tinyint().default(1).notNull(),
	onboardingCompleted: tinyint().default(0).notNull(),
	onboardingStep: int().default(0).notNull(),
	onboardingCompletedAt: timestamp({ mode: 'string' }),
	currency: mysqlEnum(['SAR', 'USD']).default('SAR').notNull(),
	timezone: varchar({ length: 50 }).default('Asia/Riyadh').notNull(),
	// Setup Wizard fields
	businessType: mysqlEnum(['store', 'services', 'both']),
	setupCompleted: tinyint().default(0).notNull(),
	setupCompletedAt: timestamp({ mode: 'string' }),
	address: varchar({ length: 500 }),
	description: text(),
	workingHoursType: mysqlEnum(['24_7', 'weekdays', 'custom']).default('weekdays'),
	workingHours: text(), // JSON: {"saturday": {"start": "09:00", "end": "18:00"}}
	// Smart Website Analysis fields
	websiteUrl: varchar("website_url", { length: 500 }),
	platformType: mysqlEnum("platform_type", ['salla', 'zid', 'shopify', 'woocommerce', 'byaan', 'custom', 'unknown']),
	lastAnalysisDate: timestamp("last_analysis_date", { mode: 'string' }),
	analysisStatus: mysqlEnum("analysis_status", ['pending', 'analyzing', 'completed', 'failed']).default('pending'),
	// Subscription fields
	currentSubscriptionId: int("current_subscription_id"),
	subscriptionStatus: mysqlEnum("subscription_status", ['none', 'trial', 'active', 'expired']).default('none'),
	trialStartedAt: timestamp("trial_started_at", { mode: 'string' }),
	trialEndsAt: timestamp("trial_ends_at", { mode: 'string' }),
	maxCustomersAllowed: int("max_customers_allowed").default(0),
	currentCustomersCount: int("current_customers_count").default(0),
	// Smart Escalation — merchant's personal phone for urgent alerts
	emergencyPhone: varchar("emergency_phone", { length: 20 }),
	// Cascading Escalation Chain — JSON array: [{phone, label, order}]
	escalationPhones: text("escalation_phones"),
	integrationSource: varchar("integration_source", { length: 20 }).default('none'),
	// Opaque HMACs make platform provisioning exactly-once without storing the
	// caller's idempotency key or registration payload in recoverable form.
	provisionIdempotencyHash: varchar("provision_idempotency_hash", { length: 64 }),
	provisionPayloadHash: varchar("provision_payload_hash", { length: 64 }),
	// Merchant Logo for PDF branding
	logoUrl: varchar("logo_url", { length: 500 }),
}, table => [
	uniqueIndex("merchants_platform_provision_unique").on(
		table.integrationSource,
		table.provisionIdempotencyHash,
	),
]);

export const messages = mysqlTable("messages", {
	id: int().autoincrement().primaryKey(),
	conversationId: int().notNull().references(() => conversations.id, { onDelete: "cascade" }),
	direction: mysqlEnum(['incoming', 'outgoing']).notNull(),
	senderType: mysqlEnum('sender_type', ['customer', 'assistant', 'merchant', 'unknown']).default('unknown').notNull(),
	messageType: mysqlEnum(['text', 'voice', 'image', 'document']).default('text').notNull(),
	content: text().notNull(),
	voiceUrl: varchar({ length: 500 }),
	imageUrl: varchar({ length: 500 }),
	mediaUrl: varchar({ length: 500 }),
	isProcessed: tinyint().default(0).notNull(),
	aiResponse: text(),
	externalId: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
	(table) => [
		uniqueIndex("idx_messages_external_id").on(table.externalId),
	]);

export const notificationTemplates = mysqlTable("notification_templates", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	status: varchar({ length: 50 }).notNull(),
	template: text().notNull(),
	enabled: tinyint().default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, table => [
	uniqueIndex("uq_notification_template_merchant_status").on(table.merchantId, table.status),
]);

export const notifications = mysqlTable("notifications", {
	id: int().autoincrement().primaryKey(),
	userId: int().notNull().references(() => users.id, { onDelete: "cascade" }),
	type: mysqlEnum(['info', 'success', 'warning', 'error']).default('info').notNull(),
	title: varchar({ length: 255 }).notNull(),
	message: text().notNull(),
	link: varchar({ length: 500 }),
	isRead: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const occasionCampaigns = mysqlTable("occasion_campaigns", {
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	campaignId: int("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
	occasionType: mysqlEnum(['ramadan', 'eid_fitr', 'eid_adha', 'national_day', 'new_year', 'hijri_new_year']).notNull(),
	year: int().notNull(),
	enabled: tinyint().default(1).notNull(),
	discountCode: varchar({ length: 50 }),
	discountPercentage: int().default(15).notNull(),
	messageTemplate: text(),
	sentAt: timestamp({ mode: 'string' }),
	recipientCount: int().default(0).notNull(),
	status: mysqlEnum(['pending', 'sending', 'completed', 'failed']).default('pending').notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, table => [
	uniqueIndex("occasion_campaigns_merchant_type_year_unique").on(table.merchantId, table.occasionType, table.year),
	uniqueIndex("occasion_campaigns_campaign_unique").on(table.campaignId),
	index("occasion_campaigns_dispatch_idx").on(table.status, table.enabled, table.occasionType, table.year, table.id),
	check("occasion_campaigns_enabled_check", sql`${table.enabled} IN (0, 1)`),
	check("occasion_campaigns_discount_check", sql`${table.discountPercentage} >= 5 AND ${table.discountPercentage} <= 50`),
]);

// Approved activation snapshots; no owner is inferred for legacy enabled rows.
export const occasionAuthorizations=mysqlTable('occasion_authorizations',{
 id:int().autoincrement().primaryKey(),grantKey:char('grant_key',{length:36}).notNull(),
 occasionId:int('occasion_id').notNull().references(()=>occasionCampaigns.id,{onDelete:'cascade'}),
 merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),actorId:int('actor_id').notNull(),
 active:tinyint().default(1),reviewRevision:char('review_revision',{length:64}).notNull(),contractDigest:char('contract_digest',{length:64}).notNull(),reviewedContract:json('reviewed_contract').notNull(),
 preparedCampaignId:int('prepared_campaign_id'),preparedCampaignDigest:char('prepared_campaign_digest',{length:64}),preparedDiscountId:int('prepared_discount_id'),preparedDiscountDigest:char('prepared_discount_digest',{length:64}),
 createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),revokedAt:datetime('revoked_at',{mode:'string',fsp:3}),
},table=>[
 uniqueIndex('uq_occasion_grant_key').on(table.grantKey),uniqueIndex('uq_occasion_active_grant').on(table.occasionId,table.active),index('idx_occasion_grant_history').on(table.merchantId,table.occasionId,table.id),
 check('chk_occasion_grant_active',sql`(${table.active} IS NOT NULL AND ${table.active}=1 AND ${table.revokedAt} IS NULL) OR (${table.active} IS NULL AND ${table.revokedAt} IS NOT NULL)`),
 check('chk_occasion_grant_prepared',sql`(${table.preparedCampaignId} IS NULL AND ${table.preparedCampaignDigest} IS NULL AND ${table.preparedDiscountId} IS NULL AND ${table.preparedDiscountDigest} IS NULL) OR (${table.preparedCampaignId} IS NOT NULL AND ${table.preparedCampaignDigest} IS NOT NULL AND ${table.preparedDiscountId} IS NOT NULL AND ${table.preparedDiscountDigest} IS NOT NULL)`),
]);

export const orderNotifications = mysqlTable("order_notifications", {
	id: int().autoincrement().primaryKey(),
	orderId: int("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	eventKey: varchar("event_key", { length: 64 }),
	customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
	status: varchar({ length: 50 }).notNull(),
	message: text().notNull(),
	sent: tinyint().default(0),
	sentAt: timestamp("sent_at", { mode: 'string' }),
	error: text(),
	deliveryStatus: mysqlEnum("delivery_status", ['pending', 'processing', 'sent', 'failed', 'manual_review', 'suppressed']).default('pending').notNull(),
	attempts: int().default(0).notNull(),
	availableAt: timestamp("available_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	claimedAt: timestamp("claimed_at", { mode: 'string', fsp: 3 }),
	claimToken: char('claim_token', { length: 36 }),
	reviewedAt: timestamp("reviewed_at", { mode: 'string', fsp: 3 }),
	reviewedByUserId: int("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string', fsp: 3 }).defaultNow().onUpdateNow().notNull(),
}, table => [
	uniqueIndex("uq_order_notification_event").on(table.merchantId, table.eventKey),
	index("idx_order_notification_dispatch").on(table.deliveryStatus, table.availableAt, table.id),
	index("idx_order_notification_merchant_health").on(table.merchantId, table.deliveryStatus, table.createdAt, table.id),
]);

export const orderTrackingLogs = mysqlTable("order_tracking_logs", {
	id: int().autoincrement().primaryKey(),
	orderId: int().notNull().references(() => orders.id, { onDelete: "cascade" }),
	oldStatus: varchar({ length: 50 }).notNull(),
	newStatus: varchar({ length: 50 }).notNull(),
	trackingNumber: varchar({ length: 255 }),
	notificationSent: tinyint().default(0).notNull(),
	notificationMessage: text(),
	errorMessage: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const orders = mysqlTable("orders", {
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	sallaOrderId: varchar({ length: 100 }),
	orderNumber: varchar({ length: 100 }),
	customerPhone: varchar({ length: 50 }).notNull(),
	customerName: varchar({ length: 255 }).notNull(),
	customerEmail: varchar({ length: 255 }),
	address: text(),
	city: varchar({ length: 100 }),
	items: text().notNull(),
	totalAmount: int().notNull(),
	currency: mysqlEnum(['SAR', 'USD']).default('SAR').notNull(),
	discountCode: varchar({ length: 50 }),
	status: mysqlEnum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']).default('pending').notNull(),
	paymentStatus: mysqlEnum("payment_status", ['unpaid', 'paid', 'refunded']).default('unpaid').notNull(),
	paymentUrl: text(),
	trackingNumber: varchar({ length: 100 }),
	notes: text(),
	checkoutReviewRequired: tinyint('checkout_review_required').default(0).notNull(),
	checkoutSubtotalMinor: int('checkout_subtotal_minor'),
	checkoutDiscountMinor: int('checkout_discount_minor'),
	checkoutDiscountReleased: tinyint('checkout_discount_released').notNull().default(0),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	isGift: tinyint().default(0).notNull(),
	giftRecipientName: varchar({ length: 255 }),
	giftMessage: text(),
	reviewRequested: tinyint().default(0).notNull(),
	reviewRequestedAt: timestamp({ mode: 'string' }),
}, (table) => [
	uniqueIndex("orders_merchant_external_unique").on(table.merchantId, table.sallaOrderId),
]);

export const passwordResetAttempts = mysqlTable("password_reset_attempts", {
	id: int().autoincrement().primaryKey(),
	email: varchar({ length: 320 }).notNull(),
	attemptedAt: timestamp("attempted_at", { mode: 'string' }).defaultNow().notNull(),
	ipAddress: varchar("ip_address", { length: 45 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const passwordResetTokens = mysqlTable("password_reset_tokens", {
	id: int().autoincrement().primaryKey(),
	userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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

export const payments = mysqlTable("payments", {
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	subscriptionId: int().notNull(),
	amount: int().notNull(),
	currency: varchar({ length: 3 }).default('SAR').notNull(),
	paymentMethod: mysqlEnum(['tap', 'paypal', 'link']).notNull(),
	transactionId: varchar({ length: 255 }),
	status: mysqlEnum(['pending', 'completed', 'failed', 'refunded']).default('pending').notNull(),
	paidAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const planChangeLogs = mysqlTable("planChangeLogs", {
	id: int().autoincrement().primaryKey(),
	planId: int().notNull(),
	changedBy: int().notNull(),
	fieldName: varchar({ length: 100 }).notNull(),
	oldValue: text(),
	newValue: text().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const plans = mysqlTable("plans", {
	id: int().autoincrement().primaryKey(),
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
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	name: varchar({ length: 255 }).notNull(),
	nameAr: varchar({ length: 255 }),
	description: text(),
	descriptionAr: text(),
	price: int().notNull(),
	priceUnit: mysqlEnum("price_unit", ['unverified', 'minor']).default('unverified').notNull(),
	currency: mysqlEnum(['SAR', 'USD']).default('SAR').notNull(),
	imageUrl: varchar({ length: 500 }),
	productUrl: varchar({ length: 500 }),
	category: varchar({ length: 100 }),
	categoryId: int("category_id"),
	isActive: tinyint().default(1).notNull(),
	stock: int().default(0),
	// Advanced fields
	sku: varchar({ length: 100 }),
	barcode: varchar({ length: 100 }),
	compareAtPrice: int("compare_at_price"),
	costPrice: int("cost_price"),
	weight: varchar({ length: 20 }),
	trackInventory: tinyint("track_inventory").default(1).notNull(),
	lowStockAlert: int("low_stock_alert").default(5),
	images: text(),
	tags: text(),
	productType: mysqlEnum("product_type", ['physical', 'digital', 'service']).default('physical'),
	status: mysqlEnum(['active', 'draft', 'archived']).default('active').notNull(),
	hasVariants: tinyint("has_variants").default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	sallaProductId: varchar({ length: 100 }),
	lastSyncedAt: timestamp({ mode: 'string', fsp: 3 }),
	// Course-specific fields (Byaan integration)
	courseStartDate: timestamp("course_start_date", { mode: 'string' }),
	courseEndDate: timestamp("course_end_date", { mode: 'string' }),
	maxStudents: int("max_students"),
	enrolledCount: int("enrolled_count").default(0),
	registrationOpen: tinyint("registration_open").default(1),
}, (table) => [
	uniqueIndex("products_merchant_external_unique").on(table.merchantId, table.sallaProductId),
]);

export const productCategories = mysqlTable("product_categories", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	name: varchar({ length: 100 }).notNull(),
	nameEn: varchar("name_en", { length: 100 }),
	parentId: int("parent_id"),
	sortOrder: int("sort_order").default(0).notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const productCategoryReceipts = mysqlTable("product_category_receipts", {
	id:int().autoincrement().primaryKey(),
	merchantId:int("merchant_id").notNull().references(()=>merchants.id,{onDelete:"cascade"}),
	actorId:int("actor_id").notNull(),requestId:char("request_id",{length:36}).notNull(),
	inputHash:char("input_hash",{length:64}).notNull(),result:json().notNull(),
	createdAt:timestamp("created_at",{mode:"string",fsp:3}).defaultNow().notNull(),
},table=>[uniqueIndex("uq_product_category_request").on(table.merchantId,table.requestId)]);

export const productDetailReceipts = mysqlTable("product_detail_receipts", {
	id:int().autoincrement().primaryKey(),
	merchantId:int("merchant_id").notNull().references(()=>merchants.id,{onDelete:"cascade"}),
	actorId:int("actor_id").notNull(),productId:int("product_id").notNull(),requestId:char("request_id",{length:36}).notNull(),
	inputHash:char("input_hash",{length:64}).notNull(),result:json().notNull(),
	createdAt:timestamp("created_at",{mode:"string",fsp:3}).defaultNow().notNull(),
},table=>[uniqueIndex("uq_product_detail_request").on(table.merchantId,table.requestId)]);

export const productOptions = mysqlTable("product_options", {
	id: int().autoincrement().primaryKey(),
	productId: int("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
	merchantId: int("merchant_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	nameEn: varchar("name_en", { length: 100 }),
	values: text().notNull(),
	sortOrder: int("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const productVariants = mysqlTable("product_variants", {
	id: int().autoincrement().primaryKey(),
	productId: int("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
	merchantId: int("merchant_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	sku: varchar({ length: 100 }),
	price: int(),
	priceUnit: mysqlEnum("price_unit", ['unverified', 'minor']).default('unverified').notNull(),
	compareAtPrice: int("compare_at_price"),
	costPrice: int("cost_price"),
	stock: int().default(0),
	barcode: varchar({ length: 100 }),
	weight: varchar({ length: 20 }),
	imageUrl: varchar("image_url", { length: 500 }),
	options: text(),
	isActive: tinyint("is_active").default(1).notNull(),
	sortOrder: int("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	index("idx_variant_product").on(table.productId),
	index("idx_variant_merchant").on(table.merchantId),
]);

export const quickResponses = mysqlTable("quick_responses", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
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
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
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
	id: int().autoincrement().primaryKey(),
	referralCodeId: int().notNull(),
	referredPhone: varchar({ length: 20 }).notNull(),
	referredName: varchar({ length: 255 }).notNull(),
	orderCompleted: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const rewards = mysqlTable("rewards", {
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	referralId: int().notNull(),
	rewardType: mysqlEnum(['discount_10', 'free_month', 'analytics_upgrade']).notNull(),
	status: mysqlEnum(['pending', 'claimed', 'expired']).default('pending').notNull(),
	claimedAt: timestamp({ mode: 'string' }),
	expiresAt: timestamp({ mode: 'string' }).notNull(),
	description: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const merchantReferralPrograms = mysqlTable('merchant_referral_programs', {
 merchantId: int('merchant_id').primaryKey().references(() => merchants.id, { onDelete: 'cascade' }),
 codeId: int('code_id'), appliedCodeId: int('applied_code_id'), appliedReferralId: int('applied_referral_id'), appliedRewardId: int('applied_reward_id'),
 createdAt: timestamp('created_at', { mode: 'string' }).defaultNow().notNull(), updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex('uq_merchant_referral_code').on(table.codeId), uniqueIndex('uq_merchant_referral_application').on(table.appliedReferralId), uniqueIndex('uq_merchant_referral_reward').on(table.appliedRewardId), check('chk_merchant_referral_application', sql`(${table.appliedCodeId} IS NULL AND ${table.appliedReferralId} IS NULL AND ${table.appliedRewardId} IS NULL) OR (${table.appliedCodeId} IS NOT NULL AND ${table.appliedReferralId} IS NOT NULL AND ${table.appliedRewardId} IS NOT NULL)`)]);

export const sallaConnections = mysqlTable("salla_connections", {
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	sallaStoreId: varchar("salla_store_id", { length: 32 }),
	storeUrl: varchar({ length: 255 }).notNull(),
	accessToken: text().notNull(),
	syncStatus: mysqlEnum(['active', 'syncing', 'error', 'paused']).default('active').notNull(),
	lastSyncAt: timestamp({ mode: 'string' }),
	syncErrors: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		uniqueIndex("salla_connections_merchantId_unique").on(table.merchantId),
		uniqueIndex("salla_connections_store_id_unique").on(table.sallaStoreId),
	]);

export const sallaWebhookReceipts = mysqlTable("salla_webhook_receipts", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	sallaStoreId: varchar("salla_store_id", { length: 32 }).notNull(),
	eventKey: varchar("event_key", { length: 64 }).notNull(),
	eventType: varchar("event_type", { length: 64 }).notNull(),
	resourceId: varchar("resource_id", { length: 32 }).notNull(),
	status: mysqlEnum(['pending', 'processing', 'completed', 'failed', 'manual_review']).default('pending').notNull(),
	attemptCount: int("attempt_count").default(0).notNull(),
	effectApplied: tinyint("effect_applied").default(0).notNull(),
	notificationRequired: tinyint("notification_required").default(0).notNull(),
	notificationStatus: varchar("notification_status", { length: 16 }),
	processingToken: varchar("processing_token", { length: 64 }),
	availableAt: timestamp("available_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	claimedAt: timestamp("claimed_at", { mode: 'string', fsp: 3 }),
	processedAt: timestamp("processed_at", { mode: 'string', fsp: 3 }),
	lastError: varchar("last_error", { length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', fsp: 3 }).defaultNow().onUpdateNow().notNull(),
}, table => [
	uniqueIndex("salla_webhook_receipts_event_unique").on(table.eventKey),
	index("salla_webhook_receipts_dispatch_idx").on(table.status, table.availableAt, table.id),
	index("salla_webhook_receipts_merchant_idx").on(table.merchantId, table.createdAt),
	index("salla_webhook_receipts_store_idx").on(table.sallaStoreId),
	index('idx_salla_receipt_order_scope').on(table.merchantId,table.sallaStoreId,table.resourceId,table.eventType,table.status),
]);

export const sallaProductProjections = mysqlTable('salla_product_projections', {
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  storeId:varchar('store_id',{length:32}).notNull(),externalProductId:varchar('external_product_id',{length:32}).notNull(),
  localProductId:int('local_product_id'),connectionId:int('connection_id').notNull(),readRevision:int('read_revision').notNull(),
  archived:tinyint().default(0).notNull(),observedAt:datetime('observed_at',{mode:'string',fsp:3}).notNull(),
},table=>[uniqueIndex('salla_product_scope').on(table.merchantId,table.storeId,table.externalProductId),
  uniqueIndex('salla_product_local').on(table.localProductId),
  check('chk_salla_product_projection',sql`${table.connectionId}>0 AND ${table.readRevision}>0 AND ${table.archived} IN (0,1)
    AND (${table.localProductId} IS NOT NULL OR ${table.archived}=1) AND (${table.localProductId} IS NULL OR ${table.localProductId}>0)
    AND REGEXP_LIKE(${table.storeId},'^[1-9][0-9]{0,19}$','c') AND REGEXP_LIKE(${table.externalProductId},'^[1-9][0-9]{0,19}$','c')`),
]);

export const sallaNoticeReceipts = mysqlTable('salla_notice_receipts', {
  id:int().autoincrement().primaryKey(),effectId:int('effect_id').notNull(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  creationId:int('creation_id').notNull(),localOrderId:int('local_order_id').notNull(),claimToken:char('claim_token',{length:36}).notNull(),
  contextHash:char('context_hash',{length:64}).notNull(),evidence:json().notNull(),evidenceHash:char('evidence_hash',{length:64}).notNull(),fullyAccepted:tinyint('fully_accepted').default(0).notNull(),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),updatedAt:datetime('updated_at',{mode:'string',fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
},table=>[uniqueIndex('salla_notice_effect_once').on(table.effectId),index('salla_notice_merchant').on(table.merchantId,table.id),
  check('chk_salla_notice_receipt',sql`${table.effectId}>0 AND ${table.creationId}>0 AND ${table.localOrderId}>0 AND ${table.fullyAccepted} IN (0,1)
    AND REGEXP_LIKE(${table.claimToken},'^[0-9a-f-]{36}$','c') AND REGEXP_LIKE(${table.contextHash},'^[0-9a-f]{64}$','c') AND REGEXP_LIKE(${table.evidenceHash},'^[0-9a-f]{64}$','c')`),
]);

export const sallaSheetReceipts = mysqlTable('salla_sheet_receipts', {
  id:int().autoincrement().primaryKey(),effectId:int('effect_id').notNull(),
  merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  creationId:int('creation_id').notNull(),localOrderId:int('local_order_id').notNull(),
  claimToken:char('claim_token',{length:36}).notNull(),contextHash:char('context_hash',{length:64}).notNull(),
  intent:json().notNull(),intentHash:char('intent_hash',{length:64}).notNull(),receipt:json(),receiptHash:char('receipt_hash',{length:64}),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),acceptedAt:datetime('accepted_at',{mode:'string',fsp:3}),
},table=>[uniqueIndex('salla_sheet_effect_once').on(table.effectId),index('salla_sheet_merchant').on(table.merchantId,table.id),
  check('chk_salla_sheet_receipt',sql`${table.effectId}>0 AND ${table.creationId}>0 AND ${table.localOrderId}>0
    AND REGEXP_LIKE(${table.claimToken},'^[0-9a-f-]{36}$','c') AND REGEXP_LIKE(${table.contextHash},'^[0-9a-f]{64}$','c')
    AND REGEXP_LIKE(${table.intentHash},'^[0-9a-f]{64}$','c')
    AND ((${table.receipt} IS NULL AND ${table.receiptHash} IS NULL AND ${table.acceptedAt} IS NULL)
      OR (${table.receipt} IS NOT NULL AND ${table.receiptHash} IS NOT NULL AND ${table.acceptedAt} IS NOT NULL AND REGEXP_LIKE(${table.receiptHash},'^[0-9a-f]{64}$','c')))`),
]);

export const sallaEffectReviews = mysqlTable('salla_effect_reviews', {
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  reviewerUserId:int('reviewer_user_id').notNull(),effectId:int('effect_id').notNull(),orderId:int('order_id').notNull(),
  requestId:char('request_id',{length:36}).notNull(),requestDigest:char('request_digest',{length:64}).notNull(),
  snapshot:json().notNull(),snapshotDigest:char('snapshot_digest',{length:64}).notNull(),createdAt:datetime('created_at',{mode:'string',fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
},table=>[uniqueIndex('salla_effect_review_request').on(table.merchantId,table.requestId),index('salla_effect_review_history').on(table.merchantId,table.orderId,table.id)]);

export const sallaCreationEffects = mysqlTable('salla_creation_effects', {
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  creationId:int('creation_id').notNull(),localOrderId:int('local_order_id').notNull(),
  kind:mysqlEnum(['owner_notice','merchant_notice','sheets']).notNull(),contextHash:char('context_hash',{length:64}).notNull(),
  state:mysqlEnum(['pending','processing','dispatching','accepted','review']).default('pending').notNull(),attempts:int().default(0).notNull(),
  claimToken:char('claim_token',{length:36}),leaseUntil:datetime('lease_until',{mode:'string',fsp:3}),
  availableAt:datetime('available_at',{mode:'string',fsp:3}).notNull(),dispatchStartedAt:datetime('dispatch_started_at',{mode:'string',fsp:3}),
  acceptedAt:datetime('accepted_at',{mode:'string',fsp:3}),lastError:varchar('last_error',{length:64}),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull(),updatedAt:datetime('updated_at',{mode:'string',fsp:3}).notNull(),
},table=>[uniqueIndex('salla_creation_effect_once').on(table.creationId,table.kind),
  index('salla_creation_effect_due').on(table.state,table.availableAt,table.id),index('salla_creation_effect_order').on(table.merchantId,table.localOrderId,table.id),
  check('chk_salla_creation_effect',sql`${table.creationId}>0 AND ${table.localOrderId}>0 AND ${table.attempts} BETWEEN 0 AND 8
    AND REGEXP_LIKE(${table.contextHash},'^[0-9a-f]{64}$','c') AND (${table.claimToken} IS NULL OR REGEXP_LIKE(${table.claimToken},'^[0-9a-f-]{36}$','c'))
    AND ((${table.state}='pending' AND ${table.claimToken} IS NULL AND ${table.leaseUntil} IS NULL AND ${table.dispatchStartedAt} IS NULL AND ${table.acceptedAt} IS NULL)
      OR (${table.state}='processing' AND ${table.claimToken} IS NOT NULL AND ${table.leaseUntil} IS NOT NULL AND ${table.dispatchStartedAt} IS NULL AND ${table.acceptedAt} IS NULL)
      OR (${table.state}='dispatching' AND ${table.claimToken} IS NOT NULL AND ${table.leaseUntil} IS NOT NULL AND ${table.dispatchStartedAt} IS NOT NULL AND ${table.acceptedAt} IS NULL)
      OR (${table.state}='accepted' AND ${table.claimToken} IS NOT NULL AND ${table.leaseUntil} IS NULL AND ${table.dispatchStartedAt} IS NOT NULL AND ${table.acceptedAt} IS NOT NULL)
      OR (${table.state}='review' AND ${table.claimToken} IS NOT NULL AND ${table.leaseUntil} IS NULL AND ${table.acceptedAt} IS NULL))`),
]);

export const sallaCheckoutReviews = mysqlTable('salla_checkout_reviews', {
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  reviewerUserId:int('reviewer_user_id').notNull(),reviewId:char('review_id',{length:36}).notNull(),
  requestDigest:char('request_digest',{length:64}).notNull(),snapshot:json().notNull(),snapshotDigest:char('snapshot_digest',{length:64}).notNull(),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
},table=>[uniqueIndex('salla_checkout_review_once').on(table.merchantId,table.reviewId),index('salla_checkout_review_history').on(table.merchantId,table.id),
  check('chk_salla_checkout_review',sql`${table.reviewerUserId}>0 AND REGEXP_LIKE(${table.requestDigest},'^[0-9a-f]{64}$','c') AND REGEXP_LIKE(${table.snapshotDigest},'^[0-9a-f]{64}$','c')`),
]);

export const sallaCheckoutCarts = mysqlTable('salla_checkout_carts', {
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  actorUserId:int('actor_user_id').notNull(),requestId:char('request_id',{length:36}).notNull(),requestHash:char('request_hash',{length:64}).notNull(),
  attemptToken:char('attempt_token',{length:36}).notNull(),state:mysqlEnum(['preparing','dispatching','ready','rejected','review']).notNull(),
  snapshot:json('snapshot'),resultJson:json('result_json'),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull(),updatedAt:datetime('updated_at',{mode:'string',fsp:3}).notNull(),
},table=>[uniqueIndex('salla_cart_request').on(table.merchantId,table.requestId),index('salla_cart_review').on(table.merchantId,table.state,table.id),
  check('chk_salla_cart_state',sql`${table.actorUserId}>0 AND REGEXP_LIKE(${table.requestHash},'^[0-9a-f]{64}$','c')
    AND (${table.state} NOT IN ('dispatching','ready') OR ${table.snapshot} IS NOT NULL)
    AND ((${table.state}='ready' AND ${table.resultJson} IS NOT NULL) OR (${table.state}<>'ready' AND ${table.resultJson} IS NULL))`),
]);

export const sallaOrderCreations = mysqlTable('salla_order_creations', {
  id:int().autoincrement().primaryKey(), merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  actorUserId:int('actor_user_id').notNull(), requestId:char('request_id',{length:36}).notNull(), requestHash:char('request_hash',{length:64}).notNull(),
  attemptToken:char('attempt_token',{length:36}).notNull(), state:mysqlEnum(['preparing','dispatching','completed','rejected','review']).notNull(),
  storeId:varchar('store_id',{length:32}),connectionId:int('connection_id'),localOrderId:int('local_order_id'),resultJson:json('result_json'),errorCode:varchar('error_code',{length:64}),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull(),updatedAt:datetime('updated_at',{mode:'string',fsp:3}).notNull(),
},table=>[uniqueIndex('salla_creation_request').on(table.merchantId,table.requestId),uniqueIndex('salla_creation_order').on(table.localOrderId),
  index('salla_creation_review').on(table.merchantId,table.state,table.id),
  check('chk_salla_creation_state',sql`${table.actorUserId}>0 AND REGEXP_LIKE(${table.requestHash},'^[0-9a-f]{64}$','c')
    AND ((${table.storeId} IS NULL AND ${table.connectionId} IS NULL) OR (${table.storeId} IS NOT NULL AND ${table.connectionId} IS NOT NULL AND ${table.connectionId}>0 AND REGEXP_LIKE(${table.storeId},'^[1-9][0-9]{0,19}$','c')))
    AND (${table.state} NOT IN ('dispatching','completed') OR (${table.storeId} IS NOT NULL AND ${table.connectionId} IS NOT NULL))
    AND ((${table.state}='completed' AND ${table.localOrderId} IS NOT NULL AND ${table.localOrderId}>0 AND ${table.resultJson} IS NOT NULL)
      OR (${table.state}<>'completed' AND ${table.localOrderId} IS NULL AND ${table.resultJson} IS NULL))`),
]);

export const sallaOrderProjections = mysqlTable('salla_order_projections', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  storeId: varchar('store_id', { length: 32 }).notNull(), externalOrderId: varchar('external_order_id', { length: 32 }).notNull(),
  localOrderId: int('local_order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  connectionId: int('connection_id').notNull(), createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull(),
}, table => [uniqueIndex('salla_projection_scope').on(table.merchantId,table.storeId,table.externalOrderId),
  uniqueIndex('salla_projection_local').on(table.localOrderId),
  check('chk_salla_projection_ids', sql`${table.connectionId}>0 AND REGEXP_LIKE(${table.storeId},'^[1-9][0-9]{0,19}$','c') AND REGEXP_LIKE(${table.externalOrderId},'^[1-9][0-9]{0,19}$','c')`),
]);

export const sallaSalesObservations = mysqlTable('salla_sales_observations', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  storeId: varchar('store_id', { length: 32 }).notNull(), orderId: varchar('order_id', { length: 32 }).notNull(),
  observedState: mysqlEnum('observed_state', ['pending','paid','processing','shipped','delivered','cancelled']).notNull(),
  providerStatus: varchar('provider_status', { length: 40 }).notNull(),
  receiptId: int('receipt_id').notNull().references(() => sallaWebhookReceipts.id, { onDelete: 'cascade' }),
  eventKey: varchar('event_key', { length: 64 }).notNull(),
  firstObservedAt: datetime('first_observed_at', { mode: 'string', fsp: 3 }).notNull(),
}, table => [
  uniqueIndex('salla_observation_scope_state').on(table.merchantId, table.storeId, table.orderId, table.observedState),
  uniqueIndex('salla_observation_receipt').on(table.receiptId),
  check('chk_salla_observation_ids', sql`REGEXP_LIKE(${table.storeId},'^[1-9][0-9]{0,19}$','c') AND REGEXP_LIKE(${table.orderId},'^[1-9][0-9]{0,19}$','c')`),
  check('chk_salla_observation_source', sql`REGEXP_LIKE(${table.eventKey},'^[a-f0-9]{64}$','c') AND REGEXP_LIKE(${table.providerStatus},'^[a-z_]{1,40}$','c')`),
]);

export const sariPersonalitySettings = mysqlTable("sari_personality_settings", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	tone: mysqlEnum(['friendly', 'professional', 'casual', 'enthusiastic']).default('friendly').notNull(),
	style: mysqlEnum(['saudi_dialect', 'formal_arabic', 'english', 'bilingual']).default('saudi_dialect').notNull(),
	emojiUsage: mysqlEnum("emoji_usage", ['none', 'minimal', 'moderate', 'frequent']).default('moderate').notNull(),
	customInstructions: text("custom_instructions"),
	brandVoice: text("brand_voice"),
	maxResponseLength: int("max_response_length").default(200).notNull(),
	responseDelay: int("response_delay").default(2).notNull(),
	customGreeting: text("custom_greeting"),
	customFarewell: text("custom_farewell"),
	recommendationStyle: mysqlEnum("recommendation_style", ['direct', 'consultative', 'enthusiastic']).default('consultative').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		index("sari_personality_settings_merchant_id_unique").on(table.merchantId),
	]);

export const scheduledMessages = mysqlTable("scheduled_messages", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
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
	id: int().autoincrement().primaryKey(),
	messageId: int("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
	conversationId: int("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
	sentiment: mysqlEnum(['positive', 'negative', 'neutral', 'angry', 'happy', 'sad', 'frustrated']).notNull(),
	confidence: int().notNull(),
	keywords: text(),
	reasoning: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const signupPromptTestResults = mysqlTable("signup_prompt_test_results", {
	id: int().autoincrement().primaryKey(),
	sessionId: varchar("session_id", { length: 255 }).notNull(),
	variantId: varchar("variant_id", { length: 50 }).notNull(),
	shown: tinyint().default(0).notNull(),
	clicked: tinyint().default(0).notNull(),
	converted: tinyint().default(0).notNull(),
	dismissedAt: timestamp("dismissed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const signupPromptVariants = mysqlTable("signup_prompt_variants", {
	id: int().autoincrement().primaryKey(),
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
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	planId: int().notNull(),
	status: mysqlEnum(['active', 'expired', 'cancelled', 'pending', 'trial']).default('pending').notNull(),
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
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	subject: varchar({ length: 255 }).notNull(),
	message: text().notNull(),
	status: mysqlEnum(['open', 'in_progress', 'resolved', 'closed']).default('open').notNull(),
	priority: mysqlEnum(['low', 'medium', 'high', 'urgent']).default('medium').notNull(),
	adminResponse: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const syncLogs = mysqlTable("sync_logs", {
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	syncType: mysqlEnum(['full_sync', 'stock_sync', 'single_product']).notNull(),
	status: mysqlEnum(['success', 'failed', 'in_progress']).notNull(),
	itemsSynced: int().default(0).notNull(),
	errors: text(),
	startedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp({ mode: 'string' }),
});

export const testConversations = mysqlTable("testConversations", {
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	requestId: char({ length: 36 }),
	startedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	endedAt: timestamp({ mode: 'string' }),
	messageCount: int().default(0).notNull(),
	hasDeal: tinyint().default(0).notNull(),
	dealValue: decimal({ precision: 12, scale: 2 }),
	dealMarkedAt: timestamp({ mode: 'string' }),
	satisfactionRating: int(),
	npsScore: int(),
	wasCompleted: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex('test_session_request').on(table.merchantId, table.requestId)]);

export const testDeals = mysqlTable("testDeals", {
	id: int().autoincrement().primaryKey(),
	conversationId: int(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	dealValue: decimal({ precision: 12, scale: 2 }).notNull(),
	timeToConversion: int(),
	messageCount: int().notNull(),
	markedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	wasCompleted: tinyint().default(0).notNull(),
	completedAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const testMessages = mysqlTable("testMessages", {
	id: int().autoincrement().primaryKey(),
	conversationId: int().notNull().references(() => testConversations.id, { onDelete: "cascade" }),
	clientMessageId: char({ length: 36 }),
	sender: mysqlEnum(['user', 'sari']).notNull(),
	content: text().notNull(),
	sentAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	responseTime: int(),
	rating: mysqlEnum(['positive', 'negative']),
	ratedAt: timestamp({ mode: 'string' }),
	ratingRevision: int().notNull().default(0),
	replySource: mysqlEnum(['model', 'guardrail']),
	productsRecommended: text(),
	wasClicked: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
}, table => [uniqueIndex('test_message_request').on(table.conversationId, table.clientMessageId)]);

export const testMessageFeedback = mysqlTable("test_message_feedback", {
  id: int().autoincrement().primaryKey(),
  merchantId: int("merchant_id").notNull(),
  requestId: char("request_id", {length:36}).notNull(),
  messageId: int("message_id").notNull().references(()=>testMessages.id,{onDelete:"cascade"}),
  reviewerId: int("reviewer_id").notNull(),
  expectedRevision: int("expected_revision").notNull(),
  revision: int().notNull(),
  previousRating: mysqlEnum("previous_rating",['positive','negative']),
  rating: mysqlEnum(['positive','negative']),
  createdAt: timestamp("created_at",{mode:'string',fsp:3}).defaultNow().notNull(),
},table=>[uniqueIndex('uq_test_feedback_request').on(table.merchantId,table.requestId),index('idx_test_feedback_message').on(table.messageId,table.revision)]);

export const testMetricsDaily = mysqlTable("testMetricsDaily", {
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
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
	id: int().autoincrement().primaryKey(),
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
	id: int().autoincrement().primaryKey(),
	openId: varchar({ length: 64 }).notNull(),
	name: text(),
	email: varchar({ length: 320 }),
	loginMethod: varchar({ length: 64 }),
	role: mysqlEnum(['user', 'admin']).default('user').notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }).defaultNow().notNull(),
	password: varchar({ length: 255 }),
	accountStatus: mysqlEnum("account_status", ['active', 'deletion_pending', 'anonymized']).default('active').notNull(),
	emailVerifiedAt: timestamp("email_verified_at", { mode: 'string' }),
	deletionRequestedAt: timestamp("deletion_requested_at", { mode: 'string' }),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	// Trial period fields
	trialStartDate: timestamp('trial_start_date', { mode: 'string' }),
	trialEndDate: timestamp('trial_end_date', { mode: 'string' }),
	isTrialActive: tinyint('is_trial_active').default(0).notNull(),
	whatsappConnected: tinyint('whatsapp_connected').default(0).notNull(),
},
	(table) => [
		uniqueIndex("users_open_id_unique").on(table.openId),
		uniqueIndex("users_email_unique").on(table.email),
	]);

export const authSessions = mysqlTable("auth_sessions", {
	id: int().autoincrement().primaryKey(),
	userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
	tokenIdHash: varchar("token_id_hash", { length: 64 }).notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	revokedAt: timestamp("revoked_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, table => [
	uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenIdHash),
	index("auth_sessions_user_active_idx").on(table.userId, table.revokedAt, table.expiresAt),
	index("auth_sessions_expiry_idx").on(table.expiresAt),
]);

export const authLoginAttempts = mysqlTable("auth_login_attempts", {
	id: int().autoincrement().primaryKey(),
	emailHash: varchar("email_hash", { length: 64 }).notNull(),
	ipHash: varchar("ip_hash", { length: 64 }).notNull(),
	attemptedAt: timestamp("attempted_at", { mode: 'string' }).defaultNow().notNull(),
}, table => [
	index("auth_login_attempts_email_time_idx").on(table.emailHash, table.attemptedAt),
	index("auth_login_attempts_ip_time_idx").on(table.ipHash, table.attemptedAt),
	index("auth_login_attempts_time_idx").on(table.attemptedAt),
]);

export const apiRateLimitWindows = mysqlTable("api_rate_limit_windows", {
	bucketHash: varchar("bucket_hash", { length: 64 }).primaryKey(),
	windowStartedAt: timestamp("window_started_at", { mode: 'string', fsp: 3 }).notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string', fsp: 3 }).notNull(),
	requestCount: int("request_count").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', fsp: 3 }).defaultNow().onUpdateNow().notNull(),
}, table => [
	index("api_rate_limit_windows_expiry_idx").on(table.expiresAt),
]);

export const consentReceipts = mysqlTable("consent_receipts", {
	id: int().autoincrement().primaryKey(),
	userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
	subjectReferenceHash: varchar("subject_reference_hash", { length: 64 }).notNull(),
	consentType: mysqlEnum("consent_type", ['terms', 'privacy', 'marketing']).notNull(),
	granted: tinyint().notNull(),
	documentVersion: varchar("document_version", { length: 32 }).notNull(),
	documentUrl: varchar("document_url", { length: 255 }).notNull(),
	source: varchar({ length: 50 }).default('signup').notNull(),
	ipHash: varchar("ip_hash", { length: 64 }),
	userAgentHash: varchar("user_agent_hash", { length: 64 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	withdrawnAt: timestamp("withdrawn_at", { mode: 'string' }),
}, table => [
	index("consent_receipts_user_type_idx").on(table.userId, table.consentType),
	index("consent_receipts_subject_idx").on(table.subjectReferenceHash),
]);

export const dataSubjectRequests = mysqlTable("data_subject_requests", {
	id: int().autoincrement().primaryKey(),
	userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
	subjectReferenceHash: varchar("subject_reference_hash", { length: 64 }).notNull(),
	requestType: mysqlEnum("request_type", ['access', 'export', 'correction', 'deletion', 'withdraw_consent', 'objection']).notNull(),
	status: mysqlEnum(['pending', 'processing', 'completed', 'rejected', 'requires_review', 'failed']).default('pending').notNull(),
	requestedAt: timestamp("requested_at", { mode: 'string' }).defaultNow().notNull(),
	dueAt: timestamp("due_at", { mode: 'string' }).notNull(),
	processingScheduledAt: timestamp("processing_scheduled_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	rejectionReason: text("rejection_reason"),
	resolutionNotes: text("resolution_notes"),
	handledByUserId: int("handled_by_user_id").references(() => users.id, { onDelete: "set null" }),
	requestMetadata: text("request_metadata"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, table => [
	index("data_subject_requests_user_idx").on(table.userId),
	index("data_subject_requests_status_due_idx").on(table.status, table.dueAt),
	index("data_subject_requests_processing_idx").on(table.status, table.processingScheduledAt),
	index("data_subject_requests_subject_idx").on(table.subjectReferenceHash),
]);

export const legalRetentionRecords = mysqlTable("legal_retention_records", {
	id: int().autoincrement().primaryKey(),
	subjectReferenceHash: varchar("subject_reference_hash", { length: 64 }).notNull(),
	recordType: mysqlEnum("record_type", ['invoice', 'payment', 'legacy_payment']).notNull(),
	sourceRecordId: int("source_record_id").notNull(),
	recordDate: timestamp("record_date", { mode: 'string' }).notNull(),
	amount: decimal({ precision: 12, scale: 2 }),
	currency: varchar({ length: 10 }),
	status: varchar({ length: 32 }),
	encryptedPayload: text("encrypted_payload").notNull(),
	retainUntil: timestamp("retain_until", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, table => [
	uniqueIndex("legal_retention_source_unique").on(table.recordType, table.sourceRecordId),
	index("legal_retention_subject_idx").on(table.subjectReferenceHash),
	index("legal_retention_until_idx").on(table.retainUntil),
]);


export const virtualAgents = mysqlTable("virtual_agents", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	name: varchar({ length: 100 }).notNull(),
	role: varchar({ length: 100 }).notNull(),
	department: varchar({ length: 100 }),
	personalityPrompt: text("personality_prompt").notNull(),
	tone: mysqlEnum(['friendly', 'professional', 'casual', 'empathetic', 'persuasive']).default('friendly').notNull(),
	avatarEmoji: varchar("avatar_emoji", { length: 10 }).default('👩‍💼'),
	isDefault: tinyint("is_default").default(0).notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	triggerKeywords: text("trigger_keywords"),
	triggerIntents: text("trigger_intents"),
	shiftStart: varchar("shift_start", { length: 5 }), // HH:mm format e.g. "09:00"
	shiftEnd: varchar("shift_end", { length: 5 }),     // HH:mm format e.g. "17:00"
	sortOrder: int("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	index("virtual_agents_merchant_id_idx").on(table.merchantId),
]);

export type VirtualAgent = InferSelectModel<typeof virtualAgents>;
export type InsertVirtualAgent = InferInsertModel<typeof virtualAgents>;


export const weeklySentimentReports = mysqlTable("weekly_sentiment_reports", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
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
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	phoneNumber: varchar({ length: 20 }),
	instanceId: varchar({ length: 255 }),
	apiToken: text(),
	status: mysqlEnum(['connected', 'disconnected', 'pending', 'error']).default('pending').notNull(),
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
	id: int().autoincrement().primaryKey(),
	merchantId: int().notNull().references(() => merchants.id, { onDelete: "cascade" }),
	countryCode: varchar({ length: 10 }).notNull(),
	phoneNumber: varchar({ length: 20 }).notNull(),
	fullNumber: varchar({ length: 30 }).notNull(),
	status: mysqlEnum(['pending', 'approved', 'rejected', 'connected']).default('pending').notNull(),
	rejectionReason: text(),
	reviewedBy: int(),
	reviewedAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	instanceId: varchar({ length: 255 }),
	apiToken: text(),
	apiUrl: varchar({ length: 255 }).default('https://api.green-api.com'),
	connectedAt: timestamp({ mode: 'string' }),
});

export const whatsappInstances = mysqlTable("whatsapp_instances", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	provider: mysqlEnum(['green_api', 'meta_cloud', 'mock']).default('green_api').notNull(),
	instanceId: varchar("instance_id", { length: 255 }).notNull(),
	token: text().notNull(),
	apiUrl: varchar("api_url", { length: 255 }).default('https://api.green-api.com'),
	providerAccountId: varchar("provider_account_id", { length: 255 }),
	phoneNumberId: varchar("phone_number_id", { length: 255 }),
	webhookTokenHash: varchar("webhook_token_hash", { length: 64 }),
	phoneNumber: varchar("phone_number", { length: 20 }),
	// SHA-256 of the canonical phone digits while active; NULL otherwise. The
	// unique index is the database-level last line of defence against two tenants
	// owning the same active number even if an application lock is bypassed.
	activePhoneIdentityHash: varchar("active_phone_identity_hash", { length: 64 }),
	webhookUrl: text("webhook_url"),
	status: mysqlEnum(['active', 'inactive', 'pending', 'expired']).default('pending').notNull(),
	isPrimary: tinyint("is_primary").default(0).notNull(),
	// MySQL unique indexes allow multiple NULL values. Only an active primary
	// projects its merchant id, so this prevents direct/uncoordinated writers
	// from creating two active primaries for one merchant.
	activePrimaryMerchantId: int("active_primary_merchant_id").generatedAlwaysAs(
		sql`CASE WHEN \`status\` = 'active' AND \`is_primary\` = 1 THEN \`merchant_id\` ELSE NULL END`,
		{ mode: 'virtual' },
	),
	lastSyncAt: timestamp("last_sync_at", { mode: 'string' }),
	connectedAt: timestamp("connected_at", { mode: 'string' }),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	metadata: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	uniqueIndex("uq_whatsapp_instance_id").on(table.instanceId),
	uniqueIndex("whatsapp_instances_active_phone_identity_unique").on(table.activePhoneIdentityHash),
	uniqueIndex("whatsapp_instances_active_primary_merchant_unique").on(table.activePrimaryMerchantId),
	check(
		"whatsapp_instances_primary_requires_active_check",
		sql`\`is_primary\` IN (0, 1) AND (\`is_primary\` = 0 OR \`status\` = 'active')`,
	),
	index("idx_whatsapp_provider_phone_id").on(table.provider, table.phoneNumberId),
]);

/**
 * A durable disconnect episode for one WhatsApp instance. The generated open
 * identity permits any number of resolved episodes while enforcing exactly one
 * open episode per instance across deploy overlaps and clustered workers.
 */
export const whatsappDisconnectIncidents = mysqlTable("whatsapp_disconnect_incidents", {
	id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	instanceId: int("instance_id").notNull(),
	detectedAt: timestamp("detected_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	alertsSent: tinyint("alerts_sent", { unsigned: true }).default(0).notNull(),
	nextAlertAt: timestamp("next_alert_at", { mode: 'string', fsp: 3 }).defaultNow(),
	lastAlertAt: timestamp("last_alert_at", { mode: 'string', fsp: 3 }),
	resolvedAt: timestamp("resolved_at", { mode: 'string', fsp: 3 }),
	openInstanceId: int("open_instance_id").generatedAlwaysAs(
		sql`CASE WHEN \`resolved_at\` IS NULL THEN \`instance_id\` ELSE NULL END`,
		{ mode: 'virtual' },
	),
	createdAt: timestamp("created_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', fsp: 3 }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.instanceId],
		foreignColumns: [whatsappInstances.id],
		name: "whatsapp_disconnect_instance_fk",
	}).onDelete("cascade"),
	uniqueIndex("uq_whatsapp_disconnect_open_instance").on(table.openInstanceId),
	index("idx_whatsapp_disconnect_due").on(table.resolvedAt, table.nextAlertAt, table.id),
	index("idx_whatsapp_disconnect_merchant").on(table.merchantId, table.detectedAt, table.id),
	check(
		"whatsapp_disconnect_alert_count_check",
		sql`${table.alertsSent} >= 0 AND ${table.alertsSent} <= 2`,
	),
]);

export const whatsappRequests = mysqlTable("whatsapp_requests", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	phoneNumber: varchar("phone_number", { length: 20 }),
	businessName: varchar("business_name", { length: 255 }),
	status: mysqlEnum(['pending', 'approved', 'rejected', 'completed']).default('pending').notNull(),
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
	id: int().autoincrement().primaryKey(),
	pageSlug: varchar("page_slug", { length: 255 }).notNull().unique(),
	pageTitle: varchar("page_title", { length: 255 }).notNull(),
	pageDescription: text("page_description").notNull(),
	keywords: text("keywords"),
	author: varchar({ length: 255 }),
	canonicalUrl: varchar("canonical_url", { length: 500 }),
	isIndexed: tinyint("is_indexed").default(1).notNull(),
	isPriority: tinyint("is_priority").default(0).notNull(),
	changeFrequency: mysqlEnum("change_frequency", ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']).default('weekly'),
	priority: varchar({ length: 3 }).default('0.5'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoMetaTags = mysqlTable("seo_meta_tags", {
	id: int().autoincrement().primaryKey(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	metaName: varchar("meta_name", { length: 100 }).notNull(),
	metaContent: text("meta_content").notNull(),
	metaProperty: varchar("meta_property", { length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoOpenGraph = mysqlTable("seo_open_graph", {
	id: int().autoincrement().primaryKey(),
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
	id: int().autoincrement().primaryKey(),
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
	id: int().autoincrement().primaryKey(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	schemaType: varchar("schema_type", { length: 100 }).notNull(),
	schemaData: text("schema_data").notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoTrackingCodes = mysqlTable("seo_tracking_codes", {
	id: int().autoincrement().primaryKey(),
	pageId: int("page_id"),
	trackingType: mysqlEnum("tracking_type", ['google_analytics', 'google_tag_manager', 'facebook_pixel', 'snapchat_pixel', 'tiktok_pixel', 'custom']).notNull(),
	trackingId: varchar("tracking_id", { length: 255 }).notNull(),
	trackingCode: text("tracking_code"),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoAnalytics = mysqlTable("seo_analytics", {
	id: int().autoincrement().primaryKey(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	date: timestamp({ mode: 'string' }).notNull(),
	visitors: int().default(0).notNull(),
	pageViews: int("page_views").default(0).notNull(),
	bounceRate: varchar({ length: 10 }).default('0'),
	avgSessionDuration: varchar("avg_session_duration", { length: 20 }).default('0'),
	conversions: int().default(0).notNull(),
	conversionRate: varchar("conversion_rate", { length: 10 }).default('0'),
	trafficSource: mysqlEnum("traffic_source", ['organic', 'direct', 'social', 'referral', 'paid', 'other']).default('organic'),
	device: mysqlEnum(['desktop', 'mobile', 'tablet']).default('desktop'),
	country: varchar({ length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const seoKeywordsAnalysis = mysqlTable("seo_keywords_analysis", {
	id: int().autoincrement().primaryKey(),
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
	id: int().autoincrement().primaryKey(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	sourceUrl: varchar("source_url", { length: 500 }).notNull(),
	sourceDomain: varchar("source_domain", { length: 255 }).notNull(),
	anchorText: varchar("anchor_text", { length: 255 }),
	linkType: mysqlEnum("link_type", ['dofollow', 'nofollow']).default('dofollow'),
	domainAuthority: int("domain_authority").default(0),
	spamScore: int("spam_score").default(0),
	lastFound: timestamp("last_found", { mode: 'string' }).defaultNow().notNull(),
	status: mysqlEnum(['active', 'lost', 'pending']).default('active').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoPerformanceAlerts = mysqlTable("seo_performance_alerts", {
	id: int().autoincrement().primaryKey(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	alertType: mysqlEnum("alert_type", ['ranking_drop', 'traffic_drop', 'broken_link', 'slow_page', 'low_ctr', 'high_bounce_rate']).notNull(),
	severity: mysqlEnum(['low', 'medium', 'high', 'critical']).default('medium').notNull(),
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
	id: int().autoincrement().primaryKey(),
	pageId: int("page_id").notNull().references(() => seoPages.id, { onDelete: "cascade" }),
	recommendationType: mysqlEnum("recommendation_type", ['keyword_optimization', 'content_improvement', 'technical_seo', 'link_building', 'user_experience', 'performance']).notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text().notNull(),
	priority: mysqlEnum(['low', 'medium', 'high', 'critical']).default('medium').notNull(),
	estimatedImpact: varchar("estimated_impact", { length: 100 }),
	implementationDifficulty: mysqlEnum("implementation_difficulty", ['easy', 'medium', 'hard']).default('medium'),
	status: mysqlEnum(['pending', 'in_progress', 'completed', 'dismissed']).default('pending').notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const seoSitemaps = mysqlTable("seo_sitemaps", {
	id: int().autoincrement().primaryKey(),
	sitemapType: mysqlEnum("sitemap_type", ['xml', 'image', 'video', 'news']).default('xml').notNull(),
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
	id: int().autoincrement().primaryKey(),
	userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
	email: varchar({ length: 320 }).notNull(),
	tokenHash: varchar("token", { length: 64 }).notNull().unique(),
	requestIpHash: varchar("request_ip_hash", { length: 64 }).notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	isUsed: tinyint("is_used").default(0).notNull(),
	usedAt: timestamp("used_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, table => [
	index("email_verification_user_time_idx").on(table.userId, table.createdAt),
	index("email_verification_ip_time_idx").on(table.requestIpHash, table.createdAt),
	index("email_verification_expiry_idx").on(table.expiresAt),
]);

// Setup Wizard Tables
export const businessTemplates = mysqlTable("business_templates", {
	id: int().autoincrement().notNull().primaryKey(),
	business_type: mysqlEnum('business_type', ['store', 'services', 'both']).notNull(),
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
	priceType: mysqlEnum("price_type", ['fixed', 'variable', 'custom']).default('fixed').notNull(),
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
	customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
	customerName: varchar("customer_name", { length: 255 }),
	serviceId: int("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
	staffId: int("staff_id").references(() => staffMembers.id, { onDelete: "set null" }),
	appointmentDate: timestamp("appointment_date", { mode: 'string' }).notNull(),
	startTime: varchar("start_time", { length: 5 }).notNull(), // HH:MM
	endTime: varchar("end_time", { length: 5 }).notNull(), // HH:MM
	status: mysqlEnum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show']).default('pending').notNull(),
	googleEventId: varchar("google_event_id", { length: 255 }),
	calendarSyncState: mysqlEnum("calendar_sync_state", ['none','creating','create_unknown','synced','cancelling','cancel_unknown','cancelled','legacy']).default('none').notNull(),
	calendarIntegrationId: int("calendar_integration_id"),
	calendarTargetId: varchar("calendar_target_id", { length: 255 }),
	calendarIdentityHash: char("calendar_identity_hash", { length: 64 }),
	calendarEventReference: varchar("calendar_event_reference", { length: 40 }),
	calendarReviewRevision: int("calendar_review_revision").default(0).notNull(),
	reminder24hSent: tinyint("reminder_24h_sent").default(0).notNull(),
	reminder1hSent: tinyint("reminder_1h_sent").default(0).notNull(),
	notes: text(),
	cancellationReason: text("cancellation_reason"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, table => [index("idx_appointment_capacity").on(table.merchantId, table.appointmentDate, table.status)]);

export const conversationBookingAgreements = mysqlTable("conversation_booking_agreements", {
  id: int().autoincrement().primaryKey(),
  merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  conversationId: int("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  customerPhone: varchar("customer_phone", { length: 50 }).notNull(), sourceMessageId: int("source_message_id").notNull(),
  consentMessageId: int("consent_message_id"), bookingReference: int("booking_reference"), state: varchar({ length: 20 }).default('proposed').notNull(),
  targetBookingId: int("target_booking_id"), priorAgreementId: int("prior_agreement_id"),
  beforeSnapshot: json("before_snapshot"), beforeHash: char("before_hash", { length: 64 }),
  snapshot: json().notNull(), snapshotHash: char("snapshot_hash", { length: 64 }).notNull(), offerText: text("offer_text").notNull(),
  expiresAt: datetime("expires_at", { mode: 'string', fsp: 3 }).notNull(),
  createdAt: datetime("created_at", { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
}, table => [uniqueIndex("uq_conversation_booking_source").on(table.merchantId,table.sourceMessageId),
  uniqueIndex("uq_conversation_booking_consent").on(table.merchantId,table.consentMessageId),
  index("idx_conversation_booking_result").on(table.merchantId,table.bookingReference,table.id),
  index("idx_conversation_booking_latest").on(table.merchantId,table.conversationId,table.id)]);

export const appointmentCreationRequests = mysqlTable("appointment_creation_requests", {
  id: int().autoincrement().primaryKey(),
  merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  requestId: char("request_id", { length: 36 }).notNull(), actorUserId: int("actor_user_id").notNull(),
  requestHash: char("request_hash", { length: 64 }).notNull(), appointmentReference: int("appointment_reference").notNull(),
  createdAt: datetime("created_at", { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
}, table => [uniqueIndex("uq_appointment_creation_request").on(table.merchantId,table.requestId),
  uniqueIndex("uq_appointment_creation_reference").on(table.merchantId,table.appointmentReference)]);

export const appointmentCalendarReviews = mysqlTable("appointment_calendar_reviews", {
  id: int().autoincrement().primaryKey(), merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  appointmentReference: int("appointment_reference").notNull(), actorUserId: int("actor_user_id").notNull(),
  requestId: char("request_id", { length: 36 }).notNull(), requestHash: char("request_hash", { length: 64 }).notNull(), revision: int().notNull(),
  action: varchar({ length: 30 }).notNull(), eventId: varchar("event_id", { length: 255 }).notNull(), outcome: varchar({ length: 30 }).notNull(),
  failureCode: varchar("failure_code", { length: 40 }), operatorReason: varchar("operator_reason", { length: 500 }).notNull(),
  manualBinding: tinyint("manual_binding").default(0).notNull(), proofHash: char("proof_hash", { length: 64 }).notNull(),
  beforeState: json("before_state").notNull(), afterState: json("after_state").notNull(),
  createdAt: datetime("created_at", { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
}, table => [uniqueIndex("uq_appointment_review_request").on(table.merchantId,table.requestId),
  uniqueIndex("uq_appointment_review_revision").on(table.merchantId,table.appointmentReference,table.revision)]);

export const serviceReviews = mysqlTable("service_reviews", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	serviceId: int("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
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
	customerAgreementId: int("customer_agreement_id"), // Retained even when the original conversation is deleted.
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	serviceId: int("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
	customerName: varchar("customer_name", { length: 255 }),
	customerEmail: varchar("customer_email", { length: 255 }),
	staffId: int("staff_id").references(() => staffMembers.id, { onDelete: "set null" }),
	// Booking Details
	bookingDate: date("booking_date").notNull(),
	startTime: varchar("start_time", { length: 5 }).notNull(), // HH:MM
	endTime: varchar("end_time", { length: 5 }).notNull(), // HH:MM
	durationMinutes: int("duration_minutes").notNull(),
	// Status
	status: mysqlEnum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).default('pending').notNull(),
	paymentStatus: mysqlEnum("payment_status", ['unpaid', 'paid', 'refunded']).default('unpaid').notNull(),
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
	cancelledBy: mysqlEnum("cancelled_by", ['customer', 'merchant', 'system']),
	// Source
	bookingSource: mysqlEnum("booking_source", ['whatsapp', 'website', 'phone', 'walk_in']).default('whatsapp').notNull(),
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
	customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
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
	revision: int().default(0).notNull(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }).unique(),
	currentStep: int("current_step").default(1).notNull(),
	completedSteps: text("completed_steps"), // JSON array [1, 2, 3]
	wizardData: mediumtext("wizard_data"), // bounded JSON draft; see setup wizard router
	isCompleted: tinyint("is_completed").default(0).notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const knowledgeRemovalReceipts = mysqlTable("knowledge_removal_receipts", {
  id: int().autoincrement().primaryKey(),
  merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  actorId: int("actor_id").notNull(),
  requestId: char("request_id", { length: 36 }).notNull(),
  inputHash: char("input_hash", { length: 64 }).notNull(),
  result: json().$type<import('../shared/knowledge-source-removal').KnowledgeRemovalReceipt>().notNull(),
  createdAt: timestamp("created_at", { mode: "string", fsp: 3 }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_knowledge_removal_request").on(table.merchantId, table.requestId)]);

export const virtualTeamSaveReceipts = mysqlTable("virtual_team_save_receipts", {
  id: int().autoincrement().primaryKey(),
  merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  actorId: int("actor_id").notNull(),
  requestId: char("request_id", { length: 36 }).notNull(),
  inputHash: char("input_hash", { length: 64 }).notNull(),
  result: json().$type<import('../shared/virtual-team-save').VirtualTeamSaveReceipt>().notNull(),
  createdAt: timestamp("created_at", { mode: "string", fsp: 3 }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_virtual_team_save_request").on(table.merchantId, table.requestId)]);

export const setupCompletionReceipts = mysqlTable("setup_completion_receipts", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	actorId: int("actor_id").notNull(),
	requestId: char("request_id", { length: 36 }).notNull(),
	inputHash: char("input_hash", { length: 64 }).notNull(),
	result: json().notNull(),
	createdAt: timestamp("created_at", { mode: "string", fsp: 3 }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_setup_completion_request").on(table.merchantId, table.requestId)]);

// Platform Integrations (Zid, Calendly, etc.)
export const platformIntegrations = mysqlTable("platform_integrations", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	platformType: mysqlEnum("platform_type", ['zid', 'calendly', 'shopify', 'woocommerce']).notNull(),
	storeName: varchar("store_name", { length: 255 }),
	storeUrl: varchar("store_url", { length: 500 }),
	accessToken: text("access_token"), // encrypted
	refreshToken: text("refresh_token"), // encrypted
	webhookEndpointId: varchar("webhook_endpoint_id", { length: 48 }),
	webhookAuthHash: varchar("webhook_auth_hash", { length: 64 }),
	webhookSigningSecret: text("webhook_signing_secret"), // encrypted; Calendly per-subscription signing key
	webhookSubscriptionUri: varchar("webhook_subscription_uri", { length: 500 }),
	isActive: tinyint("is_active").default(1).notNull(),
	settings: text(), // JSON settings
	lastSyncAt: timestamp("last_sync_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		uniqueIndex("platform_integrations_webhook_endpoint_unique").on(table.webhookEndpointId),
		uniqueIndex("platform_integrations_merchant_type_unique").on(table.merchantId, table.platformType),
	]);

// Calendly is invitee-scoped: group events can contain multiple invitees, so
// neither the generic appointments table nor the event URI alone is a valid
// identity. Keep the provider projection explicit and tenant-scoped.
export const calendlyAppointments = mysqlTable("calendly_appointments", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	integrationId: int("integration_id").notNull().references(() => platformIntegrations.id, { onDelete: "cascade" }),
	eventUri: varchar("event_uri", { length: 500 }).notNull(),
	inviteeUri: varchar("invitee_uri", { length: 500 }).notNull(),
	eventName: varchar("event_name", { length: 255 }).notNull(),
	customerName: varchar("customer_name", { length: 255 }).notNull(),
	customerEmail: varchar("customer_email", { length: 320 }),
	customerPhone: varchar("customer_phone", { length: 50 }),
	startAt: timestamp("start_at", { mode: 'string' }).notNull(),
	endAt: timestamp("end_at", { mode: 'string' }).notNull(),
	status: mysqlEnum(['active', 'cancelled']).default('active').notNull(),
	location: varchar({ length: 500 }),
	providerUpdatedAt: timestamp("provider_updated_at", { mode: 'string' }).notNull(),
	cancelledAt: timestamp("cancelled_at", { mode: 'string' }),
	notificationSentAt: timestamp("notification_sent_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, table => [
	uniqueIndex("calendly_appointments_invitee_unique").on(table.merchantId, table.inviteeUri),
	index("calendly_appointments_event_idx").on(table.merchantId, table.eventUri),
	index("calendly_appointments_upcoming_idx").on(table.merchantId, table.status, table.startAt),
]);

// Durable, PII-minimized webhook inbox. The signed payload is reduced to
// provider resource URIs plus a digest; the worker fetches canonical data.
export const calendlyWebhookReceipts = mysqlTable("calendly_webhook_receipts", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	integrationId: int("integration_id").notNull().references(() => platformIntegrations.id, { onDelete: "cascade" }),
	eventKey: varchar("event_key", { length: 64 }).notNull(),
	eventType: mysqlEnum("event_type", ['invitee.created', 'invitee.canceled']).notNull(),
	eventUri: varchar("event_uri", { length: 500 }).notNull(),
	inviteeUri: varchar("invitee_uri", { length: 500 }).notNull(),
	signatureTimestamp: int("signature_timestamp").notNull(),
	status: mysqlEnum(['pending', 'processing', 'completed', 'failed', 'manual_review']).default('pending').notNull(),
	attemptCount: int("attempt_count").default(0).notNull(),
	effectApplied: tinyint("effect_applied").default(0).notNull(),
	notificationRequired: tinyint("notification_required").default(0).notNull(),
	processingToken: varchar("processing_token", { length: 64 }),
	availableAt: timestamp("available_at", { mode: 'string' }).defaultNow().notNull(),
	claimedAt: timestamp("claimed_at", { mode: 'string' }),
	processedAt: timestamp("processed_at", { mode: 'string' }),
	lastError: varchar("last_error", { length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, table => [
	uniqueIndex("calendly_webhook_receipts_event_unique").on(table.merchantId, table.eventKey),
	index("calendly_webhook_receipts_dispatch_idx").on(table.status, table.availableAt, table.id),
	index("calendly_webhook_receipts_merchant_idx").on(table.merchantId, table.createdAt),
]);

export const zidOauthStates = mysqlTable("zid_oauth_states", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
	stateHash: varchar("state_hash", { length: 64 }).notNull(),
	sessionHash: varchar("session_hash", { length: 64 }).notNull(),
	connectionRevision: char("connection_revision", { length: 64 }), // Null legacy attempts must restart.
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	consumedAt: timestamp("consumed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, table => [
	uniqueIndex("zid_oauth_states_state_hash_unique").on(table.stateHash),
	uniqueIndex("zid_oauth_states_merchant_user_unique").on(table.merchantId, table.userId),
	index("zid_oauth_states_merchant_active_idx").on(table.merchantId, table.consumedAt, table.expiresAt),
	index("zid_oauth_states_expiry_idx").on(table.expiresAt),
]);

export const sheetsSetupAttempts = mysqlTable("sheets_setup_attempts", {
	id:int().autoincrement().primaryKey(),
	merchantId:int("merchant_id").notNull().references(()=>merchants.id,{onDelete:"cascade"}),
	actorId:int("actor_id").notNull(),requestId:char("request_id",{length:36}).notNull(),
	inputHash:char("input_hash",{length:64}).notNull(),sourceHash:char("source_hash",{length:64}).notNull(),executionHash:char("execution_hash",{length:64}).notNull(),
	state:varchar({length:20}).notNull(),spreadsheetId:varchar("spreadsheet_id",{length:255}),receipt:json(),receiptHash:char("receipt_hash",{length:64}),failureCode:varchar("failure_code",{length:24}),
	createdAt:timestamp("created_at",{mode:"string",fsp:3}).defaultNow().notNull(),leaseUntil:timestamp("lease_until",{mode:"string",fsp:3}).notNull(),finishedAt:timestamp("finished_at",{mode:"string",fsp:3}),reviewedAt:timestamp("reviewed_at",{mode:"string",fsp:3}),
},table=>[uniqueIndex("uq_sheets_setup_request").on(table.merchantId,table.requestId),index("idx_sheets_setup_open").on(table.merchantId,table.state,table.id)]);

export const sheetsOauthStates = mysqlTable("sheets_oauth_states", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
	stateHash: char("state_hash", { length: 64 }).notNull(),
	sessionHash: char("session_hash", { length: 64 }).notNull(),
	sourceHash: char("source_hash", { length: 64 }).notNull(),
	expiresAt: timestamp("expires_at", { mode: "string" }).notNull(),
	consumedAt: timestamp("consumed_at", { mode: "string" }),
	createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, table => [
	uniqueIndex("uq_sheets_oauth_state").on(table.stateHash),
	uniqueIndex("uq_sheets_oauth_merchant_user").on(table.merchantId, table.userId),
]);

export const calendarOauthStates = mysqlTable("calendar_oauth_states", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
	stateHash: char("state_hash", { length: 64 }).notNull(),
	sessionHash: char("session_hash", { length: 64 }).notNull(),
	sourceHash: char("source_hash", { length: 64 }).notNull(),
	expiresAt: timestamp("expires_at", { mode: "string" }).notNull(),
	consumedAt: timestamp("consumed_at", { mode: "string" }),
	createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, table => [
	uniqueIndex("uq_calendar_oauth_state").on(table.stateHash),
	uniqueIndex("uq_calendar_oauth_merchant_user").on(table.merchantId, table.userId),
]);

export const googleIntegrations = mysqlTable("google_integrations", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	integrationType: mysqlEnum("integration_type", ['calendar', 'sheets']).notNull(),
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
}, table => [
	uniqueIndex("zid_settings_merchant_unique").on(table.merchantId),
]);

export const zidSyncLogs = mysqlTable("zid_sync_logs", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),

	// Sync Info
	syncType: mysqlEnum("sync_type", ['products', 'orders', 'customers', 'inventory']).notNull(),
	status: mysqlEnum(['pending', 'in_progress', 'completed', 'failed']).default('pending').notNull(),

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

// ═══════════════════════════════════════════════════════════════
// Multi-User RBAC — Team Members & Invitations
// ═══════════════════════════════════════════════════════════════

/**
 * merchant_members — Links users to merchants with role-based access.
 * Replaces the 1:1 users→merchants relationship with M:N.
 * A user can be a member of multiple merchants (e.g., accountant managing 3 stores).
 */
export const merchantMembers = mysqlTable("merchant_members", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
	role: mysqlEnum(['owner', 'manager', 'sales_supervisor', 'viewer']).notNull().default('viewer'),
	invitedBy: int("invited_by"),
	invitedAt: timestamp("invited_at", { mode: 'string' }).defaultNow().notNull(),
	acceptedAt: timestamp("accepted_at", { mode: 'string' }),
	isActive: tinyint("is_active").default(1).notNull(),
}, (table) => [
	index("idx_member_merchant").on(table.merchantId),
	index("idx_member_user").on(table.userId),
	uniqueIndex("merchant_members_identity_unique").on(table.merchantId, table.userId),
]);

/**
 * merchant_invitations — Pending invitations sent by email.
 * Token-based: invited user clicks link → registers/logs in → auto-joins merchant.
 */
export const merchantInvitations = mysqlTable("merchant_invitations", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	email: varchar({ length: 320 }).notNull(),
	role: mysqlEnum(['manager', 'sales_supervisor', 'viewer']).notNull().default('viewer'),
	token: varchar({ length: 64 }).notNull(),
	recipientHash: varchar("recipient_hash", { length: 64 }),
	invitedBy: int("invited_by").notNull(),
	acceptedByUserId: int("accepted_by_user_id").references(() => users.id, { onDelete: "set null" }),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	acceptedAt: timestamp("accepted_at", { mode: 'string' }),
	status: mysqlEnum(['pending', 'accepted', 'expired', 'revoked']).default('pending').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_invitation_merchant").on(table.merchantId),
	uniqueIndex("merchant_invitations_token_unique").on(table.token),
	uniqueIndex("merchant_invitations_pending_recipient_unique").on(table.merchantId, table.recipientHash),
]);

// Type definitions
export type User = InferSelectModel<typeof users>;
export type InsertUser = InferInsertModel<typeof users>;
export type Merchant = InferSelectModel<typeof merchants>;
export type InsertMerchant = InferInsertModel<typeof merchants>;
export type Plan = InferSelectModel<typeof plans>;
export type InsertPlan = InferInsertModel<typeof plans>;
export type Subscription = InferSelectModel<typeof subscriptions>;
export type InsertSubscription = InferInsertModel<typeof subscriptions>;
export type MerchantMember = InferSelectModel<typeof merchantMembers>;
export type InsertMerchantMember = InferInsertModel<typeof merchantMembers>;
export type MerchantInvitation = InferSelectModel<typeof merchantInvitations>;
export type InsertMerchantInvitation = InferInsertModel<typeof merchantInvitations>;
export type WhatsAppConnection = InferSelectModel<typeof whatsappConnections>;
export type InsertWhatsAppConnection = InferInsertModel<typeof whatsappConnections>;
export type WhatsAppConnectionRequest = InferSelectModel<typeof whatsappConnectionRequests>;
export type InsertWhatsAppConnectionRequest = InferInsertModel<typeof whatsappConnectionRequests>;
export type Product = InferSelectModel<typeof products>;
export type InsertProduct = InferInsertModel<typeof products>;
export type ProductCategory = InferSelectModel<typeof productCategories>;
export type InsertProductCategory = InferInsertModel<typeof productCategories>;
export type ProductOption = InferSelectModel<typeof productOptions>;
export type InsertProductOption = InferInsertModel<typeof productOptions>;
export type ProductVariant = InferSelectModel<typeof productVariants>;
export type InsertProductVariant = InferInsertModel<typeof productVariants>;
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
export type Invoice = InferSelectModel<typeof invoices>;
export type InsertInvoice = InferInsertModel<typeof invoices>;
export type SallaConnection = InferSelectModel<typeof sallaConnections>;
export type InsertSallaConnection = InferInsertModel<typeof sallaConnections>;
export type SallaWebhookReceipt = InferSelectModel<typeof sallaWebhookReceipts>;
export type InsertSallaWebhookReceipt = InferInsertModel<typeof sallaWebhookReceipts>;
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
// seoRankingHistory table not yet defined
// export type SeoRanking = InferSelectModel<typeof seoRankingHistory>;
// export type InsertSeoRanking = InferInsertModel<typeof seoRankingHistory>;
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
export type CalendlyAppointment = InferSelectModel<typeof calendlyAppointments>;
export type InsertCalendlyAppointment = InferInsertModel<typeof calendlyAppointments>;
export type CalendlyWebhookReceipt = InferSelectModel<typeof calendlyWebhookReceipts>;
export type InsertCalendlyWebhookReceipt = InferInsertModel<typeof calendlyWebhookReceipts>;

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
	customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
	customerName: varchar("customer_name", { length: 255 }),
	customerEmail: varchar("customer_email", { length: 255 }),

	// معلومات الدفع
	amount: int().notNull(), // بالهللات (cents)
	currency: varchar({ length: 3 }).default('SAR').notNull(),

	// Tap Payments Integration
	tapChargeId: varchar("tap_charge_id", { length: 255 }), // معرف المعاملة من Tap
	tapPaymentUrl: text("tap_payment_url"), // رابط الدفع

	// حالة الدفع
	status: mysqlEnum(['pending', 'authorized', 'captured', 'failed', 'cancelled', 'refunded']).default('pending').notNull(),
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
	lastWebhookStatus: varchar("last_webhook_status", { length: 32 }),
	errorMessage: text("error_message"),
	errorCode: varchar("error_code", { length: 50 }),

	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		uniqueIndex("order_payments_tap_charge_id_unique").on(table.tapChargeId),
		index("order_payments_merchant_id_idx").on(table.merchantId),
		index("order_payments_order_id_idx").on(table.orderId),
		index("order_payments_booking_id_idx").on(table.bookingId),
	]);

// جدول روابط الدفع السريعة
export const paymentLinks = mysqlTable("payment_links", {
	bookingCheckoutPolicyVersion: int('booking_checkout_policy_version').notNull().default(0),
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
	status: mysqlEnum(['active', 'expired', 'disabled', 'completed']).default('active').notNull(),
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
		uniqueIndex("payment_links_link_id_unique").on(table.linkId),
		uniqueIndex("payment_links_order_id_unique").on(table.orderId),
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
	status: mysqlEnum(['pending', 'completed', 'failed']).default('pending').notNull(),

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
	id: int().autoincrement().primaryKey(),
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
	id: int().autoincrement().primaryKey(),
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
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
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
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
	type: mysqlEnum(['earn', 'redeem', 'expire', 'adjustment']).notNull(),
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
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	title: varchar({ length: 255 }).notNull(),
	titleAr: varchar("title_ar", { length: 255 }).notNull(),
	description: text(),
	descriptionAr: text("description_ar"),
	type: mysqlEnum(['discount', 'free_product', 'free_shipping', 'gift']).notNull(),
	pointsCost: int("points_cost").notNull(), // كم نقطة مطلوبة للحصول على المكافأة
	discountAmount: int("discount_amount"), // قيمة الخصم (بالريال أو نسبة مئوية)
	discountType: mysqlEnum(['fixed', 'percentage']), // نوع الخصم
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
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
	customerName: varchar("customer_name", { length: 255 }),
	rewardId: int("reward_id").notNull().references(() => loyaltyRewards.id, { onDelete: "cascade" }),
	pointsSpent: int("points_spent").notNull(),
	status: mysqlEnum(['pending', 'approved', 'used', 'cancelled', 'expired']).default('pending').notNull(),
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
	id: int().autoincrement().primaryKey(),
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

	// Scraped content — ALL text from all crawled pages, used by AI bot as knowledge base
	scrapedContent: text("scraped_content"),

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
	id: int().autoincrement().primaryKey(),
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
	id: int().autoincrement().primaryKey(),
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
	id: int().autoincrement().primaryKey(),
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
	id: int().autoincrement().primaryKey(),
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
	id: int().autoincrement().primaryKey(),
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
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	pageId: int("page_id").references(() => discoveredPages.id, { onDelete: "set null" }), // Source page
	externalId: varchar("external_id", { length: 100 }),
	syncSource: mysqlEnum("sync_source", ['extracted', 'api']).default('extracted').notNull(),
	sourceStatus: mysqlEnum("source_status", ['active', 'archived']).default('active').notNull(),

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
		uniqueIndex("uq_extracted_faq_source").on(table.merchantId, table.syncSource, table.externalId),
		index("extracted_faqs_merchant_id_idx").on(table.merchantId),
		index("extracted_faqs_category_idx").on(table.category),
		index("extracted_faqs_page_id_idx").on(table.pageId),
		index("idx_extracted_faq_bot").on(table.merchantId, table.sourceStatus, table.isActive, table.useInBot, table.id),
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

	zidStoreId: varchar("zid_store_id", { length: 20 }).notNull().default(''),
	trackInventory: tinyint("track_inventory").notNull().default(1),
	hasVariants: tinyint("has_variants").notNull().default(0),
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
	lastSyncedAt: timestamp("last_synced_at", { mode: 'string', fsp: 3 }),
	zidData: text("zid_data"), // Full JSON response from Zid API

	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', fsp: 3 }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		index("zid_products_merchant_id_idx").on(table.merchantId),
		index("zid_products_zid_product_id_idx").on(table.zidProductId),
		uniqueIndex("zid_products_merchant_store_product_unique").on(table.merchantId, table.zidStoreId, table.zidProductId),
		index("zid_products_sari_product_id_idx").on(table.sariProductId),
	]);

export const zidOrders = mysqlTable("zid_orders", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),

	// Zid Order Info
	zidStoreId: varchar("zid_store_id", { length: 20 }).default('').notNull(), // Empty only for unassigned historical rows.
	zidOrderId: varchar("zid_order_id", { length: 255 }).notNull(),
	zidOrderNumber: varchar("zid_order_number", { length: 255 }),

	// Customer Info
	customerName: varchar("customer_name", { length: 255 }),
	customerEmail: varchar("customer_email", { length: 255 }),
	customerPhone: varchar("customer_phone", { length: 50 }),

	// Order Details
	totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
	currency: varchar({ length: 3 }).default('SAR').notNull(),
	status: mysqlEnum(['pending', 'processing', 'completed', 'cancelled', 'refunded']).default('pending').notNull(),
	paymentStatus: mysqlEnum("payment_status", ['pending', 'paid', 'failed', 'refunded']).default('pending').notNull(),
	projectionStatus: mysqlEnum("projection_status", ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']).default('pending').notNull(),

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
	lastSyncedAt: timestamp("last_synced_at", { mode: 'string', fsp: 3 }),
	zidData: text("zid_data"), // Full JSON response from Zid API

	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		index("zid_orders_merchant_id_idx").on(table.merchantId),
		index("zid_orders_zid_order_id_idx").on(table.zidOrderId),
		uniqueIndex("zid_orders_merchant_store_order_unique").on(table.merchantId, table.zidStoreId, table.zidOrderId),
		index("zid_orders_sari_order_id_idx").on(table.sariOrderId),
		index("zid_orders_customer_phone_idx").on(table.customerPhone),
	]);

// Durable, PII-minimized merchant alerts for newly accepted Zid orders.
// Recipient and message content are resolved just-in-time and never stored here.
export const zidOrderNotificationOutbox = mysqlTable("zid_order_notification_outbox", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	zidOrderId: varchar("zid_order_id", { length: 255 }).notNull(),
	zidStoreId: varchar("zid_store_id", { length: 20 }).default('').notNull(),
	eventKey: varchar("event_key", { length: 64 }).notNull(),
	status: mysqlEnum(['pending', 'processing', 'delivered', 'failed', 'suppressed', 'manual_review']).default('pending').notNull(),
	attempts: int().default(0).notNull(),
	availableAt: timestamp("available_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	claimedAt: timestamp("claimed_at", { mode: 'string', fsp: 3 }),
	deliveredAt: timestamp("delivered_at", { mode: 'string', fsp: 3 }),
	lastError: varchar("last_error", { length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', fsp: 3 }).defaultNow().onUpdateNow().notNull(),
}, table => [
	uniqueIndex("zid_order_notification_event_unique").on(table.eventKey),
	index("idx_zid_order_notification_dispatch").on(table.status, table.availableAt, table.id),
	index("idx_zid_order_notification_order").on(table.merchantId, table.zidOrderId),
]);

export const zidCustomers = mysqlTable("zid_customers", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	zidCustomerId: varchar("zid_customer_id", { length: 255 }).notNull(),
	name: varchar({ length: 255 }),
	email: varchar({ length: 320 }),
	phone: varchar({ length: 50 }),
	totalOrders: int("total_orders").default(0).notNull(),
	totalSpent: decimal("total_spent", { precision: 12, scale: 2 }).default('0').notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	lastOrderAt: timestamp("last_order_at", { mode: 'string' }),
	lastSyncedAt: timestamp("last_synced_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		index("zid_customers_merchant_id_idx").on(table.merchantId),
		uniqueIndex("zid_customers_merchant_customer_unique").on(table.merchantId, table.zidCustomerId),
		index("zid_customers_merchant_phone_idx").on(table.merchantId, table.phone),
	]);

export const zidWebhooks = mysqlTable("zid_webhooks", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),

	// Webhook Info
	webhookId: varchar("webhook_id", { length: 255 }),
	eventType: varchar("event_type", { length: 100 }).notNull(), // order.created, product.updated, etc.

	// Payload
	payload: text().notNull(), // Legacy payloads; new receipts store only a minimized envelope
	payloadHash: varchar("payload_hash", { length: 64 }),

	// Processing
	status: mysqlEnum(['pending', 'processed', 'failed']).default('pending').notNull(),
	attemptCount: int("attempt_count").default(0).notNull(),
	claimedAt: timestamp("claimed_at", { mode: 'string' }),
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
		uniqueIndex("zid_webhooks_merchant_payload_unique").on(table.merchantId, table.payloadHash),
	]);

// Type exports for Zid tables
export type ZidProduct = InferSelectModel<typeof zidProducts>;
export type NewZidProduct = InferInsertModel<typeof zidProducts>;
export type ZidOrder = InferSelectModel<typeof zidOrders>;
export type NewZidOrder = InferInsertModel<typeof zidOrders>;
export type ZidCustomer = InferSelectModel<typeof zidCustomers>;
export type NewZidCustomer = InferInsertModel<typeof zidCustomers>;
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
	webhookEndpointId: varchar("webhook_endpoint_id", { length: 48 }),
	webhookSigningSecret: text("webhook_signing_secret"), // encrypted

	// Status
	isActive: tinyint("is_active").default(1).notNull(),
	lastSyncAt: timestamp("last_sync_at", { mode: 'string' }),
	lastTestAt: timestamp("last_test_at", { mode: 'string' }),
	connectionStatus: mysqlEnum(['connected', 'disconnected', 'error']).default('disconnected').notNull(),

	// Sync Settings
	autoSyncProducts: tinyint("auto_sync_products").default(0).notNull(),
	autoSyncOrders: tinyint("auto_sync_orders").default(0).notNull(),
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
		uniqueIndex("woocommerce_settings_webhook_endpoint_unique").on(table.webhookEndpointId),
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
	stockStatus: mysqlEnum("stock_status", ['instock', 'outofstock', 'onbackorder']).default('instock').notNull(),
	stockQuantity: int("stock_quantity"),
	manageStock: tinyint("manage_stock").default(0).notNull(),

	// Details
	description: text(),
	shortDescription: text("short_description"),
	imageUrl: varchar("image_url", { length: 1000 }),
	categories: text(), // JSON array of category IDs

	// Sync
	lastSyncAt: timestamp("last_sync_at", { mode: 'string' }).defaultNow().notNull(),
	providerUpdatedAt: timestamp("provider_updated_at", { mode: 'string', fsp: 3 }),
	syncStatus: mysqlEnum("sync_status", ['synced', 'pending', 'error']).default('synced').notNull(),

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
	providerUpdatedAt: timestamp("provider_updated_at", { mode: 'string', fsp: 3 }),
	syncStatus: mysqlEnum("sync_status", ['synced', 'pending', 'error']).default('synced').notNull(),

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
	syncType: mysqlEnum("sync_type", ['products', 'orders', 'customers', 'manual']).notNull(),
	direction: mysqlEnum(['import', 'export', 'bidirectional']).notNull(),

	// Results
	status: mysqlEnum(['running', 'success', 'partial', 'failed']).notNull(),
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
	status: mysqlEnum(['pending', 'processed', 'failed']).default('pending').notNull(),
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

// Provider-side webhook identities. Keeping the remote webhook ID beside its
// exact topic prevents a valid signature from being replayed under a different
// registered topic after a connection rotation.
export const woocommerceWebhookRegistrations = mysqlTable("woocommerce_webhook_registrations", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	topic: mysqlEnum(['product.created', 'product.updated', 'product.deleted', 'order.created', 'order.updated', 'order.deleted']).notNull(),
	webhookId: varchar("webhook_id", { length: 32 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, table => [
	uniqueIndex("woocommerce_webhook_registrations_topic_unique").on(table.merchantId, table.topic),
	uniqueIndex("woocommerce_webhook_registrations_remote_unique").on(table.merchantId, table.webhookId),
]);

// Durable PII-minimized inbox. Only provider identity is retained; the worker
// fetches the current canonical resource through the authenticated REST API.
export const woocommerceWebhookReceipts = mysqlTable("woocommerce_webhook_receipts", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	deliveryId: varchar("delivery_id", { length: 32 }).notNull(),
	webhookId: varchar("webhook_id", { length: 32 }).notNull(),
	topic: mysqlEnum(['product.created', 'product.updated', 'product.deleted', 'order.created', 'order.updated', 'order.deleted']).notNull(),
	resourceId: int("resource_id").notNull(),
	status: mysqlEnum(['pending', 'processing', 'completed', 'failed', 'manual_review', 'suppressed']).default('pending').notNull(),
	attemptCount: int("attempt_count").default(0).notNull(),
	processingToken: varchar("processing_token", { length: 64 }),
	availableAt: timestamp("available_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	claimedAt: timestamp("claimed_at", { mode: 'string', fsp: 3 }),
	processedAt: timestamp("processed_at", { mode: 'string', fsp: 3 }),
	lastError: varchar("last_error", { length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', fsp: 3 }).defaultNow().onUpdateNow().notNull(),
}, table => [
	uniqueIndex("woocommerce_webhook_receipts_delivery_unique").on(table.merchantId, table.deliveryId),
	index("woocommerce_webhook_receipts_dispatch_idx").on(table.status, table.availableAt, table.id),
	index("woocommerce_webhook_receipts_merchant_idx").on(table.merchantId, table.createdAt),
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
export type WooCommerceWebhookRegistration = InferSelectModel<typeof woocommerceWebhookRegistrations>;
export type NewWooCommerceWebhookRegistration = InferInsertModel<typeof woocommerceWebhookRegistrations>;
export type WooCommerceWebhookReceipt = InferSelectModel<typeof woocommerceWebhookReceipts>;
export type NewWooCommerceWebhookReceipt = InferInsertModel<typeof woocommerceWebhookReceipts>;
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
export * from "./schema_monitor";
export * from "./schema_zahypi_connector";

// ============================================
// Tables that were previously created at runtime.
// They are registered here for schema visibility, type-safety, and tracked migrations.
// ============================================

// --- AI Directives (Training Center) ---
export const sariAiDirectives = mysqlTable("sari_ai_directives", {
	id: int().autoincrement().primaryKey(),
	category: mysqlEnum(['sales', 'culture', 'persuasion', 'examples', 'limits']).notNull(),
	title: varchar({ length: 200 }).notNull(),
	content: text().notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	priority: int().default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	index("idx_active").on(table.isActive, table.category, table.priority),
]);

// --- Strategy Metrics (Sales Arsenal Tracking) ---
export const sariStrategyMetrics = mysqlTable("sari_strategy_metrics", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	strategy: varchar({ length: 50 }).notNull(),
	wasUsed: tinyint("was_used").default(1).notNull(),
	ledToPurchase: tinyint("led_to_purchase").default(0).notNull(),
	conversationId: int("conversation_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_merchant_strategy").on(table.merchantId, table.strategy),
	index("idx_created").on(table.createdAt),
]);

// --- Quality Metrics (Response Quality Tracking) ---
export const sariQualityMetrics = mysqlTable("sari_quality_metrics", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	conversationId: int("conversation_id"),
	questionText: text("question_text").notNull(),
	responseText: text("response_text").notNull(),
	responseTimeMs: int("response_time_ms").default(0).notNull(),
	wasCacheHit: tinyint("was_cache_hit").default(0).notNull(),
	ragSectionsUsed: int("rag_sections_used").default(0).notNull(),
	customerSentiment: varchar("customer_sentiment", { length: 20 }),
	feedbackRating: tinyint("feedback_rating"),
	wasEmpty: tinyint("was_empty").default(0).notNull(),
	wasEscalated: tinyint("was_escalated").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_merchant_date").on(table.merchantId, table.createdAt),
	index("idx_merchant_empty").on(table.merchantId, table.wasEmpty),
	index("idx_merchant_sentiment").on(table.merchantId, table.customerSentiment),
]);

// --- Weekly Reports (Quality Aggregation) ---
export const sariWeeklyReports = mysqlTable("sari_weekly_reports", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	weekStart: date("week_start", { mode: 'string' }).notNull(),
	weekEnd: date("week_end", { mode: 'string' }).notNull(),
	totalMessages: int("total_messages").default(0).notNull(),
	totalResponses: int("total_responses").default(0).notNull(),
	avgResponseTimeMs: int("avg_response_time_ms").default(0).notNull(),
	cacheHitRate: decimal("cache_hit_rate", { precision: 5, scale: 2 }).default('0').notNull(),
	emptyResponseRate: decimal("empty_response_rate", { precision: 5, scale: 2 }).default('0').notNull(),
	avgSentimentScore: decimal("avg_sentiment_score", { precision: 3, scale: 2 }).default('0').notNull(),
	topQuestions: text("top_questions"), // JSON
	escalationRate: decimal("escalation_rate", { precision: 5, scale: 2 }).default('0').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_merchant_week").on(table.merchantId, table.weekStart),
]);

// --- Customer Profiles (Customer Intelligence) ---
export const customerProfiles = mysqlTable("customer_profiles", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
	displayName: varchar("display_name", { length: 100 }),
	nickname: varchar({ length: 100 }),
	childName: varchar("child_name", { length: 100 }),
	preferences: text(), // JSON
	painPoints: text("pain_points"), // JSON
	purchaseHistory: text("purchase_history"), // JSON
	totalSpent: decimal("total_spent", { precision: 12, scale: 2 }).default('0').notNull(),
	totalConversations: int("total_conversations").default(0).notNull(),
	sentimentAvg: varchar("sentiment_avg", { length: 20 }).default('neutral'),
	customerTier: varchar("customer_tier", { length: 20 }).default('new'),
	lastObjection: varchar("last_objection", { length: 50 }),
	memoryVersion: int("memory_version").notNull().default(0),
	lastEnrichedMessageId: int("last_enriched_message_id"),
	memoryForgetBeforeMessageId: int('memory_forget_before_message_id').default(0).notNull(),
	verifiedPurchaseCount: int("verified_purchase_count").notNull().default(0),
	verifiedSpendByCurrency: text("verified_spend_by_currency"),
	lastSeenAt: timestamp("last_seen_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	uniqueIndex("uq_merchant_phone").on(table.merchantId, table.customerPhone),
	index("idx_tier").on(table.merchantId, table.customerTier),
	index("idx_last_seen").on(table.merchantId, table.lastSeenAt),
]);

export const customerMemoryFacts = mysqlTable('customer_memory_facts', {
	id: int().autoincrement().primaryKey(),
	profileId: int('profile_id').notNull().references(() => customerProfiles.id, { onDelete: 'cascade' }),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	fieldKey: varchar('field_key', { length: 40 }).notNull(),
	valueJson: json('value_json'),
	sourceKind: mysqlEnum('source_kind', ['explicit', 'inferred']).notNull(),
	sourceMessageId: int('source_message_id').notNull(),
	conversationId: int('conversation_id').notNull(),
	observedAt: datetime('observed_at', { mode: 'string', fsp: 3 }).notNull(),
	expiresAt: datetime('expires_at', { mode: 'string', fsp: 3 }).notNull(),
	deleted: tinyint().default(0).notNull(),
	revision: int().default(1).notNull(),
	updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
}, table => [uniqueIndex('uq_memory_profile_field').on(table.profileId, table.fieldKey), index('idx_memory_merchant').on(table.merchantId, table.profileId)]);

// --- Knowledge Sections (Hierarchical Content Engine) ---
export const knowledgeSections = mysqlTable("knowledge_sections", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	parentId: int("parent_id"),
	sectionType: mysqlEnum("section_type", [
		'identity', 'services', 'policies', 'faq', 'contact',
		'team', 'achievements', 'sales_intel', 'opportunities', 'custom'
	]).notNull(),
	title: varchar({ length: 500 }).notNull(),
	content: text().notNull(),
	summary: varchar({ length: 1000 }),
	source: mysqlEnum(['website', 'document', 'manual', 'ai_evolved', 'byaan_sync']).notNull(),
	sourceUrl: varchar("source_url", { length: 2000 }),
	confidence: decimal({ precision: 3, scale: 2 }).default('0.90'),
	status: mysqlEnum(['auto_approved', 'approved', 'pending_review']).default('auto_approved'),
	useInBot: tinyint("use_in_bot").default(1).notNull(),
	injectAs: mysqlEnum("inject_as", ['fact', 'behavior', 'none']).default('fact'),
	sortOrder: int("sort_order").default(0).notNull(),
	merchantEdited: tinyint("merchant_edited").default(0).notNull(),
	embedding: text(), // BLOB in DB, text placeholder in schema
	embeddingContentHash: varchar("embedding_content_hash", { length: 64 }),
	validUntil: datetime("valid_until", { mode: "string", fsp: 3 }),
	provenance: json("provenance"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	index("idx_merchant_type").on(table.merchantId, table.sectionType),
	index("idx_parent").on(table.parentId),
	index("idx_merchant_status").on(table.merchantId, table.status),
	index("idx_merchant_bot").on(table.merchantId, table.useInBot, table.injectAs),
]);

// --- Knowledge Changelog (Evolution History) ---
export const knowledgeChangelog = mysqlTable("knowledge_changelog", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	sectionId: int("section_id"),
	action: mysqlEnum(['add', 'merge', 'evolve', 'conflict', 'delete', 'manual_edit']).notNull(),
	reason: text(),
	oldContent: text("old_content"),
	newContent: text("new_content"),
	source: varchar({ length: 50 }),
	resolved: tinyint().default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_merchant").on(table.merchantId, table.createdAt),
	index("idx_unresolved").on(table.merchantId, table.resolved, table.action),
]);

// --- Response Cache (Smart Caching) ---
export const sariResponseCache = mysqlTable("sari_response_cache", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	questionText: text("question_text").notNull(),
	questionEmbedding: text("question_embedding"), // BLOB placeholder
	responseText: text("response_text").notNull(),
	hitCount: int("hit_count").default(0).notNull(),
	isValid: tinyint("is_valid").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	lastUsedAt: timestamp("last_used_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_merchant_valid").on(table.merchantId, table.isValid),
]);

// --- Sales Quotations ---
export const aiSalesSectorSettings = mysqlTable('ai_sales_sector_settings', {
	merchantId: int('merchant_id').primaryKey().references(() => merchants.id, { onDelete: 'cascade' }),
	playbookId: varchar('playbook_id', { length: 64 }).notNull(),
	revision: int('revision').default(1).notNull(),
	updatedBy: int('updated_by').notNull(),
	updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
});

export const salesQuotations = mysqlTable("sales_quotations", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 50 }),
	customerName: varchar("customer_name", { length: 255 }),
	quotationNumber: varchar("quotation_number", { length: 50 }).notNull(),
	items: text().notNull(), // JSON
	subtotal: decimal({ precision: 10, scale: 2 }).notNull(),
	taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).default('0').notNull(),
	taxBasisPoints: int('tax_basis_points'),
	total: decimal({ precision: 10, scale: 2 }).notNull(),
	currency: varchar({ length: 3 }).default('SAR').notNull(),
	status: mysqlEnum(['sent', 'viewed', 'accepted', 'rejected', 'expired', 'draft']).default('sent').notNull(),
	validUntil: date("valid_until", { mode: 'string' }),
	pdfUrl: varchar("pdf_url", { length: 500 }),
	conversationId: int("conversation_id"),
	sourceMessageId: int("source_message_id"),
	consentMessageId: int("consent_message_id"),
	checkoutSnapshot: json("checkout_snapshot"),
	externalProvider: varchar("external_provider", { length: 20 }),
	externalSnapshot: json("external_snapshot"),
	executionState: mysqlEnum("execution_state", ['ready', 'processing', 'succeeded', 'unknown']),
	externalResult: json("external_result"),
	executionAttemptId: varchar("execution_attempt_id", { length: 36 }),
	executionStartedAt: datetime("execution_started_at", { mode: 'string', fsp: 3 }),
	externalOrderKey: varchar("external_order_key", { length: 140 }),
	externalReconciliation: json("external_reconciliation"),
	projectionPending: tinyint("projection_pending").default(0).notNull(),
	offerVersion: int("offer_version").default(1).notNull(),
	offerExpiresAt: datetime("offer_expires_at", { mode: 'string', fsp: 3 }),
	orderId: int("order_id").references(() => orders.id, { onDelete: 'set null' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_merchant").on(table.merchantId, table.createdAt),
	index("idx_status").on(table.merchantId, table.status),
	uniqueIndex("uq_quote_source").on(table.merchantId, table.sourceMessageId),
	uniqueIndex("uq_quote_consent").on(table.merchantId, table.consentMessageId),
	uniqueIndex("uq_quote_order").on(table.orderId),
	uniqueIndex("uq_quote_external_order").on(table.merchantId, table.externalProvider, table.externalOrderKey),
	index("idx_quote_reconciliation").on(table.merchantId, table.externalProvider, table.executionState, table.id),
	index("idx_quote_conversation").on(table.merchantId, table.conversationId, table.id),
]);

// --- Sales Targets ---
export const salesTargets = mysqlTable("sales_targets", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	periodType: mysqlEnum("period_type", ['monthly', 'quarterly', 'yearly']).default('monthly').notNull(),
	periodStart: date("period_start", { mode: 'string' }).notNull(),
	periodEnd: date("period_end", { mode: 'string' }).notNull(),
	targetAmount: decimal("target_amount", { precision: 12, scale: 2 }).notNull(),
	achievedAmount: decimal("achieved_amount", { precision: 12, scale: 2 }).default('0').notNull(),
	quotationsSent: int("quotations_sent").default(0).notNull(),
	quotationsWon: int("quotations_won").default(0).notNull(),
	revision: int('revision').default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_merchant_period").on(table.merchantId, table.periodType, table.periodStart),
]);

// --- Quotation Templates ---
export const quotationActionReceipts = mysqlTable('quotation_action_receipts', {
	id: int().autoincrement().primaryKey(),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	requestId: char('request_id', { length: 36 }).notNull(),
	action: mysqlEnum('action', ['create', 'status', 'target']).notNull(),
	inputHash: char('input_hash', { length: 64 }).notNull(),
	actorId: int('actor_id').notNull(),
	result: json('result').notNull(),
	createdAt: timestamp('created_at', { mode: 'string', fsp: 3 }).defaultNow().notNull(),
}, table => [uniqueIndex('uq_quotation_action_request').on(table.merchantId, table.requestId)]);

export const quotationDeliveryReviews = mysqlTable('quotation_delivery_reviews', {
	id: int().autoincrement().primaryKey(),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	quotationId: int('quotation_id').notNull(),
	actorId: int('actor_id').notNull(),
	requestId: char('request_id', { length: 36 }).notNull(),
	inputHash: char('input_hash', { length: 64 }).notNull(),
	snapshotHash: char('snapshot_hash', { length: 64 }).notNull(),
	snapshot: json('snapshot').notNull(),
	createdAt: timestamp('created_at', { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	expiresAt: datetime('expires_at', { mode: 'string', fsp: 3 }).notNull(),
}, table => [uniqueIndex('uq_quotation_review_request').on(table.merchantId, table.requestId),
	index('idx_quotation_review_quote').on(table.merchantId, table.quotationId, table.id)]);

export const quotationDeliveries = mysqlTable('quotation_deliveries', {
	id: int().autoincrement().primaryKey(),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	quotationId: int('quotation_id').notNull(),
	reviewId: int('review_id').notNull(),
	actorId: int('actor_id').notNull(),
	requestId: char('request_id', { length: 36 }).notNull(),
	inputHash: char('input_hash', { length: 64 }).notNull(),
	state: mysqlEnum('state', ['preparing','ready','dispatching']).notNull().default('preparing'),
	pdfUrl: text('pdf_url'),
	prepareToken: char('prepare_token', { length: 36 }),
	prepareUntil: datetime('prepare_until', { mode: 'string', fsp: 3 }),
	prepareError: varchar('prepare_error', { length: 50 }),
	dispatchStartedAt: datetime('dispatch_started_at', { mode: 'string', fsp: 3 }),
	projection: mysqlEnum('projection', ['pending','recorded','quote_changed']).notNull().default('pending'),
	activeQuotationId: int('active_quotation_id').generatedAlwaysAs(sql`CASE WHEN \`state\` = 'dispatching' THEN \`quotation_id\` ELSE NULL END`, { mode: 'virtual' }),
	createdAt: timestamp('created_at', { mode: 'string', fsp: 3 }).defaultNow().notNull(),
}, table => [uniqueIndex('uq_quotation_delivery_request').on(table.merchantId,table.requestId),
	uniqueIndex('uq_quotation_delivery_review').on(table.merchantId,table.reviewId),
	uniqueIndex('uq_quotation_delivery_once').on(table.merchantId,table.activeQuotationId),
	index('idx_quotation_delivery_quote').on(table.merchantId,table.quotationId,table.id)]);

export const quotationTemplateReceipts = mysqlTable('quotation_template_receipts', {
	id: int().autoincrement().primaryKey(),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	actorId: int('actor_id').notNull(),
	requestId: char('request_id', { length: 36 }).notNull(),
	action: mysqlEnum('action', ['create','update','delete']).notNull(),
	inputHash: char('input_hash', { length: 64 }).notNull(),
	result: json('result').notNull(),
	createdAt: timestamp('created_at', { mode: 'string', fsp: 3 }).defaultNow().notNull(),
}, table => [uniqueIndex('uq_quotation_template_request').on(table.merchantId, table.requestId)]);

export const orderStatusReceipts = mysqlTable('order_status_receipts', {
	id: int().autoincrement().primaryKey(),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	actorId: int('actor_id').notNull(),
	orderId: int('order_id').notNull(),
	requestId: char('request_id', { length: 36 }).notNull(),
	inputHash: char('input_hash', { length: 64 }).notNull(),
	result: json('result').notNull(),
	createdAt: timestamp('created_at', { mode: 'string', fsp: 3 }).defaultNow().notNull(),
}, table => [uniqueIndex('uq_order_status_request').on(table.merchantId, table.requestId),
	index('idx_order_status_history').on(table.merchantId, table.orderId, table.id)]);

export const orderNotificationAuthorizations = mysqlTable('order_notification_authorizations', {
	id: int().autoincrement().primaryKey(),
	notificationId: int('notification_id').notNull(),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	orderId: int('order_id').notNull(), actorId: int('actor_id').notNull(), receiptId: int('receipt_id').notNull(),
	eventKey: char('event_key', { length: 64 }).notNull(), requestKey: char('request_key', { length: 36 }).notNull(),
	contractDigest: char('contract_digest', { length: 64 }).notNull(), reviewedContract: json('reviewed_contract').notNull(),
	createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
}, table => [uniqueIndex('uq_order_notice_authorization').on(table.notificationId),
	uniqueIndex('uq_order_notice_authorization_event').on(table.merchantId,table.eventKey),
	uniqueIndex('uq_order_notice_authorization_request').on(table.merchantId,table.requestKey),
	index('idx_order_notice_authorization_scope').on(table.merchantId,table.orderId,table.id)]);

export const customerWorkspaceTags = mysqlTable('customer_workspace_tags', {
	id: int().autoincrement().primaryKey(),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	customerKey: varchar('customer_key', { length: 50 }).notNull(),
	revision: int({ unsigned: true }).default(0).notNull(), tags: json().notNull(),
	updatedAt: timestamp('updated_at', { mode: 'string', fsp: 3 }).defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex('uq_customer_workspace_tags').on(table.merchantId, table.customerKey)]);

export const customerWorkspaceNotes = mysqlTable('customer_workspace_notes', {
	id: int().autoincrement().primaryKey(),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	customerKey: varchar('customer_key', { length: 50 }).notNull(), actorId: int('actor_id').notNull(),
	content: varchar({ length: 2000 }).notNull(),
	createdAt: timestamp('created_at', { mode: 'string', fsp: 3 }).defaultNow().notNull(),
}, table => [index('idx_customer_workspace_notes').on(table.merchantId, table.customerKey, table.id)]);

export const customerAnnotationReceipts = mysqlTable('customer_annotation_receipts', {
	id: int().autoincrement().primaryKey(),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	actorId: int('actor_id').notNull(), requestId: char('request_id', { length: 36 }).notNull(),
	inputHash: char('input_hash', { length: 64 }).notNull(), result: json().notNull(),
	createdAt: timestamp('created_at', { mode: 'string', fsp: 3 }).defaultNow().notNull(),
}, table => [uniqueIndex('uq_customer_annotation_request').on(table.merchantId, table.requestId)]);

export const productEditorReceipts = mysqlTable('product_editor_receipts', {
	id: int().autoincrement().primaryKey(),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	actorId: int('actor_id').notNull(), requestId: char('request_id', { length: 36 }).notNull(),
	inputHash: char('input_hash', { length: 64 }).notNull(), result: json().notNull(),
	createdAt: timestamp('created_at', { mode: 'string', fsp: 3 }).defaultNow().notNull(),
}, table => [uniqueIndex('uq_product_editor_request').on(table.merchantId, table.requestId)]);

export const productImportReviews = mysqlTable('product_import_reviews', {
	id: int().autoincrement().primaryKey(),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	actorId: int('actor_id').notNull(), reviewId: char('review_id', { length: 36 }).notNull(),
	inputHash: char('input_hash', { length: 64 }).notNull(), digest: char({ length: 64 }).notNull(),
	preview: json().notNull(), receipt: json(),
	createdAt: timestamp('created_at', { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	expiresAt: timestamp('expires_at', { mode: 'string', fsp: 3 }).notNull(),
}, table => [uniqueIndex('uq_product_import_review').on(table.merchantId, table.reviewId), index('idx_product_import_expiry').on(table.merchantId, table.expiresAt)]);

export const productSheetReviews = mysqlTable('product_sheet_reviews', {
	id: int().autoincrement().primaryKey(),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	actorId: int('actor_id').notNull(), reviewId: char('review_id', { length: 36 }).notNull(),
	inputHash: char('input_hash', { length: 64 }).notNull(), digest: char({ length: 64 }).notNull(),
	payload: json().notNull(), receipt: json(),
	createdAt: timestamp('created_at', { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	expiresAt: timestamp('expires_at', { mode: 'string', fsp: 3 }).notNull(),
}, table => [uniqueIndex('uq_product_sheet_review').on(table.merchantId, table.reviewId), index('idx_product_sheet_expiry').on(table.merchantId, table.expiresAt)]);

export const inventorySheetReviews = mysqlTable('inventory_sheet_reviews', {
	id: int().autoincrement().primaryKey(),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	actorId: int('actor_id').notNull(), reviewId: char('review_id', { length: 36 }).notNull(),
	inputHash: char('input_hash', { length: 64 }).notNull(), digest: char({ length: 64 }).notNull(),
	payload: json().notNull(), receipt: json(),
	createdAt: timestamp('created_at', { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	expiresAt: timestamp('expires_at', { mode: 'string', fsp: 3 }).notNull(),
}, table => [uniqueIndex('uq_inventory_sheet_review').on(table.merchantId, table.reviewId), index('idx_inventory_sheet_expiry').on(table.merchantId, table.expiresAt)]);

export const productFileAdviceRequests = mysqlTable('product_file_advice_requests', {
	id: int().autoincrement().primaryKey(),
	merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	actorId: int('actor_id').notNull(), requestId: char('request_id', { length: 36 }).notNull(),
	executionToken: char('execution_token', { length: 36 }).notNull(), inputHash: char('input_hash', { length: 64 }).notNull(),
	fileName: varchar('file_name', { length: 255 }).notNull(), fileDigest: char('file_digest', { length: 64 }).notNull(), sampleDigest: char('sample_digest', { length: 64 }).notNull(),
	state: varchar({ length: 16 }).default('processing').notNull(), failureCode: varchar('failure_code', { length: 32 }),
	result: json(), resultDigest: char('result_digest', { length: 64 }),
	startedAt: timestamp('started_at', { mode: 'string', fsp: 3 }).defaultNow().notNull(), leaseUntil: timestamp('lease_until', { mode: 'string', fsp: 3 }).notNull(),
	finishedAt: timestamp('finished_at', { mode: 'string', fsp: 3 }),
}, table => [uniqueIndex('uq_product_file_advice_request').on(table.merchantId, table.requestId), index('idx_product_file_advice_active').on(table.merchantId, table.state, table.leaseUntil)]);

export const quotationTemplates = mysqlTable("quotation_templates", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	name: varchar({ length: 255 }).notNull(),
	headerImageUrl: varchar("header_image_url", { length: 500 }),
	footerText: text("footer_text"),
	termsText: text("terms_text"),
	isDefault: tinyint("is_default").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_merchant").on(table.merchantId),
]);

// --- Merchant Promotions (AI-driven promotional offers) ---
export const promotions = mysqlTable("promotions", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),

	// Content
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	bannerImageUrl: varchar("banner_image_url", { length: 500 }),

	// Offer Type
	type: mysqlEnum(['percentage', 'fixed', 'bundle', 'free_shipping', 'custom']).notNull(),
	value: int(),

	// Scope — which products this applies to
	scope: mysqlEnum(['all', 'products', 'categories']).default('all').notNull(),
	productIds: text("product_ids"),     // JSON array: [1, 5, 12]
	categoryIds: text("category_ids"),   // JSON array: [3, 7]

	// Conditions
	minOrderAmount: int("min_order_amount"),
	minQuantity: int("min_quantity"),

	// Auto Discount Code (optional link to discount_codes table)
	autoDiscountCodeId: int("auto_discount_code_id"),

	// Validity
	startsAt: timestamp("starts_at", { mode: 'string' }),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	isActive: tinyint("is_active").default(1).notNull(),

	// Analytics
	viewCount: int("view_count").default(0).notNull(),
	clickCount: int("click_count").default(0).notNull(),

	// Timestamps
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	index("idx_promotions_merchant").on(table.merchantId),
	index("idx_promotions_active").on(table.isActive),
]);

export type Promotion = InferSelectModel<typeof promotions>;
export type InsertPromotion = InferInsertModel<typeof promotions>;

// ─── Missing Type Exports (used by server/db.ts) ───────────────
export type QuickResponse = InferSelectModel<typeof quickResponses>;
export type InsertQuickResponse = InferInsertModel<typeof quickResponses>;

export type SariPersonalitySetting = InferSelectModel<typeof sariPersonalitySettings>;
export type InsertSariPersonalitySetting = InferInsertModel<typeof sariPersonalitySettings>;

export type SentimentAnalysis = InferSelectModel<typeof sentimentAnalysis>;
export type InsertSentimentAnalysis = InferInsertModel<typeof sentimentAnalysis>;

export type LimitedTimeOffer = InferSelectModel<typeof limitedTimeOffers>;
export type InsertLimitedTimeOffer = InferInsertModel<typeof limitedTimeOffers>;

export type SignupPromptVariant = InferSelectModel<typeof signupPromptVariants>;
export type InsertSignupPromptVariant = InferInsertModel<typeof signupPromptVariants>;

export type SignupPromptTestResult = InferSelectModel<typeof signupPromptTestResults>;
export type InsertSignupPromptTestResult = InferInsertModel<typeof signupPromptTestResults>;

export type PasswordResetToken = InferSelectModel<typeof passwordResetTokens>;
export type PasswordResetAttempt = InferSelectModel<typeof passwordResetAttempts>;
export type AuthSession = InferSelectModel<typeof authSessions>;
export type AuthLoginAttempt = InferSelectModel<typeof authLoginAttempts>;

export type TrySariAnalytics = InferSelectModel<typeof trySariAnalytics>;

// --- Sales Follow-ups (Unified) ---
// Replaces: in-memory proactive-followup.ts + agent_history overwrite in action-selector + followup-reminders
export const salesFollowups = mysqlTable("sales_followups", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	conversationId: int("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
	followUpType: varchar("follow_up_type", { length: 30 }).notNull(), // hesitating, abandoned_cart, price_no_reply, ghost, post_interest, action_selector
	scheduledAt: timestamp("scheduled_at", { mode: 'string' }).notNull(),
	sentAt: timestamp("sent_at", { mode: 'string' }),
	cancelledAt: timestamp("cancelled_at", { mode: 'string' }),
	cancelReason: varchar("cancel_reason", { length: 50 }), // customer_replied, weekly_limit, human_takeover, quiet_hours_expired
	messageText: text("message_text").notNull(),
	customerName: varchar("customer_name", { length: 255 }),
	source: varchar({ length: 30 }).default('proactive').notNull(), // proactive, action_selector
	// P0-FIX: claim-lock token for atomic follow-up processing (prevents double-send)
	processingToken: varchar("processing_token", { length: 60 }),
	anchorMessageId: int("anchor_message_id"),
	claimedAt: datetime("claimed_at", { mode: 'string', fsp: 3 }),
	scheduleTimezone: varchar('schedule_timezone', { length: 64 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_followup_merchant_phone").on(table.merchantId, table.customerPhone),
	index("idx_followup_scheduled").on(table.scheduledAt),
	index("idx_followup_pending").on(table.merchantId, table.sentAt, table.cancelledAt),
]);

export type SalesFollowup = InferSelectModel<typeof salesFollowups>;
export const salesFollowupPolicies = mysqlTable('sales_followup_policies', {
	merchantId: int('merchant_id').primaryKey().references(() => merchants.id, { onDelete: 'cascade' }),
	enabled: tinyint().default(1).notNull(), timeZone: varchar('time_zone', { length: 64 }).notNull(),
	startHour: int('start_hour').default(8).notNull(), endHour: int('end_hour').default(23).notNull(), weeklyLimit: int('weekly_limit').default(3).notNull(),
	revision: int().default(1).notNull(), updatedBy: int('updated_by').notNull(),
	updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
});
// Retain quota after conversation/follow-up deletion; only merchant deletion removes the ledger.
export const salesFollowupDispatches = mysqlTable('sales_followup_dispatches', {
	followupId: int('followup_id').primaryKey(), merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
	customerPhone: varchar('customer_phone', { length: 50 }).notNull(),
	admittedAt: datetime('admitted_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
	state: mysqlEnum(['reserved', 'accepted', 'unknown', 'released']).default('reserved').notNull(),
	settledAt: datetime('settled_at', { mode: 'string', fsp: 3 }),
}, table => [index('idx_followup_dispatch_quota').on(table.merchantId, table.customerPhone, table.admittedAt)]);
export type InsertSalesFollowup = InferInsertModel<typeof salesFollowups>;

// ═══════════════════════════════════════════════════════════════
// Byaan Integration — Dedicated tables for Byaan LMS data
// These tables are populated via /api/v1/platform/sync/* endpoints
// and displayed in Byaan-only dashboard pages
// ═══════════════════════════════════════════════════════════════

// --- Byaan Connections (migrated from raw SQL) ---
export const byaanConnections = mysqlTable("byaan_connections", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	tenantDomain: varchar("tenant_domain", { length: 255 }).notNull(),
	apiBaseUrl: varchar("api_base_url", { length: 500 }),
	webhookSecret: text("webhook_secret"),
	apiKeyHash: varchar("api_key_hash", { length: 64 }),
	syncStatus: mysqlEnum("sync_status", ['pending_verification', 'active', 'syncing', 'error', 'paused']).default('pending_verification'),
	verificationTokenHash: varchar("verification_token_hash", { length: 64 }),
	verificationExpiresAt: timestamp("verification_expires_at", { mode: 'string' }),
	verifiedAt: timestamp("verified_at", { mode: 'string' }),
	lastSyncAt: timestamp("last_sync_at", { mode: 'string' }),
	syncErrors: text("sync_errors"),
	permissions: text(), // JSON
	isActive: tinyint("is_active").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	uniqueIndex("idx_byaan_merchant").on(table.merchantId),
	uniqueIndex("uq_byaan_domain").on(table.tenantDomain),
]);

export const byaanSalesOperations = mysqlTable("byaan_sales_operations", {
  id: int().autoincrement().primaryKey(),
  merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  requestId: varchar("request_id", { length: 36 }).notNull(),
  requestHash: varchar("request_hash", { length: 64 }).notNull(),
  operationKind: varchar("operation_kind", { length: 16 }).notNull(),
  authorityHash: varchar("authority_hash", { length: 64 }).notNull(),
  attemptToken: varchar("attempt_token", { length: 36 }).notNull(),
  state: varchar({ length: 16 }).notNull(),
  resultJson: json("result_json"),
  resultHash: varchar("result_hash", { length: 64 }),
  createdAt: datetime("created_at", { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime("updated_at", { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex("byaan_sales_request").on(table.merchantId, table.requestId)]);

export const byaanResyncRequests = mysqlTable("byaan_resync_requests", {
  id: int().autoincrement().primaryKey(),
  merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  actorId: int("actor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestId: varchar("request_id", { length: 36 }).notNull(),
  connectionRevision: varchar("connection_revision", { length: 64 }).notNull(),
  state: varchar({ length: 16 }).notNull(),
  createdAt: datetime("created_at", { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime("updated_at", { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex("uq_byaan_resync_request").on(table.merchantId, table.requestId), index("idx_byaan_resync_rate").on(table.merchantId, table.createdAt)]);

export const sallaSyncRequests = mysqlTable('salla_sync_requests', {
  id:int().autoincrement().primaryKey(),
  merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  actorId:int('actor_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  requestId:char('request_id',{length:36}).notNull(),connectionRevision:char('connection_revision',{length:64}).notNull(),
  syncType:varchar('sync_type',{length:8}).notNull(),syncLogId:int('sync_log_id').references(()=>syncLogs.id,{onDelete:'set null'}),
  state:varchar({length:16}).notNull(),leaseUntil:datetime('lease_until',{mode:'string',fsp:3}).notNull(),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt:datetime('updated_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},table=>[uniqueIndex('uq_salla_sync_request').on(table.merchantId,table.requestId),uniqueIndex('uq_salla_sync_log').on(table.syncLogId),index('idx_salla_sync_active').on(table.merchantId,table.state,table.leaseUntil),index('idx_salla_sync_rate').on(table.merchantId,table.createdAt)]);

export const zidSyncRequests=mysqlTable('zid_sync_requests',{
 id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),actorId:int('actor_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 requestId:char('request_id',{length:36}).notNull(),connectionRevision:char('connection_revision',{length:64}).notNull(),executionRevision:char('execution_revision',{length:64}).notNull(),resource:varchar({length:16}).notNull(),resourceMask:tinyint('resource_mask').notNull(),
 state:varchar({length:16}).notNull(),leaseUntil:datetime('lease_until',{mode:'string',fsp:3}).notNull(),createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),updatedAt:datetime('updated_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},t=>[uniqueIndex('uq_zid_sync_request').on(t.merchantId,t.requestId),index('idx_zid_sync_active').on(t.merchantId,t.state,t.leaseUntil),index('idx_zid_sync_rate').on(t.merchantId,t.createdAt),check('chk_zid_sync_request_state',sql`${t.state} IN ('pending','success','failed','interrupted')`),check('chk_zid_sync_request_resource',sql`${t.resource} IN ('all','products','orders','customers') AND ${t.resourceMask} BETWEEN 1 AND 7`)]);
export const zidSyncRequestResources=mysqlTable('zid_sync_request_resources',{
 requestPk:int('request_pk').notNull().references(()=>zidSyncRequests.id,{onDelete:'cascade'}),resource:varchar({length:16}).notNull(),logId:int('log_id').references(()=>zidSyncLogs.id,{onDelete:'set null'}),started:tinyint().notNull().default(0),
},t=>[primaryKey({columns:[t.requestPk,t.resource]}),uniqueIndex('uq_zid_sync_request_log').on(t.logId),check('chk_zid_sync_resource',sql`${t.resource} IN ('products','orders','customers') AND ${t.started} IN (0,1)`)]);

export const woocommerceOperations=mysqlTable('woocommerce_operations',{
 id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),actorId:int('actor_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 requestId:char('request_id',{length:36}).notNull(),kind:varchar({length:16}).notNull(),reviewRevision:char('review_revision',{length:64}).notNull(),payloadDigest:char('payload_digest',{length:64}).notNull(),attemptToken:char('attempt_token',{length:36}).notNull(),state:varchar({length:16}).notNull(),resultJson:json('result_json'),
 leaseUntil:datetime('lease_until',{mode:'string',fsp:3}).notNull(),startedAt:datetime('started_at',{mode:'string',fsp:3}),acknowledgedAt:datetime('acknowledged_at',{mode:'string',fsp:3}),createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),updatedAt:datetime('updated_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},t=>[uniqueIndex('uq_woo_operation_request').on(t.merchantId,t.requestId),index('idx_woo_operation_active').on(t.merchantId,t.state,t.leaseUntil),index('idx_woo_operation_actor').on(t.merchantId,t.actorId,t.id),index('idx_woo_operation_rate').on(t.merchantId,t.createdAt),check('chk_woo_operation_state',sql`${t.state} IN ('pending','success','rejected','unknown')`),check('chk_woo_operation_kind',sql`${t.kind} IN ('connect','verify','disconnect','sync_products','sync_orders','reconcile','order_status','order_notify')`),check('chk_woo_operation_result',sql`(${t.state}='success' AND ${t.resultJson} IS NOT NULL AND ${t.startedAt} IS NOT NULL) OR (${t.state}<>'success' AND ${t.resultJson} IS NULL)`),check('chk_woo_operation_rejected',sql`${t.state}<>'rejected' OR ${t.startedAt} IS NULL`)]);

export const calendlyOperations=mysqlTable('calendly_operations',{
 id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),actorId:int('actor_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 requestId:char('request_id',{length:36}).notNull(),kind:varchar({length:16}).notNull(),reviewRevision:char('review_revision',{length:64}).notNull(),payloadDigest:char('payload_digest',{length:64}).notNull(),attemptToken:char('attempt_token',{length:36}).notNull(),state:varchar({length:16}).notNull(),resultJson:json('result_json'),
 leaseUntil:datetime('lease_until',{mode:'string',fsp:3}).notNull(),startedAt:datetime('started_at',{mode:'string',fsp:3}),acknowledgedAt:datetime('acknowledged_at',{mode:'string',fsp:3}),createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),updatedAt:datetime('updated_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},t=>[uniqueIndex('uq_calendly_operation_request').on(t.merchantId,t.requestId),index('idx_calendly_operation_active').on(t.merchantId,t.state,t.leaseUntil),index('idx_calendly_operation_actor').on(t.merchantId,t.actorId,t.id),index('idx_calendly_operation_rate').on(t.merchantId,t.createdAt),check('chk_calendly_operation_state',sql`${t.state} IN ('pending','success','rejected','unknown')`),check('chk_calendly_operation_kind',sql`${t.kind} IN ('connect','verify','disconnect','sync','settings')`),check('chk_calendly_operation_result',sql`(${t.state}='success' AND ${t.resultJson} IS NOT NULL AND ${t.startedAt} IS NOT NULL) OR (${t.state}<>'success' AND ${t.resultJson} IS NULL)`),check('chk_calendly_operation_rejected',sql`${t.state}<>'rejected' OR ${t.startedAt} IS NULL`)]);

export const byaanWebhookReceipts = mysqlTable("byaan_webhook_receipts", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	deliveryId: varchar("delivery_id", { length: 36 }).notNull(),
	requestPath: varchar("request_path", { length: 255 }).notNull(),
	payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
	receivedAt: timestamp("received_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("uq_byaan_delivery_id").on(table.deliveryId),
	index("idx_byaan_receipt_merchant_date").on(table.merchantId, table.receivedAt),
]);

export const byaanOutbox = mysqlTable("byaan_outbox", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	eventKey: varchar("event_key", { length: 36 }).notNull(),
	eventType: mysqlEnum("event_type", ['subscription.activated', 'subscription.deactivated']).notNull(),
	tenantDomain: varchar("tenant_domain", { length: 255 }).notNull(),
	payload: text().notNull(),
	signingSecret: text("signing_secret").notNull(),
	status: mysqlEnum(['pending', 'processing', 'delivered', 'failed']).default('pending').notNull(),
	attempts: int().default(0).notNull(),
	availableAt: timestamp("available_at", { mode: 'string' }).defaultNow().notNull(),
	lastAttemptAt: timestamp("last_attempt_at", { mode: 'string' }),
	deliveredAt: timestamp("delivered_at", { mode: 'string' }),
	lastError: varchar("last_error", { length: 500 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	uniqueIndex("uq_byaan_outbox_event").on(table.eventKey),
	index("idx_byaan_outbox_dispatch").on(table.status, table.availableAt),
]);

// --- Byaan Trainees — synced from Byaan LMS ---
export const byaanTrainees = mysqlTable("byaan_trainees", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	externalId: varchar("external_id", { length: 100 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	phone: varchar({ length: 20 }),
	email: varchar({ length: 320 }),
	enrolledCourses: text("enrolled_courses"), // JSON array of course names/IDs
	status: mysqlEnum(['active', 'archived']).default('active'),
	syncedAt: timestamp("synced_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	uniqueIndex("uq_byaan_trainee").on(table.merchantId, table.externalId),
	index("idx_byaan_trainee_phone").on(table.merchantId, table.phone),
	index("idx_byaan_trainee_list").on(table.merchantId, table.status, table.id),
]);

export type ByaanTrainee = InferSelectModel<typeof byaanTrainees>;
export type InsertByaanTrainee = InferInsertModel<typeof byaanTrainees>;

// --- Byaan FAQs — synced from Byaan LMS ---
export const byaanFaqs = mysqlTable("byaan_faqs", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	externalId: varchar("external_id", { length: 100 }),
	question: text().notNull(),
	answer: text().notNull(),
	category: varchar({ length: 100 }).default('عام'),
	isActive: tinyint("is_active").default(1).notNull(),
	useInBot: tinyint("use_in_bot").default(1).notNull(),
	syncedAt: timestamp("synced_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("uq_byaan_faq").on(table.merchantId, table.externalId),
	index("idx_byaan_faq_merchant").on(table.merchantId),
	index("idx_byaan_faq_knowledge").on(table.merchantId, table.isActive, table.useInBot, table.id),
]);

export type ByaanFaq = InferSelectModel<typeof byaanFaqs>;
export type InsertByaanFaq = InferInsertModel<typeof byaanFaqs>;

// --- Byaan Site Content — academy identity pages ---
export const byaanSiteContent = mysqlTable("byaan_site_content", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	pageType: mysqlEnum("page_type", ['about', 'vision', 'mission', 'policies', 'custom']).notNull(),
	title: varchar({ length: 500 }),
	content: text().notNull(),
	syncedAt: timestamp("synced_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("uq_byaan_content").on(table.merchantId, table.pageType),
]);

export type ByaanSiteContent = InferSelectModel<typeof byaanSiteContent>;
export type InsertByaanSiteContent = InferInsertModel<typeof byaanSiteContent>;

// --- Runtime schema consolidation (tracked migration 0003) ---
export const sariApiKeys = mysqlTable("sari_api_keys", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
	keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
	label: varchar({ length: 100 }).default('Default Key'),
	permissions: text().notNull(),
	isActive: tinyint("is_active").default(1).notNull(),
	lastUsedAt: timestamp("last_used_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
}, table => [
	index("idx_sari_api_key_hash").on(table.keyHash),
	index("idx_sari_api_key_merchant").on(table.merchantId),
]);

export const sariPlatformKeys = mysqlTable("sari_platform_keys", {
	id: int().autoincrement().primaryKey(),
	platform: varchar({ length: 50 }).notNull().unique(),
	keyValue: text("key_value").notNull(),
	label: varchar({ length: 100 }).default(''),
	isActive: tinyint("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const whatsappMessageDeliveries = mysqlTable("whatsapp_message_deliveries", {
	requestJson: json("request_json"),
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	messageId: int("message_id").references(() => messages.id, { onDelete: "set null" }),
	instanceId: int("instance_id").references(() => whatsappInstances.id, { onDelete: "set null" }),
	provider: mysqlEnum(['green_api', 'meta_cloud', 'mock']).notNull(),
	providerMessageId: varchar("provider_message_id", { length: 255 }),
	idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
	direction: mysqlEnum(['incoming', 'outgoing']).notNull(),
	status: mysqlEnum(['received', 'queued', 'sent', 'delivered', 'read', 'failed']).notNull(),
	errorCode: varchar("error_code", { length: 100 }),
	errorDetails: text("error_details"),
	statusUpdatedAt: timestamp("status_updated_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
	uniqueIndex("uq_whatsapp_delivery_idempotency").on(table.idempotencyKey),
	uniqueIndex("uq_whatsapp_provider_message").on(table.merchantId, table.instanceId, table.provider, table.direction, table.providerMessageId),
	index("idx_whatsapp_delivery_merchant_status").on(table.merchantId, table.status, table.createdAt),
]);

export const campaignOptouts = mysqlTable("campaign_optouts", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
	optedOutAt: timestamp("opted_out_at", { mode: 'string' }).defaultNow().notNull(),
	reason: varchar({ length: 100 }).default('customer_request'),
}, table => [
	uniqueIndex("uq_campaign_optout_merchant_phone").on(table.merchantId, table.customerPhone),
	index("idx_campaign_optout_merchant").on(table.merchantId),
]);

export const campaignConsentReceipts = mysqlTable("campaign_consent_receipts", {
	id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
	decision: mysqlEnum(['granted', 'withdrawn']).notNull(),
	source: varchar({ length: 32 }).notNull(),
	provider: varchar({ length: 20 }).notNull(),
	consentVersion: varchar("consent_version", { length: 40 }).notNull(),
	evidenceDigest: char("evidence_digest", { length: 64 }).notNull(),
	providerEventDigest: char("provider_event_digest", { length: 64 }).notNull(),
	decidedAt: datetime("decided_at", { mode: 'string', fsp: 3 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
}, table => [
	uniqueIndex("campaign_consent_receipts_event_unique").on(table.merchantId, table.providerEventDigest),
	index("campaign_consent_receipts_subject_idx").on(table.merchantId, table.customerPhone, table.decidedAt, table.id),
]);

export const campaignConsentState = mysqlTable("campaign_consent_state", {
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
	status: mysqlEnum(['granted', 'withdrawn']).notNull(),
	consentVersion: varchar("consent_version", { length: 40 }).notNull(),
	source: varchar({ length: 32 }).notNull(),
	evidenceDigest: char("evidence_digest", { length: 64 }).notNull(),
	lastDecidedAt: datetime("last_decided_at", { mode: 'string', fsp: 3 }).notNull(),
	lastReceiptId: bigint("last_receipt_id", { mode: 'number', unsigned: true }).references(() => campaignConsentReceipts.id, { onDelete: "set null" }),
	createdAt: timestamp("created_at", { mode: 'string', fsp: 3 }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string', fsp: 3 }).defaultNow().onUpdateNow().notNull(),
}, table => [
	primaryKey({ columns: [table.merchantId, table.customerPhone] }),
	index("campaign_consent_state_status_idx").on(table.merchantId, table.status),
]);

export const merchantOnboardingSessions = mysqlTable('merchant_onboarding_sessions', {
  merchantId:int('merchant_id').primaryKey().references(()=>merchants.id,{onDelete:'cascade'}),
  version:int().notNull(),status:varchar({length:20}).notNull(),fieldKey:varchar('field_key',{length:50}),
  instanceId:int('instance_id').notNull(),recipient:varchar({length:20}).notNull(),deliveryKey:varchar('delivery_key',{length:100}).notNull(),
  promptText:text('prompt_text').notNull(),updatedAt:timestamp('updated_at',{mode:'string',fsp:3}).defaultNow().onUpdateNow().notNull(),
});
export const merchantOnboardingEvents = mysqlTable('merchant_onboarding_events', {
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  eventKey:char('event_key',{length:64}).notNull(),sourceDigest:char('source_digest',{length:64}).notNull(),basisHash:char('basis_hash',{length:64}).notNull(),
  sourceJson:json('source_json').notNull(),decisionJson:json('decision_json').notNull(),resultJson:json('result_json').notNull(),
  createdAt:timestamp('created_at',{mode:'string',fsp:3}).defaultNow().notNull(),
},table=>[uniqueIndex('uq_onboarding_event').on(table.merchantId,table.eventKey)]);
export const merchantOnboardingAnswers = mysqlTable("merchant_onboarding_answers", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	fieldKey: varchar("field_key", { length: 50 }).notNull(),
	verifiedEventKey: char("verified_event_key", {length:64}),
	answerDigest: char("answer_digest", {length:64}),
	questionText: text("question_text").notNull(),
	answerText: text("answer_text").notNull(),
	phase: int().default(1).notNull(),
	answeredAt: timestamp("answered_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, table => [
	uniqueIndex("uq_onboarding_answer_merchant_field").on(table.merchantId, table.fieldKey),
	index("idx_onboarding_answer_merchant").on(table.merchantId),
]);

export const whatsappInboundJobs = mysqlTable('whatsapp_inbound_jobs', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  instanceId: int('instance_id').notNull().references(() => whatsappInstances.id, { onDelete: 'cascade' }),
  eventKey: char('event_key', { length: 64 }).notNull(),
  partitionKey: char('partition_key', { length: 64 }).notNull(),
  source: varchar({ length: 20 }).notNull(),
  payloadJson: json('payload_json').notNull(),
  status: mysqlEnum(['pending', 'running', 'completed', 'review', 'dismissed']).default('pending').notNull(),
  leaseToken: char('lease_token', { length: 36 }),
  leaseUntil: datetime('lease_until', { mode: 'string', fsp: 3 }),
  attempts: int().default(0).notNull(),
  startedAt: datetime('started_at', { mode: 'string', fsp: 3 }),
  replyPlanJson: json('reply_plan_json'),
  errorCode: varchar('error_code', { length: 100 }),
  resolutionNote: varchar('resolution_note', { length: 1000 }),
  resolvedBy: int('resolved_by'),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
  updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
}, table => [
  uniqueIndex('uq_inbound_event').on(table.eventKey),
  index('idx_inbound_dispatch').on(table.status, table.id),
  index('idx_inbound_partition').on(table.partitionKey, table.status, table.id),
  index('idx_inbound_merchant').on(table.merchantId, table.id),
]);

export const sessionContexts = mysqlTable("session_contexts", {
	version: int("version").default(1).notNull(),
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	conversationId: int("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
	sessionKey: varchar("session_key", { length: 50 }).notNull().unique(),
	contextJson: text("context_json").notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, table => [
	index("idx_session_context_merchant").on(table.merchantId),
	index("idx_session_context_expires").on(table.expiresAt),
]);

export const merchantDirectiveActions = mysqlTable('merchant_directive_actions', {
  id: int('id').autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  eventKey: char('event_key', { length: 64 }).notNull(),
  sourceDigest: char('source_digest', { length: 64 }).notNull(),
  basisHash: char('basis_hash', { length: 64 }).notNull(),
  conversationId: int('conversation_id').notNull(),
  intent: varchar('intent', { length: 20 }).notNull(),
  contextJson: json('context_json').notNull(),
  decisionJson: json('decision_json').notNull(),
  resultJson: json('result_json').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [uniqueIndex('uq_merchant_directive_event').on(table.merchantId, table.eventKey)]);

export const sariCoachingSessions = mysqlTable("sari_coaching_sessions", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	status: varchar({ length: 20 }).default('pending'),
	totalQuestions: int("total_questions").default(0),
	correctCount: int("correct_count").default(0),
	correctedCount: int("corrected_count").default(0),
	skippedCount: int("skipped_count").default(0),
	currentQuestionIndex: int("current_question_index").default(0),
	startedAt: timestamp("started_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, table => [
	index("idx_coaching_session_merchant_status").on(table.merchantId, table.status),
	index("idx_coaching_session_merchant_date").on(table.merchantId, table.createdAt),
]);

export const sariCoachingQuestions = mysqlTable("sari_coaching_questions", {
	id: int().autoincrement().primaryKey(),
	sessionId: int("session_id").notNull().references(() => sariCoachingSessions.id, { onDelete: "cascade" }),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	conversationId: int("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
	customerQuestion: text("customer_question").notNull(),
	botResponse: text("bot_response").notNull(),
	contextJson: json("context_json"),
	contextDigest: char("context_digest", { length: 64 }),
	deliveryKey: varchar("delivery_key", { length: 100 }),
	reviewEventKey: char("review_event_key", { length: 64 }),
	reviewSourceDigest: char("review_source_digest", { length: 64 }),
	reviewAnalysis: json("review_analysis"),
	merchantVerdict: varchar("merchant_verdict", { length: 20 }),
	merchantCorrection: text("merchant_correction"),
	questionOrder: int("question_order").default(0),
	reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, table => [
	index("idx_coaching_question_session_order").on(table.sessionId, table.questionOrder),
	index("idx_coaching_question_merchant").on(table.merchantId),
	uniqueIndex("uq_coaching_delivery").on(table.deliveryKey),
	uniqueIndex("uq_coaching_review_event").on(table.merchantId, table.reviewEventKey),
]);

export const sariLearningSignals = mysqlTable("sari_learning_signals", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	conversationId: int("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
	signalType: varchar("signal_type", { length: 30 }).notNull(),
	signalWeight: decimal("signal_weight", { precision: 3, scale: 2 }).default('1.00'),
	botMessage: text("bot_message"),
	customerMessage: text("customer_message"),
	merchantCorrection: text("merchant_correction"),
	contextSummary: text("context_summary"),
	sourceKey: varchar("source_key", { length: 160 }),
	analyzed: tinyint().default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, table => [
	index("idx_learning_signal_merchant_type").on(table.merchantId, table.signalType),
	index("idx_learning_signal_merchant_date").on(table.merchantId, table.createdAt),
	index("idx_learning_signal_unanalyzed").on(table.merchantId, table.analyzed),
	uniqueIndex("uq_learning_source").on(table.merchantId, table.sourceKey, table.signalType),
]);

export const sariBehavioralDna = mysqlTable("sari_behavioral_dna", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	generation: int().default(1),
	dimension: varchar({ length: 30 }).notNull(),
	insight: text().notNull(),
	evidenceCount: int("evidence_count").default(1),
	confidence: decimal({ precision: 3, scale: 2 }).default('0.50'),
	isActive: tinyint("is_active").default(1).notNull(),
	autoApplied: tinyint("auto_applied").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, table => [
	uniqueIndex("uq_behavioral_dna_merchant_dimension").on(table.merchantId, table.dimension),
	index("idx_behavioral_dna_active").on(table.merchantId, table.isActive),
]);

export const sariEscalationQueue = mysqlTable("sari_escalation_queue", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	conversationId: int("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 30 }).notNull(),
	customerName: varchar("customer_name", { length: 100 }),
	question: text().notNull(),
	botResponse: text("bot_response"),
	sourceMessageId: int("source_message_id"),
	handoffVersion: int("handoff_version"),
	status: varchar({ length: 20 }).default('pending'),
	merchantAnswer: text("merchant_answer"),
	priority: varchar({ length: 10 }).default('standard'),
	merchantNotifiedAt: timestamp("merchant_notified_at", { mode: 'string' }),
	merchantAnsweredAt: timestamp("merchant_answered_at", { mode: 'string' }),
	followedUp: tinyint("followed_up").default(0).notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	currentEscalationLevel: int("current_escalation_level").default(0),
	lastEscalatedAt: timestamp("last_escalated_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, table => [
	index("idx_escalation_merchant_status").on(table.merchantId, table.status),
	index("idx_escalation_merchant_date").on(table.merchantId, table.createdAt),
	index("idx_escalation_customer").on(table.merchantId, table.customerPhone, table.status),
	index("idx_escalation_cascade").on(table.status, table.lastEscalatedAt),
]);

export const salesEscalationRelays = mysqlTable('sales_escalation_relays', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  escalationId: int('escalation_id').notNull().references(() => sariEscalationQueue.id, { onDelete: 'cascade' }),
  instanceId: int('instance_id').notNull(), authorPhone: varchar('author_phone', { length: 30 }).notNull(),
  quotedMessageId: varchar('quoted_message_id', { length: 255 }).notNull(), replyText: text('reply_text').notNull(),
  ownershipVersion: int('ownership_version').notNull(),
  status: mysqlEnum(['reserved', 'accepted', 'unknown', 'failed', 'suppressed']).notNull().default('reserved'),
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  staffBasis: json('staff_basis'),staffBasisDigest:char('staff_basis_digest',{length:64}),
  reviewRevision: int('review_revision').notNull().default(0),
  reconciledAt: timestamp('reconciled_at', { mode: 'string' }),
  teachingRecordedAt: timestamp('teaching_recorded_at', { mode: 'string' }),
  nextReconcileAt: timestamp('next_reconcile_at', { mode: 'string' }).defaultNow(),
  lastReconcileError: varchar('last_reconcile_error', { length: 60 }),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow().onUpdateNow(),
}, table => [uniqueIndex('uq_escalation_relay').on(table.merchantId, table.escalationId), index('idx_relay_reconcile').on(table.nextReconcileAt, table.id)]);

// Immutable acceptance observations survive deletion of the source conversation, relay and outbox.
export const salesStaffAcceptances=mysqlTable('ai_sales_staff_acceptances',{
  id:bigint({mode:'number',unsigned:true}).autoincrement().primaryKey(),
  merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  sourceKind:varchar('source_kind',{length:24}).notNull(),sourceId:int('source_id').notNull(),
  customerKey:char('customer_key',{length:64}).notNull(),outboxId:bigint('outbox_id',{mode:'number',unsigned:true}).notNull(),
  providerMessageDigest:char('provider_message_digest',{length:64}).notNull(),acceptanceDigest:char('acceptance_digest',{length:64}).notNull(),snapshot:json().notNull(),
  acceptanceObservedAt:datetime('acceptance_observed_at',{mode:'string',fsp:3}).notNull(),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},t=>[uniqueIndex('uq_staff_acceptance_source').on(t.merchantId,t.sourceKind,t.sourceId),
  uniqueIndex('uq_staff_acceptance_outbox').on(t.merchantId,t.outboxId),uniqueIndex('uq_staff_acceptance_receipt').on(t.merchantId,t.providerMessageDigest),
  index('idx_staff_acceptance_customer').on(t.merchantId,t.customerKey,t.acceptanceObservedAt),
  check('ck_staff_acceptance_source',sql`${t.sourceKind} IN ('escalation_relay','dashboard_text','dashboard_voice')`)]);

export const salesStaffReplies=mysqlTable('ai_sales_staff_replies',{
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  actorUserId:int('actor_user_id').notNull(),conversationId:int('conversation_id').notNull(),requestId:char('request_id',{length:36}).notNull(),
  instanceId:int('instance_id').notNull(),ownershipVersion:int('ownership_version').notNull(),customerPhone:varchar('customer_phone',{length:64}).notNull(),
  replyText:text('reply_text').notNull(),basis:json(),basisDigest:char('basis_digest',{length:64}),
  status:mysqlEnum(['reserved','accepted','failed','suppressed']).notNull().default('reserved'),providerMessageId:varchar('provider_message_id',{length:255}),
  projectedMessageId:int('projected_message_id'),nextReconcileAt:datetime('next_reconcile_at',{mode:'string',fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},t=>[uniqueIndex('uq_staff_reply_request').on(t.merchantId,t.requestId),index('idx_staff_reply_conversation').on(t.merchantId,t.conversationId,t.id),
  index('idx_staff_reply_recovery').on(t.nextReconcileAt,t.id)]);

export const salesEscalationReviews = mysqlTable('sales_escalation_reviews', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  relayId: int('relay_id').notNull().references(() => salesEscalationRelays.id, { onDelete: 'cascade' }),
  actorUserId: int('actor_user_id').notNull(), revision: int().notNull(), evidenceHash: char('evidence_hash', { length: 64 }).notNull(),
  outcome: mysqlEnum(['accepted', 'failed', 'unresolved']).notNull(), note: varchar({ length: 1000 }).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
}, table => [uniqueIndex('uq_relay_review').on(table.merchantId, table.relayId, table.revision)]);

export const mediaLibrary = mysqlTable("media_library", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	fileName: varchar("file_name", { length: 500 }).notNull(),
	originalName: varchar("original_name", { length: 500 }).notNull(),
	mimeType: varchar("mime_type", { length: 100 }).notNull(),
	fileSize: int("file_size").default(0).notNull(),
	url: text().notNull(),
	category: mysqlEnum(['product', 'promotion', 'template', 'general']).default('general').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, table => [
	index("idx_media_merchant").on(table.merchantId),
	index("idx_media_category").on(table.merchantId, table.category),
]);

export const sariConversions = mysqlTable("sari_conversions", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	customerPhone: varchar("customer_phone", { length: 20 }),
	customerName: varchar("customer_name", { length: 255 }),
	actionType: mysqlEnum("action_type", ['enrollment', 'payment', 'inquiry']).notNull(),
	productName: varchar("product_name", { length: 255 }),
	amount: decimal({ precision: 10, scale: 2 }),
	externalRef: varchar("external_ref", { length: 100 }),
	idempotencyKey: varchar("idempotency_key", { length: 100 }),
	historyDigest: char("history_digest", { length: 64 }),
	source: varchar({ length: 50 }).default('whatsapp'),
	status: mysqlEnum(['pending', 'completed', 'cancelled']).default('completed'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, table => [
	index("idx_sari_conversion_merchant_date").on(table.merchantId, table.createdAt),
	uniqueIndex("uq_sari_conversion_source_key").on(table.merchantId, table.source, table.idempotencyKey),
	index("idx_sari_conversion_summary").on(table.merchantId, table.status, table.actionType, table.createdAt),
]);

export const apiConversionObservations = mysqlTable('api_conversion_observations', {
  id:int().autoincrement().primaryKey(),
  merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  conversionId:int('conversion_id').notNull().references(()=>sariConversions.id,{onDelete:'cascade'}),
  observedState:varchar('observed_state',{length:16}).notNull(),sourceKind:varchar('source_kind',{length:32}).notNull(),
  apiKeyId:int('api_key_id'),payloadDigest:char('payload_digest',{length:64}).notNull(),previousDigest:char('previous_digest',{length:64}),
  observationDigest:char('observation_digest',{length:64}).notNull(),observedAt:datetime('observed_at',{mode:'string',fsp:3}).notNull(),
},table=>[
  uniqueIndex('api_conversion_observed_state').on(table.conversionId,table.observedState),
  index('api_conversion_merchant_history').on(table.merchantId,table.conversionId,table.id),
  check('chk_api_conversion_observation',sql`${table.observedState} IN ('pending','completed','cancelled') AND
    ((${table.sourceKind}='api_key_report' AND ${table.apiKeyId} IS NOT NULL AND ${table.apiKeyId}>0) OR (${table.sourceKind}='internal_unverified' AND ${table.apiKeyId} IS NULL)) AND
    REGEXP_LIKE(${table.payloadDigest},'^[0-9a-f]{64}$','c') AND REGEXP_LIKE(${table.observationDigest},'^[0-9a-f]{64}$','c') AND
    (${table.previousDigest} IS NULL OR REGEXP_LIKE(${table.previousDigest},'^[0-9a-f]{64}$','c'))`),
]);

export const supervisorInterventions = mysqlTable("supervisor_interventions", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	conversationId: int("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
	reason: varchar({ length: 50 }).notNull(),
	recoveryMessage: text("recovery_message"),
	customerResponded: tinyint("customer_responded").default(0).notNull(),
	ledToConversion: tinyint("led_to_conversion").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, table => [
	index("idx_supervisor_merchant").on(table.merchantId),
	index("idx_supervisor_created").on(table.createdAt),
]);

export const sariActivityLog = mysqlTable("sari_activity_log", {
	id: int().autoincrement().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	actionType: varchar("action_type", { length: 100 }).notNull(),
	description: text().notNull(),
	details: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, table => [index("idx_sari_activity_merchant_date").on(table.merchantId, table.createdAt)]);

export const aiInteractionJobs = mysqlTable('ai_interaction_jobs', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  conversationId: int('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  incomingMessageId: int('incoming_message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  replyText: text('reply_text').notNull(),
  replyOrigin: varchar('reply_origin', { length: 16 }).default('legacy').notNull(),
  replyDigest: char('reply_digest', { length: 64 }),
  replyPlan: json('reply_plan'),
  salesDeliveryId: bigint('sales_delivery_id', { mode: 'number', unsigned: true }),
  outgoingMessageReference: int('outgoing_message_reference'),
  usageState: varchar('usage_state', { length: 16 }).notNull().default('legacy'),
  usageSubscriptionId: int('usage_subscription_id'),
  usagePeriodStart: datetime('usage_period_start', { mode: 'string', fsp: 3 }),
  usageUnits: int('usage_units', { unsigned: true }).notNull().default(0),
  usageReservedAt: datetime('usage_reserved_at', { mode: 'string', fsp: 3 }),
  usageDigest: char('usage_digest', { length: 64 }),
  usageSettledAt: datetime('usage_settled_at', { mode: 'string', fsp: 3 }),
  usageOutboxId: bigint('usage_outbox_id', { mode: 'number', unsigned: true }),
  usageProvider: varchar('usage_provider', { length: 16 }),
  usageRequestDigest: char('usage_request_digest', { length: 64 }),
  usageRecoveryAt: datetime('usage_recovery_at', { mode: 'string', fsp: 3 }),
  usageAttempts: int('usage_attempts', { unsigned: true }).notNull().default(0),
  usageLastError: varchar('usage_last_error', { length: 32 }),
  state: varchar({ length: 24 }).default('waiting_delivery').notNull(),
  attempts: int().default(0).notNull(),
  leaseToken: varchar('lease_token', { length: 64 }),
  leaseUntil: datetime('lease_until', { mode: 'string', fsp: 3 }),
  availableAt: datetime('available_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
  lastError: varchar('last_error', { length: 80 }),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
  completedAt: datetime('completed_at', { mode: 'string', fsp: 3 }),
}, table => [
  index('idx_ordinary_reply_usage_holds').on(table.merchantId,table.usageSubscriptionId,table.usagePeriodStart,table.usageState),
  index('idx_ordinary_reply_usage_recovery').on(table.usageState,table.usageRecoveryAt,table.id),
  index('idx_ordinary_reply_usage_outbox').on(table.usageOutboxId,table.usageState),
  check('ck_ordinary_reply_usage', sql`(${table.usageState} IN ('legacy','pending') AND (${table.usageState}='legacy' OR ${table.replyOrigin}='ordinary')
      AND ${table.usageUnits}=0 AND ${table.usageSubscriptionId} IS NULL AND ${table.usagePeriodStart} IS NULL AND ${table.usageReservedAt} IS NULL
      AND ${table.usageDigest} IS NULL AND ${table.usageSettledAt} IS NULL AND ${table.usageOutboxId} IS NULL AND ${table.usageProvider} IS NULL
      AND ${table.usageRequestDigest} IS NULL AND ${table.usageRecoveryAt} IS NULL AND ${table.usageAttempts}=0 AND ${table.usageLastError} IS NULL)
    OR (${table.usageState} IN ('held','charged','historical','released') AND ${table.replyOrigin}='ordinary' AND ${table.usageUnits}=2
      AND ${table.usageSubscriptionId} IS NOT NULL AND ${table.usageSubscriptionId}>0 AND ${table.usagePeriodStart} IS NOT NULL AND ${table.usageReservedAt} IS NOT NULL
      AND ${table.usageDigest} IS NOT NULL AND CHAR_LENGTH(${table.usageDigest})=64 AND ${table.usageOutboxId} IS NOT NULL AND ${table.usageOutboxId}>0
      AND ${table.usageProvider} IS NOT NULL AND ${table.usageProvider} IN ('green_api','meta_cloud','mock') AND ${table.usageRequestDigest} IS NOT NULL
      AND CHAR_LENGTH(${table.usageRequestDigest})=64 AND ${table.usageAttempts}<=8
      AND (${table.usageLastError} IS NULL OR ${table.usageLastError} IN ('transport_unknown','evidence_unavailable'))
      AND ((${table.usageState}='held' AND ${table.usageSettledAt} IS NULL)
        OR (${table.usageState}<>'held' AND ${table.usageSettledAt} IS NOT NULL AND ${table.usageRecoveryAt} IS NULL)))
  `),
  uniqueIndex('uq_ai_interaction_message').on(table.merchantId, table.incomingMessageId),
  index('idx_ai_interaction_due').on(table.state, table.availableAt, table.leaseUntil),
  check('ck_interaction_reply_owner', sql`(${table.replyOrigin}='legacy' AND ${table.replyDigest} IS NULL AND ${table.replyPlan} IS NULL AND ${table.salesDeliveryId} IS NULL AND ${table.outgoingMessageReference} IS NULL)
    OR (${table.replyOrigin}='ordinary' AND ${table.replyDigest} IS NOT NULL AND ${table.replyPlan} IS NOT NULL AND ${table.salesDeliveryId} IS NULL AND ${table.outgoingMessageReference} IS NULL)
    OR (${table.replyOrigin}='reviewed' AND ${table.replyDigest} IS NOT NULL AND ${table.replyPlan} IS NULL AND ${table.salesDeliveryId} IS NOT NULL AND ${table.salesDeliveryId}>0
      AND ${table.state}='reviewed_reserved' AND (${table.outgoingMessageReference} IS NULL OR ${table.outgoingMessageReference}>0))`),
]);

export const aiLearningProposals = mysqlTable('ai_learning_proposals', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  generation: int().notNull(),
  dimension: varchar({ length: 30 }).notNull(),
  insight: text().notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  evidenceCount: int('evidence_count').default(0).notNull(),
  confidence: decimal({ precision: 3, scale: 2 }).notNull(),
  status: varchar({ length: 24 }).default('proposed').notNull(),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
}, table => [uniqueIndex('uq_ai_learning_proposal').on(table.merchantId, table.dimension, table.contentHash)]);

export const aiLearningPolicyReviews = mysqlTable('ai_learning_policy_reviews', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  proposalId: bigint('proposal_id', { mode: 'number', unsigned: true }).notNull().references(() => aiLearningProposals.id, { onDelete: 'cascade' }),
  revision: bigint({ mode: 'number', unsigned: true }).notNull(),
  requestId: char('request_id', { length: 36 }).notNull(),
  payloadDigest: char('payload_digest', { length: 64 }).notNull(),
  sourceDigest: char('source_digest', { length: 64 }).notNull(),
  suiteDigest: char('suite_digest', { length: 64 }).notNull(),
  actorUserId: int('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  proposalSnapshot: json('proposal_snapshot').notNull(), assessment: json().notNull(),
  outcome: varchar({ length: 16 }).notNull(),
  passedCases: int('passed_cases', { unsigned: true }).notNull(), regressions: int({ unsigned: true }).notNull(),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
}, table => [uniqueIndex('uq_learning_review_request').on(table.merchantId, table.requestId),
  uniqueIndex('uq_learning_review_revision').on(table.merchantId, table.proposalId, table.revision),
  check('ck_learning_review_result', sql`${table.revision} BETWEEN 1 AND 9007199254740991 AND ${table.passedCases} BETWEEN 0 AND 8
    AND ${table.regressions} BETWEEN 0 AND 8 - ${table.passedCases}
    AND ((${table.outcome} = 'passed' AND ${table.passedCases} = 8) OR (${table.outcome} = 'failed' AND ${table.passedCases} < 8))`)]);

export const aiLearningPolicyCandidates = mysqlTable('ai_learning_policy_candidates', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  proposalId: bigint('proposal_id', { mode: 'number', unsigned: true }).notNull().references(() => aiLearningProposals.id, { onDelete: 'cascade' }),
  reviewId: bigint('review_id', { mode: 'number', unsigned: true }).notNull().references(() => aiLearningPolicyReviews.id, { onDelete: 'cascade' }),
  version: bigint({ mode: 'number', unsigned: true }).notNull(),
  requestId: char('request_id', { length: 36 }).notNull(), payloadDigest: char('payload_digest', { length: 64 }).notNull(),
  sourceDigest: char('source_digest', { length: 64 }).notNull(), baselineDigest: char('baseline_digest', { length: 64 }).notNull(),
  artifactDigest: char('artifact_digest', { length: 64 }).notNull(),
  actorUserId: int('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  bundle: json().notNull(), createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
}, table => [uniqueIndex('uq_learning_candidate_request').on(table.merchantId, table.requestId),
  uniqueIndex('uq_learning_candidate_version').on(table.merchantId, table.proposalId, table.version),
  check('ck_learning_candidate_version', sql`${table.version} BETWEEN 1 AND 9007199254740991`)]);

export const aiLearningPolicyEvaluations = mysqlTable('ai_learning_policy_evaluations', {
  id: bigint({mode:'number',unsigned:true}).autoincrement().primaryKey(),
  merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  candidateId:bigint('candidate_id',{mode:'number',unsigned:true}).notNull().references(()=>aiLearningPolicyCandidates.id,{onDelete:'cascade'}),
  requestId:char('request_id',{length:36}).notNull(),payloadDigest:char('payload_digest',{length:64}).notNull(),
  artifactDigest:char('artifact_digest',{length:64}).notNull(),routeDigest:char('route_digest',{length:64}).notNull(),
  provider:varchar({length:16}).notNull(),model:varchar({length:128}).notNull(),observedModel:varchar('observed_model',{length:128}),
  recipe:json().notNull(),state:varchar({length:16}).notNull().default('running'),
  actorUserId:int('actor_user_id').references(()=>users.id,{onDelete:'set null'}),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},table=>[uniqueIndex('uq_policy_eval_request').on(table.merchantId,table.requestId),index('idx_policy_eval_candidate').on(table.merchantId,table.candidateId,table.id),
  check('ck_policy_eval_state',sql`${table.state} IN ('running','completed','halted','cancelled') AND ${table.provider} IN ('openai','zahypi')`)]);

export const aiLearningPolicyEvaluationSamples = mysqlTable('ai_learning_policy_evaluation_samples', {
  runId:bigint('run_id',{mode:'number',unsigned:true}).notNull().references(()=>aiLearningPolicyEvaluations.id,{onDelete:'cascade'}),
  ordinal:int({unsigned:true}).notNull(),caseId:varchar('case_id',{length:80}).notNull(),arm:varchar({length:16}).notNull(),
  inputDigest:char('input_digest',{length:64}).notNull(),state:varchar({length:16}).notNull().default('queued'),
  claimToken:char('claim_token',{length:36}),leaseUntil:datetime('lease_until',{mode:'string',fsp:3}),reservationKey:char('reservation_key',{length:64}),
  responseText:text('response_text'),responseMetadata:json('response_metadata'),responseDigest:char('response_digest',{length:64}),
  elapsedMs:int('elapsed_ms',{unsigned:true}),failureCode:varchar('failure_code',{length:48}),completedAt:datetime('completed_at',{mode:'string',fsp:3}),
},table=>[primaryKey({columns:[table.runId,table.ordinal]}),uniqueIndex('uq_policy_eval_sample').on(table.runId,table.caseId,table.arm),
  uniqueIndex('uq_policy_eval_reservation').on(table.reservationKey),check('ck_policy_eval_sample_state',sql`${table.ordinal}<64 AND ${table.arm} IN ('baseline','candidate') AND ${table.state} IN ('queued','dispatching','responded','invalid','uncertain','blocked')`)]);

export const aiLearningPolicyOutputReviews = mysqlTable('ai_learning_policy_output_reviews', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  runId: bigint('run_id', { mode: 'number', unsigned: true }).notNull().references(() => aiLearningPolicyEvaluations.id, { onDelete: 'cascade' }),
  revision: bigint({ mode: 'number', unsigned: true }).notNull(),
  requestId: char('request_id', { length: 36 }).notNull(), payloadDigest: char('payload_digest', { length: 64 }).notNull(),
  runDigest: char('run_digest', { length: 64 }).notNull(), rubricDigest: char('rubric_digest', { length: 64 }).notNull(),
  reviewDigest: char('review_digest', { length: 64 }).notNull(), review: json().notNull(), outcome: varchar({ length: 16 }).notNull(),
  actorUserId: int('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_output_review_request').on(table.merchantId, table.requestId),
  uniqueIndex('uq_output_review_revision').on(table.merchantId, table.runId, table.revision),
  check('ck_output_review_revision', sql`${table.revision} BETWEEN 1 AND 9007199254740991`),
  check('ck_output_review_outcome', sql`${table.outcome} IN ('passed','failed','inconclusive')`)]);

export const aiSalesExperimentProtocols = mysqlTable('ai_sales_experiment_protocols', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  candidateId: bigint('candidate_id', { mode: 'number', unsigned: true }).notNull().references(() => aiLearningPolicyCandidates.id, { onDelete: 'cascade' }),
  requestId: char('request_id', { length: 36 }).notNull(), payloadDigest: char('payload_digest', { length: 64 }).notNull(),
  artifactDigest: char('artifact_digest', { length: 64 }).notNull(), protocolDigest: char('protocol_digest', { length: 64 }).notNull(),
  protocol: json().notNull(), state: varchar({ length: 16 }).notNull().default('registered'), activeSlot: int('active_slot').default(1),
  actorUserId: int('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_sales_protocol_request').on(table.merchantId, table.requestId),
  uniqueIndex('uq_sales_protocol_active').on(table.merchantId, table.activeSlot),
  check('ck_sales_protocol_state', sql`(${table.state}='registered' AND ${table.activeSlot} IS NOT NULL AND ${table.activeSlot}=1) OR (${table.state}='withdrawn' AND ${table.activeSlot} IS NULL)`)]);

export const aiSalesExperimentWithdrawals = mysqlTable('ai_sales_experiment_withdrawals', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  protocolId: bigint('protocol_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesExperimentProtocols.id, { onDelete: 'cascade' }),
  requestId: char('request_id', { length: 36 }).notNull(), payloadDigest: char('payload_digest', { length: 64 }).notNull(),
  withdrawalDigest: char('withdrawal_digest', { length: 64 }).notNull(), withdrawal: json().notNull(),
  actorUserId: int('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_sales_withdrawal_request').on(table.merchantId, table.requestId),
  uniqueIndex('uq_sales_withdrawal_protocol').on(table.protocolId)]);

export const aiSalesExperimentCohorts = mysqlTable('ai_sales_experiment_cohorts', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  protocolId: bigint('protocol_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesExperimentProtocols.id, { onDelete: 'cascade' }),
  requestId: char('request_id', { length: 36 }).notNull(), payloadDigest: char('payload_digest', { length: 64 }).notNull(),
  protocolDigest: char('protocol_digest', { length: 64 }).notNull(), cohortDigest: char('cohort_digest', { length: 64 }).notNull(),
  snapshot: json().notNull(), actorUserId: int('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_sales_cohort_request').on(table.merchantId, table.requestId), uniqueIndex('uq_sales_cohort_protocol').on(table.protocolId)]);

export const aiSalesExperimentReviews = mysqlTable('ai_sales_experiment_reviews', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  protocolId: bigint('protocol_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesExperimentProtocols.id, { onDelete: 'cascade' }),
  revision: bigint({ mode: 'number', unsigned: true }).notNull(),
  requestId: char('request_id', { length: 36 }).notNull(), payloadDigest: char('payload_digest', { length: 64 }).notNull(),
  basisDigest: char('basis_digest', { length: 64 }).notNull(), reviewDigest: char('review_digest', { length: 64 }).notNull(),
  snapshot: json().notNull(), verdict: varchar({ length: 16 }).notNull(),
  actorUserId: int('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_sales_review_request').on(table.merchantId, table.requestId), uniqueIndex('uq_sales_review_revision').on(table.protocolId, table.revision),
  check('ck_sales_review_revision', sql`${table.revision} BETWEEN 1 AND 9007199254740991`),
  check('ck_sales_review_verdict', sql`${table.verdict} IN ('approved','rejected')`)]);

export const aiSalesExperimentLaunches = mysqlTable('ai_sales_experiment_launches', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  protocolId: bigint('protocol_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesExperimentProtocols.id, { onDelete: 'cascade' }),
  requestId: char('request_id', { length: 36 }).notNull(), payloadDigest: char('payload_digest', { length: 64 }).notNull(),
  basisDigest: char('basis_digest', { length: 64 }).notNull(), reviewId: bigint('review_id', { mode: 'number', unsigned: true }).notNull(),
  reviewDigest: char('review_digest', { length: 64 }).notNull(), launchDigest: char('launch_digest', { length: 64 }).notNull(),
  snapshot: json().notNull(), state: varchar({ length: 16 }).notNull().default('authorized'),
  actorUserId: int('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_sales_launch_request').on(table.merchantId, table.requestId), uniqueIndex('uq_sales_launch_protocol').on(table.protocolId),
  check('ck_sales_launch_state', sql`${table.state} IN ('authorized','revoked')`)]);

export const aiSalesExperimentLaunchRevocations = mysqlTable('ai_sales_experiment_launch_revocations', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  launchId: bigint('launch_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesExperimentLaunches.id, { onDelete: 'cascade' }),
  requestId: char('request_id', { length: 36 }).notNull(), payloadDigest: char('payload_digest', { length: 64 }).notNull(),
  revocationDigest: char('revocation_digest', { length: 64 }).notNull(), snapshot: json().notNull(),
  actorUserId: int('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_sales_launch_revoke_request').on(table.merchantId, table.requestId), uniqueIndex('uq_sales_launch_revoke_once').on(table.launchId)]);

export const aiSalesExperimentAssignments = mysqlTable('ai_sales_experiment_assignments', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  protocolId: bigint('protocol_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesExperimentProtocols.id, { onDelete: 'cascade' }),
  launchId: bigint('launch_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesExperimentLaunches.id, { onDelete: 'cascade' }),
  customerKey: char('customer_key', { length: 64 }).notNull(), arm: varchar({ length: 16 }).notNull(),
  conversationReference: int('conversation_reference').notNull(), messageReference: int('message_reference').notNull(),
  observationEndsAt: datetime('observation_ends_at', { mode: 'string', fsp: 3 }).notNull(),
  assignmentDigest: char('assignment_digest', { length: 64 }).notNull(), snapshot: json().notNull(),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_sales_assignment_customer').on(table.merchantId, table.protocolId, table.customerKey),
  uniqueIndex('uq_sales_assignment_source').on(table.protocolId, table.messageReference), index('idx_sales_assignment_overlap').on(table.merchantId, table.customerKey, table.observationEndsAt),
  check('ck_sales_assignment_arm', sql`${table.arm} IN ('baseline','candidate')`)]);

// Durable references, not cascading conversation/message foreign keys.
export const aiSalesExperimentAssignmentConversations = mysqlTable('ai_sales_experiment_assignment_conversations', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  protocolId: bigint('protocol_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesExperimentProtocols.id, { onDelete: 'cascade' }),
  conversationReference: int('conversation_reference').notNull(), customerKey: char('customer_key', { length: 64 }).notNull(),
  assignmentId: bigint('assignment_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesExperimentAssignments.id, { onDelete: 'cascade' }),
}, table => [uniqueIndex('uq_sales_assignment_conversation').on(table.merchantId, table.protocolId, table.conversationReference)]);

export const aiSalesExperimentTurns = mysqlTable('ai_sales_experiment_turns', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  protocolId: bigint('protocol_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesExperimentProtocols.id, { onDelete: 'cascade' }),
  assignmentId: bigint('assignment_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesExperimentAssignments.id, { onDelete: 'cascade' }),
  conversationReference: int('conversation_reference').notNull(), messageReference: int('message_reference').notNull(),
  requestId: char('request_id', { length: 36 }).notNull(), payloadDigest: char('payload_digest', { length: 64 }).notNull(),
  turnDigest: char('turn_digest', { length: 64 }).notNull(), snapshot: json().notNull(),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_sales_turn_request').on(table.merchantId, table.requestId), uniqueIndex('uq_sales_turn_message').on(table.merchantId, table.messageReference),
  index('idx_sales_turn_assignment').on(table.merchantId, table.assignmentId, table.id)]);

export const aiSalesExperimentGenerations = mysqlTable('ai_sales_experiment_generations', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  turnId: bigint('turn_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesExperimentTurns.id, { onDelete: 'cascade' }),
  actorUserId: int('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  requestId: char('request_id', { length: 36 }).notNull(), payloadDigest: char('payload_digest', { length: 64 }).notNull(),
  authorizationDigest: char('authorization_digest', { length: 64 }).notNull(), snapshot: json().notNull(),
  state: mysqlEnum(['dispatching', 'responded', 'invalid', 'blocked', 'uncertain']).notNull(), claimToken: char('claim_token', { length: 36 }).notNull(),
  reservationKey: varchar('reservation_key', { length: 64 }), responseText: mediumtext('response_text'), responseMetadata: json('response_metadata'),
  expectedReservationKey: char('expected_reservation_key', { length: 64 }),
  responseDigest: char('response_digest', { length: 64 }), failureCode: varchar('failure_code', { length: 64 }),
  providerReceipt: json('provider_receipt'), providerReceiptDigest: char('provider_receipt_digest', { length: 64 }),
  recoveryToken: char('recovery_token', { length: 36 }), recoveryLeaseUntil: datetime('recovery_lease_until', { mode: 'string', fsp: 3 }),
  recoveryNextAt: datetime('recovery_next_at', { mode: 'string', fsp: 3 }), recoveryAttempts: int('recovery_attempts', { unsigned: true }).notNull().default(0),
  recoveryLastError: varchar('recovery_last_error', { length: 64 }),
  leaseUntil: datetime('lease_until', { mode: 'string', fsp: 3 }), completedAt: datetime('completed_at', { mode: 'string', fsp: 3 }),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_sales_generation_request').on(table.merchantId, table.requestId), uniqueIndex('uq_sales_generation_turn').on(table.merchantId, table.turnId),
  uniqueIndex('uq_sales_generation_reservation').on(table.reservationKey), index('idx_sales_generation_recovery').on(table.state, table.recoveryNextAt),
  uniqueIndex('uq_sales_generation_expected_reservation').on(table.expectedReservationKey)]);

export const aiSalesGenerationOutputReviews = mysqlTable('ai_sales_generation_output_reviews', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  generationId: bigint('generation_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesExperimentGenerations.id, { onDelete: 'cascade' }),
  actorUserId: int('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  revision: bigint({ mode: 'number', unsigned: true }).notNull(), requestId: char('request_id', { length: 36 }).notNull(),
  payloadDigest: char('payload_digest', { length: 64 }).notNull(), basisDigest: char('basis_digest', { length: 64 }).notNull(),
  reviewDigest: char('review_digest', { length: 64 }).notNull(), snapshot: json().notNull(), outcome: varchar({ length: 16 }).notNull(),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_sales_reply_review_request').on(table.merchantId, table.requestId), uniqueIndex('uq_sales_reply_review_revision').on(table.generationId, table.revision)]);

export const aiSalesReplyDeliveries = mysqlTable('ai_sales_reply_deliveries', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  generationId: bigint('generation_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesExperimentGenerations.id, { onDelete: 'cascade' }),
  messageReference: int('message_reference').notNull(), actorUserId: int('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  requestId: char('request_id', { length: 36 }).notNull(), payloadDigest: char('payload_digest', { length: 64 }).notNull(),
  basisDigest: char('basis_digest', { length: 64 }).notNull(), authorizationDigest: char('authorization_digest', { length: 64 }).notNull(),
  snapshot: json().notNull(), state: varchar({ length: 16 }).notNull(), dispatchStartedAt: datetime('dispatch_started_at', { mode: 'string', fsp: 3 }),
  projectionState: varchar('projection_state', { length: 16 }).notNull().default('pending'),
  projectionToken: char('projection_token', { length: 36 }),
  projectionLeaseUntil: datetime('projection_lease_until', { mode: 'string', fsp: 3 }),
  projectionNextAt: datetime('projection_next_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`),
  projectionAttempts: int('projection_attempts', { unsigned: true }).notNull().default(0),
  projectionLastError: varchar('projection_last_error', { length: 40 }),
  projectionCompletedAt: datetime('projection_completed_at', { mode: 'string', fsp: 3 }),
  usageState: varchar('usage_state', { length: 16 }).notNull().default('legacy'),
  usageSubscriptionId: int('usage_subscription_id'),
  usagePeriodStart: datetime('usage_period_start', { mode: 'string', fsp: 3 }),
  usageUnits: int('usage_units', { unsigned: true }).notNull().default(0),
  usageReservedAt: datetime('usage_reserved_at', { mode: 'string', fsp: 3 }),
  usageDigest: char('usage_digest', { length: 64 }),
  usageSettledAt: datetime('usage_settled_at', { mode: 'string', fsp: 3 }),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_sales_reply_delivery_request').on(table.merchantId, table.requestId),
  uniqueIndex('uq_sales_reply_delivery_generation').on(table.merchantId, table.generationId),
  uniqueIndex('uq_sales_reply_delivery_message').on(table.merchantId, table.messageReference),
  index('idx_sales_reply_projection_due').on(table.state,table.projectionState,table.projectionNextAt,table.projectionLeaseUntil),
  index('idx_sales_reply_usage_holds').on(table.merchantId,table.usageSubscriptionId,table.usagePeriodStart,table.usageState),
  check('ck_sales_reply_usage', sql`(${table.usageState} IN ('legacy','pending') AND ${table.usageUnits}=0 AND ${table.usageSubscriptionId} IS NULL
    AND ${table.usagePeriodStart} IS NULL AND ${table.usageReservedAt} IS NULL AND ${table.usageDigest} IS NULL AND ${table.usageSettledAt} IS NULL)
    OR (${table.usageState} IN ('held','charged','historical','released') AND ${table.usageUnits}=2 AND ${table.usageSubscriptionId}>0
      AND ${table.usageSubscriptionId} IS NOT NULL AND ${table.usagePeriodStart} IS NOT NULL AND ${table.usageReservedAt} IS NOT NULL
      AND ${table.usageDigest} IS NOT NULL AND CHAR_LENGTH(${table.usageDigest})=64
      AND ((${table.usageState}='held' AND ${table.usageSettledAt} IS NULL) OR (${table.usageState}<>'held' AND ${table.usageSettledAt} IS NOT NULL)))`),
  check('ck_sales_reply_projection', sql`(${table.projectionState}='pending' AND ${table.projectionNextAt} IS NOT NULL AND ${table.projectionCompletedAt} IS NULL
    AND ((${table.projectionToken} IS NULL AND ${table.projectionLeaseUntil} IS NULL) OR (${table.projectionToken} IS NOT NULL AND ${table.projectionLeaseUntil} IS NOT NULL)))
    OR (${table.projectionState}='projected' AND ${table.projectionNextAt} IS NULL AND ${table.projectionCompletedAt} IS NOT NULL AND ${table.projectionToken} IS NULL AND ${table.projectionLeaseUntil} IS NULL)
    OR (${table.projectionState}='review' AND ${table.projectionNextAt} IS NULL AND ${table.projectionCompletedAt} IS NULL AND ${table.projectionToken} IS NULL AND ${table.projectionLeaseUntil} IS NULL)`) ]);

export const aiSalesExperimentExposures = mysqlTable('ai_sales_experiment_exposures', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  deliveryId: bigint('delivery_id', { mode: 'number', unsigned: true }).notNull().references(() => aiSalesReplyDeliveries.id, { onDelete: 'cascade' }),
  protocolId: bigint('protocol_id', { mode: 'number', unsigned: true }).notNull(),
  assignmentId: bigint('assignment_id', { mode: 'number', unsigned: true }).notNull(),
  outboxId: bigint('outbox_id', { mode: 'number', unsigned: true }).notNull(),
  exposureDigest: char('exposure_digest', { length: 64 }).notNull(), snapshot: json().notNull(),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_sales_exposure_delivery').on(table.merchantId,table.deliveryId),
  uniqueIndex('uq_sales_exposure_outbox').on(table.merchantId,table.outboxId),
  index('idx_sales_exposure_assignment').on(table.merchantId,table.protocolId,table.assignmentId,table.id)]);

export const aiSalesPaymentFacts = mysqlTable('ai_sales_payment_facts', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  paymentId: int('payment_id').notNull(), eventType: mysqlEnum('event_type',['captured','refunded']).notNull(),
  targetKind: mysqlEnum('target_kind',['order','booking']).notNull(), targetId: int('target_id').notNull(),
  customerKey: char('customer_key', { length: 64 }), factDigest: char('fact_digest', { length: 64 }).notNull(), snapshot: json().notNull(),
  attributionState: mysqlEnum('attribution_state',['pending','attributed','unassigned','review']).notNull().default('pending'),
  attributionDigest: char('attribution_digest', { length: 64 }), attribution: json(), attempts: int().notNull().default(0),
  nextAt: datetime('next_at', { mode: 'string', fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`), lastError: varchar('last_error', { length: 40 }),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_sales_payment_event').on(table.merchantId,table.paymentId,table.eventType),
  uniqueIndex('uq_sales_target_event').on(table.merchantId,table.targetKind,table.targetId,table.eventType),
  index('idx_sales_payment_pending').on(table.attributionState,table.nextAt,table.id),
  check('ck_sales_payment_attribution', sql`${table.attempts} BETWEEN 0 AND 8 AND (
    (${table.attributionState}='pending' AND ${table.nextAt} IS NOT NULL AND ${table.attribution} IS NULL AND ${table.attributionDigest} IS NULL)
    OR (${table.attributionState}='attributed' AND ${table.nextAt} IS NULL AND ${table.attribution} IS NOT NULL AND ${table.attributionDigest} IS NOT NULL)
    OR (${table.attributionState} IN ('unassigned','review') AND ${table.nextAt} IS NULL AND ${table.attribution} IS NULL AND ${table.attributionDigest} IS NULL))`)]);

export const aiSalesOrderFacts = mysqlTable('ai_sales_order_facts', {
  id: bigint({mode:'number',unsigned:true}).autoincrement().primaryKey(),
  merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),quotationId:int('quotation_id').notNull(),
  provider:mysqlEnum('provider',['local','zid']).notNull(),localOrderId:int('local_order_id'),orderKey:char('order_key',{length:64}).notNull(),
  customerKey:char('customer_key',{length:64}),factDigest:char('fact_digest',{length:64}).notNull(),snapshot:json().notNull(),
  attributionState:mysqlEnum('attribution_state',['pending','attributed','unassigned','review']).notNull().default('pending'),
  attributionDigest:char('attribution_digest',{length:64}),attribution:json(),attempts:int().notNull().default(0),
  nextAt:datetime('next_at',{mode:'string',fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`),lastError:varchar('last_error',{length:40}),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},t=>[uniqueIndex('uq_sales_order_quote').on(t.merchantId,t.quotationId),uniqueIndex('uq_sales_order_identity').on(t.merchantId,t.orderKey),
  uniqueIndex('uq_sales_order_local').on(t.merchantId,t.localOrderId),index('idx_sales_order_pending').on(t.attributionState,t.nextAt,t.id),
  check('ck_sales_order_attribution',sql`${t.attempts} BETWEEN 0 AND 8 AND (
    (${t.attributionState}='pending' AND ${t.nextAt} IS NOT NULL AND ${t.attribution} IS NULL AND ${t.attributionDigest} IS NULL)
    OR (${t.attributionState}='attributed' AND ${t.nextAt} IS NULL AND ${t.attribution} IS NOT NULL AND ${t.attributionDigest} IS NOT NULL)
    OR (${t.attributionState} IN ('unassigned','review') AND ${t.nextAt} IS NULL AND ${t.attribution} IS NULL AND ${t.attributionDigest} IS NULL))`)]);

export const aiSalesOrderLinks = mysqlTable('ai_sales_order_links', {
  id:bigint({mode:'number',unsigned:true}).autoincrement().primaryKey(),
  merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  orderFactId:bigint('order_fact_id',{mode:'number',unsigned:true}).notNull(),orderFactDigest:char('order_fact_digest',{length:64}).notNull(),
  orderKey:char('order_key',{length:64}).notNull(),sourceRowId:int('source_row_id').notNull(),localOrderId:int('local_order_id').notNull(),
  linkDigest:char('link_digest',{length:64}).notNull(),snapshot:json().notNull(),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},t=>[uniqueIndex('uq_sales_link_fact').on(t.merchantId,t.orderFactId),uniqueIndex('uq_sales_link_order').on(t.merchantId,t.orderKey),
  uniqueIndex('uq_sales_link_local').on(t.merchantId,t.localOrderId)]);

export const aiPurchaseOutcomes = mysqlTable('ai_purchase_outcomes', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  profileId: int('profile_id').notNull().references(() => customerProfiles.id, { onDelete: 'cascade' }),
  paymentId: int('payment_id').notNull().references(() => orderPayments.id, { onDelete: 'cascade' }),
  conversationId: int('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  outcomeType: varchar('outcome_type', { length: 30 }).notNull(),
  schemaVersion: int('schema_version').notNull().default(1),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_purchase_outcome').on(table.merchantId, table.paymentId, table.outcomeType)]);

export const aiLearningEvidenceLinks = mysqlTable('ai_learning_evidence_links', {
  proposalId: bigint('proposal_id', { mode: 'number', unsigned: true }).notNull().references(() => aiLearningProposals.id, { onDelete: 'cascade' }),
  signalId: int('signal_id').notNull().references(() => sariLearningSignals.id, { onDelete: 'cascade' }),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  relation: varchar('relation', { length: 16 }).notNull(),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [primaryKey({ columns: [table.proposalId, table.signalId, table.relation] }),
  index('idx_evidence_merchant').on(table.merchantId, table.proposalId)]);

// Descriptive observations only; publication is not strategy approval.
export const aiSalesPlaybooks = mysqlTable("ai_sales_playbooks", {
  merchantId: int("merchant_id").primaryKey().references(() => merchants.id, { onDelete: "cascade" }),
  dailyAnalysis: json("daily_analysis"), weeklyAnalysis: json("weekly_analysis"),
  dailyUpdatedAt: datetime("daily_updated_at", { mode: "string", fsp: 3 }),
  weeklyUpdatedAt: datetime("weekly_updated_at", { mode: "string", fsp: 3 }),
  revision: bigint("revision", { mode: "number", unsigned: true }).notNull().default(1),
});

export const salesOfferLimits = mysqlTable('sales_offer_limits', {
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  customerPhone: varchar('customer_phone', { length: 50 }).notNull(),
  lastIssuedAt: datetime('last_issued_at', { mode: 'string', fsp: 3 }),
  lastShareAt: datetime('last_share_at', { mode: 'string', fsp: 3 }),
}, table => [primaryKey({ columns: [table.merchantId, table.customerPhone] })]);

// Retain source/coupon identifiers after deletion so removal cannot reset a monetary limit or replay a send.
export const salesOfferAttempts = mysqlTable('sales_offer_attempts', {
  id: varchar({ length: 36 }).primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  conversationId: int('conversation_id').notNull(),
  sourceMessageId: int('source_message_id').notNull(),
  customerPhone: varchar('customer_phone', { length: 50 }).notNull(),
  kind: mysqlEnum(['issue', 'share']).notNull(),
  state: mysqlEnum(['issued', 'reserved', 'dispatching', 'accepted', 'unknown', 'cancelled']).notNull(),
  discountCodeId: int('discount_code_id').notNull(),
  evidence: json().notNull(),
  issuanceAuthorization: json('issuance_authorization'),
  reviewRevision: int('review_revision').notNull().default(0),
  instanceId: int('instance_id'),
  provider: varchar({ length: 20 }),
  providerAccount: varchar('provider_account', { length: 100 }),
  dispatchText: text('dispatch_text'),
  dispatchStartedAt: datetime('dispatch_started_at', { mode: 'string', fsp: 3 }),
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  reconciledAt: datetime('reconciled_at', { mode: 'string', fsp: 3 }),
  nextReconcileAt: datetime('next_reconcile_at', { mode: 'string', fsp: 3 }),
  lastReconcileError: varchar('last_reconcile_error', { length: 64 }),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime('updated_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_offer_source').on(table.merchantId, table.sourceMessageId, table.kind),
  index('idx_offer_customer').on(table.merchantId, table.customerPhone, table.createdAt),
  index('idx_offer_reconciliation').on(table.nextReconcileAt, table.id)]);

export const salesOfferReviews = mysqlTable('sales_offer_reviews', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  attemptId: varchar('attempt_id', { length: 36 }).notNull().references(() => salesOfferAttempts.id, { onDelete: 'cascade' }),
  actorUserId: int('actor_user_id').notNull(),
  revision: int().notNull(),
  evidenceHash: char('evidence_hash', { length: 64 }).notNull(),
  outcome: mysqlEnum(['recorded', 'accepted_unprojected', 'failed', 'unresolved']).notNull(),
  deliveryState: varchar('delivery_state', { length: 20 }).notNull(),
  note: varchar({ length: 1000 }).notNull(),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_offer_review').on(table.merchantId, table.attemptId, table.revision)]);

export const salesDiscountPolicyChanges = mysqlTable('sales_discount_policy_changes', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  actorUserId: int('actor_user_id').notNull(),
  revision: int().notNull(),
  evidenceHash: char('evidence_hash', { length: 64 }).notNull(),
  beforePolicy: json('before_policy').notNull(), afterPolicy: json('after_policy').notNull(),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_discount_policy_revision').on(table.merchantId, table.revision)]);

export const salesMarginPolicies = mysqlTable('sales_margin_policies', {
  merchantId: int('merchant_id').primaryKey().references(() => merchants.id, { onDelete: 'cascade' }),
  enabled: tinyint().notNull().default(0), minPercent: int('min_percent').notNull().default(0), revision: int().notNull().default(0),
});
export const salesMarginPolicyChanges = mysqlTable('sales_margin_policy_changes', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  actorUserId: int('actor_user_id').notNull(), revision: int().notNull(), evidenceHash: char('evidence_hash', { length: 64 }).notNull(),
  beforePolicy: json('before_policy').notNull(), afterPolicy: json('after_policy').notNull(),
  createdAt: datetime('created_at', {mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_margin_policy_revision').on(table.merchantId,table.revision)]);

export const checkoutMarginExceptions = mysqlTable('checkout_margin_exceptions', {
  id: int().autoincrement().primaryKey(),
  merchantId: int('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  orderId: int('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  actorUserId: int('actor_user_id').notNull(), reason: varchar({ length: 1000 }).notNull(),
  evidenceHash: char('evidence_hash', { length: 64 }).notNull(), assessment: json().notNull(),
  createdAt: datetime('created_at', { mode: 'string', fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
}, table => [uniqueIndex('uq_margin_exception_order').on(table.orderId), index('idx_margin_exception_merchant').on(table.merchantId, table.orderId)]);

export const checkoutDiscountRedemptions = mysqlTable('checkout_discount_redemptions', {
  id:int().autoincrement().primaryKey(), merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  orderId:int('order_id').notNull().references(()=>orders.id,{onDelete:'cascade'}), quotationId:int('quotation_id').notNull(),
  couponId:int('coupon_id').notNull(), actorUserId:int('actor_user_id').notNull(), discountCode:varchar('discount_code',{length:50}).notNull(),
  subtotalMinor:int('subtotal_minor').notNull(),discountMinor:int('discount_minor').notNull(),totalMinor:int('total_minor').notNull(),terms:json().notNull(),
  releasePolicyVersion:int('release_policy_version').notNull().default(0),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},table=>[uniqueIndex('uq_checkout_discount_order').on(table.orderId)]);

export const checkoutDiscountReleases = mysqlTable('checkout_discount_releases', {
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  orderId:int('order_id').notNull().references(()=>orders.id,{onDelete:'cascade'}),
  redemptionId:int('redemption_id').notNull().references(()=>checkoutDiscountRedemptions.id,{onDelete:'cascade'}),
  couponId:int('coupon_id').notNull(),actorUserId:int('actor_user_id').notNull(),reason:varchar({length:500}).notNull(),
  policyVersion:int('policy_version').notNull(),usedBefore:int('used_before').notNull(),usedAfter:int('used_after').notNull(),
  evidenceHash:char('evidence_hash',{length:64}).notNull(),createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},table=>[uniqueIndex('uq_checkout_discount_release_order').on(table.orderId),uniqueIndex('uq_checkout_discount_release_redemption').on(table.redemptionId)]);

export const orderCheckoutAttempts = mysqlTable('order_checkout_attempts', {
  id:char({length:36}).primaryKey(), merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  orderId:int('order_id').notNull().references(()=>orders.id,{onDelete:'cascade'}),
  paymentLinkId:int('payment_link_id').notNull().references(()=>paymentLinks.id,{onDelete:'cascade'}),
  requestId:char('request_id',{length:36}).notNull(),requestHash:char('request_hash',{length:64}).notNull(),
  providerReference:varchar('provider_reference',{length:100}).notNull(),amountMinor:int('amount_minor').notNull(),currency:char({length:3}).notNull(),
  state:varchar({length:20}).notNull().default('dispatching'),paymentId:int('payment_id'),failureCode:varchar('failure_code',{length:40}),
  reviewRevision:int('review_revision').notNull().default(0),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt:datetime('updated_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  activeOrderId:int('active_order_id').generatedAlwaysAs(sql`CASE WHEN state IN ('dispatching','unknown','created') THEN order_id ELSE NULL END`,{mode:'virtual'}),
},table=>[uniqueIndex('uq_checkout_request').on(table.paymentLinkId,table.requestId),uniqueIndex('uq_checkout_active_order').on(table.activeOrderId),
  uniqueIndex('uq_checkout_provider_reference').on(table.providerReference)]);

export const orderCheckoutReviews = mysqlTable('order_checkout_reviews', {
  id:int().autoincrement().primaryKey(),attemptId:char('attempt_id',{length:36}).notNull().references(()=>orderCheckoutAttempts.id,{onDelete:'cascade'}),
  revision:int().notNull(),actorUserId:int('actor_user_id').notNull(),chargeId:varchar('charge_id',{length:255}).notNull(),
  outcome:varchar({length:20}).notNull(),reason:varchar({length:40}),providerStatus:varchar('provider_status',{length:32}),
  proofHash:char('proof_hash',{length:64}).notNull(),createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},table=>[uniqueIndex('uq_checkout_review_revision').on(table.attemptId,table.revision)]);

export const bookingCheckoutAttempts = mysqlTable('booking_checkout_attempts', {
  reviewRevision:int('review_revision').notNull().default(0),
  id:char({length:36}).primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  bookingId:int('booking_id').notNull().references(()=>bookings.id,{onDelete:'cascade'}),
  paymentLinkId:int('payment_link_id').notNull().references(()=>paymentLinks.id,{onDelete:'cascade'}),
  requestId:char('request_id',{length:36}).notNull(),requestHash:char('request_hash',{length:64}).notNull(),
  providerReference:varchar('provider_reference',{length:100}).notNull(),amountMinor:int('amount_minor').notNull(),currency:char({length:3}).notNull(),
  state:varchar({length:20}).notNull().default('dispatching'),paymentId:int('payment_id'),failureCode:varchar('failure_code',{length:40}),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt:datetime('updated_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  activeBookingId:int('active_booking_id').generatedAlwaysAs(sql`CASE WHEN state IN ('dispatching','unknown','created') THEN booking_id ELSE NULL END`,{mode:'virtual'}),
},table=>[uniqueIndex('uq_booking_checkout_request').on(table.paymentLinkId,table.requestId),
  uniqueIndex('uq_booking_checkout_active').on(table.activeBookingId),uniqueIndex('uq_booking_checkout_reference').on(table.providerReference)]);

export const bookingCheckoutReviews = mysqlTable('booking_checkout_reviews', {
  id:int().autoincrement().primaryKey(),attemptId:char('attempt_id',{length:36}).notNull().references(()=>bookingCheckoutAttempts.id,{onDelete:'cascade'}),
  revision:int().notNull(),actorUserId:int('actor_user_id').notNull(),chargeId:varchar('charge_id',{length:255}).notNull(),
  outcome:varchar({length:20}).notNull(),reason:varchar({length:40}),providerStatus:varchar('provider_status',{length:32}),
  proofHash:char('proof_hash',{length:64}).notNull(),createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},table=>[uniqueIndex('uq_booking_checkout_review_revision').on(table.attemptId,table.revision)]);

export const bookingPaymentLinkRenewals = mysqlTable('booking_payment_link_renewals', {
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  bookingId:int('booking_id').notNull().references(()=>bookings.id,{onDelete:'cascade'}),
  paymentLinkId:int('payment_link_id').notNull().references(()=>paymentLinks.id,{onDelete:'cascade'}),
  actorUserId:int('actor_user_id').notNull(),reason:varchar({length:500}).notNull(),
  priorExpiresAt:datetime('prior_expires_at',{mode:'string',fsp:3}).notNull(),renewedExpiresAt:datetime('renewed_expires_at',{mode:'string',fsp:3}).notNull(),
  evidenceHash:char('evidence_hash',{length:64}).notNull(),createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},table=>[uniqueIndex('uq_booking_link_renewal_evidence').on(table.paymentLinkId,table.evidenceHash),index('idx_booking_link_renewal_booking').on(table.bookingId,table.id)]);

export const bookingOperationAudits = mysqlTable('booking_operation_audits', {
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  bookingReference:int('booking_reference').notNull(),actorUserId:int('actor_user_id').notNull(),requestId:char('request_id',{length:36}).notNull(),
  requestHash:char('request_hash',{length:64}).notNull(),operation:varchar({length:20}).notNull(),
  beforeState:json('before_state').notNull(),afterState:json('after_state'),changedFields:json('changed_fields').notNull(),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},table=>[uniqueIndex('uq_booking_operation_request').on(table.merchantId,table.requestId),index('idx_booking_operation_history').on(table.merchantId,table.bookingReference,table.id)]);

export const bookingCapacityLocks = mysqlTable("booking_capacity_locks", {
  merchantId: int("merchant_id").notNull().primaryKey().references(() => merchants.id, { onDelete: "cascade" }),
});

export const bookingCalendarLinks = mysqlTable("booking_calendar_links", {
 id: int().autoincrement().primaryKey(), merchantId: int("merchant_id").notNull().references(()=>merchants.id,{onDelete:"cascade"}),
 bookingReference:int("booking_reference").notNull(),actorUserId:int("actor_user_id").notNull(),requestId:char("request_id",{length:36}).notNull(),requestHash:char("request_hash",{length:64}).notNull(),
 agreementId:int("agreement_id").notNull(),integrationId:int("integration_id").notNull(),calendarId:varchar("calendar_id",{length:255}).notNull(),identityHash:char("identity_hash",{length:64}).notNull(),
 eventReference:varchar("event_reference",{length:100}).notNull(),payload:json().notNull(),payloadHash:char("payload_hash",{length:64}).notNull(),state:varchar({length:24}).default("creating").notNull(),
 failureCode:varchar("failure_code",{length:40}),revision:int().default(0).notNull(),checkedAt:datetime("checked_at",{mode:"string",fsp:3}),
 createdAt:datetime("created_at",{mode:"string",fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),updatedAt:datetime("updated_at",{mode:"string",fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
},t=>[uniqueIndex("uq_booking_calendar_booking").on(t.merchantId,t.bookingReference),uniqueIndex("uq_booking_calendar_request").on(t.merchantId,t.requestId),uniqueIndex("uq_booking_calendar_event").on(t.eventReference)]);
export const bookingCalendarReviews = mysqlTable("booking_calendar_reviews", {
 id:int().autoincrement().primaryKey(),merchantId:int("merchant_id").notNull().references(()=>merchants.id,{onDelete:"cascade"}),bookingReference:int("booking_reference").notNull(),actorUserId:int("actor_user_id").notNull(),
 requestId:char("request_id",{length:36}).notNull(),requestHash:char("request_hash",{length:64}).notNull(),action:varchar({length:20}).notNull(),outcome:varchar({length:24}).notNull(),failureCode:varchar("failure_code",{length:40}),
 reason:varchar({length:500}).notNull(),proofHash:char("proof_hash",{length:64}).notNull(),createdAt:datetime("created_at",{mode:"string",fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
},t=>[uniqueIndex("uq_booking_calendar_review_request").on(t.merchantId,t.requestId),index("idx_booking_calendar_reviews").on(t.merchantId,t.bookingReference,t.id)]);

export const bookingCalendarCancellations = mysqlTable("booking_calendar_cancellations", {
 id:int().autoincrement().primaryKey(),merchantId:int("merchant_id").notNull().references(()=>merchants.id,{onDelete:"cascade"}),bookingReference:int("booking_reference").notNull(),actorUserId:int("actor_user_id").notNull(),
 requestId:char("request_id",{length:36}).notNull(),requestHash:char("request_hash",{length:64}).notNull(),snapshot:json().notNull(),snapshotHash:char("snapshot_hash",{length:64}).notNull(),eventEtag:varchar("event_etag",{length:256}).notNull(),
 reason:varchar({length:500}).notNull(),evidenceHash:char("evidence_hash",{length:64}).notNull(),state:varchar({length:24}).default("cancelling").notNull(),failureCode:varchar("failure_code",{length:40}),revision:int().default(0).notNull(),
 createdAt:datetime("created_at",{mode:"string",fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),updatedAt:datetime("updated_at",{mode:"string",fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
},t=>[uniqueIndex("uq_booking_cancel_booking").on(t.merchantId,t.bookingReference),uniqueIndex("uq_booking_cancel_request").on(t.merchantId,t.requestId)]);

export const bookingCalendarReschedules = mysqlTable("booking_calendar_reschedules", {
 id:int().autoincrement().primaryKey(),merchantId:int("merchant_id").notNull().references(()=>merchants.id,{onDelete:"cascade"}),bookingReference:int("booking_reference").notNull(),agreementId:int("agreement_id").notNull(),serviceId:int("service_id").notNull(),staffId:int("staff_id"),bookingDate:date("booking_date",{mode:"string"}).notNull(),startTime:varchar("start_time",{length:5}).notNull(),endTime:varchar("end_time",{length:5}).notNull(),
 snapshot:json().notNull(),snapshotHash:char("snapshot_hash",{length:64}).notNull(),state:varchar({length:24}).default("pending").notNull(),actorUserId:int("actor_user_id"),requestId:char("request_id",{length:36}),requestHash:char("request_hash",{length:64}),eventEtag:varchar("event_etag",{length:256}),reason:varchar({length:500}),failureCode:varchar("failure_code",{length:40}),revision:int().default(0).notNull(),
 createdAt:datetime("created_at",{mode:"string",fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),updatedAt:datetime("updated_at",{mode:"string",fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
},t=>[uniqueIndex("uq_booking_move_agreement").on(t.merchantId,t.agreementId),uniqueIndex("uq_booking_move_request").on(t.merchantId,t.requestId),index("idx_booking_move_booking").on(t.merchantId,t.bookingReference,t.id),index("idx_booking_move_capacity").on(t.merchantId,t.bookingDate,t.state)]);

export const bookingRescheduleNotifications = mysqlTable("booking_reschedule_notifications", {
 id:int().autoincrement().primaryKey(),merchantId:int("merchant_id").notNull().references(()=>merchants.id,{onDelete:"cascade"}),rescheduleId:int("reschedule_id"),kind:varchar({length:16}).default("reschedule").notNull(),cancellationId:int("cancellation_id"),confirmationId:int("confirmation_id"),bookingReference:int("booking_reference").notNull(),snapshot:json().notNull(),snapshotHash:char("snapshot_hash",{length:64}).notNull(),dispatchText:text("dispatch_text").notNull(),state:varchar({length:24}).default("pending").notNull(),claimToken:char("claim_token",{length:36}),dispatchStartedAt:datetime("dispatch_started_at",{mode:"string",fsp:3}),acceptedAt:datetime("accepted_at",{mode:"string",fsp:3}),providerMessageId:varchar("provider_message_id",{length:255}),deliveryState:varchar("delivery_state",{length:24}).default("none").notNull(),projectionMessageId:int("projection_message_id"),lastError:varchar("last_error",{length:40}),nextCheckAt:datetime("next_check_at",{mode:"string",fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`),createdAt:datetime("created_at",{mode:"string",fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),updatedAt:datetime("updated_at",{mode:"string",fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
},t=>[uniqueIndex("uq_booking_notice_move").on(t.merchantId,t.rescheduleId),index("idx_booking_notice_due").on(t.state,t.nextCheckAt,t.id),uniqueIndex("uq_booking_notice_cancel").on(t.merchantId,t.cancellationId),uniqueIndex("uq_booking_notice_confirm").on(t.merchantId,t.confirmationId),check("chk_booking_notice_kind",sql`(${t.kind}='reschedule' AND ${t.rescheduleId} IS NOT NULL AND ${t.cancellationId} IS NULL AND ${t.confirmationId} IS NULL) OR (${t.kind}='cancellation' AND ${t.cancellationId} IS NOT NULL AND ${t.rescheduleId} IS NULL AND ${t.confirmationId} IS NULL) OR (${t.kind}='confirmation' AND ${t.confirmationId} IS NOT NULL AND ${t.rescheduleId} IS NULL AND ${t.cancellationId} IS NULL)`)]);

export const bookingNotificationReviews = mysqlTable("booking_notification_reviews", {
 id:int().autoincrement().primaryKey(),merchantId:int("merchant_id").notNull().references(()=>merchants.id,{onDelete:"cascade"}),notificationId:int("notification_id").notNull(),bookingReference:int("booking_reference").notNull(),actorUserId:int("actor_user_id").notNull(),requestId:char("request_id",{length:36}).notNull(),requestHash:char("request_hash",{length:64}).notNull(),evidenceHash:char("evidence_hash",{length:64}).notNull(),outcome:varchar({length:24}).notNull(),deliveryState:varchar("delivery_state",{length:24}).notNull(),projected:int().notNull(),reason:varchar({length:500}).notNull(),createdAt:datetime("created_at",{mode:"string",fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
},t=>[uniqueIndex("uq_booking_notice_review_request").on(t.merchantId,t.requestId),index("idx_booking_notice_reviews").on(t.merchantId,t.notificationId,t.id)]);

// References are durable tombstones: deleting a source/appointment must never recreate an attempt.
export const appointmentReminders = mysqlTable("appointment_reminders", {
 id:int().autoincrement().primaryKey(),merchantId:int("merchant_id").notNull().references(()=>merchants.id,{onDelete:"cascade"}),appointmentReference:int("appointment_reference").notNull(),sourceMessageId:int("source_message_id").notNull(),hoursBefore:int("hours_before").notNull(),termsHash:char("terms_hash",{length:64}).notNull(),snapshot:json().notNull(),snapshotHash:char("snapshot_hash",{length:64}).notNull(),dispatchText:text("dispatch_text").notNull(),dueAt:datetime("due_at",{mode:"string",fsp:3}).notNull(),expiresAt:datetime("expires_at",{mode:"string",fsp:3}).notNull(),cancelledAt:datetime("cancelled_at",{mode:"string",fsp:3}),cancellationSourceId:int("cancellation_source_id"),state:varchar({length:24}).default("pending").notNull(),claimToken:char("claim_token",{length:36}),dispatchStartedAt:datetime("dispatch_started_at",{mode:"string",fsp:3}),acceptedAt:datetime("accepted_at",{mode:"string",fsp:3}),providerMessageId:varchar("provider_message_id",{length:255}),deliveryState:varchar("delivery_state",{length:24}).default("none").notNull(),projectionMessageId:int("projection_message_id"),lastError:varchar("last_error",{length:40}),nextCheckAt:datetime("next_check_at",{mode:"string",fsp:3}),createdAt:datetime("created_at",{mode:"string",fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),updatedAt:datetime("updated_at",{mode:"string",fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
},t=>[uniqueIndex("uq_appointment_reminder_source").on(t.merchantId,t.sourceMessageId),uniqueIndex("uq_appointment_reminder_terms").on(t.merchantId,t.appointmentReference,t.hoursBefore,t.termsHash),index("idx_appointment_reminder_due").on(t.state,t.nextCheckAt,t.id),check("chk_appointment_reminder_hours",sql`${t.hoursBefore} IN (1,24)`),check("chk_appointment_reminder_window",sql`${t.expiresAt}>${t.dueAt}`)]);

export const learningAnalysisJobs = mysqlTable('ai_learning_analysis_jobs', {
 providerReceipt:json('provider_receipt'),
 aiReservationKey:char('ai_reservation_key',{length:64}),
 merchantId:int('merchant_id').notNull().primaryKey().references(()=>merchants.id,{onDelete:'cascade'}),
 sourceDigest:char('source_digest',{length:64}).notNull(),sourceIds:json('source_ids').notNull(),claimToken:char('claim_token',{length:36}).notNull(),
 recoveryToken:char('recovery_token',{length:36}),recoveryLeaseUntil:datetime('recovery_lease_until',{mode:'string',fsp:3}),recoveryNextAt:datetime('recovery_next_at',{mode:'string',fsp:3}),
 recoveryAttempts:int('recovery_attempts',{unsigned:true}).notNull().default(0),recoveryLastError:varchar('recovery_last_error',{length:40}),recoveredAt:datetime('recovered_at',{mode:'string',fsp:3}),
 state:varchar({length:16}).notNull(),leaseUntil:datetime('lease_until',{mode:'string',fsp:3}),responseJson:json('response_json'),
 responseHash:char('response_hash',{length:64}),failureCode:varchar('failure_code',{length:40}),generation:int(),proposalCount:int('proposal_count'),
 createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
 updatedAt:datetime('updated_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},t=>[uniqueIndex('uq_learning_ai_reservation').on(t.aiReservationKey),index('idx_learning_recovery_due').on(t.state,t.recoveryNextAt,t.merchantId),check('chk_learning_job_state',sql`${t.state} IN ('reserved','dispatched','responded','applied','stale','invalid','uncertain')`)]);

export const salesStaffVoices=mysqlTable('ai_sales_staff_voices',{
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  actorUserId:int('actor_user_id').notNull(),conversationId:int('conversation_id').notNull(),requestId:char('request_id',{length:36}).notNull(),
  instanceId:int('instance_id').notNull(),ownershipVersion:int('ownership_version').notNull(),customerPhone:varchar('customer_phone',{length:64}).notNull(),
  compatibility:tinyint('compatibility').notNull().default(0),compatibilityResult:json('compatibility_result'),
  intent:json(),intentDigest:char('intent_digest',{length:64}),mediaUrl:text('media_url'),basis:json(),basisDigest:char('basis_digest',{length:64}),
  status:mysqlEnum(['reserved','accepted']).notNull().default('reserved'),providerMessageId:varchar('provider_message_id',{length:255}),
  projectedMessageId:int('projected_message_id'),nextReconcileAt:datetime('next_reconcile_at',{mode:'string',fsp:3}).default(sql`CURRENT_TIMESTAMP(3)`),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},t=>[uniqueIndex('uq_staff_voice_request').on(t.merchantId,t.requestId),index('idx_staff_voice_conversation').on(t.merchantId,t.conversationId,t.id),
  index('idx_staff_voice_recovery').on(t.nextReconcileAt,t.id)]);

export const salesStaffReviews=mysqlTable('ai_sales_staff_reviews',{
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  reviewerUserId:int('reviewer_user_id').notNull(),authorUserId:int('author_user_id').notNull(),conversationId:int('conversation_id').notNull(),
  sourceKind:mysqlEnum('source_kind',['text','voice']).notNull(),sourceId:int('source_id').notNull(),requestId:char('request_id',{length:36}).notNull(),
  requestDigest:char('request_digest',{length:64}).notNull(),snapshot:json().notNull(),snapshotDigest:char('snapshot_digest',{length:64}).notNull(),
  createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},t=>[uniqueIndex('uq_staff_review_request').on(t.merchantId,t.requestId),index('idx_staff_review_history').on(t.merchantId,t.sourceKind,t.id)]);

export const merchantTeachingDrafts = mysqlTable('merchant_teaching_drafts', {
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  instanceId:int('instance_id').notNull(),authorPhone:varchar('author_phone',{length:20}).notNull(),version:int().notNull(),
  status:varchar({length:20}).notNull(),fragmentsJson:json('fragments_json').notNull(),lastInboundId:int('last_inbound_id').notNull(),
  updatedAt:timestamp('updated_at',{mode:'string',fsp:3}).defaultNow().onUpdateNow().notNull(),
},table=>[uniqueIndex('uq_teaching_draft_scope').on(table.merchantId,table.instanceId,table.authorPhone)]);
export const merchantTeachingTurns = mysqlTable('merchant_teaching_turns', {
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  eventKey:char('event_key',{length:64}).notNull(),sourceDigest:char('source_digest',{length:64}).notNull(),sourceJson:json('source_json').notNull(),
  contextJson:json('context_json').notNull(),decisionJson:json('decision_json').notNull(),resultJson:json('result_json').notNull(),
  createdAt:timestamp('created_at',{mode:'string',fsp:3}).defaultNow().notNull(),
},table=>[uniqueIndex('uq_teaching_turn_event').on(table.merchantId,table.eventKey),index('idx_teaching_turn_window').on(table.merchantId,table.createdAt)]);

export const websiteAnalysisJobs = mysqlTable('website_analysis_jobs', {
  id:int().autoincrement().primaryKey(),merchantId:int('merchant_id').notNull().references(()=>merchants.id,{onDelete:'cascade'}),
  jobId:char('job_id',{length:36}).notNull(),actorId:int('actor_id').notNull(),ownerId:int('owner_id').notNull(),websiteUrl:varchar('website_url',{length:2048}).notNull(),
  state:mysqlEnum('state',['running','completed','error','uncertain']).notNull().default('running'),activeSlot:tinyint('active_slot').default(1),
  executionToken:char('execution_token',{length:36}).notNull(),currentStep:varchar('current_step',{length:32}).notNull().default('scraping'),progress:tinyint({unsigned:true}).notNull().default(0),
  resultJson:json('result_json'),issue:varchar({length:32}),
  startedAt:datetime('started_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),updatedAt:datetime('updated_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  leaseExpiresAt:datetime('lease_expires_at',{mode:'string',fsp:3}),deadlineAt:datetime('deadline_at',{mode:'string',fsp:3}).notNull(),
},table=>[uniqueIndex('uq_website_job_scope_id').on(table.merchantId,table.id),uniqueIndex('uq_website_job_request').on(table.merchantId,table.jobId),uniqueIndex('uq_website_job_active').on(table.merchantId,table.activeSlot),index('idx_website_job_history').on(table.merchantId,table.id),check('ck_website_job_active',sql`(${table.state} = 'running' AND ${table.activeSlot} IS NOT NULL AND ${table.activeSlot} = 1) OR (${table.state} <> 'running' AND ${table.activeSlot} IS NULL)`)]);

export const websiteAnalysisRequestLinks = mysqlTable('website_analysis_request_links', {
  merchantId:int('merchant_id').notNull(),requestId:char('request_id',{length:36}).notNull(),
  jobPk:int('job_pk').notNull(),actorId:int('actor_id').notNull(),createdAt:datetime('created_at',{mode:'string',fsp:3}).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
},table=>[primaryKey({columns:[table.merchantId,table.requestId]}),index('idx_website_request_job').on(table.merchantId,table.jobPk),foreignKey({name:'fk_website_request_job',columns:[table.merchantId,table.jobPk],foreignColumns:[websiteAnalysisJobs.merchantId,websiteAnalysisJobs.id]}).onDelete('cascade')]);
