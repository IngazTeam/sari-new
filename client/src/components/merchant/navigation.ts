import {
  BarChart3,
  Bot,
  LayoutGrid,
  Megaphone,
  MessageSquareText,
  Package,
  Settings,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { merchantTools, type MerchantSectionId } from './tools';

export const merchantSections = [
  {
    id: 'overview',
    title: 'نظرة عامة',
    path: '/merchant/dashboard',
    icon: LayoutGrid,
    tabs: ['/merchant/dashboard', '/merchant/notifications'],
  },
  {
    id: 'inbox',
    title: 'المحادثات',
    path: '/merchant/conversations',
    icon: MessageSquareText,
    tabs: [
      '/merchant/conversations',
      '/merchant/human-takeover',
      '/merchant/quick-responses',
      '/merchant/scheduled-messages',
    ],
  },
  {
    id: 'sales',
    title: 'المبيعات',
    path: '/merchant/orders',
    icon: ShoppingBag,
    tabs: [
      '/merchant/orders',
      '/merchant/sales-hub',
      '/merchant/sales-pipeline',
      '/merchant/payment-links',
      '/merchant/payments',
      '/merchant/quotation-templates',
    ],
  },
  {
    id: 'catalog',
    title: 'الكتالوج',
    path: '/merchant/products',
    icon: Package,
    tabs: [
      '/merchant/products',
      '/merchant/services',
      '/merchant/bookings',
      '/merchant/calendar',
      '/merchant/staff',
      '/merchant/service-packages',
    ],
  },
  {
    id: 'customers',
    title: 'العملاء',
    path: '/merchant/customers',
    icon: Users,
    tabs: [
      '/merchant/customers',
      '/merchant/reviews',
      '/merchant/booking-reviews',
      '/merchant/loyalty/customers',
    ],
  },
  {
    id: 'ai',
    title: 'المساعد الذكي',
    path: '/merchant/ai-hub',
    icon: Bot,
    tabs: [
      '/merchant/ai-hub',
      '/merchant/sari-brain',
      '/merchant/bot-settings',
      '/merchant/test-sari',
      '/merchant/language-settings',
      '/merchant/virtual-team',
    ],
  },
  {
    id: 'marketing',
    title: 'التسويق',
    path: '/merchant/campaigns',
    icon: Megaphone,
    tabs: [
      '/merchant/campaigns',
      '/merchant/discounts',
      '/merchant/abandoned-carts',
      '/merchant/promotions',
      '/merchant/occasion-campaigns',
      '/merchant/loyalty/settings',
    ],
  },
  {
    id: 'analytics',
    title: 'التحليلات',
    path: '/merchant/analytics-hub',
    icon: BarChart3,
    tabs: [
      '/merchant/analytics-hub',
      '/merchant/analytics',
      '/merchant/message-analytics',
      '/merchant/reports',
      '/merchant/insights',
      '/merchant/scheduled-reports',
    ],
  },
  {
    id: 'settings',
    title: 'الإعدادات',
    path: '/merchant/settings',
    icon: Settings,
    tabs: [
      '/merchant/settings',
      '/merchant/platform-integrations',
      '/merchant/whatsapp-instances',
      '/merchant/team',
      '/merchant/my-subscription',
      '/merchant/usage-dashboard',
      '/merchant/privacy-center',
    ],
  },
] satisfies Array<{
  id: MerchantSectionId;
  title: string;
  path: string;
  icon: typeof LayoutGrid;
  tabs: string[];
}>;

function pathMatches(pattern: string, path: string) {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  return (
    patternParts.length === pathParts.length &&
    patternParts.every(
      (part, i) => part.startsWith(':') || part === pathParts[i]
    )
  );
}

// Prefer an exact route (e.g. services/new) over a parameter route (services/:id).
export function merchantToolForPath(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0];
  return (
    merchantTools.find(tool => tool.paths.includes(path)) ??
    merchantTools.find(tool =>
      tool.paths.some(pattern => pathMatches(pattern, path))
    )
  );
}

export function merchantSectionForPath(path: string) {
  const cleanPath = path.split(/[?#]/, 1)[0];
  return (
    merchantSections.find(section => section.tabs.includes(cleanPath)) ??
    merchantSections.find(
      section => section.id === merchantToolForPath(cleanPath)?.section
    )
  );
}

export const navigableMerchantTools = merchantTools.flatMap(tool => {
  const path = tool.paths.find(
    p =>
      !p.includes(':') &&
      !/\/(callback|checkout|payment\/success|payment\/cancel)$/.test(p)
  );
  return path
    ? [
        {
          ...tool,
          path,
          section: merchantSectionForPath(path)?.id ?? tool.section,
        },
      ]
    : [];
});
