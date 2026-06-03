import React from 'react';
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

interface SolutionPageTemplateProps {
  sector: SectorData;
  service: SolutionService;
}

export function SolutionPageTemplate({ sector, service }: SolutionPageTemplateProps) {
  return (
    <div className="bg-white">
      <SeoHead 
        title={`${service.heroTitle} | ساري`}
        description={service.metaDescription}
        canonicalUrl={`https://sari.ai/solutions/${sector.slug}/${service.slug}`}
        type="website"
      />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-white z-0"></div>
        <div className="container relative z-10 px-4 md:px-6 mx-auto">
          <div className="max-w-4xl mx-auto text-center">
            {service.heroBadge && (
              <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary/10 text-primary hover:bg-primary/20 mb-6">
                {service.heroBadge}
              </div>
            )}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 mb-6 leading-tight">
              {service.heroTitle}
            </h1>
            <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              {service.heroDescription}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register">
                <a className="w-full sm:w-auto">
                  <Button size="lg" className="w-full text-lg h-14 px-8 rounded-full">
                    جرب ساري مجاناً
                    <ArrowLeft className="w-5 h-5 mr-2" />
                  </Button>
                </a>
              </Link>
              <Link href="/contact">
                <a className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full text-lg h-14 px-8 rounded-full">
                    تحدث مع المبيعات
                  </Button>
                </a>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The Problem & Solution Section */}
      <section className="py-20 bg-white">
        <div className="container px-4 md:px-6 mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                {service.problemTitle}
              </h2>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
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
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">{item.title}</h3>
                      <p className="text-gray-600 leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Sector Chat Showcase inside the problem/solution section */}
            <div className="bg-gray-50 rounded-3xl p-6 lg:p-8 border border-gray-100">
              <SectorChatShowcase scenarios={service.chatScenarios} />
            </div>
          </div>
        </div>
      </section>

      {/* Objections Section */}
      {service.objections.length > 0 && (
        <section className="py-20 bg-gray-50">
          <div className="container px-4 md:px-6 mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">لماذا ساري هو الحل الأمثل؟</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              {service.objections.map((obj, index) => (
                <div key={index} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 mt-1">
                      <obj.icon className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 text-lg">التخوف: {obj.objection}</h4>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 pl-14">
                    <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0 mt-1">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-gray-600 leading-relaxed">
                        <span className="font-semibold text-gray-900">الحل: </span>
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
        <section className="py-20 bg-white">
          <div className="container px-4 md:px-6 mx-auto max-w-3xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">الأسئلة الشائعة</h2>
            </div>
            <Accordion type="single" collapsible className="w-full">
              {service.faqs.map((faq, index) => (
                <AccordionItem key={index} value={`faq-${index}`}>
                  <AccordionTrigger className="text-lg font-medium text-right hover:text-primary">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-600 text-base leading-relaxed pb-4">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="py-20 bg-primary relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M0 40L40 0H20L0 20M40 40V20L20 40" stroke="currentColor" strokeWidth="2" fill="none" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-pattern)" />
          </svg>
        </div>
        
        <div className="container relative z-10 px-4 md:px-6 mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            {service.ctaTitle || 'جاهز لتحويل واتساب إلى موظف مبيعات؟'}
          </h2>
          <p className="text-xl text-primary-foreground/90 mb-10 max-w-2xl mx-auto">
            {service.ctaDescription || 'ابدأ الآن وجرب ساري مجاناً. انضم لمئات الشركات التي ضاعفت مبيعاتها.'}
          </p>
          <Link href="/register">
            <a>
              <Button size="lg" variant="secondary" className="text-lg h-14 px-10 rounded-full text-primary">
                ابدأ تجربتك المجانية
              </Button>
            </a>
          </Link>
        </div>
      </section>
    </div>
  );
}
