import { Link } from "wouter";
import { ArrowRight, TrendingUp, Users, Target, BarChart3, MessageSquare, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SeoHead, useSeoConfig } from '@/components/SeoHead';
import { useTranslation } from 'react-i18next';

export default function SolutionsSales() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50">
      <SeoHead {...useSeoConfig('solutionsSales')} />
      {/* Hero Section */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Target className="w-4 h-4" />{t('solutionsSales.auto_0')}</div>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-l from-blue-600 to-blue-800 bg-clip-text text-transparent">{t('solutionsSales.auto_1')}</h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">{t('solutionsSales.auto_2')}</p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-lg px-8">{t('solutionsSales.auto_3')}<ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="text-lg px-8">{t('solutionsSales.auto_4')}</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <Card className="p-8 text-center border-blue-200 hover:shadow-lg transition-shadow">
            <div className="text-5xl font-bold text-blue-600 mb-2">30%</div>
            <div className="text-gray-600">{t('solutionsSalesPage.text0')}</div>
          </Card>
          <Card className="p-8 text-center border-blue-200 hover:shadow-lg transition-shadow">
            <div className="text-5xl font-bold text-blue-600 mb-2">3x</div>
            <div className="text-gray-600">{t('solutionsSalesPage.text1')}</div>
          </Card>
          <Card className="p-8 text-center border-blue-200 hover:shadow-lg transition-shadow">
            <div className="text-5xl font-bold text-blue-600 mb-2">20%</div>
            <div className="text-gray-600">{t('solutionsSalesPage.text2')}</div>
          </Card>
        </div>
      </section>

      {/* Features Section */}
      <section className="container py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">{t('solutionsSalesPage.text3')}</h2>
          <p className="text-xl text-gray-600">{t('solutionsSalesPage.text4')}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <Users className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">{t('solutionsSalesPage.text5')}</h3>
            <p className="text-gray-600 leading-relaxed">{t('solutionsSales.auto_5')}</p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <Target className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">{t('solutionsSalesPage.text6')}</h3>
            <p className="text-gray-600 leading-relaxed">{t('solutionsSales.auto_6')}</p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <MessageSquare className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">{t('solutionsSalesPage.text7')}</h3>
            <p className="text-gray-600 leading-relaxed">{t('solutionsSales.auto_7')}</p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <BarChart3 className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">{t('solutionsSalesPage.text8')}</h3>
            <p className="text-gray-600 leading-relaxed">{t('solutionsSales.auto_8')}</p>
          </Card>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-white py-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">{t('solutionsSalesPage.text9')}</h2>
            <p className="text-xl text-gray-600">{t('solutionsSalesPage.text10')}</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 max-w-6xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="text-xl font-bold mb-2">{t('solutionsSalesPage.text11')}</h3>
              <p className="text-gray-600">{t('solutionsSales.auto_9')}</p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-bold mb-2">{t('solutionsSalesPage.text12')}</h3>
              <p className="text-gray-600">{t('solutionsSales.auto_10')}</p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-bold mb-2">{t('solutionsSalesPage.text13')}</h3>
              <p className="text-gray-600">{t('solutionsSales.auto_11')}</p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                4
              </div>
              <h3 className="text-xl font-bold mb-2">{t('solutionsSalesPage.text14')}</h3>
              <p className="text-gray-600">{t('solutionsSales.auto_12')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <Card className="bg-gradient-to-l from-blue-600 to-blue-800 text-white p-12 text-center">
          <Clock className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-4xl font-bold mb-4">{t('solutionsSalesPage.text15')}</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">{t('solutionsSales.auto_13')}</p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-8">{t('solutionsSales.auto_14')}<ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/company/contact">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 text-lg px-8">{t('solutionsSales.auto_15')}</Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
