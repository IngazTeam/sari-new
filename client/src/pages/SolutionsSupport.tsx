import { Link } from "wouter";
import { ArrowRight, Headphones, Zap, Clock, Users, MessageCircle, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function SolutionsSupport() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50">
      {/* Hero Section */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Headphones className="w-4 h-4" />
            حلول الدعم الفني
          </div>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-l from-blue-600 to-blue-800 bg-clip-text text-transparent">
            أسعد عملاءك وأجب على الاستفسارات بسرعة
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            قدم إجابات فورية ودقيقة على مدار الساعة. حل معظم الاستفسارات دون تدخل بشري وقلل عبء العمل بنسبة تصل إلى 40%.
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
            <div className="text-5xl font-bold text-blue-600 mb-2">40%</div>
            <div className="text-gray-600">تقليل في عبء العمل</div>
          </Card>
          <Card className="p-8 text-center border-blue-200 hover:shadow-lg transition-shadow">
            <div className="text-5xl font-bold text-blue-600 mb-2">80%</div>
            <div className="text-gray-600">من الأسئلة الشائعة يحلها الذكاء الاصطناعي</div>
          </Card>
          <Card className="p-8 text-center border-blue-200 hover:shadow-lg transition-shadow">
            <div className="text-5xl font-bold text-blue-600 mb-2">40%</div>
            <div className="text-gray-600">حلول أسرع</div>
          </Card>
        </div>
      </section>

      {/* Features Section */}
      <section className="container py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">دعم فني متقدم بالذكاء الاصطناعي</h2>
          <p className="text-xl text-gray-600">أدوات قوية لفريق دعم استثنائي</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <Zap className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">ردود فورية 24/7</h3>
            <p className="text-gray-600 leading-relaxed">
              قدم إجابات فورية ودقيقة مستندة إلى قاعدة معرفتك على مدار الساعة. حل معظم الاستفسارات دون تدخل بشري.
            </p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <MessageCircle className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">توجيه ذكي</h3>
            <p className="text-gray-600 leading-relaxed">
              وجّه المحادثات المعقدة إلى الوكيل البشري المناسب تلقائياً من خلال قواعد توجيه متقدمة. لا تضيع أي استفسار.
            </p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <Users className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">صندوق وارد موحد</h3>
            <p className="text-gray-600 leading-relaxed">
              تعاون بشكل أفضل مع صندوق وارد موحد لجميع منصات المراسلة، مع علامات وسمات جهات الاتصال والتاريخ والمزيد.
            </p>
          </Card>

          <Card className="p-8 hover:shadow-xl transition-all border-blue-100">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <TrendingDown className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">رؤى مبنية على البيانات</h3>
            <p className="text-gray-600 leading-relaxed">
              عزز عمليات الدعم برؤى مبنية على البيانات حول وقت الاستجابة والحلول والأداء حسب الوكيل.
            </p>
          </Card>
        </div>
      </section>

      {/* AI Capabilities */}
      <section className="bg-white py-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">قدرات الذكاء الاصطناعي</h2>
            <p className="text-xl text-gray-600">وكيل دعم ذكي يفهم عملاءك</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="p-8 text-center hover:shadow-xl transition-all">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                🌍
              </div>
              <h3 className="text-2xl font-bold mb-4">متعدد اللغات</h3>
              <p className="text-gray-600 leading-relaxed">
                يدعم العربية والإنجليزية ولغات متعددة. يفهم اللهجات المحلية ويرد بنفس الأسلوب.
              </p>
            </Card>

            <Card className="p-8 text-center hover:shadow-xl transition-all">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                🧠
              </div>
              <h3 className="text-2xl font-bold mb-4">سياقي</h3>
              <p className="text-gray-600 leading-relaxed">
                يفهم سياق المحادثة ويتذكر التفاعلات السابقة. ردود دقيقة وشخصية.
              </p>
            </Card>

            <Card className="p-8 text-center hover:shadow-xl transition-all">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-2xl flex items-center justify-center text-3xl font-bold mx-auto mb-6">
                💙
              </div>
              <h3 className="text-2xl font-bold mb-4">متعاطف</h3>
              <p className="text-gray-600 leading-relaxed">
                يتعامل مع العملاء بتعاطف واحترافية. يعرف متى يحول إلى وكيل بشري.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">كيف يعمل؟</h2>
          <p className="text-xl text-gray-600">من الاستفسار إلى الحل في ثوانٍ</p>
        </div>

        <div className="grid md:grid-cols-4 gap-8 max-w-6xl mx-auto">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              1
            </div>
            <h3 className="text-xl font-bold mb-2">الاستفسار</h3>
            <p className="text-gray-600">
              العميل يرسل استفساره عبر واتساب
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              2
            </div>
            <h3 className="text-xl font-bold mb-2">الرد الفوري</h3>
            <p className="text-gray-600">
              ساري يرد فوراً بإجابة دقيقة من قاعدة المعرفة
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              3
            </div>
            <h3 className="text-xl font-bold mb-2">التصعيد</h3>
            <p className="text-gray-600">
              إذا لزم الأمر، يحول إلى وكيل بشري مع السياق الكامل
            </p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              4
            </div>
            <h3 className="text-xl font-bold mb-2">الحل</h3>
            <p className="text-gray-600">
              يتم حل المشكلة بسرعة ورضا العميل
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <Card className="bg-gradient-to-l from-blue-600 to-blue-800 text-white p-12 text-center">
          <Clock className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-4xl font-bold mb-4">جاهز لتحسين دعمك الفني؟</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            انضم إلى مئات الشركات التي حسّنت رضا عملائها مع ساري
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
                تحدث مع خبير دعم
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
