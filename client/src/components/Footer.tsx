import { Link } from 'wouter';
import { Mail, Phone, MapPin, Facebook, Twitter, Instagram, Linkedin, Youtube } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { t } = useTranslation();

  return (
    <footer className="border-t bg-muted/30">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand Section */}
          <div className="space-y-4 lg:col-span-1">
            <div className="flex items-center gap-2">
              <img src="/sari-logo.png" alt="ساري" className="h-10 w-auto" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('footer.description')}
            </p>
            <div className="flex gap-3">
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
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-muted hover:bg-accent flex items-center justify-center transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-4 h-4" />
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-muted hover:bg-accent flex items-center justify-center transition-colors"
                aria-label="YouTube"
              >
                <Youtube className="w-4 h-4" />
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
            </div>
          </div>

          {/* الحلول */}
          <div>
            <h3 className="font-semibold mb-4">الحلول</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/solutions/sales">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    للمبيعات
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/solutions/marketing">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    للتسويق
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/solutions/support">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    للدعم الفني
                  </span>
                </Link>
              </li>
            </ul>
          </div>

          {/* المنتج */}
          <div>
            <h3 className="font-semibold mb-4">المنتج</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/product/ai-agent">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    الذكاء الاصطناعي
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/product/chatbot">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    روبوت الدردشة
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/product/whatsapp">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    التكامل مع WhatsApp
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/product/broadcasts">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    البث الجماعي
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/pricing">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    التسعير
                  </span>
                </Link>
              </li>
            </ul>
          </div>

          {/* الشركة */}
          <div>
            <h3 className="font-semibold mb-4">الشركة</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/company/about">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    من نحن
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/company/contact">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    اتصل بنا
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/company/terms">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    الشروط والأحكام
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/company/privacy">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    سياسة الخصوصية
                  </span>
                </Link>
              </li>
            </ul>
          </div>

          {/* الموارد والدعم */}
          <div>
            <h3 className="font-semibold mb-4">الموارد والدعم</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/resources/blog">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    المدونة
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/resources/help-center">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    مركز المساعدة
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/resources/success-stories">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    قصص النجاح
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/support">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    الدعم الفني
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Contact Info */}
        <div className="mt-12 pt-8 border-t">
          <div className="grid md:grid-cols-3 gap-6 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <a href="mailto:support@sari.sa" className="hover:text-foreground transition-colors">
                support@sari.sa
              </a>
            </div>
            <div className="flex items-start gap-2">
              <Phone className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <a href="tel:+966500000000" className="hover:text-foreground transition-colors" dir="ltr">
                +966 50 000 0000
              </a>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>الرياض، المملكة العربية السعودية</span>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>© {currentYear} ساري - جميع الحقوق محفوظة</p>
        </div>
      </div>
    </footer>
  );
}
