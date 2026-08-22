import Navbar from '@/components/Navbar';
import { SeoHead, useSeoConfig } from '@/components/SeoHead';
import Footer from '@/components/Footer';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';
import { QueryStateCard } from '@/components/QueryStateCard';

export default function Pricing() {
  const { t, i18n } = useTranslation();
  // Fetch plans from database
  const { data: plans, isLoading, isFetching, error, refetch } = trpc.subscriptionPlans.listPlans.useQuery();
  const isArabic = i18n.resolvedLanguage === 'ar' || i18n.language === 'ar';

  const faqs = [
    {
      question: t('publicUx.pricing.faqTrialQuestion'),
      answer: t('publicUx.pricing.faqTrialAnswer'),
    },
    {
      question: t('publicUx.pricing.faqSourceQuestion'),
      answer: t('publicUx.pricing.faqSourceAnswer'),
    },
    {
      question: t('publicUx.pricing.faqCancelQuestion'),
      answer: t('publicUx.pricing.faqCancelAnswer'),
    },
    {
      question: t('publicUx.pricing.faqTaxQuestion'),
      answer: t('publicUx.pricing.faqTaxAnswer'),
    },
  ];

  // Parse features from JSON string
  const parseFeatures = (featuresStr: string | null): string[] => {
    if (!featuresStr) return [];
    try {
      const parsed = JSON.parse(featuresStr);
      return Array.isArray(parsed)
        ? parsed
            .filter((feature): feature is string => typeof feature === 'string')
            .map((feature) => feature.trim())
            .filter(Boolean)
            .slice(0, 50)
        : [];
    } catch {
      return [];
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead {...useSeoConfig('pricing')} />
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-background">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] dark:bg-grid-slate-700/25" />
        <div className="container relative py-20 md:py-32">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <h1 className="text-4xl md:text-6xl font-bold">
              <span className="text-primary">{t('publicUx.pricing.heroTitle')}</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              {t('publicUx.pricing.heroDescription')}
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-20">
        <div className="container">
          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center items-center py-20" role="status" aria-live="polite">
              <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
              <span className="ms-3 text-lg text-muted-foreground">{t('publicUx.pricing.loading')}</span>
            </div>
          )}

          {/* Error State */}
          {error && (
            <QueryStateCard
              kind="error"
              title={t('publicUx.pricing.errorTitle')}
              description={t('publicUx.pricing.errorDescription')}
              retryLabel={isFetching ? t('publicUx.pricing.retrying') : t('publicUx.pricing.retry')}
              onRetry={() => void refetch()}
              action={(
                <Button asChild variant="outline">
                  <Link href="/company/contact">{t('publicUx.pricing.contactSales')}</Link>
                </Button>
              )}
            />
          )}

          {/* Plans Grid */}
          {!isLoading && !error && plans && plans.length > 0 && (
            <>
              <div className="grid md:grid-cols-3 gap-8">
                {plans.map((plan) => {
                  const features = parseFeatures(plan.features);
                  const planName = isArabic ? plan.name : (plan.nameEn || plan.name);
                  const planDescription = isArabic
                    ? plan.description
                    : (plan.descriptionEn || plan.description);

                  return (
                    <Card
                      key={plan.id}
                      className="relative border-2 border-border hover:border-primary/30 dark:hover:border-blue-800 transition-all"
                    >
                      <CardHeader className="text-center space-y-4 pt-8">
                        <div>
                          <h3 className="text-2xl font-bold">{planName}</h3>
                        </div>
                        <div>
                          <div className="flex items-baseline justify-center gap-2">
                            <span className="text-5xl font-bold">{plan.monthlyPrice}</span>
                            <span className="text-muted-foreground">{plan.currency}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{t('publicUx.pricing.monthly')}</p>
                        </div>
                        {planDescription && (
                          <p className="text-sm text-muted-foreground">{planDescription}</p>
                        )}
                      </CardHeader>

                      <CardContent className="space-y-6">
                        <ul className="space-y-3">
                          {/* Display max customers */}
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                            <span className="text-sm">{t('publicUx.pricing.customerLimit', { count: plan.maxCustomers })}</span>
                          </li>
                          
                          {/* Display features from database */}
                          {features.map((feature, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
                              <span className="text-sm">{feature}</span>
                            </li>
                          ))}
                        </ul>

                        <Button asChild className="w-full" variant="outline" size="lg">
                          <Link href={`/subscribe/${plan.id}`}>
                            {t('publicUx.pricing.choosePlan', { name: planName })}
                            <ArrowRight className="ms-2 w-4 h-4 rtl:rotate-180" aria-hidden="true" />
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="text-center mt-12">
                <p className="text-muted-foreground">
                  {t('publicUx.pricing.vatNotice')}
                </p>
              </div>
            </>
          )}

          {/* No Plans State */}
          {!isLoading && !error && (!plans || plans.length === 0) && (
            <QueryStateCard
              kind="empty"
              title={t('publicUx.pricing.emptyTitle')}
              description={t('publicUx.pricing.emptyDescription')}
              action={(
                <Button asChild variant="outline">
                  <Link href="/company/contact">{t('publicUx.pricing.contactSales')}</Link>
                </Button>
              )}
            />
          )}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('publicUx.pricing.faqTitle')}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t('publicUx.pricing.faqSubtitle')}
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {faqs.map((faq) => (
              <Card key={faq.question}>
                <CardContent className="p-6 space-y-2">
                  <h3 className="font-semibold text-lg">{faq.question}</h3>
                  <p className="text-muted-foreground">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary text-white">
        <div className="container text-center space-y-8">
          <h2 className="text-3xl md:text-5xl font-bold">
            {t('publicUx.pricing.ctaTitle')}
          </h2>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            {t('publicUx.pricing.ctaDescription')}
          </p>
          <Button asChild size="lg" variant="secondary" className="text-lg h-14 px-8">
            <Link href="/signup">
              {t('publicUx.pricing.ctaButton')}
              <ArrowRight className="ms-2 w-5 h-5 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
