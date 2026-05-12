import { Link } from "wouter";
import { ArrowRight, MessageSquare, Bot, Clock, Sparkles, ShieldCheck, BarChart3, Zap, Globe, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ProductChatbot() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-emerald-50">

      {/* Hero */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Bot className="w-4 h-4" />
            روبوت الدردشة
          </div>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-l from-emerald-600 to-emerald-800 bg-clip-text text-transparent">
            روبوت دردشة ذكي يعمل على مدار الساعة
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-3xl mx-auto">
            أتمت محادثات العملاء بالكامل مع روبوت ساري الذكي — يفهم السياق، يتذكر المحادثات السابقة، ويرد بلغة طبيعية تُشعر العميل أنه يتحدث مع شخص حقيقي.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-lg px-8">
                ابدأ مجاناً
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

      {/* Chat Demo */}
      <section className="container py-16">
        <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          <div>
            <h2 className="text-4xl font-bold mb-6">ليس مجرد ردود آلية جامدة</h2>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed">
              ساري تتعلم من كل محادثة وتتكيف مع أسلوب عملائك. تفهم اللهجة السعودية والعامية، وتتعامل مع الأسئلة المعقدة بذكاء.
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Globe className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">تعدد اللغات</h3>
                  <p className="text-gray-600 text-sm">تتحدث العربية والإنجليزية بطلاقة، وتتعرف على اللهجة تلقائياً.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">ذاكرة محادثة ذكية</h3>
                  <p className="text-gray-600 text-sm">تتذكر ما قاله العميل سابقاً وتبني عليه — لا يحتاج يكرر نفسه.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Settings className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">شخصية قابلة للتخصيص</h3>
                  <p className="text-gray-600 text-sm">حدد نبرة الروبوت: ودود، رسمي، أو مرح. يتكيف مع هوية علامتك التجارية.</p>
                </div>
              </li>
            </ul>
          </div>

          <Card className="p-6 bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
            <div className="bg-white rounded-lg p-5 shadow-sm space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center text-sm">👤</div>
                <div className="flex-1 bg-gray-100 rounded-2xl rounded-tr-none p-3">
                  <p className="text-sm">السلام عليكم، عندكم عرض على الساعات؟</p>
                </div>
              </div>
              <div className="flex items-start gap-3 flex-row-reverse">
                <div className="w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-sm">س</div>
                <div className="flex-1 bg-emerald-600 text-white rounded-2xl rounded-tl-none p-3">
                  <p className="text-sm">وعليكم السلام! أهلاً بك 😊 أيوا عندنا عرض خاص هالأسبوع على ساعات كاسيو — خصم 30%! تبي أعرض لك الموديلات المتوفرة؟</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center text-sm">👤</div>
                <div className="flex-1 bg-gray-100 rounded-2xl rounded-tr-none p-3">
                  <p className="text-sm">ايوا خلني اشوف</p>
                </div>
              </div>
              <div className="flex items-start gap-3 flex-row-reverse">
                <div className="w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-sm">س</div>
                <div className="flex-1 bg-emerald-600 text-white rounded-2xl rounded-tl-none p-3">
                  <p className="text-sm">تفضل! عندنا 3 موديلات بالعرض:
                    <br />• كاسيو G-Shock — 450 ريال بدل 650
                    <br />• كاسيو Edifice — 380 ريال بدل 550
                    <br />• كاسيو Vintage — 180 ريال بدل 260
                    <br />أيهم يعجبك؟ 🎁</p>
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-gray-500 mt-3">محادثة حقيقية مع روبوت ساري</p>
          </Card>
        </div>
      </section>

      {/* Features Grid */}
      <section className="bg-white py-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">مميزات تجعلك تتفوق على المنافسين</h2>
            <p className="text-xl text-gray-600">كل ما تحتاجه لتحويل الواتساب إلى قناة مبيعات فعّالة</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Clock className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">رد فوري 24/7</h3>
              <p className="text-gray-600 leading-relaxed">
                لا تفوّت أي رسالة. ساري ترد خلال ثوانٍ على مدار الساعة — حتى في الإجازات والعطلات.
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <MessageSquare className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">محادثات طبيعية</h3>
              <p className="text-gray-600 leading-relaxed">
                ردود بشرية طبيعية — ليس قوائم أرقام جامدة. العميل يشعر أنه يتكلم مع شخص حقيقي.
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">تحويل ذكي للفريق</h3>
              <p className="text-gray-600 leading-relaxed">
                عندما يحتاج العميل مساعدة بشرية، ساري تحوّل المحادثة تلقائياً مع ملخص كامل للموظف.
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">تحليلات المحادثات</h3>
              <p className="text-gray-600 leading-relaxed">
                تعرف على أكثر الأسئلة تكراراً، مشاعر العملاء، ومعدل التحويل لتحسين أدائك.
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Zap className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">ردود سريعة مُعدّة</h3>
              <p className="text-gray-600 leading-relaxed">
                أنشئ قوالب ردود جاهزة للأسئلة المتكررة، وساري تستخدمها تلقائياً مع تخصيص ذكي.
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-emerald-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Bot className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">تعلم مستمر</h3>
              <p className="text-gray-600 leading-relaxed">
                ساري تتعلم من تفاعلات العملاء وتحسّن ردودها باستمرار — كل يوم أذكى من اليوم اللي قبله.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20">
        <Card className="bg-gradient-to-l from-emerald-600 to-emerald-800 text-white p-12 text-center">
          <Bot className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-4xl font-bold mb-4">جاهز تأتمت محادثاتك؟</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            فعّل روبوت ساري في 5 دقائق وابدأ بالرد على عملائك تلقائياً
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-white text-emerald-600 hover:bg-gray-100 text-lg px-8">
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
