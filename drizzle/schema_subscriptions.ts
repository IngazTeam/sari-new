import { mysqlTable, mysqlEnum, int, varchar, text, timestamp, tinyint, decimal, index, foreignKey, InferSelectModel, InferInsertModel } from "drizzle-orm/mysql-core"
import { merchants } from "./schema"

// ============================================
// Subscription Plans Table (الباقات)
// ============================================
export const subscriptionPlans = mysqlTable("subscription_plans", {
	id: int().autoincrement().notNull().primaryKey(),
	name: varchar({ length: 255 }).notNull(), // اسم الباقة (أساسية، احترافية، مؤسسات)
	nameEn: varchar("name_en", { length: 255 }).notNull(), // الاسم بالإنجليزية
	description: text(), // وصف الباقة
	descriptionEn: text("description_en"), // الوصف بالإنجليزية

	// Pricing
	monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull(), // السعر الشهري
	yearlyPrice: decimal("yearly_price", { precision: 10, scale: 2 }).notNull(), // السعر السنوي
	currency: varchar({ length: 10 }).default('SAR').notNull(),

	// Features
	maxCustomers: int("max_customers").notNull(), // الحد الأقصى للعملاء (الميزة الرئيسية)
	maxWhatsAppNumbers: int("max_whatsapp_numbers").default(1).notNull(), // عدد أرقام الواتساب المسموح بها
	features: text(), // ميزات إضافية (JSON array)

	// Status & Display
	isActive: tinyint("is_active").default(1).notNull(), // تفعيل/تعطيل الباقة
	sortOrder: int("sort_order").default(0).notNull(), // ترتيب العرض

	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		index("subscription_plans_is_active_idx").on(table.isActive),
		index("subscription_plans_sort_order_idx").on(table.sortOrder),
	]);

// ============================================
// Subscription Addons Table (الخدمات الإضافية)
// ============================================
export const subscriptionAddons = mysqlTable("subscription_addons", {
	id: int().autoincrement().notNull().primaryKey(),
	name: varchar({ length: 255 }).notNull(), // اسم الخدمة
	nameEn: varchar("name_en", { length: 255 }).notNull(), // الاسم بالإنجليزية
	description: text(), // وصف الخدمة
	descriptionEn: text("description_en"), // الوصف بالإنجليزية

	// Type & Pricing
	type: mysqlEnum(['extra_whatsapp', 'extra_customers', 'custom']).notNull(), // نوع الخدمة
	monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull(), // السعر الشهري
	yearlyPrice: decimal("yearly_price", { precision: 10, scale: 2 }).notNull(), // السعر السنوي
	currency: varchar({ length: 10 }).default('SAR').notNull(),

	// Value
	value: int().notNull(), // القيمة (مثلاً: 1 رقم، 500 عميل إضافي)

	// Status
	isActive: tinyint("is_active").default(1).notNull(),

	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		index("subscription_addons_is_active_idx").on(table.isActive),
		index("subscription_addons_type_idx").on(table.type),
	]);

// ============================================
// Merchant Subscriptions Table (اشتراكات التجار)
// ============================================
export const merchantSubscriptions = mysqlTable("merchant_subscriptions", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	planId: int("plan_id").references(() => subscriptionPlans.id, { onDelete: "set null" }),

	// Status
	status: mysqlEnum(['trial', 'active', 'expired', 'cancelled']).notNull(),
	billingCycle: mysqlEnum("billing_cycle", ['monthly', 'yearly']).notNull(),

	// Dates
	startDate: timestamp("start_date", { mode: 'string' }).notNull(),
	endDate: timestamp("end_date", { mode: 'string' }).notNull(),
	trialEndsAt: timestamp("trial_ends_at", { mode: 'string' }), // تاريخ انتهاء الفترة التجريبية

	// Auto Renewal
	autoRenew: tinyint("auto_renew").default(0).notNull(), // التجديد التلقائي

	// Cancellation
	cancelledAt: timestamp("cancelled_at", { mode: 'string' }),
	cancellationReason: text("cancellation_reason"),

	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		index("merchant_subscriptions_merchant_id_idx").on(table.merchantId),
		index("merchant_subscriptions_plan_id_idx").on(table.planId),
		index("merchant_subscriptions_status_idx").on(table.status),
		index("merchant_subscriptions_end_date_idx").on(table.endDate),
	]);

