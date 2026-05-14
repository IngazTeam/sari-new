import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutGrid,
  LogOut,
  PanelLeft,
  Users,
  MessageSquareText,
  Package,
  Megaphone,
  Settings,
  ShieldCheck,
  Smartphone,
  BarChart3,
  CreditCard,
  Store,
  ShoppingCart,
  Ticket,
  UserPlus,
  ShoppingBag,
  PartyPopper,
  BellDot,
  Bot,
  CalendarCheck2,
  Sparkles,
  Zap,
  Search,
  Key,
  Database,
  Receipt,
  Star,
  CalendarDays,
  UsersRound,
  HandPlatter,
  CalendarRange,
  FileSpreadsheet,
  Download,
  Warehouse,
  HandCoins,
  LinkIcon,
  Gift,
  Award,
  Crown,
  Heart,
  Plug,
  BellRing,
  Timer,
  ScrollText,
  TrendingUp,
  Activity,
  Globe,
  ChevronDown,
  Languages,
  AudioLines,
  FlaskConical,
  ScanSearch,
  Brain,
  UserCheck,
  Wand2,
  Send,
  Boxes,
  Swords,
  ClipboardList,
  Gem,
  Palette,
  CircuitBoard,
  Mail,
  FileCode2,
  KeyRound,
  ChartPie,
  Webhook
} from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { NotificationBell } from "./NotificationBell";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { SubscriptionBadge } from "./SubscriptionBadge";
import { useTranslation } from 'react-i18next';
import { useIntegration } from '@/hooks/useIntegration';

// Menu item type with optional group
type MenuItem = {
  icon: any;
  label: string;
  path: string;
  group?: string;
};

// Menu groups for merchant
const getMerchantMenuGroups = (t: any) => [
  { id: 'main', label: t('sidebar.groups.main', 'الرئيسية والمتابعة'), icon: LayoutGrid, color: 'text-slate-600 dark:text-slate-400', activeColor: 'text-slate-700', bgColor: 'bg-slate-100/60 dark:bg-slate-800/40', borderColor: 'border-slate-300 dark:border-slate-600' },
  { id: 'operations', label: t('sidebar.groups.operations', 'المبيعات والتشغيل'), icon: Boxes, color: 'text-emerald-600 dark:text-emerald-400', activeColor: 'text-emerald-700', bgColor: 'bg-emerald-50/60 dark:bg-emerald-900/20', borderColor: 'border-emerald-300 dark:border-emerald-700' },
  { id: 'channels', label: t('sidebar.groups.channels', 'المساعد الذكي والواتساب'), icon: CircuitBoard, color: 'text-violet-600 dark:text-violet-400', activeColor: 'text-violet-700', bgColor: 'bg-violet-50/60 dark:bg-violet-900/20', borderColor: 'border-violet-300 dark:border-violet-700' },
  { id: 'marketing', label: t('sidebar.groups.marketing', 'التسويق والولاء'), icon: Send, color: 'text-orange-600 dark:text-orange-400', activeColor: 'text-orange-700', bgColor: 'bg-orange-50/60 dark:bg-orange-900/20', borderColor: 'border-orange-300 dark:border-orange-700' },
  { id: 'analytics', label: t('sidebar.groups.analytics', 'التحليلات'), icon: ChartPie, color: 'text-blue-600 dark:text-blue-400', activeColor: 'text-blue-700', bgColor: 'bg-blue-50/60 dark:bg-blue-900/20', borderColor: 'border-blue-300 dark:border-blue-700' },
  { id: 'settings', label: t('sidebar.groups.settings', 'الإعدادات والربط'), icon: Settings, color: 'text-gray-600 dark:text-gray-400', activeColor: 'text-gray-700', bgColor: 'bg-gray-50/60 dark:bg-gray-800/30', borderColor: 'border-gray-300 dark:border-gray-600' },
];

