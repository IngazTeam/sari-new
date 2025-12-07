import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Menu, X, Bot } from 'lucide-react';
import { useState } from 'react';

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks = [
    { href: '/', label: 'الرئيسية' },
    { href: '/products', label: 'المنتجات' },
    { href: '/pricing', label: 'التسعير' },
    { href: '/support', label: 'الدعم' },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/">
          <a className="flex items-center gap-2 font-bold text-xl hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              ساري
            </span>
          </a>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <a className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                {link.label}
              </a>
            </Link>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/login">
            <a>
              <Button variant="ghost">تسجيل الدخول</Button>
            </a>
          </Link>
          <Link href="/login">
            <a>
              <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                ابدأ الآن مجاناً
              </Button>
            </a>
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
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <a
                  className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.label}
                </a>
              </Link>
            ))}
            <div className="pt-3 space-y-2">
              <Link href="/login">
                <a className="block" onClick={() => setIsMenuOpen(false)}>
                  <Button variant="outline" className="w-full">
                    تسجيل الدخول
                  </Button>
                </a>
              </Link>
              <Link href="/login">
                <a className="block" onClick={() => setIsMenuOpen(false)}>
                  <Button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                    ابدأ الآن مجاناً
                  </Button>
                </a>
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
