import { useAuth } from "@/_core/hooks/useAuth";
import { AiBudgetAlerts } from './admin/AiBudgetAlerts';
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
import { Sidebar, SidebarContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

import { useIsMobile } from "@/hooks/useMobile";
import { LayoutGrid, LogOut, PanelLeft, Users, Megaphone, Settings, ShieldCheck, Smartphone, BarChart3, CreditCard, BellDot, Sparkles, Search, Key, Database, Receipt, Gift, Award, TrendingUp, Activity, Globe, Languages, FlaskConical, Brain, Mail, FileCode2, FileCheck2, KeyRound } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { NotificationBell } from "./NotificationBell";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { useTranslation } from 'react-i18next';
import MerchantShell from './merchant/MerchantShell';
import { WorkspaceStandalone, WorkspaceState } from './merchant/WorkspaceState';

// Administration menu items.
type MenuItem = {
  icon: any;
  label: string;
  path: string;
};

// Administration navigation. Tenant navigation lives only in MerchantShell.
const getAdminMenuItems = (t: any): MenuItem[] => [
  { icon: LayoutGrid, label: t('sidebar.admin.dashboard'), path: "/admin/dashboard" },
  { icon: Activity, label: t('sidebar.admin.monitor', 'مركز المراقبة'), path: "/admin/monitor" },
  { icon: ShieldCheck, label: t('sidebar.admin.privacyRequests', 'طلبات الخصوصية'), path: "/admin/privacy-requests" },
  { icon: Users, label: t('sidebar.admin.merchants'), path: "/admin/merchants" },
  { icon: Megaphone, label: t('sidebar.admin.campaigns'), path: "/admin/campaigns" },
  { icon: Smartphone, label: t('sidebar.admin.whatsappRequests'), path: "/admin/whatsapp-requests" },
  { icon: Award, label: t('sidebar.admin.packages'), path: "/admin/packages" },
  { icon: Gift, label: t('sidebar.admin.addons'), path: "/admin/addons" },
  { icon: CreditCard, label: t('sidebar.admin.tapSettings', 'إعدادات Tap'), path: "/admin/tap-settings" },
  { icon: Receipt, label: t('sidebar.admin.invoices', 'الفواتير'), path: "/admin/invoices" },
  { icon: TrendingUp, label: t('sidebar.admin.subscriptionReports', 'تقارير الاشتراكات'), path: "/admin/subscription-reports" },
  { icon: FileCheck2, label: t('salesEvidence.title'), path: "/admin/sales-evidence" },
  { icon: FileCheck2, label: t('salesReadout.title'), path: "/admin/sales-experiments" },
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
  { icon: Brain, label: 'مركز تدريب ساري', path: "/admin/ai-training" },
  { icon: BarChart3, label: '📊 ذكاء المنصة', path: "/admin/ai-analytics" },
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
  const [routeLocation] = useLocation();
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user, error, refresh } = useAuth();
  const merchantRoute = /^\/merchant(?:\/|$)/.test(routeLocation);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    if (merchantRoute) return <WorkspaceStandalone><WorkspaceState kind="loading" /></WorkspaceStandalone>;
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    if (merchantRoute) return <WorkspaceStandalone><WorkspaceState kind={error ? 'offline' : 'session'} onRetry={error ? () => { void refresh(); } : undefined} /></WorkspaceStandalone>;
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

  const isAdminRoute = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
  const isAdmin = user.role === 'admin' || user.role === 'superadmin';
  if (isAdminRoute && !isAdmin) {
    return <Redirect to="/merchant/dashboard" />;
  }

  if (merchantRoute) {
    return <MerchantShell>{children}</MerchantShell>;
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

  const menuItems = getAdminMenuItems(t);
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
                    {t('sidebar.adminPanel')}
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
              {
                menuItems.filter(item => item.label.toLowerCase().includes(sidebarSearch.trim().toLowerCase())).map((item) => {
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
              }
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
        <main className="flex-1 p-4 md:p-6">
          {user?.role === 'admin' && location !== '/admin/ai-settings' && <div className="mb-4"><AiBudgetAlerts /></div>}
          {children}
        </main>
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
