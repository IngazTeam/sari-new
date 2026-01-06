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
      title: 'للمبيعات',
      href: '/solutions/sales',
      description: 'سرّع خط مبيعاتك وزد تحويلاتك'
    },
    {
      title: 'للتسويق',
      href: '/solutions/marketing',
      description: 'حملات تسويقية مخصصة على واتساب'
    },
    {
      title: 'للدعم الفني',
      href: '/solutions/support',
      description: 'ردود فورية بالذكاء الاصطناعي'
    }
  ];

  const productMenu = [
    {
      title: 'الذكاء الاصطناعي',
      href: '/product/ai-agent',
      description: 'وكيل ذكي بشخصية ساري'
    },
    {
      title: 'روبوت الدردشة',
      href: '/product/chatbot',
      description: 'روبوتات دردشة بدون برمجة'
    },
    {
      title: 'التكامل مع WhatsApp',
      href: '/product/whatsapp',
      description: 'ربط سهل عبر QR Code'
    },
    {
      title: 'البث الجماعي',
      href: '/product/broadcasts',
      description: 'حملات مخصصة لآلاف العملاء'
    }
  ];

  const resourcesMenu = [
    {
      title: 'المدونة',
      href: '/resources/blog',
      description: 'مقالات ونصائح تسويقية'
    },
    {
      title: 'مركز المساعدة',
      href: '/resources/help-center',
      description: 'إجابات على أسئلتك'
    },
    {
      title: 'قصص النجاح',
      href: '/resources/success-stories',
      description: 'تجارب عملائنا'
    }
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/">
          <div className="flex items-center gap-2 font-bold text-xl hover:opacity-80 transition-opacity cursor-pointer">
            <img src="/sari-logo.png" alt="ساري" className="h-10 w-auto" />
          </div>
        </Link>

        {/* Desktop Navigation with Dropdowns */}
        <div className="hidden md:flex items-center">
          <NavigationMenu>
            <NavigationMenuList className="gap-2">
              {/* الحلول */}
              <NavigationMenuItem>
                <NavigationMenuTrigger className="text-sm font-medium">
                  الحلول
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
                  المنتج
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
                  الموارد
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
                    التسعير
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>

              {/* جرب ساري */}
              <NavigationMenuItem>
                <Link href="/try-sari">
                  <NavigationMenuLink className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors cursor-pointer px-4 py-2 inline-block">
                    جرب ساري
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
                <span className="ml-2">🇸🇦</span>
                العربية
              </DropdownMenuItem>
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
              <div className="text-sm font-bold text-foreground py-2">الحلول</div>
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
              <div className="text-sm font-bold text-foreground py-2">المنتج</div>
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
              <div className="text-sm font-bold text-foreground py-2">الموارد</div>
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
                التسعير
              </div>
            </Link>

            {/* جرب ساري */}
            <Link href="/try-sari">
              <div
                className="block py-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                onClick={() => setIsMenuOpen(false)}
              >
                جرب ساري
              </div>
            </Link>

            <div className="pt-3 space-y-2">
              <div onClick={() => setIsMenuOpen(false)}>
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    تسجيل الدخول
                  </Button>
                </Link>
              </div>
              <div onClick={() => setIsMenuOpen(false)}>
                <Link href="/signup">
                  <Button className="w-full bg-primary hover:bg-primary/90">
                    ابدأ الآن مجاناً
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
