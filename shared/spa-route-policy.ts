/**
 * Server-side policy for the client-side application routes.
 *
 * Express must know whether an HTML request is a real SPA deep link, a
 * canonical redirect, or a genuine 404 before it serves index.html. The
 * release test keeps this manifest in sync with <Route> declarations.
 */
export const SPA_ROUTE_TEMPLATES = [
  "/",
  "/login",
  "/signup",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/reset-password/:token",
  "/verify-email",
  "/accept-invite",
  "/products",
  "/pricing",
  "/subscribe",
  "/subscribe/:planId",
  "/payment/callback",
  "/payment/return",
  "/pay/:linkId/status",
  "/pay/:linkId",
  "/support",
  "/solutions/sales",
  "/solutions/marketing",
  "/solutions/support",
  "/product/ai-agent",
  "/product/chatbot",
  "/product/whatsapp",
  "/product/broadcasts",
  "/company/about",
  "/resources/blog",
  "/resources/help-center",
  "/resources/success-stories",
  "/company/contact",
  "/company/terms",
  "/company/privacy",
  "/try-sari",
  "/try-sari-enhanced",
  "/ai-whatsapp-sales-agent",
  "/whatsapp-ordering-system",
  "/whatsapp-booking-system",
  "/ai-customer-service-whatsapp",
  "/conversational-commerce-platform",
  "/solutions/clinics",
  "/solutions/restaurants",
  "/solutions/salons",
  "/solutions/training-centers",
  "/solutions/real-estate",
  "/solutions/consultants",
  "/solutions/:sector/:service",
  "/docs/how-sari-works",
  "/docs/whatsapp-payment-guide",
  "/docs/ai-sales-guide",
  "/merchant/setup-wizard",
  "/merchant/dashboard",
  "/merchant/ai-hub",
  "/merchant/analytics-hub",
  "/merchant/campaigns",
  "/merchant/campaigns/new",
  "/merchant/campaigns/:id",
  "/merchant/campaigns/:id/report",
  "/merchant/products",
  "/merchant/products/upload",
  "/merchant/conversations",
  "/merchant/whatsapp",
  "/merchant/salla",
  "/merchant/integrations/byaan",
  "/merchant/byaan-dashboard",
  "/merchant/integrations/zid",
  "/merchant/zid/settings",
  "/merchant/zid/callback",
  "/merchant/zid/products",
  "/merchant/zid/sync-logs",
  "/merchant/woocommerce/settings",
  "/merchant/woocommerce/products",
  "/merchant/woocommerce/orders",
  "/merchant/woocommerce/analytics",
  "/merchant/integrations/calendly",
  "/merchant/chat-orders",
  "/merchant/discounts",
  "/merchant/referrals",
  "/merchant/abandoned-carts",
  "/merchant/occasion-campaigns",
  "/merchant/promotions",
  "/merchant/analytics",
  "/merchant/message-analytics",
  "/merchant/overview-analytics",
  "/merchant/orders",
  "/merchant/whatsapp-instances",
  "/merchant/whatsapp-setup",
  "/merchant/whatsapp-test",
  "/merchant/greenapi-setup",
  "/merchant/test-sari",
  "/merchant/metrics-dashboard",
  "/merchant/whatsapp-webhook-setup",
  "/merchant/bot-settings",
  "/merchant/human-takeover",
  "/merchant/virtual-team",
  "/merchant/sari-brain",
  "/merchant/sari-playground",
  "/merchant/sari-analytics",
  "/merchant/sales-hub",
  "/merchant/sales-pipeline",
  "/merchant/acquisition-report",
  "/merchant/quotation-templates",
  "/merchant/media-library",
  "/merchant/scheduled-messages",
  "/merchant/sari-personality",
  "/merchant/quick-responses",
  "/merchant/insights",
  "/merchant/advanced-analytics",
  "/merchant/analytics-dashboard",
  "/merchant/performance-metrics",
  "/merchant/data-sync",
  "/merchant/reviews",
  "/merchant/booking-reviews",
  "/merchant/order-notifications",
  "/merchant/settings",
  "/merchant/privacy-center",
  "/merchant/notifications",
  "/merchant/language-settings",
  "/merchant/calendar/settings",
  "/merchant/calendar",
  "/merchant/staff",
  "/merchant/team",
  "/merchant/services",
  "/merchant/services/new",
  "/merchant/services/:id/edit",
  "/merchant/services/:id",
  "/merchant/bookings",
  "/merchant/service-categories",
  "/merchant/service-packages",
  "/merchant/sheets/settings",
  "/merchant/sheets/export",
  "/merchant/sheets/reports",
  "/merchant/sheets/inventory",
  "/merchant/payments",
  "/merchant/payments/:id",
  "/merchant/payment-links",
  "/merchant/payment-settings",
  "/merchant/loyalty/settings",
  "/merchant/loyalty/tiers",
  "/merchant/loyalty/rewards",
  "/merchant/loyalty/customers",
  "/customer/loyalty/:customerPhone",
  "/merchant/integrations-dashboard",
  "/merchant/platform-integrations",
  "/merchant/notification-settings",
  "/merchant/currency-settings",
  "/merchant/push-notifications",
  "/merchant/scheduled-reports",
  "/merchant/whatsapp-auto-notifications",
  "/merchant/reports",
  "/merchant/subscriptions",
  "/merchant/usage",
  "/merchant/usage-dashboard",
  "/merchant/subscription/plans",
  "/merchant/subscription/compare",
  "/merchant/subscription",
  "/merchant/checkout",
  "/merchant/payment/success",
  "/merchant/payment/cancel",
  "/merchant/customers",
  "/merchant/website-analysis",
  "/merchant/smart-analysis",
  "/merchant/competitor-analysis",
  "/merchant/customers/:phone",
  "/merchant/ai-suggestions",
  "/merchant/keywords",
  "/merchant/voice-messages",
  "/merchant/analysis",
  "/merchant/weekly-reports",
  "/merchant/ab-tests",
  "/merchant/try-sari-analytics",
  "/merchant/merchant-payments",
  "/merchant/my-subscription",
  "/admin/dashboard",
  "/admin/privacy-requests",
  "/admin/campaigns",
  "/admin/merchants",
  "/admin/merchants/:id",
  "/admin/payment-gateways",
  "/admin/google-oauth",
  "/admin/settings",
  "/admin/platform-keys",
  "/admin/whatsapp-requests",
  "/admin/smtp-settings",
  "/admin/email-templates",
  "/admin/template-translations",
  "/admin/data-sync",
  "/admin/seo",
  "/admin/seo/recommendations",
  "/admin/seo/recommendations/analytics",
  "/admin/seo/global-settings",
  "/admin/ab-test-dashboard",
  "/admin/subscription-plans",
  "/admin/packages",
  "/admin/subscription-addons",
  "/admin/addons",
  "/admin/tap-settings",
  "/admin/notifications",
  "/admin/subscription-reports",
  "/admin/invoices",
  "/admin/ai-settings",
  "/admin/ai-training",
  "/admin/monitor",
  "/admin/ai-analytics",
  "/404",
] as const;

