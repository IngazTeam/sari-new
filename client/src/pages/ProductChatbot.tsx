import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight, MessageSquare, Bot, Clock, Sparkles, ShieldCheck, BarChart3, Zap, Globe, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SeoHead, useSeoConfig } from '@/components/SeoHead';

export default function ProductChatbot() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-emerald-50">
      <SeoHead {...useSeoConfig('productChatbot')} />
      {/* Hero */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Bot className="w-4 h-4" />
            {t('productChatbot.hero.badge')}
          </div>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-l from-emerald-600 to-emerald-800 bg-clip-text text-transparent">
            {t('productChatbot.hero.title')}
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-3xl mx-auto">
            {t('productChatbot.hero.description')}
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-lg px-8">
                {t('productChatbot.hero.ctaPrimary')}
                <ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="text-lg px-8">
                {t('productChatbot.hero.ctaSecondary')}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Chat Demo */}
      <section className="container py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          <div>
            <h2 className="text-4xl font-bold mb-6">{t('productChatbot.demo.title')}</h2>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed">
              {t('productChatbot.demo.description')}
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Globe className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">{t('productChatbot.demo.f1.title')}</h3>
                  <p className="text-gray-600 text-sm">{t('productChatbot.demo.f1.desc')}</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">{t('productChatbot.demo.f2.title')}</h3>
                  <p className="text-gray-600 text-sm">{t('productChatbot.demo.f2.desc')}</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Settings className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">{t('productChatbot.demo.f3.title')}</h3>
                  <p className="text-gray-600 text-sm">{t('productChatbot.demo.f3.desc')}</p>
                </div>
              </li>
            </ul>
          </div>

          <Card className="p-6 bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
            <div className="bg-white rounded-lg p-5 shadow-sm space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center text-sm">👤</div>
                <div className="flex-1 bg-gray-100 rounded-2xl rounded-tr-none p-3">
                  <p className="text-sm">{t('productChatbot.demo.chat.m1')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 flex-row-reverse">
                <div className="w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-sm">س</div>
                <div className="flex-1 bg-emerald-600 text-white rounded-2xl rounded-tl-none p-3">
                  <p className="text-sm">{t('productChatbot.demo.chat.m2')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center text-sm">👤</div>
                <div className="flex-1 bg-gray-100 rounded-2xl rounded-tr-none p-3">
                  <p className="text-sm">{t('productChatbot.demo.chat.m3')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 flex-row-reverse">
                <div className="w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-sm">س</div>
                <div className="flex-1 bg-emerald-600 text-white rounded-2xl rounded-tl-none p-3">
                  <p className="text-sm" dangerouslySetInnerHTML={{ __html: t('productChatbot.demo.chat.m4') }} />
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-gray-500 mt-3">{t('productChatbot.demo.chat.subtitle')}</p>
          </Card>
        </div>
      </section>

      {/* Features Grid */}
      <section className="bg-white py-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">{t('productChatbot.features.title')}</h2>
            <p className="text-xl text-gray-600">{t('productChatbot.features.subtitle')}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Clock className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('productChatbot.features.items.f1.title')}</h3>
              <p className="text-gray-600 leading-relaxed">{t('productChatbot.features.items.f1.desc')}</p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <MessageSquare className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('productChatbot.features.items.f2.title')}</h3>
              <p className="text-gray-600 leading-relaxed">{t('productChatbot.features.items.f2.desc')}</p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('productChatbot.features.items.f3.title')}</h3>
              <p className="text-gray-600 leading-relaxed">{t('productChatbot.features.items.f3.desc')}</p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('productChatbot.features.items.f4.title')}</h3>
              <p className="text-gray-600 leading-relaxed">{t('productChatbot.features.items.f4.desc')}</p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Zap className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('productChatbot.features.items.f5.title')}</h3>
              <p className="text-gray-600 leading-relaxed">{t('productChatbot.features.items.f5.desc')}</p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Bot className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('productChatbot.features.items.f6.title')}</h3>
              <p className="text-gray-600 leading-relaxed">{t('productChatbot.features.items.f6.desc')}</p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20">
        <Card className="bg-gradient-to-l from-emerald-600 to-emerald-800 text-white p-12 text-center">
          <Bot className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-4xl font-bold mb-4">{t('productChatbot.cta.title')}</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            {t('productChatbot.cta.description')}
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-white text-emerald-600 hover:bg-gray-100 text-lg px-8">
                {t('productChatbot.cta.btnPrimary')}
                <ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/company/contact">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 text-lg px-8">
                {t('productChatbot.cta.btnSecondary')}
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
