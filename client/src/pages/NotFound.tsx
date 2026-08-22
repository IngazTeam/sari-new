import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { AlertCircle, Headphones, Home } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { SeoHead } from '@/components/SeoHead';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function NotFound() {
  const { t, i18n } = useTranslation();
  const isArabic = (i18n.resolvedLanguage || i18n.language || 'ar').startsWith('ar');

  return (
    <div className="min-h-screen flex flex-col bg-background" dir={isArabic ? 'rtl' : 'ltr'}>
      <SeoHead
        title={t('publicUx.notFound.pageTitle')}
        description={t('publicUx.notFound.metaDescription')}
        noindex
      />
      <Navbar />

      <main className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-background py-16">
        <Card className="w-full max-w-lg mx-4 shadow-lg border-0 bg-background/90 backdrop-blur-sm">
          <CardContent className="py-10 text-center">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-destructive/10 rounded-full" />
                <AlertCircle aria-hidden="true" className="relative h-16 w-16 text-destructive" />
              </div>
            </div>

            <p className="text-sm font-semibold tracking-widest text-muted-foreground">404</p>
            <h1 className="text-3xl font-bold mt-2">{t('publicUx.notFound.title')}</h1>
            <p className="text-muted-foreground mt-4 mb-8 leading-relaxed">
              {t('publicUx.notFound.description')}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild>
                <Link href="/">
                  <Home aria-hidden="true" className={`h-4 w-4 ${isArabic ? 'ml-2' : 'mr-2'}`} />
                  {t('publicUx.notFound.home')}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/support">
                  <Headphones aria-hidden="true" className={`h-4 w-4 ${isArabic ? 'ml-2' : 'mr-2'}`} />
                  {t('publicUx.notFound.support')}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
