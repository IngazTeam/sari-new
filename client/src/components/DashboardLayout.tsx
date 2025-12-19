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
  Database
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { NotificationBell } from "./NotificationBell";
import { useTranslation } from 'react-i18next';

// Menu items based on user role
const getMerchantMenuItems = (t: any) => [
  { icon: LayoutDashboard, label: t('sidebar.merchant.dashboard'), path: "/merchant/dashboard" },
  { icon: Megaphone, label: t('sidebar.merchant.campaigns'), path: "/merchant/campaigns" },
  { icon: Package, label: t('sidebar.merchant.products'), path: "/merchant/products" },
  { icon: ShoppingCart, label: t('sidebar.merchant.chatOrders'), path: "/merchant/chat-orders" },
  { icon: MessageSquare, label: t('sidebar.merchant.conversations'), path: "/merchant/conversations" },
  { icon: Ticket, label: t('sidebar.merchant.discounts'), path: "/merchant/discounts" },
  { icon: UserPlus, label: t('sidebar.merchant.referrals'), path: "/merchant/referrals" },
  { icon: ShoppingBag, label: t('sidebar.merchant.abandonedCarts'), path: "/merchant/abandoned-carts" },
  { icon: PartyPopper, label: t('sidebar.merchant.occasionCampaigns'), path: "/merchant/occasion-campaigns" },
  { icon: BarChart3, label: t('sidebar.merchant.analytics'), path: "/merchant/analytics" },
  { icon: CreditCard, label: t('sidebar.merchant.subscriptions'), path: "/merchant/subscriptions" },
  { icon: Smartphone, label: t('sidebar.merchant.whatsapp'), path: "/merchant/whatsapp" },
  { icon: Smartphone, label: t('sidebar.merchant.whatsappInstances'), path: "/merchant/whatsapp-instances" },
  { icon: MessageSquare, label: 'اختبار ساري AI', path: "/merchant/test-sari" },
  { icon: Bot, label: 'ملعب ساري AI', path: "/merchant/sari-playground" },
  { icon: BarChart3, label: 'إحصائيات ساري AI', path: "/merchant/sari-analytics" },
  { icon: Bell, label: t('sidebar.merchant.orderNotifications'), path: "/merchant/order-notifications" },
  { icon: Store, label: t('sidebar.merchant.salla'), path: "/merchant/salla" },
  { icon: Bot, label: t('sidebar.merchant.botSettings'), path: "/merchant/bot-settings" },
  { icon: Calendar, label: t('sidebar.merchant.scheduledMessages'), path: "/merchant/scheduled-messages" },
  { icon: Sparkles, label: 'إعدادات شخصية ساري', path: "/merchant/sari-personality" },
  { icon: Zap, label: 'الردود السريعة', path: "/merchant/quick-responses" },
  { icon: BarChart3, label: 'التحليلات المتقدمة', path: "/merchant/advanced-analytics" },
  { icon: Database, label: 'مزامنة البيانات', path: "/merchant/data-sync" },
  { icon: Settings, label: t('sidebar.merchant.settings'), path: "/merchant/settings" },
];

const getAdminMenuItems = (t: any) => [
  { icon: LayoutDashboard, label: t('sidebar.admin.dashboard'), path: "/admin/dashboard" },
  { icon: Users, label: t('sidebar.admin.merchants'), path: "/admin/merchants" },
  { icon: Megaphone, label: t('sidebar.admin.campaigns'), path: "/admin/campaigns" },
  { icon: Smartphone, label: t('sidebar.admin.whatsappRequests'), path: "/admin/whatsapp-requests" },
  { icon: CreditCard, label: t('sidebar.admin.paymentGateways'), path: "/admin/payment-gateways" },
  { icon: Settings, label: t('sidebar.admin.settings'), path: "/admin/settings" },
  { icon: MessageSquare, label: 'إعدادات SMTP', path: "/admin/smtp-settings" },
  { icon: Zap, label: 'إعدادات Google OAuth', path: "/admin/google-oauth" },
  { icon: Database, label: 'مزامنة البيانات', path: "/admin/data-sync" },
  { icon: BarChart3, label: 'SEO - لوحة التحكم', path: "/admin/seo/dashboard" },
  { icon: Package, label: 'SEO - الصفحات', path: "/admin/seo/pages" },
  { icon: MessageSquare, label: 'SEO - Meta Tags', path: "/admin/seo/meta-tags" },
  { icon: Sparkles, label: 'SEO - Open Graph', path: "/admin/seo/open-graph" },
  { icon: Zap, label: 'SEO - رموز التتبع', path: "/admin/seo/tracking" },
  { icon: BarChart3, label: 'SEO - الإحصائيات', path: "/admin/seo/analytics" },
  { icon: Package, label: 'SEO - الكلمات المفتاحية', path: "/admin/seo/keywords" },
  { icon: Smartphone, label: 'SEO - الروابط الخارجية', path: "/admin/seo/backlinks" },
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
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to this dashboard requires authentication. Continue to launch the login flow.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = "/login";
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
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
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    logout();
  };
  
  // Get menu items based on user role
  const menuItems = user?.role === 'admin' ? getAdminMenuItems(t) : getMerchantMenuItems(t);
  const activeMenuItem = menuItems.find(item => item.path === location);

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

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map((item) => {
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
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{t('common.logout')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
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
              <NotificationBell />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4 ml-2" />
                {t('common.logout')}
              </Button>
            </div>
          </div>
        )}
        {!isMobile && (
          <div className="flex border-b h-14 items-center justify-end bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <NotificationBell />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4 ml-2" />
                {t('common.logout')}
              </Button>
            </div>
          </div>
        )}
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد تسجيل الخروج</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من رغبتك في تسجيل الخروج من حسابك؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLogout}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              تسجيل الخروج
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