// Menu items based on user role
const getMerchantMenuItems = (t: any): MenuItem[] => [
  // 1. الرئيسية والمتابعة
  { icon: LayoutGrid, label: t('sidebar.merchant.dashboard', 'لوحة التحكم'), path: "/merchant/dashboard", group: 'main' },
  { icon: MessageSquareText, label: t('sidebar.merchant.conversations', 'المحادثات'), path: "/merchant/conversations", group: 'main' },
  { icon: BellDot, label: t('sidebar.merchant.notifications', 'الإشعارات'), path: "/merchant/notifications", group: 'main' },

  // 2. المبيعات والتشغيل
  { icon: Package, label: t('sidebar.merchant.products', 'المنتجات'), path: "/merchant/products", group: 'operations' },
  { icon: Receipt, label: t('sidebar.merchant.orders', 'الطلبات'), path: "/merchant/orders", group: 'operations' },
  { icon: HandPlatter, label: t('sidebar.merchant.services', 'الخدمات'), path: "/merchant/services", group: 'operations' },
  { icon: CalendarCheck2, label: t('sidebar.merchant.bookingManagement', 'الحجوزات'), path: "/merchant/bookings", group: 'operations' },
  { icon: CalendarRange, label: t('sidebar.merchant.calendar', 'التقويم'), path: "/merchant/calendar", group: 'operations' },
  { icon: Users, label: t('sidebar.merchant.customerManagement', 'العملاء'), path: "/merchant/customers", group: 'operations' },
  { icon: LinkIcon, label: t('sidebar.merchant.paymentLinks', 'روابط الدفع'), path: "/merchant/payment-links", group: 'operations' },
  { icon: HandCoins, label: t('sidebar.merchant.paymentsPage', 'المدفوعات'), path: "/merchant/payments", group: 'operations' },
  { icon: Star, label: t('sidebar.merchant.reviews', 'التقييمات'), path: "/merchant/reviews", group: 'operations' },
  { icon: Receipt, label: t('sidebar.merchant.salesHub', 'مركز المبيعات'), path: "/merchant/sales-hub", group: 'operations' },

  // 3. المساعد الذكي والواتساب
  { icon: Wand2, label: t('sidebar.merchant.aiHub', 'مركز المساعد الذكي'), path: "/merchant/ai-hub", group: 'channels' },
  { icon: Brain, label: t('sidebar.merchant.sariBrain', 'عقل ساري'), path: "/merchant/sari-brain", group: 'channels' },
  { icon: Smartphone, label: t('sidebar.merchant.whatsappInstances', 'إدارة أرقام الواتساب'), path: "/merchant/whatsapp-instances", group: 'channels' },
  { icon: Bot, label: t('sidebar.merchant.botSettings', 'إعدادات الروبوت'), path: "/merchant/bot-settings", group: 'channels' },
  { icon: UserCheck, label: t('sidebar.merchant.humanTakeover', 'التدخل البشري'), path: "/merchant/human-takeover", group: 'channels' },
  { icon: UsersRound, label: t('sidebar.merchant.virtualTeam', 'فريق العمل الافتراضي'), path: "/merchant/virtual-team", group: 'channels' },
  { icon: Zap, label: t('sidebar.merchant.quickResponses', 'الردود السريعة'), path: "/merchant/quick-responses", group: 'channels' },
  { icon: Timer, label: t('sidebar.merchant.scheduledMessages', 'الرسائل المجدولة'), path: "/merchant/scheduled-messages", group: 'channels' },
  { icon: BellRing, label: t('sidebar.merchant.orderNotifications', 'إشعارات الطلبات'), path: "/merchant/order-notifications", group: 'channels' },
  { icon: ScrollText, label: t('sidebar.merchant.messageAnalytics', 'سجل الرسائل'), path: "/merchant/message-analytics", group: 'channels' },
  { icon: AudioLines, label: t('sidebar.merchant.voiceMessages', 'الرسائل الصوتية'), path: "/merchant/voice-messages", group: 'channels' },

  // 4. التسويق والولاء
  { icon: Megaphone, label: t('sidebar.merchant.campaigns', 'الحملات التسويقية'), path: "/merchant/campaigns", group: 'marketing' },
  { icon: PartyPopper, label: t('sidebar.merchant.occasionCampaigns', 'حملات المناسبات'), path: "/merchant/occasion-campaigns", group: 'marketing' },
  { icon: Ticket, label: t('sidebar.merchant.discounts', 'كوبونات الخصم'), path: "/merchant/discounts", group: 'marketing' },
  { icon: Gem, label: t('sidebar.merchant.loyaltySettings', 'برنامج الولاء'), path: "/merchant/loyalty/settings", group: 'marketing' },
  { icon: ShoppingBag, label: t('sidebar.merchant.abandonedCarts', 'السلات المتروكة'), path: "/merchant/abandoned-carts", group: 'marketing' },
  { icon: UserPlus, label: t('sidebar.merchant.referrals', 'الإحالات'), path: "/merchant/referrals", group: 'marketing' },

  // 5. التحليلات والتقارير
  { icon: ChartPie, label: t('sidebar.merchant.analyticsHub', 'مركز التحليلات'), path: "/merchant/analytics-hub", group: 'analytics' },
  { icon: Globe, label: t('sidebar.merchant.smartAnalysis', 'تحليل الموقع'), path: "/merchant/smart-analysis", group: 'analytics' },
  { icon: Swords, label: t('sidebar.merchant.competitorAnalysis', 'تحليل المنافسين'), path: "/merchant/competitor-analysis", group: 'analytics' },
  { icon: ClipboardList, label: t('sidebar.merchant.weeklyReports', 'التقارير الأسبوعية'), path: "/merchant/weekly-reports", group: 'analytics' },
  { icon: BarChart3, label: t('sidebar.merchant.reports', 'التقارير الدورية'), path: "/merchant/reports", group: 'analytics' },
  { icon: ScanSearch, label: t('sidebar.merchant.keywords', 'الكلمات المفتاحية'), path: "/merchant/keywords", group: 'analytics' },
  { icon: FlaskConical, label: t('sidebar.merchant.abTests', 'اختبارات A/B'), path: "/merchant/ab-tests", group: 'analytics' },

  // 6. الإعدادات والربط
  { icon: Settings, label: t('sidebar.merchant.settings', 'إعدادات المتجر'), path: "/merchant/settings", group: 'settings' },
  { icon: Languages, label: t('sidebar.merchant.languageSettings', 'إعدادات اللغة'), path: "/merchant/language-settings", group: 'settings' },
  { icon: Webhook, label: t('sidebar.merchant.integrationsDashboard', 'التطبيقات والربط'), path: "/merchant/integrations-dashboard", group: 'settings' },
  { icon: Users, label: t('sidebar.merchant.staffManagement', 'فريق العمل'), path: "/merchant/staff", group: 'settings' },
  { icon: Crown, label: t('sidebar.merchant.mySubscription', 'باقتي والفواتير'), path: "/merchant/my-subscription", group: 'settings' },
  { icon: CreditCard, label: t('sidebar.merchant.merchantPayments', 'مدفوعات التاجر'), path: "/merchant/merchant-payments", group: 'settings' },
];

