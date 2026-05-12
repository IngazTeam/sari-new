import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  ShoppingCart, ArrowRight, Star, Sparkles, CreditCard, Package,
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
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "SAR" },
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "كيف يعمل نظام الطلبات عبر واتساب؟", "acceptedAnswer": { "@type": "Answer", "text": "يستقبل العميل رسالة على واتساب، ساري يعرض المنتجات المناسبة، العميل يختار، ساري يرسل رابط دفع آمن، ثم يؤكد الطلب ويرسل تفاصيل الشحن تلقائياً." }},
        { "@type": "Question", "name": "هل يدعم ساري الدفع الإلكتروني؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يتكامل مع بوابات الدفع الرئيسية مثل Tap وMoyasar. يرسل روابط دفع آمنة للعميل مباشرة في المحادثة." }},
        { "@type": "Question", "name": "هل يمكن ربط نظام الطلبات مع سلة وزد؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يتكامل مع سلة وزد وووكومرس. الطلبات تُسجّل تلقائياً في متجرك مع تحديث المخزون." }},
        { "@type": "Question", "name": "هل يدعم تتبع الشحنات؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يرسل تحديثات الشحن للعملاء تلقائياً عبر واتساب مع رقم التتبع وروابط الشحن." }},
        { "@type": "Question", "name": "كم طلب يمكن معالجته يومياً؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري يعالج آلاف الطلبات يومياً بدون تأخير. لا يوجد حد لعدد الطلبات في الباقات المدفوعة." }},
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
    { icon: CreditCard, ar: 'دفع إلكتروني آمن', en: 'Secure Electronic Payment', arD: 'روابط دفع فورية عبر Tap و Moyasar', enD: 'Instant payment links via Tap and Moyasar' },
    { icon: Receipt, ar: 'فواتير تلقائية', en: 'Automatic Invoices', arD: 'فاتورة مفصلة تُرسل للعميل فور إتمام الطلب', enD: 'Detailed invoice sent to customer upon order completion' },
    { icon: Truck, ar: 'تتبع الشحنات', en: 'Shipment Tracking', arD: 'تحديثات مباشرة للعميل عن حالة الشحنة', enD: 'Live updates for customers about shipment status' },
    { icon: Package, ar: 'إدارة المخزون الذكية', en: 'Smart Inventory Management', arD: 'تحديث المخزون تلقائياً مع كل طلب', enD: 'Automatic inventory update with each order' },
    { icon: Bell, ar: 'إشعارات الطلبات', en: 'Order Notifications', arD: 'تنبيهات فورية لك ولعميلك في كل مرحلة', enD: 'Instant alerts for you and your customer at every stage' },
    { icon: BarChart3, ar: 'تقارير المبيعات', en: 'Sales Reports', arD: 'تحليل تفصيلي لأفضل المنتجات والأوقات', enD: 'Detailed analysis of best products and peak times' },
    { icon: Shield, ar: 'حماية بيانات العملاء', en: 'Customer Data Protection', arD: 'تشفير كامل وحماية متقدمة للبيانات', enD: 'Full encryption and advanced data protection' },
    { icon: Zap, ar: 'سرعة خارقة', en: 'Blazing Speed', arD: 'معالجة الطلب في ثوانٍ بدل ساعات', enD: 'Process orders in seconds instead of hours' },
  ];

  const flow = [
    { n: '1', ar: 'العميل يرسل رسالة', en: 'Customer sends message', arD: '"أبغى أطلب بيتزا مارغريتا وكولا"', enD: '"I want to order a Margherita pizza and cola"' },
    { n: '2', ar: 'ساري يفهم ويؤكد', en: 'Sari understands & confirms', arD: 'يعرض تفاصيل الطلب والسعر الإجمالي', enD: 'Shows order details and total price' },
    { n: '3', ar: 'إرسال رابط الدفع', en: 'Payment link sent', arD: 'رابط دفع آمن يُرسل مباشرة في المحادثة', enD: 'Secure payment link sent directly in chat' },
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
              {[{ v: '40%', ar: 'زيادة المبيعات', en: 'Sales Increase' }, { v: '0', ar: 'أخطاء في الطلبات', en: 'Order Errors' }, { v: '<30s', ar: 'وقت استلام الطلب', en: 'Order Receive Time' }, { v: '24/7', ar: 'استقبال الطلبات', en: 'Order Reception' }].map(s => (<div key={s.v} className="text-center"><div className="text-3xl font-bold text-blue-600">{s.v}</div><div className="text-sm text-muted-foreground">{isAr ? s.ar : s.en}</div></div>))}
            </div>
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
            {schemaData["@graph"][1].mainEntity.map((q: any, i: number) => (
              <Card key={i} className="border"><CardContent className="p-6"><h3 className="font-bold mb-2">{q.name}</h3><p className="text-muted-foreground text-sm">{q.acceptedAnswer.text}</p></CardContent></Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'متاجر تثق بساري' : 'Stores Trust Sari'}</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { name: isAr ? 'متجر نوره للعبايات' : 'Noura Abayas Store', role: isAr ? 'متجر إلكتروني — الرياض' : 'Online Store — Riyadh', text: isAr ? 'طلبات الواتساب أصبحت 60% من مبيعاتنا. ساري يتعامل مع كل الطلبات تلقائياً والعملاء يحبون السهولة.' : 'WhatsApp orders became 60% of our sales. Sari handles all orders automatically and customers love the ease.' },
              { name: isAr ? 'مطعم بيت الشاورما' : 'Shawarma House', role: isAr ? 'مطعم — جدة' : 'Restaurant — Jeddah', text: isAr ? 'أخطاء الطلبات اختفت تماماً. كل شيء مكتوب ومؤكد. الطلبات تصلنا جاهزة للتحضير.' : 'Order errors completely disappeared. Everything is written and confirmed. Orders come ready for preparation.' },
              { name: isAr ? 'بقالة الحي' : 'Al-Hay Grocery', role: isAr ? 'بقالة توصيل — الدمام' : 'Delivery Grocery — Dammam', text: isAr ? 'ساري يستقبل طلبات التوصيل 24/7. حتى بالليل الطلبات تتسجل ونجهزها الصباح.' : 'Sari receives delivery orders 24/7. Even at night, orders are registered and we prepare them in the morning.' },
            ].map((t, i) => (<Card key={i} className="border-2"><CardContent className="p-6"><div className="flex gap-1 mb-3">{[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}</div><p className="text-muted-foreground mb-4 text-sm">{t.text}</p><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">{t.role}</div></CardContent></Card>))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">{isAr ? 'حوّل واتسابك إلى قناة طلبات الآن' : 'Transform WhatsApp Into an Order Channel'}</h2>
          <p className="text-xl mb-8 opacity-90">{isAr ? 'ابدأ باستقبال طلبات عبر واتساب خلال 5 دقائق' : 'Start receiving WhatsApp orders in 5 minutes'}</p>
          <Link href="/signup"><a><Button size="lg" variant="secondary" className="text-lg h-14 px-8">{isAr ? 'ابدأ مجاناً' : 'Start Free'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
