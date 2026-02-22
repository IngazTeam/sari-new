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
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Users,
  MessageSquare,
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
  Bell,
  Bot,
  Calendar,
  Sparkles,
  Zap,
  Search,
  Key,
  Database,
  FileText,
  Star,
  CalendarDays,
  UsersRound,
  Briefcase,
  BookOpen,
  FileSpreadsheet,
  Download,
  Warehouse,
  Wallet,
  Link,
  Gift,
  Award,
  Crown,
  Heart,
  Plug,
  BellRing,
  Clock,
  MessageCircle,
  TrendingUp,
  Activity,
  Gauge,
  ChevronDown,
  ChevronRight,
  Languages
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { NotificationBell } from "./NotificationBell";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { SubscriptionBadge } from "./SubscriptionBadge";
import { useTranslation } from 'react-i18next';

// Menu item type with optional group
type MenuItem = {
  icon: any;
  label: string;
  path: string;
  group?: string;
};

// Menu groups for merchant
const getMerchantMenuGroups = (t: any) => [
  { id: 'main', label: t('sidebar.groups.main'), icon: LayoutDashboard },
  { id: 'sales', label: t('sidebar.groups.sales'), icon: ShoppingCart },
  { id: 'marketing', label: t('sidebar.groups.marketing'), icon: Megaphone },
  { id: 'sari', label: t('sidebar.groups.sari'), icon: Bot },
  { id: 'whatsapp', label: t('sidebar.groups.whatsapp'), icon: Smartphone },
  { id: 'calendar', label: t('sidebar.groups.calendar'), icon: CalendarDays },
  { id: 'analytics', label: t('sidebar.groups.analytics'), icon: BarChart3 },
  { id: 'integrations', label: t('sidebar.groups.integrations'), icon: Plug },
  { id: 'loyalty', label: t('sidebar.groups.loyalty'), icon: Heart },
  { id: 'payments', label: t('sidebar.groups.payments'), icon: Wallet },
  { id: 'settings', label: t('sidebar.groups.settings'), icon: Settings },
];

