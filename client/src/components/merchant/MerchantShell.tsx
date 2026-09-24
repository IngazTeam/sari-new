import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  ArrowLeft,
  Grid2X2,
  LogOut,
  Menu,
  Search,
  Sparkles,
  Store,
} from 'lucide-react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MerchantSelector } from '@/components/MerchantSelector';
import { NotificationBell } from '@/components/NotificationBell';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { EmergencyPhoneButton } from '@/components/EmergencyPhoneButton';
import { SubscriptionBadge } from '@/components/SubscriptionBadge';
import { useIntegration } from '@/hooks/useIntegration';
import {
  merchantSections,
  merchantSectionForPath,
  merchantToolForPath,
  navigableMerchantTools,
} from './navigation';
import '@/styles/merchant-workspace.css';

export default function MerchantShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const searchButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const { data: merchant } = trpc.merchants.getCurrent.useQuery(undefined, {
    staleTime: 30_000,
  });
  const section = merchantSectionForPath(location);
  const tool = merchantToolForPath(location);
  const { source, term } = useIntegration();
  const toolLabel = (path: string) =>
    source !== 'none' && path === '/merchant/products'
      ? term('products')
      : source !== 'none' && path === '/merchant/customers'
        ? term('customers')
        : source !== 'none' && path === '/merchant/orders'
          ? term('orders')
          : merchantToolForPath(path)?.title || 'الأداة';

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setQuery('');
  }, [location]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(open => !open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const sidebar = (
    <>
      <Link
        href="/merchant/dashboard"
        className="mw-brand"
        onClick={() => setMobileOpen(false)}
      >
        <span className="mw-brand-mark">
          <Sparkles aria-hidden="true" />
        </span>
        <span>
          <strong>ساري</strong>
          <small>شريك يومك</small>
        </span>
      </Link>
      <div className="mw-sidebar-scroll">
        <p className="mw-nav-label">مساحة العمل</p>
        <nav aria-label="أقسام لوحة التاجر" className="mw-nav">
          {merchantSections.slice(0, 8).map(item => (
            <Link
              key={item.id}
              href={item.path}
              className="mw-nav-link"
              aria-current={section?.id === item.id ? 'page' : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon aria-hidden="true" />
              <span>{item.title}</span>
            </Link>
          ))}
          <div className="mw-nav-secondary">
            <Link
              href="/merchant/settings"
              className="mw-nav-link"
              aria-current={section?.id === 'settings' ? 'page' : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <Store aria-hidden="true" />
              الإعدادات
            </Link>
            <Link
              href="/merchant/tools"
              className="mw-nav-link"
              aria-current={location === '/merchant/tools' ? 'page' : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <Grid2X2 aria-hidden="true" />
              جميع الأدوات
            </Link>
          </div>
        </nav>
      </div>
      <div className="mw-sidebar-footer">
        <MerchantSelector />
        <div className="mw-subscription">
          <SubscriptionBadge />
          <Link
            href="/merchant/my-subscription"
            className="flex items-center gap-2 text-xs"
          >
            الباقة والاستخدام
            <ArrowLeft aria-hidden="true" />
          </Link>
        </div>
      </div>
    </>
  );
  const searchResults = navigableMerchantTools.filter(item =>
    `${item.title} ${item.path} ${merchantSections.find(s => s.id === item.section)?.title}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  );
  return (
    <div className="merchant-workspace" dir="rtl">
      <a
        href="#merchant-main"
        className="mw-skip"
        onClick={event => {
          event.preventDefault();
          main.current?.focus();
        }}
      >
        انتقل إلى المحتوى
      </a>
      <aside className="mw-sidebar" aria-label="القائمة الرئيسية">
        {sidebar}
      </aside>
      <div className="mw-workspace">
        <header className="mw-topbar">
          <div className="mw-store-row">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mw-mobile-menu"
                  aria-label="فتح قائمة التاجر"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="merchant-workspace mw-mobile-sheet"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>قائمة التاجر</SheetTitle>
                  <SheetDescription>
                    الأقسام والإعدادات والمتجر المحدد
                  </SheetDescription>
                </SheetHeader>
                {mobileOpen && sidebar}
              </SheetContent>
            </Sheet>
            <Link href="/merchant/settings" className="mw-store">
              <span className="mw-store-icon">
                <Store aria-hidden="true" />
              </span>
              <span>
                <strong>{merchant?.businessName || 'متجرك'}</strong>
                <small>
                  {section?.title ||
                    (location === '/merchant/tools'
                      ? 'جميع الأدوات'
                      : tool?.title || 'مساحة التاجر')}
                </small>
              </span>
            </Link>
          </div>
          <div className="mw-header-actions">
            <Button
              ref={searchButton}
              type="button"
              variant="outline"
              className="mw-search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label="البحث في أدوات المتجر"
            >
              <Search />
              <span>ابحث عن أداة…</span>
              <kbd>Ctrl K</kbd>
            </Button>
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="mw-account"
                  aria-label="الحساب والتفضيلات"
                >
                  <span>{user?.name?.charAt(0) || 'س'}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-3 py-2">
                  <strong className="block text-sm">{user?.name}</strong>
                  <span className="text-xs text-muted-foreground break-all">
                    {user?.email}
                  </span>
                </div>
                <div className="flex items-center justify-between border-y px-3 py-2">
                  <ThemeSwitcher variant="compact" />
                  <LanguageSwitcher variant="compact" />
                  <EmergencyPhoneButton />
                </div>
                <DropdownMenuItem
                  onClick={() => setLocation('/merchant/settings')}
                >
                  إعدادات الحساب
                </DropdownMenuItem>
                {(user?.role === 'admin' || user?.role === 'superadmin') && (
                  <DropdownMenuItem
                    onClick={() => setLocation('/admin/dashboard')}
                  >
                    لوحة الإدارة
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setConfirmLogout(true)}
                >
                  <LogOut className="h-4 w-4" />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {section && !['overview', 'inbox'].includes(section.id) && (
          <nav
            className="mw-section-tabs"
            aria-label={`أدوات ${section.title}`}
          >
            {section.tabs.map(path => (
              <Link
                key={path}
                href={path}
                aria-current={
                  location === path || location.startsWith(path + '/')
                    ? 'page'
                    : undefined
                }
              >
                {toolLabel(path)}
              </Link>
            ))}
            <Link href={`/merchant/tools?section=${section.id}`}>
              المزيد
              <Grid2X2 aria-hidden="true" />
            </Link>
          </nav>
        )}
        <main
          id="merchant-main"
          ref={main}
          tabIndex={-1}
          className={`mw-main ${section?.id === 'inbox' && location === '/merchant/conversations' ? 'mw-inbox-main' : ''}`}
        >
          {children}
        </main>
        <footer className="mw-footer">
          <span>مساحة أوضح. يوم أخف.</span>
          <Link href="/merchant/privacy-center">الخصوصية وإدارة البيانات</Link>
        </footer>
      </div>
      <nav className="mw-bottom-nav" aria-label="التنقل السريع">
        {merchantSections.slice(0, 3).map(item => (
          <Link
            key={item.id}
            href={item.path}
            aria-current={section?.id === item.id ? 'page' : undefined}
          >
            <item.icon aria-hidden="true" />
            <span>{item.title}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="المزيد من أقسام المتجر"
        >
          <Grid2X2 aria-hidden="true" />
          <span>المزيد</span>
        </button>
      </nav>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent
          className="merchant-workspace mw-search-dialog"
          onCloseAutoFocus={event => {
            event.preventDefault();
            searchButton.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>إلى أين تريد الذهاب؟</DialogTitle>
            <DialogDescription>
              ابحث في أقسام متجرك وأدواته. Esc للإغلاق.
            </DialogDescription>
          </DialogHeader>
          <label className="sr-only" htmlFor="merchant-tool-search">
            اسم الأداة
          </label>
          <div className="mw-search-field">
            <Search aria-hidden="true" />
            <input
              id="merchant-tool-search"
              autoComplete="off"
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="مثال: الحجوزات، الولاء، واتساب…"
            />
          </div>
          <div className="mw-search-results" aria-label="نتائج البحث">
            {searchResults.length ? (
              searchResults.map(item => (
                <Link
                  href={item.path}
                  key={item.path}
                  className="mw-search-result"
                  onClick={() => setSearchOpen(false)}
                >
                  <span>
                    <strong>{toolLabel(item.path)}</strong>
                    <small>
                      {merchantSections.find(s => s.id === item.section)?.title}
                    </small>
                  </span>
                  <ArrowLeft aria-hidden="true" />
                </Link>
              ))
            ) : (
              <p
                role="status"
                className="py-8 text-center text-muted-foreground"
              >
                لا توجد أداة مطابقة. جرّب كلمة أخرى.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تسجيل الخروج</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد إنهاء جلسة العمل الحالية؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={() => void logout()}>
              تسجيل الخروج
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