const CANONICAL_REDIRECTS: Readonly<Record<string, string>> = {
  '/register': '/signup',
  '/solutions/sales': '/ai-whatsapp-sales-agent',
  '/solutions/marketing': '/ai-whatsapp-sales-agent',
  '/solutions/support': '/ai-customer-service-whatsapp',
  '/product/ai-agent': '/ai-whatsapp-sales-agent',
  '/product/chatbot': '/ai-customer-service-whatsapp',
  '/product/whatsapp': '/ai-whatsapp-sales-agent',
  '/product/broadcasts': '/ai-whatsapp-sales-agent',
  '/company/contact': '/support',
  '/try-sari-enhanced': '/try-sari',
  '/conversational-commerce-platform': '/ai-whatsapp-sales-agent',
  '/docs/ai-sales-guide': '/ai-whatsapp-sales-agent',
  '/merchant/whatsapp-setup': '/merchant/whatsapp',
  '/merchant/sari-personality': '/merchant/bot-settings',
  '/merchant/website-analysis': '/merchant/smart-analysis',
  '/merchant/keywords': '/merchant/smart-analysis',
  '/merchant/weekly-reports': '/merchant/reports',
  '/admin/packages': '/admin/subscription-plans',
  '/admin/addons': '/admin/subscription-addons',
};