// Menu items based on user role
const getMerchantMenuItems = (t: any): MenuItem[] => [
  // الرئيسية
  { icon: LayoutDashboard, label: t('sidebar.merchant.dashboard'), path: "/merchant/dashboard", group: 'main' },

  // المبيعات والطلبات
  { icon: Package, label: t('sidebar.merchant.products'), path: "/merchant/products", group: 'sales' },
  { icon: ShoppingCart, label: t('sidebar.merchant.chatOrders'), path: "/merchant/chat-orders", group: 'sales' },
  { icon: FileText, label: t('sidebar.merchant.orders'), path: "/merchant/orders", group: 'sales' },
  { icon: Users, label: t('sidebar.merchant.customerManagement'), path: "/merchant/customers", group: 'sales' },
  { icon: Ticket, label: t('sidebar.merchant.discounts'), path: "/merchant/discounts", group: 'sales' },
  { icon: ShoppingBag, label: t('sidebar.merchant.abandonedCarts'), path: "/merchant/abandoned-carts", group: 'sales' },
  { icon: Star, label: t('sidebar.merchant.reviews'), path: "/merchant/reviews", group: 'sales' },

  // التسويق والحملات
  { icon: Megaphone, label: t('sidebar.merchant.campaigns'), path: "/merchant/campaigns", group: 'marketing' },
  { icon: PartyPopper, label: t('sidebar.merchant.occasionCampaigns'), path: "/merchant/occasion-campaigns", group: 'marketing' },
  { icon: UserPlus, label: t('sidebar.merchant.referrals'), path: "/merchant/referrals", group: 'marketing' },

  // ساري AI
  { icon: MessageSquare, label: t('sidebar.merchant.conversations'), path: "/merchant/conversations", group: 'sari' },
  { icon: Bot, label: t('sidebar.merchant.testSari'), path: "/merchant/test-sari", group: 'sari' },
  { icon: Sparkles, label: t('sidebar.merchant.sariPlayground'), path: "/merchant/sari-playground", group: 'sari' },
  { icon: BarChart3, label: t('sidebar.merchant.sariAnalytics'), path: "/merchant/sari-analytics", group: 'sari' },
  { icon: Bot, label: t('sidebar.merchant.botSettings'), path: "/merchant/bot-settings", group: 'sari' },
  { icon: Sparkles, label: t('sidebar.merchant.sariPersonality'), path: "/merchant/sari-personality", group: 'sari' },
  { icon: Zap, label: t('sidebar.merchant.quickResponses'), path: "/merchant/quick-responses", group: 'sari' },
  { icon: Sparkles, label: t('sidebar.merchant.aiSuggestions'), path: "/merchant/ai-suggestions", group: 'sari' },
  { icon: TrendingUp, label: t('sidebar.merchant.sentimentAnalysis'), path: "/merchant/sentiment-analysis", group: 'sari' },
  { icon: Key, label: t('sidebar.merchant.keywords'), path: "/merchant/keywords", group: 'sari' },

  // واتساب
  { icon: Smartphone, label: t('sidebar.merchant.whatsapp'), path: "/merchant/whatsapp", group: 'whatsapp' },
  { icon: Smartphone, label: t('sidebar.merchant.whatsappInstances'), path: "/merchant/whatsapp-instances", group: 'whatsapp' },
  { icon: Bell, label: t('sidebar.merchant.orderNotifications'), path: "/merchant/order-notifications", group: 'whatsapp' },
  { icon: Calendar, label: t('sidebar.merchant.scheduledMessages'), path: "/merchant/scheduled-messages", group: 'whatsapp' },
  { icon: BellRing, label: t('sidebar.merchant.whatsappAutoNotifications'), path: "/merchant/whatsapp-auto-notifications", group: 'whatsapp' },
  { icon: MessageCircle, label: t('sidebar.merchant.messageAnalytics'), path: "/merchant/message-analytics", group: 'whatsapp' },
  { icon: Activity, label: t('sidebar.merchant.voiceMessages'), path: "/merchant/voice-messages", group: 'whatsapp' },

  // المواعيد والخدمات
  { icon: CalendarDays, label: t('sidebar.merchant.calendarAppointments'), path: "/merchant/calendar", group: 'calendar' },
  { icon: Settings, label: t('sidebar.merchant.calendarSettings'), path: "/merchant/calendar/settings", group: 'calendar' },
  { icon: UsersRound, label: t('sidebar.merchant.staffManagement'), path: "/merchant/staff", group: 'calendar' },
  { icon: Briefcase, label: t('sidebar.merchant.serviceManagement'), path: "/merchant/services", group: 'calendar' },
  { icon: BookOpen, label: t('sidebar.merchant.bookingManagement'), path: "/merchant/bookings", group: 'calendar' },
  { icon: Package, label: t('sidebar.merchant.serviceCategories'), path: "/merchant/service-categories", group: 'calendar' },
  { icon: Gift, label: t('sidebar.merchant.servicePackages'), path: "/merchant/service-packages", group: 'calendar' },
  { icon: Star, label: t('sidebar.merchant.bookingReviews'), path: "/merchant/booking-reviews", group: 'calendar' },

  // التحليلات والتقارير
  { icon: BarChart3, label: t('sidebar.merchant.analytics'), path: "/merchant/analytics", group: 'analytics' },
  { icon: TrendingUp, label: t('sidebar.merchant.advancedAnalytics'), path: "/merchant/advanced-analytics", group: 'analytics' },
  { icon: Activity, label: t('sidebar.merchant.insightsDashboard'), path: "/merchant/insights", group: 'analytics' },
  { icon: Gauge, label: t('sidebar.merchant.performanceMetrics'), path: "/merchant/performance-metrics", group: 'analytics' },
  { icon: FileText, label: t('sidebar.merchant.reports'), path: "/merchant/reports", group: 'analytics' },
  { icon: Clock, label: t('sidebar.merchant.scheduledReports'), path: "/merchant/scheduled-reports", group: 'analytics' },
  { icon: MessageCircle, label: t('sidebar.merchant.messageUsage'), path: "/merchant/usage", group: 'analytics' },
  { icon: Search, label: t('sidebar.merchant.websiteAnalysis'), path: "/merchant/website-analysis", group: 'analytics' },
  { icon: Activity, label: t('sidebar.merchant.advancedAnalysis'), path: "/merchant/analysis", group: 'analytics' },
  { icon: FileText, label: t('sidebar.merchant.weeklyReports'), path: "/merchant/weekly-reports", group: 'analytics' },
  { icon: Zap, label: t('sidebar.merchant.abTests'), path: "/merchant/ab-tests", group: 'analytics' },
  { icon: TrendingUp, label: t('sidebar.merchant.trySariAnalytics'), path: "/merchant/try-sari-analytics", group: 'analytics' },

  // التكاملات
  { icon: Plug, label: t('sidebar.merchant.integrationsDashboard'), path: "/merchant/integrations-dashboard", group: 'integrations' },
  { icon: Store, label: t('sidebar.merchant.salla'), path: "/merchant/salla", group: 'integrations' },
  { icon: Store, label: t('sidebar.merchant.zidIntegration'), path: "/merchant/integrations/zid", group: 'integrations' },
  { icon: ShoppingCart, label: t('sidebar.merchant.woocommerceSettings'), path: "/merchant/woocommerce/settings", group: 'integrations' },
  { icon: BarChart3, label: t('sidebar.merchant.woocommerceAnalytics'), path: "/merchant/woocommerce/analytics", group: 'integrations' },
  { icon: Calendar, label: t('sidebar.merchant.calendlyIntegration'), path: "/merchant/integrations/calendly", group: 'integrations' },
  { icon: FileSpreadsheet, label: t('sidebar.merchant.sheetsSettings'), path: "/merchant/sheets/settings", group: 'integrations' },
  { icon: Download, label: t('sidebar.merchant.dataExport'), path: "/merchant/sheets/export", group: 'integrations' },
  { icon: FileText, label: t('sidebar.merchant.sheetsReports'), path: "/merchant/sheets/reports", group: 'integrations' },
  { icon: Warehouse, label: t('sidebar.merchant.inventorySync'), path: "/merchant/sheets/inventory", group: 'integrations' },
  { icon: Database, label: t('sidebar.merchant.dataSync'), path: "/merchant/data-sync", group: 'integrations' },

  // برنامج الولاء
  { icon: Heart, label: t('sidebar.merchant.loyaltySettings'), path: "/merchant/loyalty/settings", group: 'loyalty' },
  { icon: Crown, label: t('sidebar.merchant.loyaltyTiers'), path: "/merchant/loyalty/tiers", group: 'loyalty' },
  { icon: Gift, label: t('sidebar.merchant.loyaltyRewards'), path: "/merchant/loyalty/rewards", group: 'loyalty' },
  { icon: Users, label: t('sidebar.merchant.loyaltyCustomers'), path: "/merchant/loyalty/customers", group: 'loyalty' },

  // المدفوعات
  { icon: Wallet, label: t('sidebar.merchant.paymentsPage'), path: "/merchant/payments", group: 'payments' },
  { icon: Link, label: t('sidebar.merchant.paymentLinks'), path: "/merchant/payment-links", group: 'payments' },
  { icon: CreditCard, label: t('sidebar.merchant.paymentSettings'), path: "/merchant/payment-settings", group: 'payments' },
  { icon: CreditCard, label: t('sidebar.merchant.subscriptions'), path: "/merchant/subscriptions", group: 'payments' },
  { icon: Wallet, label: t('sidebar.merchant.subscriptionPayments'), path: "/merchant/merchant-payments", group: 'payments' },
  { icon: Award, label: t('sidebar.merchant.mySubscription'), path: "/merchant/my-subscription", group: 'payments' },

  // الإعدادات
  { icon: Settings, label: t('sidebar.merchant.settings'), path: "/merchant/settings", group: 'settings' },
  { icon: Languages, label: t('sidebar.merchant.languageSettings'), path: "/merchant/language-settings", group: 'settings' },
  { icon: BellRing, label: t('sidebar.merchant.notificationSettings'), path: "/merchant/notification-settings", group: 'settings' },
];

