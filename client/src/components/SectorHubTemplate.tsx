import React from 'react';
import { SectorData } from '../data/solutions/types';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { ArrowLeft, Sparkles, CheckCircle2, ShieldCheck } from 'lucide-react';
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
            <Button asChild size="lg" className="text-lg h-14 px-8 shadow-lg">
              <Link href="/signup">
                ابدأ تجربتك المجانية
                <Sparkles aria-hidden="true" className="ms-2 w-5 h-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {sector.spotlight && (
        <section
          className="py-16 md:py-20 bg-slate-950 text-white"
          aria-labelledby={`${sector.spotlight.id}-title`}
        >
          <div className="container px-4 md:px-6 mx-auto max-w-6xl">
            <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-10 lg:gap-14 items-start">
              <div className="space-y-5 lg:sticky lg:top-24">
                <span className="inline-flex rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-sm font-semibold text-emerald-200">
                  {sector.spotlight.badge}
                </span>
                <h2 id={`${sector.spotlight.id}-title`} className="text-3xl md:text-4xl font-bold leading-tight">
                  {sector.spotlight.title}
                </h2>
                <p className="text-lg leading-8 text-slate-300">
                  {sector.spotlight.description}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button asChild size="lg">
                    <Link href={sector.spotlight.primaryAction.href}>
                      {sector.spotlight.primaryAction.label}
                      <ArrowLeft aria-hidden="true" className="ms-2 h-4 w-4" />
                    </Link>
                  </Button>
                  {sector.spotlight.secondaryAction && (
                    <Button asChild size="lg" variant="outline" className="border-slate-600 bg-transparent text-white hover:bg-white/10 hover:text-white">
                      <Link href={sector.spotlight.secondaryAction.href}>
                        {sector.spotlight.secondaryAction.label}
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {sector.spotlight.features.map(feature => (
                  <article key={feature.title} className="rounded-2xl border border-white/10 bg-white/5 p-5 md:p-6">
                    <div className="flex gap-4 items-start">
                      <span className="rounded-xl bg-primary/20 p-3 shrink-0">
                        <feature.icon aria-hidden="true" className="h-6 w-6 text-emerald-300" />
                      </span>
                      <div>
                        <h3 className="text-xl font-semibold">{feature.title}</h3>
                        <p className="mt-2 leading-7 text-slate-300">{feature.description}</p>
                      </div>
                    </div>
                  </article>
                ))}
                <div className="flex gap-3 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                  <ShieldCheck aria-hidden="true" className="h-5 w-5 shrink-0 mt-0.5" />
                  <p>{sector.spotlight.qualificationNotice}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

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

                <Button asChild variant="outline" className="mt-auto w-full justify-between group-hover:bg-primary/5 group-hover:border-primary/30">
                  <Link href={`/solutions/${sector.slug}/${service.slug}`}>
                    اكتشف المزيد
                    <ArrowLeft aria-hidden="true" className="w-4 h-4 mr-2" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — Sari primary color */}
      <section className="py-20 bg-primary text-white">
        <div className="container text-center px-4">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            {sector.callToAction?.title || `هل أنت جاهز لتحويل قطاع ${sector.title}؟`}
          </h2>
          <p className="text-xl mb-10 opacity-90 max-w-2xl mx-auto">
            {sector.callToAction?.description || 'ابدأ تجربة ساري لتقييم أتمتة المبيعات وخدمة العملاء عبر واتساب وفق احتياج منشأتك.'}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Button asChild size="lg" variant="secondary" className="text-lg h-14 px-10">
              <Link href={sector.callToAction?.primaryAction.href || '/signup'}>
                {sector.callToAction?.primaryAction.label || 'ابدأ مجاناً الآن'}
                <ArrowLeft aria-hidden="true" className="ms-2 w-5 h-5" />
              </Link>
            </Button>
            {sector.callToAction?.secondaryAction && (
              <Button asChild size="lg" variant="outline" className="text-lg h-14 px-10 border-white/60 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <Link href={sector.callToAction.secondaryAction.href}>
                  {sector.callToAction.secondaryAction.label}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
