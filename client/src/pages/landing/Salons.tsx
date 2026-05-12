import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  Scissors, ArrowRight, Star, Sparkles, Clock, Shield, Calendar,
  MessageSquare, Users, Bell, CreditCard, BarChart3, CheckCircle2,
  Heart, Repeat, Phone, Zap, UserCheck, Palette, Gift,
} from 'lucide-react';

const BASE = 'https://sary.live';
const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "SoftwareApplication", "name": "ساري للصالونات - مساعد حجز واتساب ذكي", "applicationCategory": "BusinessApplication", "url": `${BASE}/solutions/salons`, "description": "نظام حجز ذكي للصالونات ومراكز التجميل عبر واتساب. حجز مواعيد، تذكيرات، إدارة موظفين، وبرامج ولاء — بالذكاء الاصطناعي.", "offers": { "@type": "Offer", "price": "0", "priceCurrency": "SAR" }, "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "ratingCount": "410" } },
    { "@type": "FAQPage", "mainEntity": [
      { "@type": "Question", "name": "كيف يساعد ساري صالونات التجميل؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري يستقبل حجوزات المواعيد عبر واتساب، يعرض الخدمات والأسعار، يوزع المواعيد على المختصات، ويرسل تذكيرات تلقائية. هذا يقلل المكالمات ويزيد الحجوزات." }},
      { "@type": "Question", "name": "هل يدعم ساري حجز خدمة معينة مع مختصة معينة؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، العميلة تختار الخدمة (صبغة، قص، بروتين..) والمختصة المفضلة. ساري يعرض الأوقات المتاحة لتلك المختصة تحديداً." }},
      { "@type": "Question", "name": "هل يمكن إرسال العروض والخصومات عبر ساري؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، يمكنك إرسال حملات تسويقية عبر واتساب لكل عميلاتك أو فئة معينة. عروض الموسم، خصومات أعياد الميلاد، وباقات خاصة." }},
      { "@type": "Question", "name": "هل يدعم برنامج ولاء؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يتتبع زيارات كل عميلة ويقدم مكافآت تلقائية. مثلاً: الزيارة العاشرة مجانية، أو خصم 20% بعد 5 زيارات." }},
      { "@type": "Question", "name": "ما هي تكلفة ساري للصالونات؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري يقدم باقة مجانية للبدء. الباقات المدفوعة تبدأ من 99 ريال شهرياً وتشمل حجوزات غير محدودة وتذكيرات تلقائية وحملات تسويقية." }},
    ]},
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": BASE },
      { "@type": "ListItem", "position": 2, "name": "الحلول", "item": `${BASE}/solutions/sales` },
      { "@type": "ListItem", "position": 3, "name": "الصالونات", "item": `${BASE}/solutions/salons` },
    ]}
  ]
};