const KNOWN_SOLUTION_SERVICE_PATHS = new Set([
  '/solutions/clinics/appointment-booking',
  '/solutions/clinics/no-show-reminders',
  '/solutions/clinics/patient-inquiries',
  '/solutions/restaurants/whatsapp-ordering',
  '/solutions/restaurants/digital-menu-payment',
  '/solutions/restaurants/delivery-repeat-orders',
  '/solutions/salons/appointment-booking',
  '/solutions/salons/deposits-service-menu',
  '/solutions/salons/loyalty-campaigns',
  '/solutions/training-centers/course-registration',
  '/solutions/training-centers/class-reminders-certificates',
  '/solutions/training-centers/course-marketing',
  '/solutions/real-estate/lead-qualification',
  '/solutions/real-estate/property-catalog',
  '/solutions/real-estate/viewing-followup',
  '/solutions/consultants/consultation-booking',
  '/solutions/consultants/advance-payment',
  '/solutions/consultants/client-followup',
]);

const ROUTE_MATCHERS = SPA_ROUTE_TEMPLATES.map(template => {
  const expression = template
    .split('/')
    .map(segment => segment.startsWith(':')
      ? '[^/]+'
      : segment.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&'))
    .join('/');
  return new RegExp('^' + expression + '/?$');
});

const SENSITIVE_FILE_NAMES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'tsconfig.json',
  'vite.config.ts',
  'drizzle.config.ts',
]);

export type SpaRouteDecision =
  | { kind: 'known'; path: string }
  | { kind: 'redirect'; path: string; target: string }
  | { kind: 'not_found'; path: string }
  | { kind: 'sensitive'; path: string };

export function normalizeSpaPath(rawPath: string): string | null {
  let path = rawPath.split(/[?#]/, 1)[0] || '/';

  try {
    // Decode twice to catch a common double-encoding bypass without accepting
    // unbounded recursive decoding.
    for (let pass = 0; pass < 2; pass += 1) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    }
  } catch {
    return null;
  }

  if (path.includes('\\') || path.includes('\0')) return null;
  if (!path.startsWith('/')) path = '/' + path;

  const segments = path.split('/');
  if (segments.some(segment => segment === '..')) return null;

  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path;
}

export function isSensitiveBrowserPath(path: string): boolean {
  const lowerPath = path.toLowerCase();
  const segments = lowerPath.split('/').filter(Boolean);

  if (segments.some(segment => segment.startsWith('.'))) return true;
  if (segments.some(segment => SENSITIVE_FILE_NAMES.has(segment))) return true;
  if (/^\/(?:server|shared|drizzle|scripts)(?:\/|$)/.test(lowerPath)) return true;
  if (/^\/client\/src(?:\/|$)/.test(lowerPath)) return true;
  if (/\.(?:env|sql|ts|tsx|map)$/i.test(lowerPath)) return true;
  return false;
}

export function classifySpaRoute(rawPath: string): SpaRouteDecision {
  const normalized = normalizeSpaPath(rawPath);
  if (!normalized) return { kind: 'sensitive', path: '/' };

  if (isSensitiveBrowserPath(normalized)) {
    return { kind: 'sensitive', path: normalized };
  }

  const redirect = CANONICAL_REDIRECTS[normalized];
  if (redirect) return { kind: 'redirect', path: normalized, target: redirect };

  if (normalized === '/404') return { kind: 'not_found', path: normalized };

  if (/^\/solutions\/[^/]+\/[^/]+$/.test(normalized)
    && !KNOWN_SOLUTION_SERVICE_PATHS.has(normalized)) {
    return { kind: 'not_found', path: normalized };
  }

  return ROUTE_MATCHERS.some(matcher => matcher.test(normalized))
    ? { kind: 'known', path: normalized }
    : { kind: 'not_found', path: normalized };
}
