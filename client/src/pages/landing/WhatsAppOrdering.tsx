// @ts-nocheck
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  ShoppingCart, ArrowRight, Sparkles, CreditCard, Package,
  Truck, Bell, Receipt, Clock, Shield, Smartphone, Zap, CheckCircle2,
  MessageSquare, BarChart3,
} from 'lucide-react';

const BASE = 'https://sary.live';

const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "ساري - نظام طلبات واتساب",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "url": `${BASE}/whatsapp-ordering-system`,
      "description": "نظام طلبات واتساب متكامل بالذكاء الاصطناعي. يستقبل الطلبات، يرسل الفواتير، يتتبع الشحنات، ويدير المدفوعات تلقائياً.",
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "كيف يعمل نظام الطلبات عبر واتساب؟", "acceptedAnswer": { "@type": "Answer", "text": "يعرض ساري بيانات المنتجات، ثم يحفظ الطلب قبل تأكيده. إذا كان Tap مفعّلًا ومتحققًا يرسل الرابط الذي تعيده البوابة، وتتغير حالة الدفع بعد callback موثّق." }},
        { "@type": "Question", "name": "هل يدعم ساري الدفع الإلكتروني؟", "acceptedAnswer": { "@type": "Answer", "text": "يدعم المسار الحالي Tap Payments عند تفعيل مفاتيح التاجر والتحقق منها. وسائل الدفع والتسوية والرسوم يحددها حساب التاجر لدى Tap." }},
        { "@type": "Question", "name": "هل يمكن ربط نظام الطلبات مع سلة وزد؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يتكامل مع سلة وزد وووكومرس. الطلبات تُسجّل تلقائياً في متجرك مع تحديث المخزون." }},
        { "@type": "Question", "name": "هل يدعم تتبع الشحنات؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يرسل تحديثات الشحن للعملاء تلقائياً عبر واتساب مع رقم التتبع وروابط الشحن." }},
        { "@type": "Question", "name": "كم طلب يمكن معالجته يومياً؟", "acceptedAnswer": { "@type": "Answer", "text": "السعة الفعلية تعتمد على الباقة وقناة واتساب وبوابة الدفع وحدود مزودي الخدمة. راجع صفحة التسعير وحدود حسابك الحالية." }},
      ]
    },
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": BASE },
      { "@type": "ListItem", "position": 2, "name": "نظام طلبات واتساب", "item": `${BASE}/whatsapp-ordering-system` },
    ]}
  ]
};