const getAdminMenuItems = (t: any): MenuItem[] => [
  { icon: LayoutGrid, label: t('sidebar.admin.dashboard'), path: "/admin/dashboard" },
  { icon: Activity, label: t('sidebar.admin.monitor', 'مركز المراقبة'), path: "/admin/monitor" },
  { icon: Users, label: t('sidebar.admin.merchants'), path: "/admin/merchants" },
  { icon: Megaphone, label: t('sidebar.admin.campaigns'), path: "/admin/campaigns" },
  { icon: Smartphone, label: t('sidebar.admin.whatsappRequests'), path: "/admin/whatsapp-requests" },
  { icon: Award, label: t('sidebar.admin.packages'), path: "/admin/packages" },
  { icon: Gift, label: t('sidebar.admin.addons'), path: "/admin/addons" },
  { icon: CreditCard, label: t('sidebar.admin.paymentGateways'), path: "/admin/payment-gateways" },
  { icon: Palette, label: t('sidebar.admin.tapSettings', 'إعدادات Tap'), path: "/admin/tap-settings" },
  { icon: Receipt, label: t('sidebar.admin.invoices', 'الفواتير'), path: "/admin/invoices" },
  { icon: TrendingUp, label: t('sidebar.admin.subscriptionReports', 'تقارير الاشتراكات'), path: "/admin/subscription-reports" },
  { icon: BellDot, label: t('sidebar.admin.notifications', 'الإشعارات'), path: "/admin/notifications" },
  { icon: FlaskConical, label: t('sidebar.admin.abTests', 'اختبارات A/B'), path: "/admin/ab-test-dashboard" },
  { icon: Settings, label: t('sidebar.admin.settings'), path: "/admin/settings" },
  { icon: Mail, label: t('sidebar.admin.smtpSettings'), path: "/admin/smtp-settings" },
  { icon: FileCode2, label: t('sidebar.admin.emailTemplates'), path: "/admin/email-templates" },
  { icon: Languages, label: t('sidebar.admin.templateTranslations'), path: "/admin/template-translations" },
  { icon: KeyRound, label: t('sidebar.admin.googleOAuth'), path: "/admin/google-oauth" },
  { icon: Database, label: t('sidebar.admin.dataSync'), path: "/admin/data-sync" },
  { icon: Globe, label: t('sidebar.admin.seoManagement'), path: "/admin/seo" },
  { icon: Sparkles, label: t('sidebar.admin.aiSettings', 'إعدادات AI'), path: "/admin/ai-settings" },
  { icon: Key, label: 'مفاتيح المنصات', path: "/admin/platform-keys" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              {t('sidebar.signInTitle')}
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              {t('sidebar.signInDescription')}
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = "/login";
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            {t('sidebar.signInButton')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>('main');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    logout();
  };

  // Accordion: only one group open at a time
  const toggleGroup = (groupId: string) => {
    setExpandedGroup(prev => prev === groupId ? null : groupId);
  };

  // Get menu items based on user role
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const menuItems = isAdmin ? getAdminMenuItems(t) : getMerchantMenuItems(t);
  const menuGroups = getMerchantMenuGroups(t);

  // Apply integration terminology to sidebar labels (e.g., منتجات → دورات when Byaan)
  const { term, isLocked, source: integrationSource } = useIntegration();
  const adaptedMenuItems = useMemo(() => {
    if (isAdmin || integrationSource === 'none') return menuItems;
    return menuItems.map(item => {
      if (item.path === '/merchant/products') return { ...item, label: term('products') };
      if (item.path === '/merchant/customers') return { ...item, label: term('customers') };
      if (item.path === '/merchant/orders') return { ...item, label: term('orders') };
      return item;
    });
  }, [menuItems, isAdmin, integrationSource, term]);

  const activeMenuItem = adaptedMenuItems.find(item => item.path === location);

  // Group menu items by group
  const groupedMenuItems = adaptedMenuItems.reduce((acc, item) => {
    const group = item.group || 'other';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  // Filter menu items based on search
  const filteredGroupedItems = useMemo(() => {
    if (!sidebarSearch.trim()) return groupedMenuItems;
    const query = sidebarSearch.toLowerCase();
    const filtered: Record<string, MenuItem[]> = {};
    for (const [group, items] of Object.entries(groupedMenuItems)) {
      const matched = items.filter(item => item.label.toLowerCase().includes(query));
      if (matched.length > 0) filtered[group] = matched;
    }
    return filtered;
  }, [groupedMenuItems, sidebarSearch]);

  // Auto-expand group containing active item
  useEffect(() => {
    if (activeMenuItem?.group && expandedGroup !== activeMenuItem.group) {
      setExpandedGroup(activeMenuItem.group);
    }
  }, [location]);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-l-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold tracking-tight truncate">
                    {isAdmin ? t('sidebar.adminPanel') : t('sidebar.merchantPanel')}
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 overflow-y-auto">
            {/* Sidebar Search */}
            {!isCollapsed && (
              <div className="px-3 py-2">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    placeholder={t('sidebar.search', 'بحث في القائمة...')}
                    className="w-full h-9 pr-9 pl-3 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            )}
            <SidebarMenu className="px-2 py-1">
              {isAdmin ? (
                // Admin: flat list
                menuItems.map((item) => {
                  const isActive = location === item.path;
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setLocation(item.path)}
                        tooltip={item.label}
                        className={`h-10 transition-all font-normal`}
                      >
                        <item.icon
                          className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                        />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              ) : (
                // Merchant: grouped with collapsible sections
                menuGroups.map((group) => {
                  const groupItems = (sidebarSearch.trim() ? filteredGroupedItems : groupedMenuItems)[group.id] || [];
                  if (groupItems.length === 0) return null;
                  const isSearching = sidebarSearch.trim().length > 0;
                  const isExpanded = isSearching || expandedGroup === group.id;
                  const hasActiveItem = groupItems.some(item => item.path === location);
                  const GroupIcon = group.icon;

                  return (
                    <div key={group.id} className="mb-0.5">
                      {/* Group Header */}
                      <button
                        onClick={() => toggleGroup(group.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
                          isExpanded
                            ? `${group.bgColor} ${group.color} shadow-sm`
                            : hasActiveItem
                              ? `${group.color} bg-accent/20`
                              : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                        } ${isCollapsed ? 'justify-center' : ''}`}
                      >
                        <GroupIcon className={`h-4.5 w-4.5 shrink-0 ${isExpanded ? group.color : ''}`} />
                        {!isCollapsed && (
                          <>
                            <span className="flex-1 text-right truncate">{group.label}</span>
                            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-300 ${isExpanded ? '' : 'ltr:-rotate-90 rtl:rotate-90'}`} />
                          </>
                        )}
                      </button>

                      {/* Group Items — smooth accordion */}
                      <div
                        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                          isExpanded || isCollapsed ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className={`${!isCollapsed ? `mr-3 border-r-2 ${group.borderColor}` : ''} mt-0.5 mb-1`}>
                            {groupItems.map((item) => {
                              const isActive = location === item.path;
                              return (
                                <SidebarMenuItem key={item.path}>
                                  <SidebarMenuButton
                                    isActive={isActive}
                                    onClick={() => setLocation(item.path)}
                                    tooltip={item.label}
                                    className={`h-9 transition-all duration-200 font-normal rounded-lg ${!isCollapsed ? 'mr-2' : ''} ${
                                      isActive ? `font-medium ${group.bgColor}` : 'hover:bg-accent/40'
                                    }`}
                                  >
                                    <item.icon
                                      className={`h-4 w-4 transition-colors ${isActive ? group.color : 'text-muted-foreground'}`}
                                    />
                                    <span className="truncate">{item.label}</span>
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </SidebarMenu>
          </SidebarContent>


        </Sidebar>
        <div
          className={`absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isAdmin && <SubscriptionBadge />}
              <ThemeSwitcher variant="compact" />
              <LanguageSwitcher variant="compact" />
              <NotificationBell />
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-accent/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar className="h-8 w-8 border shrink-0">
                      <AvatarFallback className="text-xs font-medium">
                        {user?.name?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate max-w-[100px]">{user?.name || '-'}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{user?.email || '-'}</div>
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="ml-2 h-4 w-4" />
                    <span>{t('common.logout')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
        {!isMobile && (
          <div className="flex border-b h-14 items-center justify-start bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-3">
              {!isAdmin && <SubscriptionBadge />}
              <ThemeSwitcher variant="compact" />
              <LanguageSwitcher variant="compact" />
              <NotificationBell />
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar className="h-8 w-8 border shrink-0">
                      <AvatarFallback className="text-xs font-medium">
                        {user?.name?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate max-w-[120px]">{user?.name || '-'}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{user?.email || '-'}</div>
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="ml-2 h-4 w-4" />
                    <span>{t('common.logout')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sidebar.logoutConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('sidebar.logoutConfirmMessage')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLogout}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.logout')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
