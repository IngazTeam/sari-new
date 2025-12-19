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