export default function WhatsAppOrdering() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || 'ar') === 'ar';

  const features = [
    { icon: MessageSquare, ar: 'استقبال الطلبات عبر المحادثة', en: 'Receive Orders via Chat', arD: 'العميل يطلب بالكلام العادي وساري يفهم ويعالج', enD: 'Customer orders in natural language and Sari understands and processes' },
    { icon: CreditCard, ar: 'رابط دفع من المزود', en: 'Provider Payment Link', arD: 'رابط Tap يظهر فقط بعد تحقق إعداد التاجر ونجاح إنشاء العملية', enD: 'A Tap link appears only after merchant verification and successful charge creation' },
    { icon: Receipt, ar: 'تأكيد مرتبط بالسجل', en: 'Record-Backed Confirmation', arD: 'لا تُرسل رسالة نجاح إلا من طلب محفوظ وحالة دفع موثقة عند وجودها', enD: 'Success is messaged only from a persisted order and verified payment state when applicable' },
    { icon: Truck, ar: 'تتبع الشحنات', en: 'Shipment Tracking', arD: 'تحديثات مباشرة للعميل عن حالة الشحنة', enD: 'Live updates for customers about shipment status' },
    { icon: Package, ar: 'إدارة المخزون الذكية', en: 'Smart Inventory Management', arD: 'تحديث المخزون تلقائياً مع كل طلب', enD: 'Automatic inventory update with each order' },
    { icon: Bell, ar: 'حالة طلب قابلة للتتبع', en: 'Traceable Order Status', arD: 'تتغير الحالة من الأحداث المحفوظة ونتيجة مزود الدفع', enD: 'Status changes from persisted events and the payment-provider result' },
    { icon: BarChart3, ar: 'تقارير المبيعات', en: 'Sales Reports', arD: 'تحليل تفصيلي لأفضل المنتجات والأوقات', enD: 'Detailed analysis of best products and peak times' },
    { icon: Shield, ar: 'حماية بيانات العملاء', en: 'Customer Data Protection', arD: 'عزل بيانات المتجر وضوابط وصول على العمليات الحساسة', enD: 'Merchant data isolation and access controls on sensitive operations' },
    { icon: Zap, ar: 'مسار آلي', en: 'Automated Flow', arD: 'ينفذ خطوات الطلب آلياً عند سلامة القناة والتكاملات', enD: 'Runs order steps automatically when the channel and integrations are healthy' },
  ];

  const flow = [
    { n: '1', ar: 'العميل يرسل رسالة', en: 'Customer sends message', arD: '"أبغى أطلب بيتزا مارغريتا وكولا"', enD: '"I want to order a Margherita pizza and cola"' },
    { n: '2', ar: 'ساري يفهم ويؤكد', en: 'Sari understands & confirms', arD: 'يعرض تفاصيل الطلب والسعر الإجمالي', enD: 'Shows order details and total price' },
    { n: '3', ar: 'إنشاء رابط الدفع', en: 'Create Payment Link', arD: 'عند تفعيل Tap، يرسل ساري الرابط الذي تعيده البوابة أو يوضح تعذر إنشائه', enD: 'When Tap is enabled, Sari sends the provider URL or reports that it could not be created' },
    { n: '4', ar: 'تأكيد وتتبع', en: 'Confirmation & tracking', arD: 'تأكيد الطلب + رقم التتبع للعميل تلقائياً', enD: 'Order confirmation + tracking number sent automatically' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead
        title={isAr ? 'نظام طلبات واتساب بالذكاء الاصطناعي | ساري' : 'AI WhatsApp Ordering System | Sari'}
        description={isAr
          ? 'حوّل واتساب متجرك إلى قناة طلبات متكاملة. استقبال طلبات، دفع إلكتروني، فواتير تلقائية، وتتبع شحنات — كل شيء عبر واتساب.'
          : 'Transform your store\'s WhatsApp into a complete ordering channel. Receive orders, electronic payment, auto invoices, and shipment tracking — all via WhatsApp.'}
        keywords="نظام طلبات واتساب, طلبات عبر الواتساب, WhatsApp ordering system, دفع واتساب, فواتير واتساب, تجارة محادثية"
        canonicalUrl={`${BASE}/whatsapp-ordering-system`}
        ogType="product"
        structuredData={schemaData}
      />
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 via-indigo-50/30 to-white dark:from-blue-950/20 dark:via-gray-900 dark:to-background py-20 md:py-28">
        <div className="container relative">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-sm font-medium">
              <ShoppingCart className="w-4 h-4" />
              <span>{isAr ? 'نظام طلبات متكامل' : 'Complete Ordering System'}</span>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight">
              <span className="text-blue-600 dark:text-blue-400">{isAr ? 'نظام طلبات واتساب' : 'WhatsApp Ordering'}</span>
              <br />{isAr ? 'بالذكاء الاصطناعي' : 'System with AI'}
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              {isAr
                ? 'عملاؤك يطلبون عبر واتساب بالكلام العادي. ساري يفهم الطلب، يحسب المجموع، يرسل رابط الدفع، ويؤكد الطلب — تلقائياً.'
                : 'Your customers order via WhatsApp in natural language. Sari understands the order, calculates total, sends payment link, and confirms — automatically.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup"><a><Button size="lg" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-lg h-14 px-8 shadow-lg">{isAr ? 'ابدأ مجاناً' : 'Start Free'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link>
              <Link href="/try-sari"><a><Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">{isAr ? 'شاهد عرض تجريبي' : 'See Demo'}</Button></a></Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 max-w-2xl mx-auto">
              {[
                { v: '3', ar: 'عملاء تجريبيون', en: 'Pilot clients' },
                { v: '≈100', ar: 'عميل نهائي شهرياً لكل تجربة', en: 'Monthly end customers per pilot' },
                { v: '≈300', ar: 'عميل نهائي شهرياً عبر التجارب', en: 'Monthly end customers across pilots' },
                { v: isAr ? 'بيتا' : 'Beta', ar: 'مرحلة المنتج', en: 'Product stage' },
              ].map(s => (<div key={s.v} className="text-center"><div className="text-3xl font-bold text-blue-600">{s.v}</div><div className="text-sm text-muted-foreground">{isAr ? s.ar : s.en}</div></div>))}
            </div>
            <p className="text-xs text-muted-foreground">{isAr ? 'أرقام الاستخدام بحسب إفادة مالك المنتج عن تجارب أغسطس 2026؛ أثر المبيعات والأخطاء وزمن الطلب قيد القياس.' : 'Usage figures are owner-reported for August 2026 pilots; sales impact, errors and order time are still being measured.'}</p>
          </div>
        </div>
      </section>

      {/* Order Flow */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'رحلة الطلب الذكية' : 'Smart Order Journey'}</h2>
          <div className="space-y-8">
            {flow.map((s, i) => (
              <div key={i} className="flex gap-6 items-start">
                <div className="w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold flex-shrink-0">{s.n}</div>
                <div>
                  <h3 className="text-xl font-bold mb-1">{isAr ? s.ar : s.en}</h3>
                  <p className="text-muted-foreground italic">"{isAr ? s.arD : s.enD}"</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-4">{isAr ? 'كل ما تحتاجه لإدارة الطلبات' : 'Everything You Need for Order Management'}</h2>
          <p className="text-xl text-muted-foreground text-center mb-16">{isAr ? 'من الطلب إلى التوصيل — أتمتة كاملة' : 'From order to delivery — full automation'}</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <Card key={i} className="border-2 hover:border-blue-500 transition-all hover:shadow-lg group">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <f.icon className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{isAr ? f.ar : f.en}</h3>
                  <p className="text-muted-foreground text-sm">{isAr ? f.arD : f.enD}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'أسئلة شائعة' : 'FAQ'}</h2>
          <div className="space-y-4">
            // @ts-ignore
            {schemaData["@graph"][1].mainEntity.map((q: any, i: number) => (
              <Card key={i} className="border"><CardContent className="p-6"><h3 className="font-bold mb-2">{q.name}</h3><p className="text-muted-foreground text-sm">{q.acceptedAnswer.text}</p></CardContent></Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pilot evidence */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'دليل البيتا الحالي' : 'Current Beta Evidence'}</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { title: isAr ? 'استخدام فعلي' : 'Live usage', text: isAr ? 'ثلاثة عملاء جرّبوا المنتج بنجاح تشغيلياً.' : 'Three clients have used the product successfully in operation.' },
              { title: isAr ? 'حجم أولي' : 'Initial volume', text: isAr ? 'نحو 100 عميل نهائي شهرياً لكل تجربة.' : 'About 100 end customers monthly per pilot.' },
              { title: isAr ? 'قياس مطلوب' : 'Measurement required', text: isAr ? 'نقيس اكتمال الطلب والدفع والأخطاء قبل نشر نسب نتائج.' : 'Order completion, payment and errors are being measured before publishing outcome rates.' },
            ].map((item, i) => (<Card key={i} className="border-2"><CardContent className="p-6"><CheckCircle2 className="w-6 h-6 text-blue-600 mb-3" aria-hidden="true" /><div className="font-semibold mb-2">{item.title}</div><p className="text-muted-foreground text-sm">{item.text}</p></CardContent></Card>))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">{isAr ? 'حوّل واتسابك إلى قناة طلبات الآن' : 'Transform WhatsApp Into an Order Channel'}</h2>
          <p className="text-xl mb-8 opacity-90">{isAr ? 'أنشئ حسابك واختبر حفظ الطلب وربط القناة والدفع قبل استقبال طلبات العملاء' : 'Create an account and test order persistence, channel setup, and payments before accepting customer orders'}</p>
          <Button asChild size="lg" variant="secondary" className="text-lg h-14 px-8">
            <Link href="/signup">{isAr ? 'ابدأ التجربة' : 'Start Trial'}<ArrowRight aria-hidden="true" className="ms-2 w-5 h-5" /></Link>
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
