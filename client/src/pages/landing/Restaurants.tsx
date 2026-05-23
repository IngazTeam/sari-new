// @ts-nocheck
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  UtensilsCrossed, ArrowRight, Star, Sparkles, Clock, Shield,
  MessageSquare, ShoppingCart, Bell, CreditCard, BarChart3, CheckCircle2,
  Truck, Package, Repeat, Phone, Zap, Receipt, MapPin,
} from 'lucide-react';

const BASE = 'https://sary.live';
const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "SoftwareApplication", "name": "ساري للمطاعم - نظام طلبات واتساب ذكي", "alternateName": "Sari for Restaurants - AI WhatsApp Ordering System", "applicationCategory": "BusinessApplication", "operatingSystem": "Web", "url": `${BASE}/solutions/restaurants`, "description": "نظام طلبات واتساب ذكي للمطاعم والكافيهات. استقبال طلبات، قائمة ذكية، دفع إلكتروني، وتوصيل — كل شيء عبر واتساب بالذكاء الاصطناعي.", "offers": { "@type": "Offer", "price": "0", "priceCurrency": "SAR" }, "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "ratingCount": "540" } },
    { "@type": "FAQPage", "mainEntity": [
      { "@type": "Question", "name": "كيف يستقبل ساري طلبات المطعم عبر واتساب؟", "acceptedAnswer": { "@type": "Answer", "text": "العميل يرسل رسالة واتساب بما يريد طلبه بالكلام العادي. ساري يفهم الطلب، يعرض القائمة إذا لزم الأمر، يحسب المجموع، ويرسل رابط الدفع. كل شيء يتم في المحادثة بدون تطبيق أو موقع." }},
      { "@type": "Question", "name": "هل يدعم ساري قائمة الطعام الديناميكية؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، يمكنك تحديث قائمة الطعام في أي وقت — إضافة أصناف جديدة، تعديل الأسعار، أو تعطيل أصناف نفدت. ساري يعكس التحديثات فوراً." }},
      { "@type": "Question", "name": "هل يمكن للعميل تخصيص طلبه؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يفهم التخصيصات مثل 'بدون بصل'، 'حار زيادة'، 'نصف حجم'. يسجل كل التفاصيل ويرسلها لك بالطلب." }},
      { "@type": "Question", "name": "هل يدعم التوصيل وحجز الطاولات؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يدعم طلبات التوصيل مع تتبع الحالة، وكذلك حجز الطاولات مع إدارة السعة وإرسال تأكيدات تلقائية." }},
      { "@type": "Question", "name": "كيف يتعامل ساري مع أوقات الذروة؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري يعالج مئات الطلبات في وقت واحد بدون تأخير. في أوقات الذروة، يمكنه إخبار العملاء بوقت الانتظار المتوقع تلقائياً." }},
    ]},
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": BASE },
      { "@type": "ListItem", "position": 2, "name": "الحلول", "item": `${BASE}/solutions/sales` },
      { "@type": "ListItem", "position": 3, "name": "المطاعم", "item": `${BASE}/solutions/restaurants` },
    ]}
  ]
};

