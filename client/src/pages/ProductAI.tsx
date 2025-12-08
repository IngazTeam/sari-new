import { Link } from "wouter";
import { ArrowRight, Brain, MessageSquare, Sparkles, Zap, Globe, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ProductAI() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50">
      {/* Hero Section */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Brain className="w-4 h-4" />
            الذكاء الاصطناعي
          </div>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-l from-blue-600 to-blue-800 bg-clip-text text-transparent">
            تعرّف على ساري: وكيلك الذكي للمبيعات
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            وكيل ذكاء اصطناعي متقدم يتحدث باللهجة السعودية والإنجليزية، يفهم عملاءك، يبحث في منتجاتك، ويحول المحادثات إلى مبيعات.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-lg px-8">
                جرب ساري مجاناً
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

      {/* AI Personality Section */}
      <section className="container py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          <div>
            <h2 className="text-4xl font-bold mb-6">شخصية ساري الفريدة</h2>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed">
              ساري ليست مجرد روبوت دردشة عادي. إنها وكيلة مبيعات ذكية بشخصية ودودة ومحترفة، مدربة خصيصاً على ثقافة السوق السعودي والخليجي.
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <Globe className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">متعددة اللغات</h3>
                  <p className="text-gray-600">تتحدث العربية بلهجة سعودية طبيعية والإنجليزية بطلاقة</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <Heart className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">ودودة ومحترفة</h3>
                  <p className="text-gray-600">تتعامل مع العملاء بأسلوب ودود لكن احترافي</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <Brain className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">ذكية وسياقية</h3>
                  <p className="text-gray-600">تفهم السياق وتتذكر تفاصيل المحادثة</p>
                </div>
              </li>
            </ul>
          </div>
          <Card className="p-8 bg-gradient-to-br from-blue-50 to-white border-blue-200">
            <div className="bg-white rounded-lg p-6 shadow-sm mb-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                  👤
                </div>
                <div className="flex-1 bg-gray-100 rounded-2xl rounded-tr-none p-3">
                  <p className="text-sm">السلام عليكم، أبحث عن هدية لأخي</p>
                </div>
              </div>
              <div className="flex items-start gap-3 flex-row-reverse">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                  س
                </div>
                <div className="flex-1 bg-blue-600 text-white rounded-2xl rounded-tl-none p-3">
                  <p className="text-sm">وعليكم السلام! أهلاً وسهلاً 😊 أكيد بساعدك تلاقي هدية مميزة. ممكن تقولي إيش اهتماماته؟ رياضة، تقنية، موضة؟</p>
                </div>
              </div>
            </div>
            <div className="text-center text-sm text-gray-500">
              مثال على محادثة مع ساري
            </div>
          </Card>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white py-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">قدرات ساري الذكية</h2>
            <p className="text-xl text-gray-600">تقنيات متقدمة لتجربة عملاء استثنائية</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="p-8 hover:shadow-xl transition-all">
              <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
                <MessageSquare className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold mb-4">فهم طبيعي للغة</h3>
              <p className="text-gray-600 leading-relaxed">
                تفهم ساري اللهجات العربية المختلفة والعامية السعودية. تتعامل مع الأخطاء الإملائية والاختصارات بذكاء.
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all">
              <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
                <Sparkles className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold mb-4">بحث ذكي في المنتجات</h3>
              <p className="text-gray-600 leading-relaxed">
                تبحث ساري في كتالوج منتجاتك وتقترح الخيارات الأنسب بناءً على احتياجات العميل وميزانيته.
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all">
              <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
                <Zap className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold mb-4">ردود فورية 24/7</h3>
              <p className="text-gray-600 leading-relaxed">
                ساري متاحة دائماً للرد على عملائك في أي وقت، حتى خارج ساعات العمل. لا تفوت أي فرصة مبيعات.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="container py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">كيف تساعدك ساري؟</h2>
          <p className="text-xl text-gray-600">حالات استخدام متنوعة لكل نوع من الأعمال</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <Card className="p-8 border-blue-100">
            <div className="text-4xl mb-4">🛍️</div>
            <h3 className="text-2xl font-bold mb-4">التجارة الإلكترونية</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              ساري تساعد عملاءك في إيجاد المنتجات المناسبة، تجيب على أسئلتهم حول المقاسات والألوان، وتوجههم لإتمام الشراء.
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                اقتراح منتجات بناءً على التفضيلات
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                الإجابة على أسئلة المنتجات
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                تتبع الطلبات والشحنات
              </li>
            </ul>
          </Card>

          <Card className="p-8 border-blue-100">
            <div className="text-4xl mb-4">🏢</div>
            <h3 className="text-2xl font-bold mb-4">الخدمات المهنية</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              ساري تؤهل العملاء المحتملين، تحدد احتياجاتهم، وتحجز المواعيد تلقائياً مع الفريق المناسب.
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                تأهيل العملاء المحتملين
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                حجز المواعيد تلقائياً
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                الإجابة على الأسئلة الشائعة
              </li>
            </ul>
          </Card>

          <Card className="p-8 border-blue-100">
            <div className="text-4xl mb-4">🏥</div>
            <h3 className="text-2xl font-bold mb-4">الرعاية الصحية</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              ساري تساعد المرضى في حجز المواعيد، تذكيرهم بالمواعيد، والإجابة على الأسئلة العامة عن الخدمات.
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                حجز وإدارة المواعيد
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                إرسال تذكيرات تلقائية
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                معلومات عن الخدمات والأسعار
              </li>
            </ul>
          </Card>

          <Card className="p-8 border-blue-100">
            <div className="text-4xl mb-4">🎓</div>
            <h3 className="text-2xl font-bold mb-4">التعليم</h3>
            <p className="text-gray-600 leading-relaxed mb-4">
              ساري تساعد الطلاب في التسجيل، تجيب على أسئلتهم حول الدورات، وترسل التحديثات والإشعارات المهمة.
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                معلومات عن الدورات والبرامج
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                مساعدة في التسجيل
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                إرسال التحديثات والإشعارات
              </li>
            </ul>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <Card className="bg-gradient-to-l from-blue-600 to-blue-800 text-white p-12 text-center">
          <Brain className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-4xl font-bold mb-4">جاهز لتجربة قوة الذكاء الاصطناعي؟</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            اجعل ساري جزءاً من فريقك اليوم وابدأ في تحويل المحادثات إلى مبيعات
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
                تحدث مع فريقنا
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
