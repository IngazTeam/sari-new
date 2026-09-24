// Navigation metadata only. All actions remain in the existing authenticated pages.
export type MerchantSectionId =
  | 'overview'
  | 'inbox'
  | 'sales'
  | 'catalog'
  | 'customers'
  | 'ai'
  | 'marketing'
  | 'analytics'
  | 'settings';
export type MerchantTool = {
  title: string;
  section: MerchantSectionId;
  paths: string[];
};
export const merchantTools: MerchantTool[] = [
  {
    title: 'الإعداد الأولي',
    section: 'settings',
    paths: ['/merchant/setup-wizard'],
  },
  {
    title: 'نظرة عامة',
    section: 'overview',
    paths: ['/merchant/dashboard'],
  },
  {
    title: 'مركز المساعد',
    section: 'ai',
    paths: ['/merchant/ai-hub'],
  },
  {
    title: 'مركز التحليلات',
    section: 'analytics',
    paths: ['/merchant/analytics-hub'],
  },
  {
    title: 'الحملات',
    section: 'marketing',
    paths: ['/merchant/campaigns'],
  },
  {
    title: 'إنشاء حملة',
    section: 'marketing',
    paths: ['/merchant/campaigns/new', '/merchant/campaigns/:id/edit'],
  },
  {
    title: 'تفاصيل الحملة',
    section: 'marketing',
    paths: ['/merchant/campaigns/:id'],
  },
  {
    title: 'تقرير الحملة',
    section: 'analytics',
    paths: ['/merchant/campaigns/:id/report'],
  },
  {
    title: 'المنتجات',
    section: 'catalog',
    paths: ['/merchant/products'],
  },
  {
    title: 'استيراد المنتجات',
    section: 'catalog',
    paths: ['/merchant/products/upload'],
  },
  {
    title: 'المحادثات',
    section: 'inbox',
    paths: ['/merchant/conversations'],
  },
  {
    title: 'أرقام واتساب',
    section: 'settings',
    paths: ['/merchant/whatsapp', '/merchant/whatsapp-instances'],
  },
  {
    title: 'ربط سلة',
    section: 'settings',
    paths: ['/merchant/salla'],
  },
  {
    title: 'ربط بيان',
    section: 'settings',
    paths: ['/merchant/integrations/byaan'],
  },
  {
    title: 'بيان: الدورات والمتدربون',
    section: 'settings',
    paths: ['/merchant/byaan-dashboard'],
  },
  {
    title: 'ربط زد',
    section: 'settings',
    paths: ['/merchant/integrations/zid', '/merchant/zid/settings'],
  },
  {
    title: 'نتيجة تفويض زد',
    section: 'settings',
    paths: ['/merchant/zid/callback'],
  },
  {
    title: 'منتجات زد',
    section: 'catalog',
    paths: ['/merchant/zid/products'],
  },
  {
    title: 'سجل مزامنة زد',
    section: 'settings',
    paths: ['/merchant/zid/sync-logs'],
  },
  {
    title: 'ربط WooCommerce',
    section: 'settings',
    paths: ['/merchant/woocommerce/settings'],
  },
  {
    title: 'منتجات WooCommerce',
    section: 'catalog',
    paths: ['/merchant/woocommerce/products'],
  },
  {
    title: 'طلبات WooCommerce',
    section: 'sales',
    paths: ['/merchant/woocommerce/orders'],
  },
  {
    title: 'تحليلات WooCommerce',
    section: 'analytics',
    paths: ['/merchant/woocommerce/analytics'],
  },
  {
    title: 'ربط Calendly',
    section: 'settings',
    paths: ['/merchant/integrations/calendly'],
  },
  {
    title: 'كوبونات الخصم',
    section: 'marketing',
    paths: ['/merchant/discounts'],
  },
  {
    title: 'إحالات التجار',
    section: 'settings',
    paths: ['/merchant/referrals'],
  },
  {
    title: 'السلات المتروكة',
    section: 'marketing',
    paths: ['/merchant/abandoned-carts'],
  },
  {
    title: 'حملات المناسبات',
    section: 'marketing',
    paths: ['/merchant/occasion-campaigns'],
  },
  {
    title: 'العروض الترويجية',
    section: 'marketing',
    paths: ['/merchant/promotions'],
  },
  {
    title: 'تحليلات المبيعات',
    section: 'analytics',
    paths: ['/merchant/analytics'],
  },
  {
    title: 'تحليلات الرسائل',
    section: 'analytics',
    paths: [
      '/merchant/message-analytics',
      '/merchant/sari-analytics',
      '/merchant/advanced-analytics',
      '/merchant/analytics-dashboard',
      '/merchant/voice-messages',
      '/merchant/analysis',
    ],
  },
  {
    title: 'نظرة الأداء',
    section: 'analytics',
    paths: ['/merchant/overview-analytics'],
  },
  {
    title: 'الطلبات',
    section: 'sales',
    paths: ['/merchant/orders'],
  },
  {
    title: 'تشخيص واتساب',
    section: 'settings',
    paths: ['/merchant/whatsapp-test'],
  },
  {
    title: 'دليل ربط واتساب',
    section: 'settings',
    paths: ['/merchant/greenapi-setup'],
  },
  {
    title: 'تجربة المساعد',
    section: 'ai',
    paths: ['/merchant/test-sari'],
  },
  {
    title: 'مقاييس المساعد',
    section: 'analytics',
    paths: ['/merchant/metrics-dashboard', '/merchant/try-sari-analytics'],
  },
  {
    title: 'تشخيص Webhook',
    section: 'settings',
    paths: ['/merchant/whatsapp-webhook-setup'],
  },
  {
    title: 'سلوك المساعد',
    section: 'ai',
    paths: ['/merchant/bot-settings'],
  },
  {
    title: 'التدخل البشري',
    section: 'inbox',
    paths: ['/merchant/human-takeover'],
  },
  {
    title: 'شخصيات المساعد',
    section: 'ai',
    paths: ['/merchant/virtual-team'],
  },
  {
    title: 'معرفة المساعد',
    section: 'ai',
    paths: ['/merchant/sari-brain'],
  },
  {
    title: 'ساحة التجربة',
    section: 'ai',
    paths: ['/merchant/sari-playground'],
  },
  {
    title: 'عروض الأسعار',
    section: 'sales',
    paths: ['/merchant/sales-hub'],
  },
  {
    title: 'فرص البيع',
    section: 'sales',
    paths: ['/merchant/sales-pipeline'],
  },
  {
    title: 'مصادر العملاء',
    section: 'analytics',
    paths: ['/merchant/acquisition-report'],
  },
  {
    title: 'قوالب عروض الأسعار',
    section: 'sales',
    paths: ['/merchant/quotation-templates'],
  },
  {
    title: 'مكتبة الوسائط',
    section: 'catalog',
    paths: ['/merchant/media-library'],
  },
  {
    title: 'الرسائل المجدولة',
    section: 'marketing',
    paths: ['/merchant/scheduled-messages'],
  },
  {
    title: 'الردود السريعة',
    section: 'inbox',
    paths: ['/merchant/quick-responses'],
  },
  {
    title: 'الرؤى والاقتراحات وA/B',
    section: 'analytics',
    paths: [
      '/merchant/insights',
      '/merchant/ai-suggestions',
      '/merchant/ab-tests',
    ],
  },
  {
    title: 'مقاييس الأداء',
    section: 'analytics',
    paths: ['/merchant/performance-metrics'],
  },
  {
    title: 'مزامنة Google Sheets',
    section: 'settings',
    paths: ['/merchant/data-sync'],
  },
  {
    title: 'تقييمات المنتجات',
    section: 'customers',
    paths: ['/merchant/reviews'],
  },
  {
    title: 'تقييمات الحجوزات',
    section: 'customers',
    paths: ['/merchant/booking-reviews'],
  },
  {
    title: 'إشعارات الطلبات',
    section: 'settings',
    paths: ['/merchant/order-notifications'],
  },
  {
    title: 'الحساب والمتجر',
    section: 'settings',
    paths: ['/merchant/settings'],
  },
  {
    title: 'الخصوصية',
    section: 'settings',
    paths: ['/merchant/privacy-center'],
  },
  {
    title: 'الإشعارات',
    section: 'overview',
    paths: ['/merchant/notifications'],
  },
  {
    title: 'لغة المساعد',
    section: 'ai',
    paths: ['/merchant/language-settings'],
  },
  {
    title: 'ربط Google Calendar',
    section: 'settings',
    paths: ['/merchant/calendar/settings'],
  },
  {
    title: 'التقويم',
    section: 'catalog',
    paths: ['/merchant/calendar'],
  },
  {
    title: 'مقدمو الخدمات',
    section: 'catalog',
    paths: ['/merchant/staff'],
  },
  {
    title: 'الفريق والصلاحيات',
    section: 'settings',
    paths: ['/merchant/team'],
  },
  {
    title: 'الخدمات',
    section: 'catalog',
    paths: ['/merchant/services'],
  },
  {
    title: 'إضافة خدمة',
    section: 'catalog',
    paths: ['/merchant/services/new', '/merchant/services/:id/edit'],
  },
  {
    title: 'تفاصيل الخدمة',
    section: 'catalog',
    paths: ['/merchant/services/:id'],
  },
  {
    title: 'الحجوزات',
    section: 'catalog',
    paths: ['/merchant/bookings'],
  },
  {
    title: 'تصنيفات الخدمات',
    section: 'catalog',
    paths: ['/merchant/service-categories'],
  },
  {
    title: 'حزم الخدمات',
    section: 'catalog',
    paths: ['/merchant/service-packages'],
  },
  {
    title: 'ربط Google Sheets',
    section: 'settings',
    paths: ['/merchant/sheets/settings'],
  },
  {
    title: 'تصدير المحادثات',
    section: 'analytics',
    paths: ['/merchant/sheets/export'],
  },
  {
    title: 'تقارير Google Sheets',
    section: 'analytics',
    paths: ['/merchant/sheets/reports'],
  },
  {
    title: 'مخزون Google Sheets',
    section: 'catalog',
    paths: ['/merchant/sheets/inventory'],
  },
  {
    title: 'المدفوعات',
    section: 'sales',
    paths: ['/merchant/payments', '/merchant/merchant-payments'],
  },
  {
    title: 'تفاصيل معاملة',
    section: 'sales',
    paths: ['/merchant/payments/:id'],
  },
  {
    title: 'روابط الدفع',
    section: 'sales',
    paths: ['/merchant/payment-links'],
  },
  {
    title: 'بوابة دفع العملاء',
    section: 'settings',
    paths: ['/merchant/payment-settings'],
  },
  {
    title: 'إعدادات الولاء',
    section: 'marketing',
    paths: ['/merchant/loyalty/settings'],
  },
  {
    title: 'مستويات الولاء',
    section: 'marketing',
    paths: ['/merchant/loyalty/tiers'],
  },
  {
    title: 'مكافآت الولاء',
    section: 'marketing',
    paths: ['/merchant/loyalty/rewards'],
  },
  {
    title: 'عملاء الولاء',
    section: 'customers',
    paths: ['/merchant/loyalty/customers'],
  },
  {
    title: 'صحة التكاملات',
    section: 'settings',
    paths: ['/merchant/integrations-dashboard'],
  },
  {
    title: 'التكاملات',
    section: 'settings',
    paths: ['/merchant/platform-integrations'],
  },
  {
    title: 'تفضيلات الإشعارات',
    section: 'settings',
    paths: ['/merchant/notification-settings'],
  },
  {
    title: 'عملة المتجر',
    section: 'settings',
    paths: ['/merchant/currency-settings'],
  },
  {
    title: 'إشعارات المتصفح',
    section: 'settings',
    paths: ['/merchant/push-notifications'],
  },
  {
    title: 'التقارير المجدولة',
    section: 'analytics',
    paths: ['/merchant/scheduled-reports'],
  },
  {
    title: 'أتمتة رسائل العملاء',
    section: 'marketing',
    paths: ['/merchant/whatsapp-auto-notifications'],
  },
  {
    title: 'التقارير',
    section: 'analytics',
    paths: ['/merchant/reports'],
  },
  {
    title: 'الباقة والفواتير',
    section: 'settings',
    paths: [
      '/merchant/subscriptions',
      '/merchant/subscription',
      '/merchant/my-subscription',
    ],
  },
  {
    title: 'استهلاك الرسائل',
    section: 'settings',
    paths: ['/merchant/usage'],
  },
  {
    title: 'حدود الاستخدام',
    section: 'settings',
    paths: ['/merchant/usage-dashboard'],
  },
  {
    title: 'الباقات',
    section: 'settings',
    paths: ['/merchant/subscription/plans'],
  },
  {
    title: 'مقارنة الباقات',
    section: 'settings',
    paths: ['/merchant/subscription/compare'],
  },
  {
    title: 'بدء الاشتراك المدفوع',
    section: 'settings',
    paths: ['/merchant/checkout'],
  },
  {
    title: 'نتيجة دفع الاشتراك',
    section: 'settings',
    paths: ['/merchant/payment/success'],
  },
  {
    title: 'إلغاء دفع الاشتراك',
    section: 'settings',
    paths: ['/merchant/payment/cancel'],
  },
  {
    title: 'العملاء',
    section: 'customers',
    paths: ['/merchant/customers'],
  },
  {
    title: 'تحليل الموقع',
    section: 'ai',
    paths: ['/merchant/smart-analysis'],
  },
  {
    title: 'تحليل المنافسين',
    section: 'analytics',
    paths: ['/merchant/competitor-analysis'],
  },
  {
    title: 'ملف العميل',
    section: 'customers',
    paths: ['/merchant/customers/:phone'],
  },
];