const getAdminMenuItems = (t: any) => [
  { icon: LayoutDashboard, label: t('sidebar.admin.dashboard'), path: "/admin/dashboard" },
  { icon: Users, label: t('sidebar.admin.merchants'), path: "/admin/merchants" },
  { icon: Megaphone, label: t('sidebar.admin.campaigns'), path: "/admin/campaigns" },
  { icon: Smartphone, label: t('sidebar.admin.whatsappRequests'), path: "/admin/whatsapp-requests" },
  { icon: Award, label: t('sidebar.admin.packages'), path: "/admin/packages" },
  { icon: Gift, label: t('sidebar.admin.addons'), path: "/admin/addons" },
  { icon: CreditCard, label: t('sidebar.admin.paymentGateways'), path: "/admin/payment-gateways" },
  { icon: Settings, label: t('sidebar.admin.settings'), path: "/admin/settings" },
  { icon: MessageSquare, label: t('sidebar.admin.smtpSettings'), path: "/admin/smtp-settings" },
  { icon: FileText, label: t('sidebar.admin.emailTemplates'), path: "/admin/email-templates" },
  { icon: Languages, label: t('sidebar.admin.templateTranslations'), path: "/admin/template-translations" },
  { icon: Zap, label: t('sidebar.admin.googleOAuth'), path: "/admin/google-oauth" },
  { icon: Database, label: t('sidebar.admin.dataSync'), path: "/admin/data-sync" },
  { icon: BarChart3, label: t('sidebar.admin.seoManagement'), path: "/admin/seo" },
  { icon: BellRing, label: t('sidebar.admin.notificationPreferences'), path: "/admin/notification-preferences" },
  { icon: FileText, label: t('sidebar.admin.weeklyReport'), path: "/admin/weekly-report" },
  { icon: Bell, label: t('sidebar.admin.pushNotifications'), path: "/admin/push-notifications" },
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
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['main']);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    logout();
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  // Get menu items based on user role
  const menuItems = user?.role === 'admin' ? getAdminMenuItems(t) : getMerchantMenuItems(t);
  const menuGroups = getMerchantMenuGroups(t);
  const activeMenuItem = menuItems.find(item => item.path === location);

  // Group menu items by group
  const groupedMenuItems = menuItems.reduce((acc, item) => {
    const group = item.group || 'other';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  // Auto-expand group containing active item
  useEffect(() => {
    if (activeMenuItem?.group && !expandedGroups.includes(activeMenuItem.group)) {
      setExpandedGroups(prev => [...prev, activeMenuItem.group!]);
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
          className="border-r-0"
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
                    {user?.role === 'admin' ? t('sidebar.adminPanel') : t('sidebar.merchantPanel')}
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 overflow-y-auto">
            <SidebarMenu className="px-2 py-1">
              {user?.role === 'admin' ? (
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
                  const groupItems = groupedMenuItems[group.id] || [];
                  if (groupItems.length === 0) return null;

                  const isExpanded = expandedGroups.includes(group.id);
                  const hasActiveItem = groupItems.some(item => item.path === location);
                  const GroupIcon = group.icon;

                  return (
                    <div key={group.id} className="mb-1">
                      {/* Group Header */}
                      <button
                        onClick={() => toggleGroup(group.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors hover:bg-accent/50 ${hasActiveItem ? 'text-primary bg-accent/30' : 'text-muted-foreground'
                          } ${isCollapsed ? 'justify-center' : ''}`}
                      >
                        <GroupIcon className="h-4 w-4 shrink-0" />
                        {!isCollapsed && (
                          <>
                            <span className="flex-1 text-right truncate">{group.label}</span>
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0" />
                            )}
                          </>
                        )}
                      </button>

                      {/* Group Items */}
                      {(isExpanded || isCollapsed) && (
                        <div className={`${!isCollapsed ? 'mr-2 border-r border-border/50' : ''}`}>
                          {groupItems.map((item) => {
                            const isActive = location === item.path;
                            return (
                              <SidebarMenuItem key={item.path}>
                                <SidebarMenuButton
                                  isActive={isActive}
                                  onClick={() => setLocation(item.path)}
                                  tooltip={item.label}
                                  className={`h-9 transition-all font-normal ${!isCollapsed ? 'mr-2' : ''}`}
                                >
                                  <item.icon
                                    className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                                  />
                                  <span className="truncate">{item.label}</span>
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </SidebarMenu>
          </SidebarContent>


        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
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
              <SubscriptionBadge />
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
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{t('common.logout')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
        {!isMobile && (
          <div className="flex border-b h-14 items-center justify-end bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <SubscriptionBadge />
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
                    <LogOut className="mr-2 h-4 w-4" />
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