// ============================================
// Merchant Addons Table (الخدمات الإضافية المشتراة)
// ============================================
export const merchantAddons = mysqlTable("merchant_addons", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	addonId: int("addon_id").notNull().references(() => subscriptionAddons.id, { onDelete: "cascade" }),
	subscriptionId: int("subscription_id").references(() => merchantSubscriptions.id, { onDelete: "cascade" }),

	// Quantity & Dates
	quantity: int().default(1).notNull(), // الكمية (مثلاً: 2 رقم إضافي)
	startDate: timestamp("start_date", { mode: 'string' }).notNull(),
	endDate: timestamp("end_date", { mode: 'string' }).notNull(),

	// Status
	isActive: tinyint("is_active").default(1).notNull(),

	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		index("merchant_addons_merchant_id_idx").on(table.merchantId),
		index("merchant_addons_addon_id_idx").on(table.addonId),
		index("merchant_addons_subscription_id_idx").on(table.subscriptionId),
		index("merchant_addons_is_active_idx").on(table.isActive),
	]);

// ============================================
// Payment Transactions Table (سجل المدفوعات)
// ============================================
export const paymentTransactions = mysqlTable("payment_transactions", {
	id: int().autoincrement().notNull().primaryKey(),
	merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
	subscriptionId: int("subscription_id"),

	// Transaction Type
	type: mysqlEnum(['subscription', 'addon', 'renewal', 'upgrade', 'downgrade']).notNull(),

	// Amount
	amount: decimal({ precision: 10, scale: 2 }).notNull(),
	currency: varchar({ length: 10 }).default('SAR').notNull(),

	// Status
	status: mysqlEnum(['pending', 'completed', 'failed', 'refunded']).default('pending').notNull(),

	// Payment Method
	paymentMethod: varchar("payment_method", { length: 50 }).default('tap').notNull(),

	// Tap Integration
	tapChargeId: varchar("tap_charge_id", { length: 255 }), // معرف الدفعة من Tap
	tapResponse: text("tap_response"), // الاستجابة الكاملة من Tap (JSON)

	// Payment Date
	paidAt: timestamp("paid_at", { mode: 'string' }),

	// Refund
	refundedAt: timestamp("refunded_at", { mode: 'string' }),
	refundReason: text("refund_reason"),

	// Metadata
	metadata: text(), // بيانات إضافية (JSON)

	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
	(table) => [
		index("payment_transactions_merchant_id_idx").on(table.merchantId),
		index("payment_transactions_subscription_id_idx").on(table.subscriptionId),
		index("payment_transactions_status_idx").on(table.status),
		index("payment_transactions_tap_charge_id_idx").on(table.tapChargeId),
		index("payment_transactions_type_idx").on(table.type),
		foreignKey({
			name: "pt_sub_id_fk",
			columns: [table.subscriptionId],
			foreignColumns: [merchantSubscriptions.id],
		}).onDelete("set null"),
	]);

// ============================================
// Tap Settings Table (إعدادات Tap للأدمن)
// ============================================
export const tapSettings = mysqlTable("tap_settings", {
	id: int().autoincrement().notNull().primaryKey(),

	// API Keys
	secretKey: text("secret_key").notNull(), // Tap Secret Key (encrypted)
	publicKey: varchar("public_key", { length: 500 }).notNull(), // Tap Public Key

	// Environment
	isLive: tinyint("is_live").default(0).notNull(), // وضع الإنتاج (1) أم التجربة (0)

	// Webhook
	webhookUrl: varchar("webhook_url", { length: 500 }),
	webhookSecret: varchar("webhook_secret", { length: 500 }), // للتحقق من صحة webhooks

	// Status
	isActive: tinyint("is_active").default(1).notNull(),

	// Test Connection
	lastTestAt: timestamp("last_test_at", { mode: 'string' }),
	lastTestStatus: mysqlEnum("last_test_status", ['success', 'failed']),
	lastTestMessage: text("last_test_message"),

	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

// ============================================
// Type Exports
// ============================================
export type SubscriptionPlan = InferSelectModel<typeof subscriptionPlans>;
export type NewSubscriptionPlan = InferInsertModel<typeof subscriptionPlans>;

export type SubscriptionAddon = InferSelectModel<typeof subscriptionAddons>;
export type NewSubscriptionAddon = InferInsertModel<typeof subscriptionAddons>;

export type MerchantSubscription = InferSelectModel<typeof merchantSubscriptions>;
export type NewMerchantSubscription = InferInsertModel<typeof merchantSubscriptions>;

export type MerchantAddon = InferSelectModel<typeof merchantAddons>;
export type NewMerchantAddon = InferInsertModel<typeof merchantAddons>;

export type PaymentTransaction = InferSelectModel<typeof paymentTransactions>;
export type NewPaymentTransaction = InferInsertModel<typeof paymentTransactions>;

export type TapSettings = InferSelectModel<typeof tapSettings>;
export type NewTapSettings = InferInsertModel<typeof tapSettings>;