export default function Salons() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || 'ar') === 'ar';

  const painPoints = [
    { icon: Phone, ar: 'مكالمات في أوقات العمل', en: 'Calls During Work', arD: 'المختصات يتركون العميلات للرد على المكالمات', enD: 'Specialists leave clients to answer phone calls', arS: 'ساري يحجز عبر واتساب — المختصات يركزون على العمل', enS: 'Sari books via WhatsApp — specialists focus on work' },
    { icon: Calendar, ar: 'حجوزات مكررة وتعارضات', en: 'Double Bookings', arD: 'حجز يدوي يسبب تعارض مواعيد وإحراج مع العميلات', enD: 'Manual booking causes conflicts and embarrassment with clients', arS: 'نظام ذكي يمنع أي تعارض تلقائياً', enS: 'Smart system prevents any conflict automatically' },
    { icon: Clock, ar: 'عميلات تنسى مواعيدها', en: 'Clients Forget Appointments', arD: 'خسارة مواعيد بسبب نسيان العميلات', enD: 'Lost appointments because clients forget', arS: 'تذكيرات واتساب تلقائية تقلل عدم الحضور 80%', enS: 'Auto WhatsApp reminders reduce no-shows by 80%' },
    { icon: Gift, ar: 'لا برنامج ولاء', en: 'No Loyalty Program', arD: 'العميلات المخلصات لا يحصلون على مكافأة فيروحون لغيرك', enD: 'Loyal clients get no reward so they go elsewhere', arS: 'برنامج ولاء تلقائي يكافئ العميلات ويبقيهم', enS: 'Auto loyalty program rewards clients and retains them' },
  ];

  const features = [
    { icon: Calendar, ar: 'حجز ذكي بالمحادثة', en: 'Smart Chat Booking', arD: 'العميلة تحجز بالكلام: "أبغى صبغة يوم الخميس عند سارة"', enD: 'Client books naturally: "I want coloring Thursday with Sara"' },
    { icon: Users, ar: 'إدارة المختصات', en: 'Specialist Management', arD: 'جدول كل مختصة منفصل مع خدماتها وأوقاتها', enD: 'Each specialist\'s schedule separate with services and times' },
    { icon: Palette, ar: 'قائمة الخدمات الذكية', en: 'Smart Service Menu', arD: 'عرض الخدمات والأسعار والمدة لكل خدمة', enD: 'Display services, prices, and duration for each service' },
    { icon: Bell, ar: 'تذكيرات تلقائية', en: 'Auto Reminders', arD: 'رسالة واتساب قبل الموعد بيوم وساعة', enD: 'WhatsApp message one day and one hour before appointment' },
    { icon: CreditCard, ar: 'دفع وعربون', en: 'Payment & Deposit', arD: 'رابط دفع لتأكيد الحجز وتقليل الإلغاءات', enD: 'Payment link to confirm booking and reduce cancellations' },
    { icon: Heart, ar: 'برنامج الولاء', en: 'Loyalty Program', arD: 'نقاط ومكافآت تلقائية لكل زيارة', enD: 'Auto points and rewards for every visit' },
    { icon: Repeat, ar: 'حجوزات متكررة', en: 'Recurring Bookings', arD: 'جدولة مواعيد أسبوعية أو شهرية تلقائياً', enD: 'Schedule weekly or monthly appointments automatically' },
    { icon: BarChart3, ar: 'تقارير الأداء', en: 'Performance Reports', arD: 'إيرادات كل مختصة وأوقات الذروة والخدمات الأكثر طلباً', enD: 'Revenue per specialist, peak times, and top services' },
    { icon: Sparkles, ar: 'حملات تسويقية', en: 'Marketing Campaigns', arD: 'أرسلي عروض الموسم لكل عميلاتك بضغطة', enD: 'Send seasonal offers to all your clients with one click' },
  ];

  const testimonials = [
    { name: isAr ? 'صالون لمسة جمال' : 'Lamsat Jamal Salon', role: isAr ? 'صالون نسائي — الرياض' : 'Ladies Salon — Riyadh', text: isAr ? 'ساري غيّر طريقة إدارة الحجوزات عندنا بالكامل. المكالمات انخفضت 70% والمختصات أصبحوا يركزون على العمل.' : 'Sari completely changed how we manage bookings. Calls dropped 70% and specialists now focus on work.' },
    { name: isAr ? 'بيوتي لاونج' : 'Beauty Lounge', role: isAr ? 'مركز تجميل — جدة' : 'Beauty Center — Jeddah', text: isAr ? 'برنامج الولاء من ساري زاد تكرار الزيارات بشكل ملحوظ. العميلات يحبون يجمعون النقاط.' : 'Sari\'s loyalty program noticeably increased repeat visits. Clients love collecting points.' },
    { name: isAr ? 'صالون الأناقة' : 'Elegance Salon', role: isAr ? 'صالون رجالي — الدمام' : 'Men\'s Salon — Dammam', text: isAr ? 'الحجوزات عبر الواتساب أسهل بكثير لعملائنا. ساري يتعامل مع 5 حلاقين بجداول مختلفة بدون أي خطأ.' : 'WhatsApp bookings are much easier for our clients. Sari handles 5 barbers with different schedules without any error.' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead title={isAr ? 'ساري للصالونات — نظام حجز واتساب ذكي لمراكز التجميل | Sari AI' : 'Sari for Salons — AI WhatsApp Booking for Beauty Centers | Sari AI'} description={isAr ? 'نظام حجز ذكي للصالونات ومراكز التجميل عبر واتساب. حجز مواعيد، تذكيرات، إدارة مختصات، وبرنامج ولاء — بالذكاء الاصطناعي.' : 'Smart booking system for salons and beauty centers via WhatsApp. Appointments, reminders, specialist management, and loyalty program — powered by AI.'} keywords="حجز صالون واتساب, صالون تجميل واتساب, salon WhatsApp booking, حجز مواعيد صالون, beauty salon AI, بوت صالون" canonicalUrl={`${BASE}/solutions/salons`} ogType="product" structuredData={schemaData} />
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-pink-50 via-rose-50/30 to-white dark:from-pink-950/20 dark:via-gray-900 dark:to-background py-20 md:py-28">
        <div className="container relative"><div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 text-sm font-medium"><Scissors className="w-4 h-4" /><span>{isAr ? 'مصمم خصيصاً للصالونات ومراكز التجميل' : 'Designed for Salons & Beauty Centers'}</span></div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight"><span className="text-pink-600 dark:text-pink-400">{isAr ? 'ساري للصالونات' : 'Sari for Salons'}</span><br />{isAr ? 'حجز واتساب ذكي لمراكز التجميل' : 'AI WhatsApp Booking for Beauty'}</h1>
          <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">{isAr ? 'عميلاتك يحجزون عبر واتساب بمحادثة بسيطة. ساري يدير الجداول، يذكّر بالمواعيد، ويكافئ العميلات المخلصات — تلقائياً.' : 'Your clients book via WhatsApp with a simple chat. Sari manages schedules, sends reminders, and rewards loyal clients — automatically.'}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup"><a><Button size="lg" className="w-full sm:w-auto bg-pink-600 hover:bg-pink-700 text-lg h-14 px-8 shadow-lg">{isAr ? 'فعّلي ساري لصالونك' : 'Activate Sari for Your Salon'}<Sparkles className="ms-2 w-5 h-5" /></Button></a></Link>
            <Link href="/try-sari"><a><Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">{isAr ? 'جرّبي مجاناً' : 'Try Free'}</Button></a></Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 max-w-2xl mx-auto">
            {[{ v: '80%', ar: 'تقليل عدم الحضور', en: 'No-Show Reduction' }, { v: '70%', ar: 'انخفاض المكالمات', en: 'Call Reduction' }, { v: '3x', ar: 'زيادة الحجوزات', en: 'Booking Increase' }, { v: '24/7', ar: 'حجز متاح', en: 'Always Available' }].map(s => (<div key={s.v} className="text-center"><div className="text-3xl font-bold text-pink-600">{s.v}</div><div className="text-sm text-muted-foreground">{isAr ? s.ar : s.en}</div></div>))}
          </div>
        </div></div>
      </section>

      {/* Pain Points */}
      <section className="py-20 bg-white dark:bg-background"><div className="container max-w-5xl"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'مشاكل الصالونات التي يحلها ساري' : 'Salon Problems Sari Solves'}</h2><div className="grid md:grid-cols-2 gap-8">{painPoints.map((p, i) => (<div key={i} className="rounded-2xl border-2 p-6 hover:border-pink-400 transition-all"><div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><p.icon className="w-5 h-5 text-red-600" /></div><h3 className="text-lg font-bold">{isAr ? p.ar : p.en}</h3></div><p className="text-muted-foreground text-sm mb-3">{isAr ? p.arD : p.enD}</p><div className="flex items-center gap-2 text-pink-600 text-sm font-medium"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /><span>{isAr ? p.arS : p.enS}</span></div></div>))}</div></div></section>

      {/* Features */}
      <section className="py-20 bg-muted/30"><div className="container"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'مزايا ساري للصالونات' : 'Sari Features for Salons'}</h2><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">{features.map((f, i) => (<Card key={i} className="border-2 hover:border-pink-500 transition-all hover:shadow-lg group"><CardContent className="p-6"><div className="w-12 h-12 rounded-xl bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><f.icon className="w-6 h-6 text-pink-600" /></div><h3 className="text-lg font-bold mb-2">{isAr ? f.ar : f.en}</h3><p className="text-muted-foreground text-sm">{isAr ? f.arD : f.enD}</p></CardContent></Card>))}</div></div></section>

      {/* Testimonials */}
      <section className="py-20 bg-white dark:bg-background"><div className="container"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'صالونات تثق بساري' : 'Salons Trust Sari'}</h2><div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">{testimonials.map((t, i) => (<Card key={i} className="border-2"><CardContent className="p-6"><div className="flex gap-1 mb-3">{[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}</div><p className="text-muted-foreground mb-4 text-sm">{t.text}</p><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">{t.role}</div></CardContent></Card>))}</div></div></section>

      {/* FAQ */}
      <section className="py-20 bg-muted/30"><div className="container max-w-4xl"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'أسئلة شائعة — الصالونات' : 'FAQ — Salons'}</h2><div className="space-y-4">{schemaData["@graph"][1].mainEntity.map((q: any, i: number) => (<Card key={i} className="border"><CardContent className="p-6"><h3 className="font-bold mb-2">{q.name}</h3><p className="text-muted-foreground text-sm">{q.acceptedAnswer.text}</p></CardContent></Card>))}</div></div></section>

      {/* CTA */}
      <section className="py-20 bg-pink-600 text-white"><div className="container text-center"><h2 className="text-3xl md:text-5xl font-bold mb-4">{isAr ? 'فعّلي ساري لصالونك الآن' : 'Activate Sari for Your Salon Now'}</h2><p className="text-xl mb-8 opacity-90">{isAr ? 'مجاناً — بدون بطاقة ائتمان' : 'Free — no credit card required'}</p><Link href="/signup"><a><Button size="lg" variant="secondary" className="text-lg h-14 px-8">{isAr ? 'ابدأي مجاناً' : 'Start Free'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link></div></section>
      <Footer />
    </div>
  );
}
