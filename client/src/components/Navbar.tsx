import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Menu, X, Globe } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { changeAppLanguage } from '@/lib/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';

const LANGUAGE_OPTIONS = [
  { code: 'ar', flag: '🇸🇦', label: 'العربية' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'zh', flag: '🇨🇳', label: '中文' },
  { code: 'tr', flag: '🇹🇷', label: 'Türkçe' },
  { code: 'it', flag: '🇮🇹', label: 'Italiano' },
] as const;

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.resolvedLanguage || i18n.language || 'ar').split(/[-_]/, 1)[0];
  const isRTL = currentLang === 'ar';

  // Update document direction when language changes
  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;
  }, [currentLang, isRTL]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isMenuOpen]);

  const changeLanguage = (lang: string) => {
    void changeAppLanguage(lang);
  };

  const solutionsMenu = [
    {
      title: t('menu.solutions.sales.title'),
      href: '/solutions/sales',
      description: t('menu.solutions.sales.description')
    },
    {
      title: t('menu.solutions.marketing.title'),
      href: '/solutions/marketing',
      description: t('menu.solutions.marketing.description')
    },
    {
      title: t('menu.solutions.support.title'),
      href: '/solutions/support',
      description: t('menu.solutions.support.description')
    }
  ];

  const productMenu = [
    {
      title: t('menu.product.ai.title'),
      href: '/product/ai-agent',
      description: t('menu.product.ai.description')
    },
    {
      title: t('menu.product.chatbot.title'),
      href: '/product/chatbot',
      description: t('menu.product.chatbot.description')
    },
    {
      title: t('menu.product.whatsapp.title'),
      href: '/product/whatsapp',
      description: t('menu.product.whatsapp.description')
    },
    {
      title: t('menu.product.broadcasts.title'),
      href: '/product/broadcasts',
      description: t('menu.product.broadcasts.description')
    }
  ];

  const resourcesMenu = [
    {
      title: t('menu.resources.blog.title'),
      href: '/resources/blog',
      description: t('menu.resources.blog.description')
    },
    {
      title: t('menu.resources.helpCenter.title'),
      href: '/resources/help-center',
      description: t('menu.resources.helpCenter.description')
    },
    {
      title: t('menu.resources.successStories.title'),
      href: '/resources/success-stories',
      description: t('menu.resources.successStories.description')
    }
  ];

  const industriesMenu = [
    { title: isRTL ? 'العيادات' : 'Clinics', href: '/solutions/clinics', description: isRTL ? 'حجز مواعيد وتذكيرات ذكية' : 'Appointment booking & reminders' },
    { title: isRTL ? 'المطاعم' : 'Restaurants', href: '/solutions/restaurants', description: isRTL ? 'نظام طلبات واتساب ذكي' : 'AI WhatsApp ordering' },
    { title: isRTL ? 'الصالونات' : 'Salons', href: '/solutions/salons', description: isRTL ? 'حجز وبرنامج ولاء' : 'Booking & loyalty' },
    { title: isRTL ? 'مراكز التدريب' : 'Training', href: '/solutions/training-centers', description: isRTL ? 'تسجيل دورات وتذكيرات' : 'Course registration' },
    { title: isRTL ? 'العقار' : 'Real Estate', href: '/solutions/real-estate', description: isRTL ? 'عرض عقارات ومتابعة' : 'Listings & follow-up' },
    { title: isRTL ? 'الاستشارات' : 'Consulting', href: '/solutions/consultants', description: isRTL ? 'حجز استشارات ودفع' : 'Booking & payment' },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/">
          <div className="flex items-center gap-2 font-bold text-xl hover:opacity-80 transition-opacity cursor-pointer">
            <img src="/sari-logo.png" alt={t('compNavbarPage.text0')} className="h-12 w-auto object-contain" />
          </div>
        </Link>

        {/* Desktop Navigation with Dropdowns */}
        <div className="hidden md:flex items-center">
          <NavigationMenu>
            <NavigationMenuList className="gap-2">
              {/* الحلول */}
              <NavigationMenuItem>
                <NavigationMenuTrigger className="text-sm font-medium">
                  {t('menu.solutions.title')}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[400px] gap-3 p-4">
                    {solutionsMenu.map((item) => (
                      <li key={item.href}>
                        <Link href={item.href}>
                          <NavigationMenuLink className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">
                            <div className="text-sm font-medium leading-none">{item.title}</div>
                            <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                              {item.description}
                            </p>
                          </NavigationMenuLink>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>

              {/* القطاعات */}
              <NavigationMenuItem>
                <NavigationMenuTrigger className="text-sm font-medium">
                  {t('publicUx.navigation.industries')}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[400px] gap-3 p-4">
                    {industriesMenu.map((item) => (
                      <li key={item.href}>
                        <Link href={item.href}>
                          <NavigationMenuLink className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">
                            <div className="text-sm font-medium leading-none">{item.title}</div>
                            <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">{item.description}</p>
                          </NavigationMenuLink>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>

              {/* المنتج */}
              <NavigationMenuItem>
                <NavigationMenuTrigger className="text-sm font-medium">
                  {t('menu.product.title')}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[400px] gap-3 p-4">
                    {productMenu.map((item) => (
                      <li key={item.href}>
                        <Link href={item.href}>
                          <NavigationMenuLink className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">
                            <div className="text-sm font-medium leading-none">{item.title}</div>
                            <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                              {item.description}
                            </p>
                          </NavigationMenuLink>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>

              {/* الموارد */}
              <NavigationMenuItem>
                <NavigationMenuTrigger className="text-sm font-medium">
                  {t('menu.resources.title')}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[400px] gap-3 p-4">
                    {resourcesMenu.map((item) => (
                      <li key={item.href}>
                        <Link href={item.href}>
                          <NavigationMenuLink className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">
                            <div className="text-sm font-medium leading-none">{item.title}</div>
                            <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                              {item.description}
                            </p>
                          </NavigationMenuLink>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>

              {/* التسعير */}
              <NavigationMenuItem>
                <Link href="/pricing">
                  <NavigationMenuLink className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-4 py-2 inline-block">
                    {t('menu.pricing')}
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>

              {/* جرب ساري */}
              <NavigationMenuItem>
                <Link href="/try-sari">
                  <NavigationMenuLink className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors cursor-pointer px-4 py-2 inline-block">
                    {t('menu.trySari')}
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          {/* Language Switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                aria-label={t('publicUx.navigation.switchLanguage')}
              >
                <Globe aria-hidden="true" className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {LANGUAGE_OPTIONS.map(language => (
                <DropdownMenuItem
                  key={language.code}
                  onClick={() => changeLanguage(language.code)}
                  className={currentLang === language.code ? 'bg-accent' : ''}
                >
                  <span aria-hidden="true" className={isRTL ? 'ml-2' : 'mr-2'}>{language.flag}</span>
                  {language.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button asChild variant="ghost">
            <Link href="/login">{t('auth.login')}</Link>
          </Button>
          <Button asChild className="bg-primary hover:bg-primary/90">
            <Link href="/signup">
              {t('nav.tryFree')}
            </Link>
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          className="md:hidden p-2 hover:bg-accent rounded-lg transition-colors"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label={t(isMenuOpen ? 'publicUx.navigation.menuClose' : 'publicUx.navigation.menuOpen')}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-navigation-menu"
        >
          {isMenuOpen ? <X aria-hidden="true" className="w-6 h-6" /> : <Menu aria-hidden="true" className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div
          id="mobile-navigation-menu"
          className="md:hidden border-t bg-background max-h-[calc(100vh-4rem)] overflow-y-auto"
          aria-label={t('publicUx.navigation.mobileMenu')}
        >
          <div className="container py-4 space-y-4">
            <div className="space-y-2">
              <label htmlFor="mobile-language" className="flex items-center gap-2 text-sm font-semibold">
                <Globe aria-hidden="true" className="h-4 w-4" />
                {t('publicUx.navigation.languageLabel')}
              </label>
              <select
                id="mobile-language"
                value={currentLang}
                onChange={event => changeLanguage(event.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {LANGUAGE_OPTIONS.map(language => (
                  <option key={language.code} value={language.code}>
                    {language.flag} {language.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/pricing"
                className="rounded-md border px-3 py-2 text-center text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setIsMenuOpen(false)}
              >
                {t('menu.pricing')}
              </Link>
              <Link
                href="/try-sari"
                className="rounded-md border border-primary/40 px-3 py-2 text-center text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setIsMenuOpen(false)}
              >
                {t('menu.trySari')}
              </Link>
            </div>

            {[
              { title: t('menu.solutions.title'), items: solutionsMenu },
              { title: t('publicUx.navigation.industries'), items: industriesMenu },
              { title: t('menu.product.title'), items: productMenu },
              { title: t('menu.resources.title'), items: resourcesMenu },
            ].map(section => (
              <details key={section.title} className="group rounded-md border px-3">
                <summary className="cursor-pointer list-none py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                  <span className="flex items-center justify-between">
                    {section.title}
                    <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
                  </span>
                </summary>
                <div className="border-t pb-2 pt-1">
                  {section.items.map(item => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block rounded-sm px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {item.title}
                    </Link>
                  ))}
                </div>
              </details>
            ))}

            <div className="grid gap-2 pt-1">
              <Button asChild variant="outline" className="w-full">
                <Link href="/login" onClick={() => setIsMenuOpen(false)}>{t('menu.login')}</Link>
              </Button>
              <Button asChild className="w-full bg-primary hover:bg-primary/90">
                <Link href="/signup" onClick={() => setIsMenuOpen(false)}>{t('menu.startFree')}</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
