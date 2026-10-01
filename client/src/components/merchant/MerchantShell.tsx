import { hasKnowledgeDrafts } from "@/lib/knowledge-workspace-cache";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { hasAssistantDrafts } from "@/lib/assistant-draft-cache";
import {
  ArrowLeft,
  ArrowRight,
  Grid2X2,
  LogOut,
  Menu,
  Search,
  Sparkles,
  Store,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import { MerchantSelector } from "@/components/MerchantSelector";
import { NotificationBell } from "@/components/NotificationBell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { EmergencyPhoneButton } from "@/components/EmergencyPhoneButton";
import { SubscriptionBadge } from "@/components/SubscriptionBadge";
import { useIntegration } from "@/hooks/useIntegration";
import {
  merchantSections,
  merchantSectionForPath,
  merchantToolForPath,
  navigableMerchantTools,
} from "./navigation";
import "@/styles/merchant-workspace.css";
import "@/styles/merchant-mobile.css";
import {
  searchMerchantTools,
  toolTranslationKey,
} from "@/lib/merchant-tools-search";
import { useMerchantViewport } from "@/lib/merchant-viewport";
import ErrorBoundary from "../ErrorBoundary";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";

export default function MerchantShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const direction = i18n.dir(),
    Arrow = direction === "rtl" ? ArrowLeft : ArrowRight;
  useMerchantViewport();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);
  const searchButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const mobileOpener = useRef<HTMLElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchResultsRef = useRef<HTMLElement>(null);
  const { data: merchant } = trpc.merchants.getCurrent.useQuery(undefined, {
    staleTime: 30_000,
  });
  const section = merchantSectionForPath(location);
  const tool = merchantToolForPath(location);
  const { source, term } = useIntegration();
  const sectionLabel = (section: string, language?: "ar" | "en") =>
    t(
      `merchantNavigationUx.sections.${section}`,
      language ? { lng: language } : {}
    );
  const translatedTool = (path: string, language?: "ar" | "en") => {
    const canonical = merchantToolForPath(path)?.paths[0];
    return canonical
      ? t(toolTranslationKey(canonical), language ? { lng: language } : {})
      : t("merchantShellUx.tool");
  };
  const toolLabel = (path: string) =>
    source !== "none" && path === "/merchant/products"
      ? term("products")
      : source !== "none" && path === "/merchant/customers"
        ? term("customers")
        : source !== "none" && path === "/merchant/orders"
          ? term("orders")
          : translatedTool(path);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setQuery("");
  }, [location]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        !event.isComposing &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setSearchOpen(open => !open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
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
          <strong>{t("merchantShellUx.brand")}</strong>
          <small>{t("merchantShellUx.tagline")}</small>
        </span>
      </Link>
      <div className="mw-sidebar-scroll">
        <p className="mw-nav-label">{t("merchantShellUx.workspace")}</p>
        <nav aria-label={t("merchantShellUx.sections")} className="mw-nav">
          {merchantSections.slice(0, 8).map(item => (
            <Link
              key={item.id}
              href={item.path}
              className="mw-nav-link"
              aria-current={section?.id === item.id ? "page" : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon aria-hidden="true" />
              <span>{sectionLabel(item.id)}</span>
            </Link>
          ))}
          <div className="mw-nav-secondary">
            <Link
              href="/merchant/settings"
              className="mw-nav-link"
              aria-current={
                section?.id === "settings" && location !== "/merchant/tools"
                  ? "page"
                  : undefined
              }
              onClick={() => setMobileOpen(false)}
            >
              <Store aria-hidden="true" />
              {t("merchantNavigationUx.sections.settings")}
            </Link>
            <Link
              href="/merchant/tools"
              className="mw-nav-link"
              aria-current={location === "/merchant/tools" ? "page" : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <Grid2X2 aria-hidden="true" />
              {t("merchantToolsUx.title")}
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
            {t("merchantShellUx.plan")}
            <Arrow className="mw-direction-arrow" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </>
  );
  const searchResults = searchMerchantTools(
    { query, section: "all" },
    (path, language) => `${translatedTool(path, language)} ${toolLabel(path)}`,
    sectionLabel
  );
  return (
    <div className="merchant-workspace" dir={direction}>
      <a
        href="#merchant-main"
        className="mw-skip"
        onClick={event => {
          event.preventDefault();
          main.current?.focus();
        }}
      >
        {t("merchantShellUx.skip")}
      </a>
      <aside className="mw-sidebar" aria-label={t("merchantShellUx.mainMenu")}>
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
                  onClick={event => {
                    mobileOpener.current = event.currentTarget;
                  }}
                  aria-label={t("merchantShellUx.openMenu")}
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent
                side={direction === "rtl" ? "right" : "left"}
                dir={direction}
                closeLabel={t("merchantShellUx.close")}
                onCloseAutoFocus={event => {
                  event.preventDefault();
                  mobileOpener.current?.focus();
                }}
                className="merchant-workspace mw-mobile-sheet"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>{t("merchantShellUx.menu")}</SheetTitle>
                  <SheetDescription>
                    {t("merchantShellUx.menuHelp")}
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
                <strong>
                  {merchant?.businessName || t("merchantShellUx.store")}
                </strong>
                <small>
                  {location === "/merchant/tools"
                    ? t("merchantToolsUx.title")
                    : section
                      ? sectionLabel(section.id)
                      : tool
                        ? toolLabel(tool.paths[0])
                        : t("merchantShellUx.merchantSpace")}
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
              aria-label={t("merchantShellUx.searchOpen")}
            >
              <Search />
              <span>{t("merchantShellUx.searchTrigger")}</span>
              <kbd>Ctrl K</kbd>
            </Button>
            <NotificationBell />
            <DropdownMenu dir={direction}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="mw-account"
                  aria-label={t("merchantShellUx.account")}
                >
                  <span>{user?.name?.charAt(0) || "س"}</span>
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
                  onClick={() => setLocation("/merchant/settings")}
                >
                  {t("merchantShellUx.accountSettings")}
                </DropdownMenuItem>
                {(user?.role === "admin" || user?.role === "superadmin") && (
                  <DropdownMenuItem
                    onClick={() => setLocation("/admin/dashboard")}
                  >
                    {t("merchantShellUx.admin")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setConfirmLogout(true)}
                >
                  <LogOut className="h-4 w-4" />
                  {t("merchantShellUx.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {section && !["overview", "inbox"].includes(section.id) && (
          <nav
            className="mw-section-tabs"
            aria-label={t("merchantShellUx.sectionTools", {
              section: sectionLabel(section.id),
            })}
          >
            {section.tabs.map(path => (
              <Link
                key={path}
                href={path}
                aria-current={
                  location === path || location.startsWith(path + "/")
                    ? "page"
                    : undefined
                }
              >
                {toolLabel(path)}
              </Link>
            ))}
            <Link href={`/merchant/tools?section=${section.id}`}>
              {t("merchantShellUx.more")}
              <Grid2X2 aria-hidden="true" />
            </Link>
          </nav>
        )}
        <main
          id="merchant-main"
          ref={main}
          tabIndex={-1}
          className={`mw-main ${section?.id === "inbox" && location === "/merchant/conversations" ? "mw-inbox-main" : ""}`}
        >
          <ErrorBoundary
            resetKey={location}
            fallback={(retry, error) => (
              <WorkspaceState
                kind={workspaceFailureKind(error)}
                onRetry={
                  workspaceFailureKind(error) === "error" ? retry : undefined
                }
                focus
              />
            )}
          >
            {children}
          </ErrorBoundary>
        </main>
        <footer className="mw-footer">
          <span>{t("merchantShellUx.footer")}</span>
          <Link href="/merchant/privacy-center">
            {t("merchantShellUx.privacy")}
          </Link>
        </footer>
      </div>
      <nav className="mw-bottom-nav" aria-label={t("merchantShellUx.quickNav")}>
        {merchantSections.slice(0, 3).map(item => (
          <Link
            key={item.id}
            href={item.path}
            aria-current={section?.id === item.id ? "page" : undefined}
          >
            <item.icon aria-hidden="true" />
            <span>{sectionLabel(item.id)}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={event => {
            mobileOpener.current = event.currentTarget;
            setMobileOpen(true);
          }}
          aria-label={t("merchantShellUx.moreSections")}
        >
          <Grid2X2 aria-hidden="true" />
          <span>{t("merchantShellUx.more")}</span>
        </button>
      </nav>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent
          className="merchant-workspace mw-search-dialog"
          dir={direction}
          closeLabel={t("merchantShellUx.close")}
          onCloseAutoFocus={event => {
            event.preventDefault();
            searchButton.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("merchantShellUx.searchTitle")}</DialogTitle>
            <DialogDescription>
              {t("merchantShellUx.searchHelp")}
            </DialogDescription>
          </DialogHeader>
          <label className="sr-only" htmlFor="merchant-tool-search">
            {t("merchantShellUx.searchLabel")}
          </label>
          <div className="mw-search-field">
            <Search aria-hidden="true" />
            <input
              id="merchant-tool-search"
              ref={searchInput}
              type="search"
              maxLength={100}
              aria-controls="merchant-tool-results"
              onKeyDown={event => {
                if (
                  !event.nativeEvent.isComposing &&
                  event.key === "ArrowDown"
                ) {
                  const first =
                    searchResultsRef.current?.querySelector<HTMLAnchorElement>(
                      "a"
                    );
                  if (first) {
                    event.preventDefault();
                    first.focus();
                  }
                }
              }}
              autoComplete="off"
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t("merchantShellUx.searchPlaceholder")}
            />
          </div>
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-sm text-muted-foreground"
          >
            {t("merchantToolsUx.results", {
              shown: searchResults.length,
              total: navigableMerchantTools.length,
            })}
          </p>
          {query && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setQuery("");
                searchInput.current?.focus();
              }}
            >
              {t("merchantShellUx.clearSearch")}
            </Button>
          )}
          <nav
            id="merchant-tool-results"
            ref={searchResultsRef}
            className="mw-search-results"
            aria-label={t("merchantToolsUx.resultsLabel")}
            onKeyDown={event => {
              if (
                event.nativeEvent.isComposing ||
                !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
              )
                return;
              const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>("a"));
              const index = links.indexOf(event.target as HTMLAnchorElement);
              if (index < 0) return;
              event.preventDefault();
              if (event.key === "ArrowUp" && index === 0) {
                searchInput.current?.focus();
                return;
              }
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? links.length - 1
                    : Math.min(
                        links.length - 1,
                        index + (event.key === "ArrowDown" ? 1 : -1)
                      );
              links[next]?.focus();
            }}
          >
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
                    <small>{sectionLabel(item.section)}</small>
                  </span>
                  <Arrow className="mw-direction-arrow" aria-hidden="true" />
                </Link>
              ))
            ) : (
              <p
                role="status"
                className="py-8 text-center text-muted-foreground"
              >
                {t("merchantShellUx.searchEmpty")}
              </p>
            )}
          </nav>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent dir={direction}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("merchantShellUx.logout")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("merchantShellUx.logoutHelp")}
              {hasAssistantDrafts() && (
                <span className="mt-2 block">
                  {t("assistantDraftUx.logoutWarning")}
                </span>
              )}
              {hasKnowledgeDrafts() && (
                <span className="mt-2 block">
                  {t("merchantUx.knowledgeDraft.logoutWarning")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("merchantShellUx.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void logout()}>
              {t("merchantShellUx.logout")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
