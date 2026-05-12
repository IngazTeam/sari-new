import { Link } from "wouter";
import { ArrowRight, Radio, Users, Clock, Target, Sparkles, BarChart3, Filter, Calendar, Image, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ProductBroadcasts() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-purple-50">

      {/* Hero */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Radio className="w-4 h-4" />
            البث الجماعي
          </div>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-l from-purple-600 to-purple-800 bg-clip-text text-transparent">
            أرسل حملاتك لآلاف العملاء في ثوانٍ
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-3xl mx-auto">
            بث رسائل واتساب مخصصة لقوائم العملاء — عروض، تحديثات، تذكيرات — مع تخصيص ذكي لكل عميل وتقارير أداء فورية.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-lg px-8">
                ابدأ حملتك الأولى
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

      {/* Stats */}
      <section className="container py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {[
            { value: "98%", label: "معدل الفتح", desc: "أعلى من الإيميل 5x" },
            { value: "45%", label: "معدل الرد", desc: "تفاعل حقيقي مع العملاء" },
            { value: "3x", label: "زيادة المبيعات", desc: "مقارنة بالقنوات التقليدية" },
            { value: "<1 دقيقة", label: "وقت الوصول", desc: "رسائل فورية للجميع" },
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
            <h2 className="text-4xl font-bold mb-4">حملات ذكية — ليس مجرد رسائل عشوائية</h2>
            <p className="text-xl text-gray-600">أدوات احترافية لتسويق فعّال عبر الواتساب</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Target className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">استهداف دقيق</h3>
              <p className="text-gray-600 leading-relaxed">
                قسّم عملاءك حسب المدينة، المشتريات، آخر تفاعل، أو أي معيار مخصص. أرسل الرسالة الصح للشخص الصح.
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Sparkles className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">تخصيص ذكي</h3>
              <p className="text-gray-600 leading-relaxed">
                خصص كل رسالة باسم العميل، آخر منتج اشتراه، أو عرض خاص فيه. رسائل تبدو شخصية لكل عميل.
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Image className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">وسائط متعددة</h3>
              <p className="text-gray-600 leading-relaxed">
                أرسل صور، فيديوهات، ملفات PDF، وأزرار تفاعلية. اجعل حملاتك جذابة وغنية بالمحتوى.
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Calendar className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">جدولة مسبقة</h3>
              <p className="text-gray-600 leading-relaxed">
                جدول حملاتك مسبقاً — حدد اليوم والوقت الأنسب. حملات المناسبات والأعياد جاهزة تلقائياً.
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">تقارير مفصلة</h3>
              <p className="text-gray-600 leading-relaxed">
                تابع أداء كل حملة لحظة بلحظة — معدل الوصول، الفتح، الردود، والتحويلات. اعرف وش نجح ووش لا.
              </p>
            </Card>

            <Card className="p-8 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Filter className="w-7 h-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-3">قوائم ذكية</h3>
              <p className="text-gray-600 leading-relaxed">
                أنشئ قوائم عملاء ديناميكية تتحدث تلقائياً. عملاء جدد، عملاء غير نشطين، أو أعلى المشترين.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="container py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">أفكار حملات تزيد مبيعاتك</h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            { emoji: "🎉", title: "عروض وتخفيضات", desc: "أرسل عروضك الحصرية مع كود خصم مخصص لكل عميل." },
            { emoji: "🛒", title: "استعادة السلات المتروكة", desc: "ذكّر العملاء بالمنتجات اللي في سلتهم مع حافز للإكمال." },
            { emoji: "📦", title: "تحديثات الشحن", desc: "أرسل تحديثات الطلب والشحن تلقائياً — رقم التتبع والحالة." },
            { emoji: "🌙", title: "حملات المناسبات", desc: "رمضان، العيد، اليوم الوطني — حملات جاهزة بضغطة زر." },
            { emoji: "⭐", title: "طلب تقييمات", desc: "بعد التوصيل، أرسل طلب تقييم مع رابط مباشر." },
            { emoji: "🎁", title: "برنامج الولاء", desc: "أرسل نقاط المكافآت والعروض الحصرية لأعضاء برنامج الولاء." },
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
          <h2 className="text-4xl font-bold mb-4">ابدأ أول حملة بث جماعي</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            وصّل رسالتك لكل عملائك في ثوانٍ مع أعلى معدل فتح في السوق
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-white text-purple-600 hover:bg-gray-100 text-lg px-8">
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
