import { Link } from "wouter";
import { ArrowRight, TrendingUp, Users, Target, BarChart3, MessageSquare, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function SolutionsSales() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50">
      {/* Hero Section */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Target className="w-4 h-4" />
            حلول المبيعات
          </div>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-l from-blue-600 to-blue-800 bg-clip-text text-transparent">
            سرّع خط مبيعاتك وزد تحويلاتك
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            حوّل كل محادثة على واتساب إلى فرصة مبيعات. أدر العملاء المحتملين، اختصر دورة المبيعات، وزد إيراداتك بنسبة تصل إلى 20%.
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
            <div className="text-5xl font-bold text-blue-600 mb-2">30%</div>
            <div className="text-gray-600">تقليل في دورة المبيعات</div>
          </Card>
          <Card className="p-8 text-center border-blue-200 hover:shadow-lg transition-shadow">
            <div className="text-5xl font-bold text-blue-600 mb-2">3x</div>
            <div className="text-gray-600">استجابات أسرع</div>
          </Card>
          <Card className="p-8 text-center border-blue-200 hover:shadow-lg transition-shadow">
            <div className="text-5xl font-bold text-blue-600 mb-2">20%</div>
            <div className="text-gray-600">نمو في الإيرادات</div>
          </Card>
        </div>
      </section>

      {/* Features Section */}
      <section className="container py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">كيف يساعدك ساري في المبيعات؟</h2>
          <p className="text-xl text-gray-600">أدوات قوية لفريق المبيعات الحديث</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <Users className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">مساحة عمل موحدة</h3>
            <p className="text-gray-600 leading-relaxed">
              مساحة عمل واحدة لجميع مندوبي المبيعات للتعاون والتواصل وتحويل العملاء المحتملين. تتبع كل محادثة وتفاعل في مكان واحد.
            </p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <Target className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">تأهيل فوري للعملاء</h3>
            <p className="text-gray-600 leading-relaxed">
              تأكد من عدم ضياع أي عميل محتمل جاهز للشراء. تأهيل فوري في الوقت الفعلي على قناة المراسلة المفضلة لديك.
            </p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <MessageSquare className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">إدارة ذكية للعملاء المحتملين</h3>
            <p className="text-gray-600 leading-relaxed">
              أدر حجم كبير من العملاء المحتملين بسهولة على واتساب. استخدم الذكاء الاصطناعي لتأهيل العملاء وتسليم الأفضل لمندوبيك تلقائياً.
            </p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <BarChart3 className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">مراقبة الجودة</h3>
            <p className="text-gray-600 leading-relaxed">
              راقب محادثات العملاء بسهولة وتأكد من تجربة عملاء عالية الجودة لتجنب مخاطر السمعة. تقارير مفصلة عن أداء الفريق.
            </p>
          </Card>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-white py-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">كيف يعمل؟</h2>
            <p className="text-xl text-gray-600">أربع خطوات بسيطة لتحويل المبيعات</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 max-w-6xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="text-xl font-bold mb-2">استقبال العميل</h3>
              <p className="text-gray-600">
                العميل يتواصل معك عبر واتساب من أي مصدر (إعلان، موقع، رابط)
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-bold mb-2">التأهيل الذكي</h3>
              <p className="text-gray-600">
                ساري يؤهل العميل تلقائياً ويجمع المعلومات المهمة
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-bold mb-2">التوزيع التلقائي</h3>
              <p className="text-gray-600">
                يتم توزيع العميل المؤهل على المندوب المناسب تلقائياً
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                4
              </div>
              <h3 className="text-xl font-bold mb-2">إتمام الصفقة</h3>
              <p className="text-gray-600">
                المندوب يتابع ويغلق الصفقة بسرعة أكبر
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <Card className="bg-gradient-to-l from-blue-600 to-blue-800 text-white p-12 text-center">
          <Clock className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-4xl font-bold mb-4">جاهز لزيادة مبيعاتك؟</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            انضم إلى مئات التجار الذين ضاعفوا مبيعاتهم باستخدام ساري
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
                تحدث مع خبير مبيعات
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
