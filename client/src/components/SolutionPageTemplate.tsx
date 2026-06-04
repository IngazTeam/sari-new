import React, { useMemo } from 'react';
import { SolutionService, SectorData } from '../data/solutions/types';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SectorChatShowcase } from './SectorChatShowcase';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { SeoHead } from './SeoHead';
import Navbar from './Navbar';
import Footer from './Footer';

const BASE_URL = 'https://sary.live';

interface SolutionPageTemplateProps {
  sector: SectorData;
  service: SolutionService;
}

export function SolutionPageTemplate({ sector, service }: SolutionPageTemplateProps) {
  // P2-5: Generate structured data for rich results (FAQ + Breadcrumb + Service)
  const structuredData = useMemo(() => {
    const schemas: any[] = [];

    // BreadcrumbList schema
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ساري', item: `${BASE_URL}/` },
        { '@type': 'ListItem', position: 2, name: `حلول ${sector.title}`, item: `${BASE_URL}/solutions/${sector.slug}` },
        { '@type': 'ListItem', position: 3, name: service.heroTitle, item: `${BASE_URL}/solutions/${sector.slug}/${service.slug}` },
      ],
    });

    // FAQPage schema (only if FAQs exist)
    if (service.faqs.length > 0) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: service.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      });
    }

    // Service schema
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: service.heroTitle,
      description: service.metaDescription,
      provider: {
        '@type': 'Organization',
        name: 'ساري | Sari',
        url: BASE_URL,
      },
      areaServed: { '@type': 'Country', name: 'SA' },
      serviceType: service.title,
    });

    return schemas;
  }, [sector, service]);

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead 
        title={`${service.heroTitle} | ساري`}
        description={service.metaDescription}
        canonicalUrl={`${BASE_URL}/solutions/${sector.slug}/${service.slug}`}
        ogType="website"
        structuredData={structuredData}
      />
      <Navbar />

      {/* Hero Section — matching Sari identity */}
      <section className="relative pt-20 pb-16 md:pt-28 md:pb-20 overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] dark:bg-grid-slate-700/25" />
        <div className="container relative z-10 px-4 md:px-6 mx-auto">
          <div className="max-w-4xl mx-auto text-center space-y-6">
            {service.heroBadge && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
                <sector.icon className="w-4 h-4" />
                <span>{service.heroBadge}</span>
              </div>
            )}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
              {service.heroTitle}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              {service.heroDescription}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link href="/signup">
                <a className="w-full sm:w-auto">
                  <Button size="lg" className="w-full text-lg h-14 px-8 shadow-lg">
                    جرب ساري مجاناً
                    <ArrowLeft className="w-5 h-5 mr-2" />
                  </Button>
                </a>
              </Link>
              <Link href="/try-sari">
                <a className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full text-lg h-14 px-8">
                    شاهد العرض التوضيحي
                  </Button>
                </a>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The Problem & Solution Section */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container px-4 md:px-6 mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <h2 className="text-3xl font-bold mb-6">
                {service.problemTitle}
              </h2>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                {service.problemDescription}
              </p>
              
              <div className="space-y-6">
                {service.howItWorks.map((item, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <item.icon className="w-6 h-6" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                      <p className="text-muted-foreground leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Sector Chat Showcase */}
            <div className="bg-muted/30 rounded-3xl p-6 lg:p-8 border">
              <SectorChatShowcase scenarios={service.chatScenarios} />
            </div>
          </div>
        </div>
      </section>

      {/* Objections Section */}
      {service.objections.length > 0 && (
        <section className="py-20 bg-muted/30">
          <div className="container px-4 md:px-6 mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">لماذا ساري هو الحل الأمثل؟</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              {service.objections.map((obj, index) => (
                <div key={index} className="bg-card p-6 rounded-2xl shadow-sm border">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0 mt-1">
                      <obj.icon className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-lg">التخوف: {obj.objection}</h4>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 mr-14">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-muted-foreground leading-relaxed">
                        <span className="font-semibold text-foreground">الحل: </span>
                        {obj.response}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FAQ Section */}
      {service.faqs.length > 0 && (
        <section className="py-20 bg-white dark:bg-background">
          <div className="container px-4 md:px-6 mx-auto max-w-3xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">الأسئلة الشائعة</h2>
            </div>
            <Accordion type="single" collapsible className="w-full">
              {service.faqs.map((faq, index) => (
                <AccordionItem key={index} value={`faq-${index}`}>
                  <AccordionTrigger className="text-lg font-medium text-right hover:text-primary">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-base leading-relaxed pb-4">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      )}

      {/* CTA Section — using Sari primary green */}
      <section className="py-20 bg-primary text-white">
        <div className="container px-4 md:px-6 mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            {service.ctaTitle || 'جاهز لتحويل واتساب إلى موظف مبيعات؟'}
          </h2>
          <p className="text-xl opacity-90 mb-10 max-w-2xl mx-auto">
            {service.ctaDescription || 'ابدأ الآن وجرب ساري مجاناً — بدون بطاقة ائتمان — تفعيل خلال 5 دقائق.'}
          </p>
          <Link href="/signup">
            <a>
              <Button size="lg" variant="secondary" className="text-lg h-14 px-10">
                ابدأ مجاناً الآن
                <ArrowLeft className="ms-2 w-5 h-5" />
              </Button>
            </a>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
