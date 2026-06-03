import React from 'react';
import { SectorData } from '../data/solutions/types';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { ArrowLeft, Sparkles, CheckCircle2 } from 'lucide-react';
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
        title={`حلول ساري لقطاع ${sector.title} | ساري`}
        description={sector.description}
        canonicalUrl={`https://sary.live/solutions/${sector.slug}`}
        ogType="website"
      />
      <Navbar />

      {/* Hero — unified with Sari primary green */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background py-20 md:py-28">
        <div className="container relative z-10 text-center max-w-4xl mx-auto px-4 space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <sector.icon className="w-4 h-4" />
            <span>حلول ساري لقطاع {sector.title}</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
            ساري لقطاع <span className="text-primary">{sector.title}</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {sector.description}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link href="/signup">
              <a>
                <Button size="lg" className="text-lg h-14 px-8 shadow-lg">
                  ابدأ تجربتك المجانية
                  <Sparkles className="ms-2 w-5 h-5" />
                </Button>
              </a>
            </Link>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container px-4 md:px-6 mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl md:text-4xl font-bold">حلول ساري المخصصة</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              اكتشف كيف يمكن لساري أتمتة عملياتك وزيادة مبيعاتك من خلال هذه الحلول الجاهزة.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {sector.services.map((service) => (
              <div key={service.id} className="bg-card border rounded-2xl p-6 hover:shadow-xl transition-all duration-300 group flex flex-col h-full">
                <div className="mb-4">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary mb-3">
                    {service.heroBadge || 'خدمة ساري'}
                  </span>
                  <h3 className="text-2xl font-bold mb-3">{service.title}</h3>
                  <p className="text-muted-foreground line-clamp-3 mb-6">
                    {service.heroDescription}
                  </p>
                </div>
                
                <div className="mt-auto space-y-3 mb-6">
                  {service.howItWorks.slice(0, 3).map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                      <span>{item.title}</span>
                    </div>
                  ))}
                </div>

                <Link href={`/solutions/${sector.slug}/${service.slug}`}>
                  <a className="mt-auto block">
                    <Button variant="outline" className="w-full justify-between group-hover:bg-primary/5 group-hover:border-primary/30">
                      اكتشف المزيد
                      <ArrowLeft className="w-4 h-4 mr-2" />
                    </Button>
                  </a>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — Sari primary color */}
      <section className="py-20 bg-primary text-white">
        <div className="container text-center px-4">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">هل أنت جاهز لتحويل قطاع {sector.title}؟</h2>
          <p className="text-xl mb-10 opacity-90 max-w-2xl mx-auto">
            انضم إلى الشركات الرائدة التي تعتمد على ساري لأتمتة مبيعاتها وخدمة عملائها عبر واتساب.
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
