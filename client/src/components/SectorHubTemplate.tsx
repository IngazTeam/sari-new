import React from 'react';
import { SectorData } from '../data/solutions/types';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface SectorHubTemplateProps {
  sector: SectorData;
}

export function SectorHubTemplate({ sector }: SectorHubTemplateProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead
        title={`${sector.title} | ساري`}
        description={sector.description}
        canonicalUrl={`https://sari.ai/solutions/${sector.slug}`}
        type="website"
      />
      <Navbar />

      {/* Hero */}
      <section className={`relative overflow-hidden bg-gradient-to-b from-${sector.themeColor}/10 to-white py-20 md:py-28`}>
        <div className="container relative z-10 text-center max-w-4xl mx-auto px-4">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-${sector.themeColor}/10 text-${sector.themeColor} text-sm font-medium mb-6`}>
            <sector.icon className="w-4 h-4" />
            <span>حلول ساري لقطاع {sector.title}</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            ساري لقطاع <span className={`text-${sector.themeColor}`}>{sector.title}</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            {sector.description}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <a>
                <Button size="lg" className={`w-full sm:w-auto bg-${sector.themeColor} hover:bg-${sector.themeColor}/90 text-lg h-14 px-8 shadow-lg text-white`}>
                  ابدأ تجربتك المجانية
                  <Sparkles className="ms-2 w-5 h-5" />
                </Button>
              </a>
            </Link>
          </div>
        </div>
      </section>

      {/* Services Grid (Hub section) */}
      <section className="py-20 bg-white">
        <div className="container px-4 md:px-6 mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">حلول ساري المخصصة</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              اكتشف كيف يمكن لساري أتمتة عملياتك وزيادة مبيعاتك من خلال هذه الحلول الجاهزة.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {sector.services.map((service) => (
              <div key={service.id} className="bg-white border rounded-2xl p-6 hover:shadow-xl transition-all duration-300 group flex flex-col h-full">
                <div className="mb-4">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold bg-${sector.themeColor}/10 text-${sector.themeColor} mb-3`}>
                    {service.heroBadge || 'خدمة ساري'}
                  </span>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{service.title}</h3>
                  <p className="text-gray-600 line-clamp-3 mb-6">
                    {service.heroDescription}
                  </p>
                </div>
                
                <div className="mt-auto space-y-3 mb-6">
                  {service.howItWorks.slice(0, 3).map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                      <CheckCircle2 className={`w-4 h-4 text-${sector.themeColor}`} />
                      <span>{item.title}</span>
                    </div>
                  ))}
                </div>

                <Link href={`/solutions/${sector.slug}/${service.slug}`}>
                  <a className="mt-auto">
                    <Button variant="outline" className="w-full justify-between group-hover:bg-gray-50">
                      اكتشف المزيد
                      <ArrowRight className="w-4 h-4 ml-2 rtl:rotate-180" />
                    </Button>
                  </a>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={`py-20 bg-${sector.themeColor} text-white`}>
        <div className="container text-center px-4">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">هل أنت جاهز لتحويل قطاع {sector.title}؟</h2>
          <p className="text-xl mb-10 opacity-90 max-w-2xl mx-auto">
            انضم إلى الشركات الرائدة التي تعتمد على ساري لأتمتة مبيعاتها وخدمة عملائها عبر واتساب.
          </p>
          <Link href="/register">
            <a>
              <Button size="lg" variant="secondary" className={`text-lg h-14 px-10 text-${sector.themeColor}`}>
                ابدأ مجاناً الآن
                <ArrowRight className="ms-2 w-5 h-5 rtl:rotate-180" />
              </Button>
            </a>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
