// Seed packages using direct SQL through webdev_execute_sql
const packages = [
  {
    name_ar: "الباقة الأساسية",
    name_en: "Basic Plan",
    description_ar: "باقة مثالية للمشاريع الصغيرة والمتاجر الناشئة",
    description_en: "Perfect for small businesses and startups",
    price: 99,
    billing_cycle: "monthly",
    customer_limit: 100,
    message_limit: 1000,
    features: JSON.stringify({
      whatsapp_integration: true,
      ai_responses: true,
      basic_analytics: true,
      product_management: true,
      order_management: true,
      customer_support: "email",
      custom_branding: false,
      advanced_analytics: false,
      api_access: false,
      priority_support: false
    }),
    is_active: 1,
    sort_order: 1
  },
  {
    name_ar: "الباقة الاحترافية",
    name_en: "Professional Plan",
    description_ar: "باقة شاملة للأعمال المتنامية مع ميزات متقدمة",
    description_en: "Comprehensive package for growing businesses with advanced features",
    price: 299,
    billing_cycle: "monthly",
    customer_limit: 500,
    message_limit: 5000,
    features: JSON.stringify({
      whatsapp_integration: true,
      ai_responses: true,
      basic_analytics: true,
      advanced_analytics: true,
      product_management: true,
      order_management: true,
      campaign_management: true,
      customer_support: "priority_email",
      custom_branding: true,
      api_access: true,
      priority_support: false,
      google_calendar: true,
      google_sheets: true,
      loyalty_program: true
    }),
    is_active: 1,
    sort_order: 2
  },
  {
    name_ar: "باقة المؤسسات",
    name_en: "Enterprise Plan",
    description_ar: "حل متكامل للمؤسسات الكبيرة مع دعم مخصص وإمكانيات غير محدودة",
    description_en: "Complete solution for large enterprises with dedicated support and unlimited capabilities",
    price: 999,
    billing_cycle: "monthly",
    customer_limit: -1,
    message_limit: -1,
    features: JSON.stringify({
      whatsapp_integration: true,
      ai_responses: true,
      basic_analytics: true,
      advanced_analytics: true,
      product_management: true,
      order_management: true,
      campaign_management: true,
      customer_support: "24_7_phone",
      custom_branding: true,
      api_access: true,
      priority_support: true,
      google_calendar: true,
      google_sheets: true,
      loyalty_program: true,
      white_label: true,
      dedicated_account_manager: true,
      custom_integrations: true,
      sla_guarantee: true
    }),
    is_active: 1,
    sort_order: 3
  }
];

console.log("SQL queries to insert packages:");
console.log("===============================\n");

for (const pkg of packages) {
  const sql = `INSERT INTO packages (name_ar, name_en, description_ar, description_en, price, billing_cycle, customer_limit, message_limit, features, is_active, sort_order, created_at) VALUES ('${pkg.name_ar}', '${pkg.name_en}', '${pkg.description_ar}', '${pkg.description_en}', ${pkg.price}, '${pkg.billing_cycle}', ${pkg.customer_limit}, ${pkg.message_limit}, '${pkg.features}', ${pkg.is_active}, ${pkg.sort_order}, datetime('now'));`;
  console.log(sql);
  console.log("");
}
