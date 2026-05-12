import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Menu, X, Globe, ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;
  const isRTL = currentLang === 'ar';

  // Update document direction when language changes
  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;
  }, [currentLang, isRTL]);

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
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
              <Button variant="ghost" size="icon" className="relative">
                <Globe className="h-5 w-5" />
                <span className="sr-only">Switch Language</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => changeLanguage('ar')}
                className={currentLang === 'ar' ? 'bg-accent' : ''}
              >
                <span className="ml-2">🇸🇦</span>{t('navbar.auto_0')}</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => changeLanguage('en')}
                className={currentLang === 'en' ? 'bg-accent' : ''}
              >
                <span className="ml-2">🇬🇧</span>
                English
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => changeLanguage('fr')}
                className={currentLang === 'fr' ? 'bg-accent' : ''}
              >
                <span className="ml-2">🇫🇷</span>
                Français
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => changeLanguage('de')}
                className={currentLang === 'de' ? 'bg-accent' : ''}
              >
                <span className="ml-2">🇩🇪</span>
                Deutsch
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => changeLanguage('es')}
                className={currentLang === 'es' ? 'bg-accent' : ''}
              >
                <span className="ml-2">🇪🇸</span>
                Español
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => changeLanguage('zh')}
                className={currentLang === 'zh' ? 'bg-accent' : ''}
              >
                <span className="ml-2">🇨🇳</span>
                中文
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => changeLanguage('tr')}
                className={currentLang === 'tr' ? 'bg-accent' : ''}
              >
                <span className="ml-2">🇹🇷</span>
                Türkçe
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => changeLanguage('it')}
                className={currentLang === 'it' ? 'bg-accent' : ''}
              >
                <span className="ml-2">🇮🇹</span>
                Italiano
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link href="/login">
            <Button variant="ghost">{t('auth.login')}</Button>
          </Link>
          <Link href="/signup">
            <Button className="bg-primary hover:bg-primary/90">
              {t('nav.tryFree')}
            </Button>
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 hover:bg-accent rounded-lg transition-colors"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t bg-background">
          <div className="container py-4 space-y-3">
            {/* الحلول */}
            <div className="space-y-2">
              <div className="text-sm font-bold text-foreground py-2">{t('menu.solutions.title')}</div>
              {solutionsMenu.map((item) => (
                <Link key={item.href} href={item.href}>
                  <div
                    className="block py-2 pr-4 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.title}
                  </div>
                </Link>
              ))}
            </div>

            {/* المنتج */}
            <div className="space-y-2">
              <div className="text-sm font-bold text-foreground py-2">{t('menu.product.title')}</div>
              {productMenu.map((item) => (
                <Link key={item.href} href={item.href}>
                  <div
                    className="block py-2 pr-4 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.title}
                  </div>
                </Link>
              ))}
            </div>

            {/* الموارد */}
            <div className="space-y-2">
              <div className="text-sm font-bold text-foreground py-2">{t('menu.resources.title')}</div>
              {resourcesMenu.map((item) => (
                <Link key={item.href} href={item.href}>
                  <div
                    className="block py-2 pr-4 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.title}
                  </div>
                </Link>
              ))}
            </div>

            {/* التسعير */}
            <Link href="/pricing">
              <div
                className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                onClick={() => setIsMenuOpen(false)}
              >
                {t('menu.pricing')}
              </div>
            </Link>

            {/* جرب ساري */}
            <Link href="/try-sari">
              <div
                className="block py-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                onClick={() => setIsMenuOpen(false)}
              >
                {t('menu.trySari')}
              </div>
            </Link>

            <div className="pt-3 space-y-2">
              <div onClick={() => setIsMenuOpen(false)}>
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    {t('menu.login')}
                  </Button>
                </Link>
              </div>
              <div onClick={() => setIsMenuOpen(false)}>
                <Link href="/signup">
                  <Button className="w-full bg-primary hover:bg-primary/90">
                    {t('menu.startFree')}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
