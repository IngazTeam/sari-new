import { Link } from 'wouter';
import { Bot, Mail, Phone, MapPin, Facebook, Twitter, Instagram, Linkedin } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/30">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <span className="font-bold text-xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                ساري
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              مساعد المبيعات الذكي على الواتساب. نساعد التجار في أتمتة خدمة العملاء وزيادة المبيعات باستخدام الذكاء الاصطناعي.
            </p>
            <div className="flex gap-3">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-muted hover:bg-accent flex items-center justify-center transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="w-4 h-4" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-muted hover:bg-accent flex items-center justify-center transition-colors"
                aria-label="Twitter"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-muted hover:bg-accent flex items-center justify-center transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-muted hover:bg-accent flex items-center justify-center transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold mb-4">روابط سريعة</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/">
                  <a className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    الرئيسية
                  </a>
                </Link>
              </li>
              <li>
                <Link href="/products">
                  <a className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    المنتجات
                  </a>
                </Link>
              </li>
              <li>
                <Link href="/pricing">
                  <a className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    التسعير
                  </a>
                </Link>
              </li>
              <li>
                <Link href="/support">
                  <a className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    الدعم
                  </a>
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold mb-4">قانوني</h3>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  سياسة الخصوصية
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  شروط الاستخدام
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  سياسة الاسترجاع
                </a>
              </li>
              <li>
                <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  الأسئلة الشائعة
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold mb-4">تواصل معنا</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <a href="mailto:support@sari.sa" className="hover:text-foreground transition-colors">
                  support@sari.sa
                </a>
              </li>
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <Phone className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <a href="tel:+966500000000" className="hover:text-foreground transition-colors" dir="ltr">
                  +966 50 000 0000
                </a>
              </li>
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>الرياض، المملكة العربية السعودية</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>© {currentYear} ساري. جميع الحقوق محفوظة.</p>
        </div>
      </div>
    </footer>
  );
}