export default function Restaurants() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || 'ar') === 'ar';

  const painPoints = [
    { icon: Phone, ar: 'طلبات هاتفية فوضوية', en: 'Chaotic Phone Orders', arD: 'أخطاء في الطلبات بسبب سوء الفهم عبر الهاتف', enD: 'Order errors due to miscommunication over phone', arS: 'ساري يستلم الطلب مكتوباً ويؤكده — صفر أخطاء', enS: 'Sari receives order in writing and confirms — zero errors' },
    { icon: Clock, ar: 'ضغط أوقات الذروة', en: 'Peak Hour Pressure', arD: 'الموظفين لا يقدرون يردون على كل الطلبات وقت الذروة', enD: 'Staff can\'t handle all orders during peak hours', arS: 'ساري يعالج مئات الطلبات بالتوازي بدون تأخير', enS: 'Sari processes hundreds of orders simultaneously without delay' },
    { icon: Receipt, ar: 'لا نظام متابعة', en: 'No Tracking System', arD: 'لا تعرف كم طلب جاء اليوم ولا إيش الأصناف الأكثر طلباً', enD: 'You don\'t know how many orders came today or top-selling items', arS: 'تقارير تفصيلية يومية عن المبيعات والأصناف', enS: 'Detailed daily reports on sales and items' },
    { icon: Repeat, ar: 'خسارة العملاء المتكررين', en: 'Losing Repeat Customers', arD: 'ما تعرف عملاءك المخلصين ولا تقدر تكافئهم', enD: 'You don\'t know loyal customers and can\'t reward them', arS: 'ساري يتذكر كل عميل وطلباته السابقة ويقترح المفضلات', enS: 'Sari remembers every customer and past orders, suggests favorites' },
  ];

  const features = [
    { icon: MessageSquare, ar: 'طلب بالمحادثة', en: 'Order via Chat', arD: 'العميل يطلب بالكلام العادي مثل "أبغى بيتزا بيبروني كبير"', enD: 'Customer orders naturally like "I want a large pepperoni pizza"' },
    { icon: Package, ar: 'قائمة طعام ذكية', en: 'Smart Menu', arD: 'يعرض القائمة حسب التصنيف مع الأسعار والصور', enD: 'Shows menu by category with prices and photos' },
    { icon: CreditCard, ar: 'دفع إلكتروني فوري', en: 'Instant E-Payment', arD: 'رابط دفع آمن يُرسل في المحادثة مباشرة', enD: 'Secure payment link sent directly in chat' },
    { icon: Truck, ar: 'إدارة التوصيل', en: 'Delivery Management', arD: 'تتبع حالة الطلب وإرسال تحديثات للعميل', enD: 'Track order status and send updates to customer' },
    { icon: MapPin, ar: 'حجز طاولات', en: 'Table Reservation', arD: 'حجز طاولات عبر واتساب مع إدارة السعة', enD: 'Book tables via WhatsApp with capacity management' },
    { icon: Bell, ar: 'تنبيهات الطلبات', en: 'Order Alerts', arD: 'إشعار فوري لك عند كل طلب جديد', enD: 'Instant notification for every new order' },
    { icon: Repeat, ar: 'إعادة الطلب السريع', en: 'Quick Reorder', arD: 'العميل يقول "نفس الطلب السابق" وساري يكرره فوراً', enD: 'Customer says "same as last order" and Sari repeats it instantly' },
    { icon: BarChart3, ar: 'تحليل المبيعات', en: 'Sales Analytics', arD: 'أفضل الأصناف، أوقات الذروة، متوسط الطلب', enD: 'Top items, peak times, average order value' },
    { icon: Shield, ar: 'وقت الانتظار الذكي', en: 'Smart Wait Time', arD: 'يخبر العميل بوقت التحضير المتوقع تلقائياً', enD: 'Automatically tells customer expected preparation time' },
  ];

  const testimonials = [
    { name: isAr ? 'مطعم بيت الشاورما' : 'Shawarma House', role: isAr ? 'مطعم شعبي — الرياض' : 'Popular Restaurant — Riyadh', text: isAr ? 'طلبات الواتساب زادت مبيعاتنا 40%. العملاء يحبون سهولة الطلب بدون تطبيق. ساري يفهم حتى الطلبات المعقدة.' : 'WhatsApp orders increased our sales by 40%. Customers love the ease of ordering without an app. Sari understands even complex orders.' },
    { name: isAr ? 'كافيه سحاب' : 'Sahab Café', role: isAr ? 'كافيه متخصص — جدة' : 'Specialty Café — Jeddah', text: isAr ? 'ساري يدير طلبات الكافيه وحجوزات الأماكن بنفس الوقت. وفّرنا راتب موظف كامل.' : 'Sari manages café orders and space reservations simultaneously. We saved a full employee salary.' },
    { name: isAr ? 'مطبخ أم سارة' : 'Um Sara Kitchen', role: isAr ? 'طبخ منزلي — الدمام' : 'Home Kitchen — Dammam', text: isAr ? 'بدأت مشروعي من البيت وساري ينظم كل شيء. الطلبات، الدفع، والتوصيل — كل شيء عبر واتساب فقط.' : 'Started my business from home and Sari organizes everything. Orders, payment, and delivery — all via WhatsApp only.' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead title={isAr ? 'ساري للمطاعم — نظام طلبات واتساب ذكي | Sari AI' : 'Sari for Restaurants — AI WhatsApp Ordering System | Sari AI'} description={isAr ? 'حوّل واتساب مطعمك إلى قناة طلبات متكاملة. قائمة ذكية، دفع إلكتروني، تتبع توصيل، وحجز طاولات — بالذكاء الاصطناعي.' : 'Transform your restaurant\'s WhatsApp into a complete ordering channel. Smart menu, e-payment, delivery tracking, and table reservations — powered by AI.'} keywords="طلبات مطاعم واتساب, نظام طلبات مطعم, WhatsApp restaurant ordering, بوت مطعم, توصيل واتساب, حجز طاولات واتساب" canonicalUrl={`${BASE}/solutions/restaurants`} ogType="product" structuredData={schemaData} />
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-amber-50 via-orange-50/30 to-white dark:from-amber-950/20 dark:via-gray-900 dark:to-background py-20 md:py-28">
        <div className="container relative"><div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-sm font-medium"><UtensilsCrossed className="w-4 h-4" /><span>{isAr ? 'مصمم خصيصاً للمطاعم والكافيهات' : 'Designed for Restaurants & Cafés'}</span></div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight"><span className="text-amber-600 dark:text-amber-400">{isAr ? 'ساري للمطاعم' : 'Sari for Restaurants'}</span><br />{isAr ? 'نظام طلبات واتساب ذكي' : 'AI WhatsApp Ordering System'}</h1>
          <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">{isAr ? 'عملاءك يطلبون بالواتساب بالكلام العادي. ساري يفهم الطلب، يحسب المجموع، يقبض الفلوس، ويبلّغك — كل شيء تلقائي.' : 'Your customers order via WhatsApp in natural language. Sari understands, calculates total, collects payment, and notifies you — all automatic.'}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup"><a><Button size="lg" className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-lg h-14 px-8 shadow-lg">{isAr ? 'فعّل ساري لمطعمك' : 'Activate Sari for Your Restaurant'}<Sparkles className="ms-2 w-5 h-5" /></Button></a></Link>
            <Link href="/try-sari"><a><Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">{isAr ? 'جرّب مجاناً' : 'Try Free'}</Button></a></Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 max-w-2xl mx-auto">
            {[{ v: '40%', ar: 'زيادة المبيعات', en: 'Sales Increase' }, { v: '0', ar: 'أخطاء في الطلبات', en: 'Order Errors' }, { v: '<30s', ar: 'وقت استلام الطلب', en: 'Order Receive Time' }, { v: '24/7', ar: 'استقبال الطلبات', en: 'Order Reception' }].map(s => (<div key={s.v} className="text-center"><div className="text-3xl font-bold text-amber-600">{s.v}</div><div className="text-sm text-muted-foreground">{isAr ? s.ar : s.en}</div></div>))}
          </div>
        </div></div>
      </section>

      {/* Pain Points */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container max-w-5xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'مشاكل المطاعم التي يحلها ساري' : 'Restaurant Problems Sari Solves'}</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {painPoints.map((p, i) => (
              <div key={i} className="rounded-2xl border-2 p-6 hover:border-amber-400 transition-all">
                <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><p.icon className="w-5 h-5 text-red-600" /></div><h3 className="text-lg font-bold">{isAr ? p.ar : p.en}</h3></div>
                <p className="text-muted-foreground text-sm mb-3">{isAr ? p.arD : p.enD}</p>
                <div className="flex items-center gap-2 text-amber-600 text-sm font-medium"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /><span>{isAr ? p.arS : p.enS}</span></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'كل ما يحتاجه مطعمك' : 'Everything Your Restaurant Needs'}</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (<Card key={i} className="border-2 hover:border-amber-500 transition-all hover:shadow-lg group"><CardContent className="p-6"><div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><f.icon className="w-6 h-6 text-amber-600" /></div><h3 className="text-lg font-bold mb-2">{isAr ? f.ar : f.en}</h3><p className="text-muted-foreground text-sm">{isAr ? f.arD : f.enD}</p></CardContent></Card>))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'مطاعم تثق بساري' : 'Restaurants Trust Sari'}</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {testimonials.map((t, i) => (<Card key={i} className="border-2"><CardContent className="p-6"><div className="flex gap-1 mb-3">{[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}</div><p className="text-muted-foreground mb-4 text-sm">{t.text}</p><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">{t.role}</div></CardContent></Card>))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-muted/30">
        <div className="container max-w-4xl"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'أسئلة شائعة — المطاعم' : 'FAQ — Restaurants'}</h2>
          // @ts-ignore
          <div className="space-y-4">{schemaData["@graph"][1].mainEntity.map((q: any, i: number) => (<Card key={i} className="border"><CardContent className="p-6"><h3 className="font-bold mb-2">{q.name}</h3><p className="text-muted-foreground text-sm">{q.acceptedAnswer.text}</p></CardContent></Card>))}</div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-amber-600 text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">{isAr ? 'فعّل ساري لمطعمك الآن' : 'Activate Sari for Your Restaurant Now'}</h2>
          <p className="text-xl mb-8 opacity-90">{isAr ? 'مجاناً — بدون بطاقة ائتمان' : 'Free — no credit card required'}</p>
          <Link href="/signup"><a><Button size="lg" variant="secondary" className="text-lg h-14 px-8">{isAr ? 'ابدأ مجاناً' : 'Start Free'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link>
        </div>
      </section>
      <Footer />
    </div>
  );
}