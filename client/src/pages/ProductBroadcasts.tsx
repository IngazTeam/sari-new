import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight, Radio, Users, Clock, Target, Sparkles, BarChart3, Filter, Calendar, Image, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SeoHead, useSeoConfig } from '@/components/SeoHead';

export default function ProductBroadcasts() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-purple-50">
      <SeoHead {...useSeoConfig('productBroadcasts')} />

      {/* Hero */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Radio className="w-4 h-4" />
            {t('productBroadcasts.hero.badge')}
          </div>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-l from-purple-600 to-purple-800 bg-clip-text text-transparent">
            {t('productBroadcasts.hero.title')}
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-3xl mx-auto">
            {t('productBroadcasts.hero.description')}
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-lg px-8">
                {t('productBroadcasts.hero.ctaPrimary')}
                <ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="text-lg px-8">
                {t('productBroadcasts.hero.ctaSecondary')}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="container py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {[
            { value: "98%", label: t('productBroadcasts.stats.s1.label'), desc: t('productBroadcasts.stats.s1.desc') },
            { value: "45%", label: t('productBroadcasts.stats.s2.label'), desc: t('productBroadcasts.stats.s2.desc') },
            { value: "3x", label: t('productBroadcasts.stats.s3.label'), desc: t('productBroadcasts.stats.s3.desc') },
            { value: "<1 min", label: t('productBroadcasts.stats.s4.label'), desc: t('productBroadcasts.stats.s4.desc') },
          ].map((stat, i) => (
            <Card key={i} className="p-6 text-center border-purple-100 hover:border-purple-300 transition-colors">
              <p className="text-3xl font-bold text-purple-600 mb-1">{stat.value}</p>
              <p className="font-semibold text-sm mb-1">{stat.label}</p>
              <p className="text-xs text-gray-500">{stat.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-white py-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">{t('productBroadcasts.features.title')}</h2>
            <p className="text-xl text-gray-600">{t('productBroadcasts.features.subtitle')}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Target className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('productBroadcasts.features.items.f1.title')}</h3>
              <p className="text-gray-600 leading-relaxed">
                {t('productBroadcasts.features.items.f1.desc')}
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Sparkles className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('productBroadcasts.features.items.f2.title')}</h3>
              <p className="text-gray-600 leading-relaxed">
                {t('productBroadcasts.features.items.f2.desc')}
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Image className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('productBroadcasts.features.items.f3.title')}</h3>
              <p className="text-gray-600 leading-relaxed">
                {t('productBroadcasts.features.items.f3.desc')}
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Calendar className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('productBroadcasts.features.items.f4.title')}</h3>
              <p className="text-gray-600 leading-relaxed">
                {t('productBroadcasts.features.items.f4.desc')}
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('productBroadcasts.features.items.f5.title')}</h3>
              <p className="text-gray-600 leading-relaxed">
                {t('productBroadcasts.features.items.f5.desc')}
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Filter className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">{t('productBroadcasts.features.items.f6.title')}</h3>
              <p className="text-gray-600 leading-relaxed">
                {t('productBroadcasts.features.items.f6.desc')}
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="container py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">{t('productBroadcasts.useCases.title')}</h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            { emoji: "🎉", title: t('productBroadcasts.useCases.c1.title'), desc: t('productBroadcasts.useCases.c1.desc') },
            { emoji: "🛒", title: t('productBroadcasts.useCases.c2.title'), desc: t('productBroadcasts.useCases.c2.desc') },
            { emoji: "📦", title: t('productBroadcasts.useCases.c3.title'), desc: t('productBroadcasts.useCases.c3.desc') },
            { emoji: "🌙", title: t('productBroadcasts.useCases.c4.title'), desc: t('productBroadcasts.useCases.c4.desc') },
            { emoji: "⭐", title: t('productBroadcasts.useCases.c5.title'), desc: t('productBroadcasts.useCases.c5.desc') },
            { emoji: "🎁", title: t('productBroadcasts.useCases.c6.title'), desc: t('productBroadcasts.useCases.c6.desc') },
          ].map((item, i) => (
            <Card key={i} className="p-6 border-purple-100 hover:border-purple-300 hover:shadow-md transition-all">
              <div className="text-3xl mb-3">{item.emoji}</div>
              <h3 className="font-bold text-lg mb-2">{item.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20">
        <Card className="bg-gradient-to-l from-purple-600 to-purple-800 text-white p-12 text-center">
          <Radio className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-4xl font-bold mb-4">{t('productBroadcasts.cta.title')}</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            {t('productBroadcasts.cta.description')}
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-white text-purple-600 hover:bg-gray-100 text-lg px-8">
                {t('productBroadcasts.cta.btnPrimary')}
                <ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/company/contact">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 text-lg px-8">
                {t('productBroadcasts.cta.btnSecondary')}
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
