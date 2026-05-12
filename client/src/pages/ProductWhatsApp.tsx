import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight, MessageCircle, Link as LinkIcon, Shield, Zap, CheckCircle2, ShoppingCart, Store, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SeoHead, useSeoConfig } from '@/components/SeoHead';

export default function ProductWhatsApp() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-green-50">
      <SeoHead {...useSeoConfig('productWhatsApp')} />

      {/* Hero */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <MessageCircle className="w-4 h-4" />
            {t('productWhatsApp.hero.badge')}
          </div>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-l from-green-600 to-green-800 bg-clip-text text-transparent">
            {t('productWhatsApp.hero.title')}
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-3xl mx-auto">
            {t('productWhatsApp.hero.description')}
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-green-600 hover:bg-green-700 text-lg px-8">
                {t('productWhatsApp.hero.ctaPrimary')}
                <ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/company/contact">
              <Button size="lg" variant="outline" className="text-lg px-8">
                {t('productWhatsApp.hero.ctaSecondary')}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Integration Steps */}
      <section className="container py-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">{t('productWhatsApp.steps.title')}</h2>
            <p className="text-gray-600">{t('productWhatsApp.steps.subtitle')}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-green-100 -z-10" />
            
            {[
              { icon: Phone, title: t('productWhatsApp.steps.s1.title'), desc: t('productWhatsApp.steps.s1.desc') },
              { icon: LinkIcon, title: t('productWhatsApp.steps.s2.title'), desc: t('productWhatsApp.steps.s2.desc') },
              { icon: Zap, title: t('productWhatsApp.steps.s3.title'), desc: t('productWhatsApp.steps.s3.desc') },
            ].map((step, i) => (
              <Card key={i} className="p-6 text-center border-green-200 bg-white hover:shadow-lg transition-all">
                <div className="w-16 h-16 bg-green-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-sm">
                  <step.icon className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                <p className="text-gray-600 text-sm">{step.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Integrations */}
      <section className="bg-white py-20">
        <div className="container max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold mb-6">{t('productWhatsApp.platforms.title')}</h2>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                {t('productWhatsApp.platforms.description')}
              </p>
              
              <div className="space-y-4">
                {[
                  { title: "سلة Salla", icon: ShoppingCart },
                  { title: "زد Zid", icon: Store },
                  { title: "شوبيفاي Shopify", icon: Globe },
                ].map((platform, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 border border-gray-100 rounded-xl hover:bg-green-50 hover:border-green-200 transition-colors">
                    <div className="w-12 h-12 bg-white shadow-sm rounded-lg flex items-center justify-center">
                      <platform.icon className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg">{platform.title}</h4>
                      <p className="text-sm text-gray-500">{t('productWhatsApp.platforms.sync')}</p>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-green-500 ml-auto" />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                t('productWhatsApp.features.f1'),
                t('productWhatsApp.features.f2'),
                t('productWhatsApp.features.f3'),
                t('productWhatsApp.features.f4'),
              ].map((feature, i) => (
                <Card key={i} className="p-6 bg-green-50/50 border-none">
                  <Shield className="w-8 h-8 text-green-600 mb-4" />
                  <h4 className="font-bold mb-2">{feature}</h4>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20">
        <Card className="bg-gradient-to-l from-green-600 to-green-800 text-white p-12 text-center">
          <MessageCircle className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-4xl font-bold mb-4">{t('productWhatsApp.cta.title')}</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            {t('productWhatsApp.cta.description')}
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-white text-green-600 hover:bg-gray-100 text-lg px-8">
                {t('productWhatsApp.cta.btnPrimary')}
                <ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
