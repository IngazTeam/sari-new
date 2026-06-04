import { Link } from "wouter";
import { ArrowRight, Megaphone, TrendingUp, Target, Zap, BarChart, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SeoHead, useSeoConfig } from '@/components/SeoHead';
import { useTranslation } from 'react-i18next';

export default function SolutionsMarketing() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-primary/5">
      <SeoHead {...useSeoConfig('solutionsMarketing')} />
      {/* Hero Section */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Megaphone className="w-4 h-4" />{t('solutionsMarketing.auto_0')}</div>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-l from-primary/80 to-primary bg-clip-text text-transparent">{t('solutionsMarketing.auto_1')}</h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">{t('solutionsMarketing.auto_2')}</p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-lg px-8">{t('solutionsMarketing.auto_3')}<ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="text-lg px-8">{t('solutionsMarketing.auto_4')}</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <Card className="p-8 text-center border-primary/20 hover:shadow-lg transition-shadow">
            <div className="text-5xl font-bold text-primary mb-2">4x</div>
            <div className="text-gray-600">{t('solutionsMarketingPage.text0')}</div>
          </Card>
          <Card className="p-8 text-center border-primary/20 hover:shadow-lg transition-shadow">
            <div className="text-5xl font-bold text-primary mb-2">3x</div>
            <div className="text-gray-600">{t('solutionsMarketingPage.text1')}</div>
          </Card>
          <Card className="p-8 text-center border-primary/20 hover:shadow-lg transition-shadow">
            <div className="text-5xl font-bold text-primary mb-2">85%</div>
            <div className="text-gray-600">{t('solutionsMarketingPage.text2')}</div>
          </Card>
        </div>
      </section>

      {/* Features Section */}
      <section className="container py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">{t('solutionsMarketingPage.text3')}</h2>
          <p className="text-xl text-gray-600">{t('solutionsMarketingPage.text4')}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <Card className="p-8 hover:shadow-xl transition-all border-primary/10">
            <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
              <Zap className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-4">{t('solutionsMarketingPage.text5')}</h3>
            <p className="text-gray-600 leading-relaxed">{t('solutionsMarketing.auto_5')}</p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-primary/10">
            <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
              <Target className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-4">{t('solutionsMarketingPage.text6')}</h3>
            <p className="text-gray-600 leading-relaxed">{t('solutionsMarketing.auto_6')}</p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-primary/10">
            <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
              <Users className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-4">{t('solutionsMarketingPage.text7')}</h3>
            <p className="text-gray-600 leading-relaxed">{t('solutionsMarketing.auto_7')}</p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-primary/10">
            <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
              <BarChart className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-4">{t('solutionsMarketingPage.text8')}</h3>
            <p className="text-gray-600 leading-relaxed">{t('solutionsMarketing.auto_8')}</p>
          </Card>
        </div>
      </section>

      {/* Campaign Types */}
      <section className="bg-white py-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">{t('solutionsMarketingPage.text9')}</h2>
            <p className="text-xl text-gray-600">{t('solutionsMarketingPage.text10')}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="p-8 text-center hover:shadow-xl transition-all">
              <div className="w-20 h-20 bg-gradient-to-br from-primary/80 to-primary text-white rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                ًں“¢
              </div>
              <h3 className="text-2xl font-bold mb-4">{t('solutionsMarketingPage.text11')}</h3>
              <p className="text-gray-600 leading-relaxed">{t('solutionsMarketing.auto_9')}</p>
            </Card>

            <Card className="p-8 text-center hover:shadow-xl transition-all">
              <div className="w-20 h-20 bg-gradient-to-br from-primary/80 to-primary text-white rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                ًںژ¯
              </div>
              <h3 className="text-2xl font-bold mb-4">{t('solutionsMarketingPage.text12')}</h3>
              <p className="text-gray-600 leading-relaxed">{t('solutionsMarketing.auto_10')}</p>
            </Card>

            <Card className="p-8 text-center hover:shadow-xl transition-all">
              <div className="w-20 h-20 bg-gradient-to-br from-primary/80 to-primary text-white rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                ًں”„
              </div>
              <h3 className="text-2xl font-bold mb-4">{t('solutionsMarketingPage.text13')}</h3>
              <p className="text-gray-600 leading-relaxed">{t('solutionsMarketing.auto_11')}</p>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">{t('solutionsMarketingPage.text14')}</h2>
          <p className="text-xl text-gray-600">{t('solutionsMarketingPage.text15')}</p>
        </div>

        <div className="grid md:grid-cols-4 gap-8 max-w-6xl mx-auto">
          <div className="text-center">
            <div className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              1
            </div>
            <h3 className="text-xl font-bold mb-2">{t('solutionsMarketingPage.text16')}</h3>
            <p className="text-gray-600">{t('solutionsMarketing.auto_12')}</p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              2
            </div>
            <h3 className="text-xl font-bold mb-2">{t('solutionsMarketingPage.text17')}</h3>
            <p className="text-gray-600">{t('solutionsMarketing.auto_13')}</p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              3
            </div>
            <h3 className="text-xl font-bold mb-2">{t('solutionsMarketingPage.text18')}</h3>
            <p className="text-gray-600">{t('solutionsMarketing.auto_14')}</p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              4
            </div>
            <h3 className="text-xl font-bold mb-2">{t('solutionsMarketingPage.text19')}</h3>
            <p className="text-gray-600">{t('solutionsMarketing.auto_15')}</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <Card className="bg-gradient-to-l from-primary/80 to-primary text-white p-12 text-center">
          <TrendingUp className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-4xl font-bold mb-4">{t('solutionsMarketingPage.text20')}</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">{t('solutionsMarketing.auto_16')}</p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-white text-primary hover:bg-gray-100 text-lg px-8">{t('solutionsMarketing.auto_17')}<ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/company/contact">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 text-lg px-8">{t('solutionsMarketing.auto_18')}</Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
