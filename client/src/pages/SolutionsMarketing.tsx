import { Link } from "wouter";
import { ArrowRight, Megaphone, TrendingUp, Target, Zap, BarChart, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SeoHead, seoConfigs } from '@/components/SeoHead';
import { useTranslation } from 'react-i18next';

export default function SolutionsMarketing() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50">
      <SeoHead {...seoConfigs.solutionsMarketing} />
      {/* Hero Section */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Megaphone className="w-4 h-4" />
            حلول التسويق
          </div>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-l from-blue-600 to-blue-800 bg-clip-text text-transparent">
            اكتسب وأشرك وأهّل العملاء بحملات مخصصة
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            حوّل كل نقطة تواصل إلى محادثة هادفة. حسّن الإسناد، أعد الاستهداف بسهولة، وزد العائد على الاستثمار بنسبة تصل إلى 3 أضعاف.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-lg px-8">
                ابدأ الآن مجاناً
                <ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="text-lg px-8">
                عرض الأسعار
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <Card className="p-8 text-center border-blue-200 hover:shadow-lg transition-shadow">
            <div className="text-5xl font-bold text-blue-600 mb-2">4x</div>
            <div className="text-gray-600">{t('solutionsMarketingPage.text0')}</div>
          </Card>
          <Card className="p-8 text-center border-blue-200 hover:shadow-lg transition-shadow">
            <div className="text-5xl font-bold text-blue-600 mb-2">3x</div>
            <div className="text-gray-600">{t('solutionsMarketingPage.text1')}</div>
          </Card>
          <Card className="p-8 text-center border-blue-200 hover:shadow-lg transition-shadow">
            <div className="text-5xl font-bold text-blue-600 mb-2">85%</div>
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
          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <Zap className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">{t('solutionsMarketingPage.text5')}</h3>
            <p className="text-gray-600 leading-relaxed">
              حوّل كل نقطة تواصل - من الروابط إلى التفاعلات الميدانية والإعلانات - إلى محادثات هادفة فوراً. لا تفقد أي فرصة.
            </p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <Target className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">{t('solutionsMarketingPage.text6')}</h3>
            <p className="text-gray-600 leading-relaxed">
              حسّن الإسناد، أعد الاستهداف بسهولة، وزد العائد على الاستثمار مع إعلانات Meta وGoogle التي تنقر إلى واتساب مباشرة.
            </p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <Users className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">{t('solutionsMarketingPage.text7')}</h3>
            <p className="text-gray-600 leading-relaxed">
              أشرك مستخدميك تلقائياً وقدم سير عمل رائعة بعد التحويل بمحادثات مدعومة بالذكاء الاصطناعي، لكنها تبدو بشرية.
            </p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <BarChart className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">{t('solutionsMarketingPage.text8')}</h3>
            <p className="text-gray-600 leading-relaxed">
              ابق على اطلاع برؤى قوية لتحسين رسائلك وحملاتك وأداء إعلاناتك. قرارات مبنية على البيانات.
            </p>
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
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                📢
              </div>
              <h3 className="text-2xl font-bold mb-4">{t('solutionsMarketingPage.text11')}</h3>
              <p className="text-gray-600 leading-relaxed">
                اربط إعلاناتك على Meta وGoogle مباشرة بواتساب. تتبع الأداء وحسّن العائد على الاستثمار.
              </p>
            </Card>

            <Card className="p-8 text-center hover:shadow-xl transition-all">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                🎯
              </div>
              <h3 className="text-2xl font-bold mb-4">{t('solutionsMarketingPage.text12')}</h3>
              <p className="text-gray-600 leading-relaxed">
                أرسل رسائل مخصصة لشرائح محددة من عملائك. زد معدل التفاعل والتحويل.
              </p>
            </Card>

            <Card className="p-8 text-center hover:shadow-xl transition-all">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                🔄
              </div>
              <h3 className="text-2xl font-bold mb-4">{t('solutionsMarketingPage.text13')}</h3>
              <p className="text-gray-600 leading-relaxed">
                أعد التواصل مع العملاء الذين أبدوا اهتماماً. حوّل الزوار إلى عملاء فعليين.
              </p>
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
            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              1
            </div>
            <h3 className="text-xl font-bold mb-2">{t('solutionsMarketingPage.text16')}</h3>
            <p className="text-gray-600">
              العميل يشاهد إعلانك على Meta أو Google
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              2
            </div>
            <h3 className="text-xl font-bold mb-2">{t('solutionsMarketingPage.text17')}</h3>
            <p className="text-gray-600">
              ينقر ويبدأ محادثة مباشرة على واتساب
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              3
            </div>
            <h3 className="text-xl font-bold mb-2">{t('solutionsMarketingPage.text18')}</h3>
            <p className="text-gray-600">
              ساري يشرك العميل بمحادثة ذكية ومخصصة
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              4
            </div>
            <h3 className="text-xl font-bold mb-2">{t('solutionsMarketingPage.text19')}</h3>
            <p className="text-gray-600">
              يتحول العميل من زائر إلى مشتري
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <Card className="bg-gradient-to-l from-blue-600 to-blue-800 text-white p-12 text-center">
          <TrendingUp className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-4xl font-bold mb-4">{t('solutionsMarketingPage.text20')}</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            انضم إلى مئات المسوقين الذين حققوا نتائج استثنائية مع ساري
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-8">
                ابدأ تجربتك المجانية
                <ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/company/contact">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 text-lg px-8">
                تحدث مع خبير تسويق
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
