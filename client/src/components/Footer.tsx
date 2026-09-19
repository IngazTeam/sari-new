import { Link } from 'wouter';
import { Mail, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { t } = useTranslation();

  return (
    <footer className="border-t bg-muted/30">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-8">
          {/* Brand Section */}
          <div className="space-y-4 lg:col-span-1">
            <div className="flex items-center gap-2">
              <img src="/sari-logo.png" alt={t('compFooterPage.text0')} className="h-12 w-auto object-contain" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('footer.description')}
            </p>
          </div>

          {/* الحلول */}
          <div>
            <h3 className="font-semibold mb-4">{t('compFooterPage.text1')}</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/solutions/sales">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_0')}</span>
                </Link>
              </li>
              <li>
                <Link href="/solutions/marketing">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_1')}</span>
                </Link>
              </li>
              <li>
                <Link href="/solutions/support">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_2')}</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* القطاعات */}
          <div>
            <h3 className="font-semibold mb-4">القطاعات</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/solutions/clinics">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">العيادات والمراكز الطبية</span>
                </Link>
              </li>
              <li>
                <Link href="/solutions/restaurants">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">المطاعم والمقاهي</span>
                </Link>
              </li>
              <li>
                <Link href="/solutions/salons">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">الصالونات والتجميل</span>
                </Link>
              </li>
              <li>
                <Link href="/solutions/training-centers">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">مراكز التدريب</span>
                </Link>
              </li>
              <li>
                <Link href="/solutions/real-estate">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">العقارات والمقاولات</span>
                </Link>
              </li>
              <li>
                <Link href="/solutions/consultants">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">الاستشارات والخدمات</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* المنتج */}
          <div>
            <h3 className="font-semibold mb-4">{t('compFooterPage.text2')}</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/product/ai-agent">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_3')}</span>
                </Link>
              </li>
              <li>
                <Link href="/product/chatbot">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_4')}</span>
                </Link>
              </li>
              <li>
                <Link href="/product/whatsapp">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_5')}</span>
                </Link>
              </li>
              <li>
                <Link href="/product/broadcasts">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_6')}</span>
                </Link>
              </li>
              <li>
                <Link href="/pricing">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_7')}</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* الشركة */}
          <div>
            <h3 className="font-semibold mb-4">{t('compFooterPage.text3')}</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/company/about">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_8')}</span>
                </Link>
              </li>
              <li>
                <Link href="/company/contact">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_9')}</span>
                </Link>
              </li>
              <li>
                <Link href="/company/terms">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_10')}</span>
                </Link>
              </li>
              <li>
                <Link href="/company/privacy">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_11')}</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* الموارد والدعم */}
          <div>
            <h3 className="font-semibold mb-4">{t('compFooterPage.text4')}</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/resources/blog">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_12')}</span>
                </Link>
              </li>
              <li>
                <Link href="/resources/help-center">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_13')}</span>
                </Link>
              </li>
              <li>
                <Link href="/resources/success-stories">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_14')}</span>
                </Link>
              </li>
              <li>
                <Link href="/support">
                  <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{t('footer.auto_15')}</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Contact Info */}
        <div className="mt-12 pt-8 border-t">
          <div className="grid md:grid-cols-2 gap-6 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <a href="mailto:support@sary.live" className="hover:text-foreground transition-colors">
                support@sary.live
              </a>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{t('compFooterPage.text5')}</span>
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
