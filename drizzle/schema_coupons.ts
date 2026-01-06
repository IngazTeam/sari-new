import { mysqlTable, int, varchar, text, timestamp, decimal, mysqlEnum, index } from "drizzle-orm/mysql-core";
import { merchants, subscriptionPlans } from "./schema";

/**
 * جدول كوبونات الخصم
 * يستخدم لتطبيق خصومات على الباقات والاشتراكات
 */
export const discountCoupons = mysqlTable("discount_coupons", {
  id: int("id").primaryKey().autoincrement(),
  
  // معلومات الكوبون
  code: varchar("code", { length: 50 }).notNull().unique(),
  description: text("description"),
  
  // نوع الخصم
  discountType: mysqlEnum("discount_type", ['percentage', 'fixed']).notNull(),
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  
  // الحد الأدنى للسعر (اختياري)
  minPurchaseAmount: decimal("min_purchase_amount", { precision: 10, scale: 2 }),
  
  // الحد الأقصى للخصم (للنسبة المئوية)
  maxDiscountAmount: decimal("max_discount_amount", { precision: 10, scale: 2 }),
  
  // الصلاحية
  validFrom: timestamp("valid_from").notNull(),
  validUntil: timestamp("valid_until").notNull(),
  
  // حدود الاستخدام
  maxUsageCount: int("max_usage_count"), // null = غير محدود
  currentUsageCount: int("current_usage_count").notNull().default(0),
  maxUsagePerMerchant: int("max_usage_per_merchant").default(1),
  
  // تطبيق على باقات محددة (null = جميع الباقات)
  applicablePlanIds: text("applicable_plan_ids"), // JSON array of plan IDs
  
  // الحالة
  isActive: int("is_active").notNull().default(1),
  
  // من أنشأه
  createdBy: int("created_by"), // admin user id
  
  // التواريخ
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
},
(table) => [
  index("discount_coupons_code_idx").on(table.code),
  index("discount_coupons_is_active_idx").on(table.isActive),
  index("discount_coupons_valid_from_idx").on(table.validFrom),
  index("discount_coupons_valid_until_idx").on(table.validUntil),
]);

/**
 * سجل استخدام الكوبونات
 * يتتبع من استخدم الكوبون ومتى
 */
export const couponUsageLog = mysqlTable("coupon_usage_log", {
  id: int("id").primaryKey().autoincrement(),
  
  couponId: int("coupon_id").notNull().references(() => discountCoupons.id, { onDelete: "cascade" }),
  merchantId: int("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  
  // تفاصيل الاستخدام
  subscriptionId: int("subscription_id"), // الاشتراك الذي تم تطبيق الكوبون عليه
  planId: int("plan_id").references(() => subscriptionPlans.id),
  
  // قيمة الخصم المطبق
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }).notNull(),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull(),
  finalPrice: decimal("final_price", { precision: 10, scale: 2 }).notNull(),
  
  // التوقيت
  usedAt: timestamp("used_at").notNull().defaultNow(),
},
(table) => [
  index("coupon_usage_log_coupon_id_idx").on(table.couponId),
  index("coupon_usage_log_merchant_id_idx").on(table.merchantId),
  index("coupon_usage_log_used_at_idx").on(table.usedAt),
]);
