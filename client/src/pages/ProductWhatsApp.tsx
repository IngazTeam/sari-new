import { Link } from "wouter";
import { ArrowRight, MessageCircle, Smartphone, Shield, Plug, Repeat, UserCheck, Bell, QrCode, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ProductWhatsApp() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-green-50">

      {/* Hero */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <MessageCircle className="w-4 h-4" />
            التكامل مع WhatsApp
          </div>
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-l from-green-600 to-green-800 bg-clip-text text-transparent">
            اربط واتسابك بساري في دقائق
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-3xl mx-auto">
            تكامل سلس مع واتساب بزنس — ربط مباشر بدون أي تعقيدات تقنية. استقبل الرسائل، رد تلقائياً، وتابع محادثاتك كلها من مكان واحد.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-green-600 hover:bg-green-700 text-lg px-8">
                اربط واتسابك الآن
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

      {/* How it Works */}
      <section className="bg-white py-20">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">كيف يعمل التكامل؟</h2>
            <p className="text-xl text-gray-600">3 خطوات بسيطة وتبدأ</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="w-20 h-20 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <QrCode className="w-10 h-10 text-green-600" />
              </div>
              <div className="w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">1</div>
              <h3 className="text-xl font-bold mb-3">امسح رمز QR</h3>
              <p className="text-gray-600">افتح واتساب على جوالك وامسح رمز QR من لوحة تحكم ساري. العملية تأخذ 30 ثانية فقط.</p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Plug className="w-10 h-10 text-green-600" />
              </div>
              <div className="w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">2</div>
              <h3 className="text-xl font-bold mb-3">فعّل الروبوت</h3>
              <p className="text-gray-600">اختر شخصية ساري المناسبة لعملك وحدد ساعات العمل ونوع الردود.</p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Smartphone className="w-10 h-10 text-green-600" />
              </div>
              <div className="w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">3</div>
              <h3 className="text-xl font-bold mb-3">ابدأ الاستقبال</h3>
              <p className="text-gray-600">ساري تبدأ بالرد على عملائك فوراً. تقدر تتابع كل المحادثات من اللوحة.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="container py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
          <div>
            <h2 className="text-4xl font-bold mb-6">يتكامل مع متجرك</h2>
            <p className="text-lg text-gray-600 mb-8 leading-relaxed">
              ساري يتصل تلقائياً بمتجرك على سلّة أو زد أو WooCommerce — يسحب المنتجات والأسعار والمخزون في ثوانٍ.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {["سلّة", "زد", "Shopify", "WooCommerce"].map((platform) => (
                <Card key={platform} className="p-4 flex items-center gap-3 border-green-100 hover:border-green-300 transition-colors">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Link2 className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="font-semibold">{platform}</span>
                </Card>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <Card className="p-6 border-green-100">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">تشفير كامل</h3>
                  <p className="text-gray-600 text-sm">كل المحادثات مشفرة بتقنية end-to-end. بياناتك وبيانات عملائك آمنة 100%.</p>
                </div>
              </div>
            </Card>

            <Card className="p-6 border-green-100">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Repeat className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">مزامنة فورية</h3>
                  <p className="text-gray-600 text-sm">أي تغيير في المنتجات أو الأسعار ينعكس فوراً في ردود ساري — بدون تحديث يدوي.</p>
                </div>
              </div>
            </Card>

            <Card className="p-6 border-green-100">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <UserCheck className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">أرقام متعددة</h3>
                  <p className="text-gray-600 text-sm">اربط أكثر من رقم واتساب في حساب واحد — مثالي للفرق والفروع المتعددة.</p>
                </div>
              </div>
            </Card>

            <Card className="p-6 border-green-100">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Bell className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">إشعارات ذكية</h3>
                  <p className="text-gray-600 text-sm">استقبل تنبيهات فورية عند وصول رسائل مهمة أو عندما يحتاج العميل مساعدة بشرية.</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20">
        <Card className="bg-gradient-to-l from-green-600 to-green-800 text-white p-12 text-center">
          <MessageCircle className="w-16 h-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-4xl font-bold mb-4">جاهز تربط واتسابك؟</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            انضم لأكثر من 500 تاجر سعودي يستخدمون ساري لأتمتة مبيعاتهم على الواتساب
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-white text-green-600 hover:bg-gray-100 text-lg px-8">
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
