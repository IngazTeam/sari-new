import { Link } from "wouter";
import { ArrowRight, Brain, MessageSquare, Sparkles, Zap, Globe, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslation } from 'react-i18next';
import { SeoHead, useSeoConfig } from '@/components/SeoHead';

export default function ProductAI() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-primary/5">
      <SeoHead {...useSeoConfig('productAI')} />
      {/* Hero Section */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Brain className="w-4 h-4" />{t('productAI.auto_0')}</div>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-l from-primary/80 to-primary bg-clip-text text-transparent">{t('productAI.auto_1')}</h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">{t('productAI.auto_2')}</p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-lg px-8">{t('productAI.auto_3')}<ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="text-lg px-8">{t('productAI.auto_4')}</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* AI Personality Section */}
      <section className="container py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          <div>
            <h2 className="text-4xl font-bold mb-6">{t('productAIPage.text0')}</h2>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed">{t('productAI.auto_5')}</p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <Globe className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">{t('productAIPage.text1')}</h3>
                  <p className="text-gray-600">{t('productAIPage.text2')}</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <Heart className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">{t('productAIPage.text3')}</h3>
                  <p className="text-gray-600">{t('productAIPage.text4')}</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <Brain className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">{t('productAIPage.text5')}</h3>
                  <p className="text-gray-600">{t('productAIPage.text6')}</p>
                </div>
              </li>
            </ul>
          </div>
          <Card className="p-8 bg-gradient-to-br from-primary/5 to-white border-primary/20">
            <div className="bg-white rounded-lg p-6 shadow-sm mb-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                  ًں‘¤
                </div>
                <div className="flex-1 bg-gray-100 rounded-2xl rounded-tr-none p-3">
                  <p className="text-sm">{t('productAIPage.text7')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 flex-row-reverse">
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold">{t('productAI.auto_6')}</div>
                <div className="flex-1 bg-primary text-white rounded-2xl rounded-tl-none p-3">
                  <p className="text-sm">{t('productAIPage.text8')}</p>
                </div>
              </div>
            </div>
            <div className="text-center text-sm text-gray-500">{t('productAI.auto_7')}</div>
          </Card>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white py-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">{t('productAIPage.text9')}</h2>
            <p className="text-xl text-gray-600">{t('productAIPage.text10')}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="p-8 hover:shadow-xl transition-all">
              <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                <MessageSquare className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-4">{t('productAIPage.text11')}</h3>
              <p className="text-gray-600 leading-relaxed">{t('productAI.auto_8')}</p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all">
              <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-4">{t('productAIPage.text12')}</h3>
              <p className="text-gray-600 leading-relaxed">{t('productAI.auto_9')}</p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all">
              <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                <Zap className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-4">{t('productAIPage.text13')}</h3>
              <p className="text-gray-600 leading-relaxed">{t('productAI.auto_10')}</p>
            </Card>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="container py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">{t('productAIPage.text14')}</h2>
          <p className="text-xl text-gray-600">{t('productAIPage.text15')}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <Card className="p-8 border-primary/10">
            <div className="text-4xl mb-4">ًں›چï¸ڈ</div>
            <h3 className="text-2xl font-bold mb-4">{t('productAIPage.text16')}</h3>
            <p className="text-gray-600 leading-relaxed mb-4">{t('productAI.auto_11')}</p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>{t('productAI.auto_12')}</li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>{t('productAI.auto_13')}</li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>{t('productAI.auto_14')}</li>
            </ul>
          </Card>

          <Card className="p-8 border-primary/10">
            <div className="text-4xl mb-4">ًںڈ¢</div>
            <h3 className="text-2xl font-bold mb-4">{t('productAIPage.text17')}</h3>
            <p className="text-gray-600 leading-relaxed mb-4">{t('productAI.auto_15')}</p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>{t('productAI.auto_16')}</li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>{t('productAI.auto_17')}</li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>{t('productAI.auto_18')}</li>
            </ul>
          </Card>

          <Card className="p-8 border-primary/10">
            <div className="text-4xl mb-4">ًںڈ¥</div>
            <h3 className="text-2xl font-bold mb-4">{t('productAIPage.text18')}</h3>
            <p className="text-gray-600 leading-relaxed mb-4">{t('productAI.auto_19')}</p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>{t('productAI.auto_20')}</li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>{t('productAI.auto_21')}</li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>{t('productAI.auto_22')}</li>
            </ul>
          </Card>

          <Card className="p-8 border-primary/10">
            <div className="text-4xl mb-4">ًںژ“</div>
            <h3 className="text-2xl font-bold mb-4">{t('productAIPage.text19')}</h3>
            <p className="text-gray-600 leading-relaxed mb-4">{t('productAI.auto_23')}</p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>{t('productAI.auto_24')}</li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>{t('productAI.auto_25')}</li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>{t('productAI.auto_26')}</li>
            </ul>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <Card className="bg-gradient-to-l from-primary/80 to-primary text-white p-12 text-center">
          <Brain className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-4xl font-bold mb-4">{t('productAIPage.text20')}</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">{t('productAI.auto_27')}</p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-white text-primary hover:bg-gray-100 text-lg px-8">{t('productAI.auto_28')}<ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/company/contact">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 text-lg px-8">{t('productAI.auto_29')}</Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
