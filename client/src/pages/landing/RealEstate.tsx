// @ts-nocheck
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  Building2, ArrowRight, Star, Sparkles, Clock, Shield, Calendar,
  MessageSquare, Users, Bell, CreditCard, BarChart3, CheckCircle2,
  MapPin, Camera, Phone, Zap, FileText, Eye, Home, Key,
} from 'lucide-react';

const BASE = 'https://sary.live';
const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "SoftwareApplication", "name": "ساري للعقار - مساعد واتساب ذكي للوسطاء العقاريين", "applicationCategory": "BusinessApplication", "url": `${BASE}/solutions/real-estate`, "description": "مساعد عقاري ذكي عبر واتساب. يرد على استفسارات المشترين، يعرض العقارات المناسبة، يحجز المعاينات، ويتابع العملاء المهتمين — بالذكاء الاصطناعي.", "offers": { "@type": "Offer", "price": "0", "priceCurrency": "SAR" } },
    { "@type": "FAQPage", "mainEntity": [
      { "@type": "Question", "name": "كيف يساعد ساري الوسطاء العقاريين؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري يستقبل استفسارات المشترين والمستأجرين عبر واتساب، يفهم متطلباتهم (الميزانية، الموقع، المساحة)، يعرض العقارات المناسبة بالصور والتفاصيل، ويحجز مواعيد المعاينة تلقائياً." }},
      { "@type": "Question", "name": "هل يمكن لساري عرض صور ومخططات العقارات؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يرسل صور العقار والمخططات والموقع على الخريطة مباشرة في محادثة الواتساب. العميل يرى كل التفاصيل بدون مغادرة المحادثة." }},
      { "@type": "Question", "name": "هل يدعم ساري متابعة العملاء المهتمين؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يتتبع كل عميل وتفضيلاته. عند إضافة عقار جديد يطابق متطلبات عميل سابق، يرسل له إشعار تلقائياً." }},
      { "@type": "Question", "name": "هل يناسب المطورين العقاريين والمكاتب؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يناسب الوسطاء الأفراد، المكاتب العقارية، وشركات التطوير. يمكن إضافة مئات العقارات وتصنيفها حسب النوع والموقع والسعر." }},
      { "@type": "Question", "name": "كيف يحجز ساري مواعيد المعاينة؟", "acceptedAnswer": { "@type": "Answer", "text": "العميل يطلب معاينة عقار معين، ساري يعرض الأوقات المتاحة، يؤكد الموعد، ويرسل الموقع على الخريطة. يرسل تذكير قبل المعاينة بساعة." }},
    ]},
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": BASE },
      { "@type": "ListItem", "position": 2, "name": "العقار", "item": `${BASE}/solutions/real-estate` },
    ]}
  ]
};

export default function RealEstate() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || 'ar') === 'ar';

  const painPoints = [
    { icon: Phone, ar: 'استفسارات كثيرة بلا تحويل', en: 'Many Inquiries, No Conversion', arD: 'عشرات الرسائل يومياً ومعظمها لا تتحول لعملاء', enD: 'Dozens of messages daily and most don\'t convert to clients', arS: 'ساري يؤهل العملاء ويرسل لك المهتمين فقط', enS: 'Sari qualifies leads and sends you only interested ones' },
    { icon: Eye, ar: 'عروض لا تصل للعملاء', en: 'Listings Don\'t Reach Clients', arD: 'عندك عقارات ممتازة لكن العملاء المناسبين ما يعرفون', enD: 'You have great properties but the right clients don\'t know', arS: 'ساري يرسل العقارات الجديدة لكل عميل حسب تفضيلاته', enS: 'Sari sends new listings to each client based on preferences' },
    { icon: Calendar, ar: 'تنسيق المعاينات مرهق', en: 'Viewing Coordination is Exhausting', arD: 'مواعيد متعارضة وعملاء لا يحضرون', enD: 'Conflicting schedules and clients who don\'t show up', arS: 'حجز معاينات تلقائي مع تذكيرات وموقع الخريطة', enS: 'Auto viewing booking with reminders and map location' },
    { icon: FileText, ar: 'لا متابعة منظمة', en: 'No Organized Follow-up', arD: 'تنسى تتابع عملاء مهتمين وتخسرهم', enD: 'You forget to follow up interested clients and lose them', arS: 'ساري يتابع تلقائياً ويذكرك بالعملاء الساخنين', enS: 'Sari follows up automatically and reminds you of hot leads' },
  ];

  const features = [
    { icon: Home, ar: 'كتالوج العقارات', en: 'Property Catalog', arD: 'عرض العقارات بالصور والأسعار والمواقع', enD: 'Display properties with photos, prices, and locations' },
    { icon: MessageSquare, ar: 'تأهيل العملاء', en: 'Lead Qualification', arD: 'يسأل عن الميزانية والموقع المفضل والمساحة المطلوبة', enD: 'Asks about budget, preferred location, and required area' },
    { icon: Camera, ar: 'إرسال صور ومخططات', en: 'Photos & Floor Plans', arD: 'يرسل صور العقار والمخططات في المحادثة', enD: 'Sends property photos and floor plans in chat' },
    { icon: MapPin, ar: 'موقع على الخريطة', en: 'Map Location', arD: 'يرسل الموقع الدقيق للعقار على Google Maps', enD: 'Sends exact property location on Google Maps' },
    { icon: Calendar, ar: 'حجز المعاينات', en: 'Viewing Booking', arD: 'حجز مواعيد معاينة مع تأكيد وتذكير', enD: 'Book viewing appointments with confirmation and reminders' },
    { icon: Bell, ar: 'تنبيهات العقارات الجديدة', en: 'New Listing Alerts', arD: 'إشعار تلقائي للعملاء عند إضافة عقار يطابق تفضيلاتهم', enD: 'Auto alert to clients when a matching property is added' },
    { icon: Users, ar: 'إدارة العملاء', en: 'Client Management', arD: 'ملف لكل عميل مع تفضيلاته وتاريخ تواصله', enD: 'Profile for each client with preferences and communication history' },
    { icon: Key, ar: 'متابعة تلقائية', en: 'Auto Follow-up', arD: 'يتابع العملاء المهتمين بعد المعاينة', enD: 'Follows up interested clients after viewing' },
    { icon: BarChart3, ar: 'تقارير الأداء', en: 'Performance Reports', arD: 'عدد الاستفسارات والمعاينات ومعدل الإغلاق', enD: 'Inquiry count, viewings, and closing rate' },
  ];

  const testimonials = [
    { name: isAr ? 'مكتب الريادة العقاري' : 'Reyada Real Estate', role: isAr ? 'وساطة عقارية — الرياض' : 'Real Estate Brokerage — Riyadh', text: isAr ? 'ساري يرد على 80% من الاستفسارات تلقائياً. نركز على العملاء الجادين فقط.' : 'Sari automatically answers 80% of inquiries. We focus only on serious clients.' },
    { name: isAr ? 'عبدالله المالكي' : 'Abdullah Al-Malki', role: isAr ? 'وسيط عقاري مستقل — جدة' : 'Independent Broker — Jeddah', text: isAr ? 'العملاء يتلقون صور العقارات والمواقع فوراً. المعاينات منظمة بشكل ممتاز بفضل ساري.' : 'Clients receive property photos and locations instantly. Viewings are excellently organized thanks to Sari.' },
    { name: isAr ? 'شركة بناء للتطوير' : 'Binaa Development Co.', role: isAr ? 'تطوير عقاري — الدمام' : 'Real Estate Development — Dammam', text: isAr ? 'ساري يتابع كل عميل محتمل تلقائياً. مبيعات الوحدات زادت 35% بعد تفعيله.' : 'Sari follows up every potential client automatically. Unit sales increased 35% after activation.' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead title={isAr ? 'ساري للعقار — مساعد واتساب ذكي للوسطاء العقاريين | Sari AI' : 'Sari for Real Estate — AI WhatsApp Assistant for Brokers | Sari AI'} description={isAr ? 'مساعد عقاري ذكي عبر واتساب. عرض العقارات، تأهيل العملاء، حجز المعاينات، ومتابعة تلقائية — بالذكاء الاصطناعي.' : 'AI real estate assistant via WhatsApp. Property listings, lead qualification, viewing booking, and auto follow-up — powered by AI.'} keywords="واتساب عقار, وسيط عقاري واتساب, real estate WhatsApp bot, عرض عقارات واتساب, حجز معاينة, تسويق عقاري ذكي" canonicalUrl={`${BASE}/solutions/real-estate`} ogType="product" structuredData={schemaData} />
      <Navbar />

      <section className="relative overflow-hidden bg-gradient-to-b from-slate-100 via-gray-50/30 to-white dark:from-slate-900/40 dark:via-gray-900 dark:to-background py-20 md:py-28">
        <div className="container relative"><div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium"><Building2 className="w-4 h-4" /><span>{isAr ? 'مصمم للقطاع العقاري' : 'Designed for Real Estate'}</span></div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight"><span className="text-slate-700 dark:text-slate-300">{isAr ? 'ساري للعقار' : 'Sari for Real Estate'}</span><br />{isAr ? 'مساعد واتساب ذكي للوسطاء' : 'AI WhatsApp Assistant for Brokers'}</h1>
          <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">{isAr ? 'العملاء يسألون عن العقارات عبر واتساب. ساري يفهم احتياجهم، يعرض العقارات المناسبة بالصور، ويحجز المعاينة — تلقائياً.' : 'Clients inquire about properties via WhatsApp. Sari understands their needs, shows suitable properties with photos, and books viewings — automatically.'}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup"><a><Button size="lg" className="w-full sm:w-auto bg-slate-800 hover:bg-slate-900 text-lg h-14 px-8 shadow-lg">{isAr ? 'فعّل ساري لعقارك' : 'Activate Sari for Real Estate'}<Sparkles className="ms-2 w-5 h-5" /></Button></a></Link>
            <Link href="/try-sari"><a><Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">{isAr ? 'جرّب مجاناً' : 'Try Free'}</Button></a></Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 max-w-2xl mx-auto">
            {[{ v: '80%', ar: 'رد تلقائي', en: 'Auto Response' }, { v: '35%', ar: 'زيادة المبيعات', en: 'Sales Increase' }, { v: '24/7', ar: 'متاح للعملاء', en: 'Available to Clients' }, { v: '<10s', ar: 'وقت الرد', en: 'Response Time' }].map(s => (<div key={s.v} className="text-center"><div className="text-3xl font-bold text-slate-700 dark:text-slate-300">{s.v}</div><div className="text-sm text-muted-foreground">{isAr ? s.ar : s.en}</div></div>))}
          </div>
        </div></div>
      </section>

      <section className="py-20 bg-white dark:bg-background"><div className="container max-w-5xl"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'تحديات العقار التي يحلها ساري' : 'Real Estate Challenges Sari Solves'}</h2><div className="grid md:grid-cols-2 gap-8">{painPoints.map((p, i) => (<div key={i} className="rounded-2xl border-2 p-6 hover:border-slate-400 transition-all"><div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><p.icon className="w-5 h-5 text-red-600" /></div><h3 className="text-lg font-bold">{isAr ? p.ar : p.en}</h3></div><p className="text-muted-foreground text-sm mb-3">{isAr ? p.arD : p.enD}</p><div className="flex items-center gap-2 text-slate-700 text-sm font-medium"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /><span>{isAr ? p.arS : p.enS}</span></div></div>))}</div></div></section>

      <section className="py-20 bg-muted/30"><div className="container"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'مزايا ساري للقطاع العقاري' : 'Sari Features for Real Estate'}</h2><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">{features.map((f, i) => (<Card key={i} className="border-2 hover:border-slate-500 transition-all hover:shadow-lg group"><CardContent className="p-6"><div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><f.icon className="w-6 h-6 text-slate-700 dark:text-slate-300" /></div><h3 className="text-lg font-bold mb-2">{isAr ? f.ar : f.en}</h3><p className="text-muted-foreground text-sm">{isAr ? f.arD : f.enD}</p></CardContent></Card>))}</div></div></section>

      <section className="py-20 bg-white dark:bg-background"><div className="container"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'عقاريون يثقون بساري' : 'Real Estate Pros Trust Sari'}</h2><div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">{testimonials.map((t, i) => (<Card key={i} className="border-2"><CardContent className="p-6"><div className="flex gap-1 mb-3">{[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}</div><p className="text-muted-foreground mb-4 text-sm">{t.text}</p><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">{t.role}</div></CardContent></Card>))}</div></div></section>

      // @ts-ignore
      <section className="py-20 bg-muted/30"><div className="container max-w-4xl"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'أسئلة شائعة' : 'FAQ'}</h2><div className="space-y-4">{schemaData["@graph"][1].mainEntity.map((q: any, i: number) => (<Card key={i} className="border"><CardContent className="p-6"><h3 className="font-bold mb-2">{q.name}</h3><p className="text-muted-foreground text-sm">{q.acceptedAnswer.text}</p></CardContent></Card>))}</div></div></section>

      <section className="py-20 bg-slate-800 text-white"><div className="container text-center"><h2 className="text-3xl md:text-5xl font-bold mb-4">{isAr ? 'فعّل ساري لعقارك الآن' : 'Activate Sari for Real Estate Now'}</h2><p className="text-xl mb-8 opacity-90">{isAr ? 'مجاناً — بدون بطاقة ائتمان' : 'Free — no credit card required'}</p><Link href="/signup"><a><Button size="lg" variant="secondary" className="text-lg h-14 px-8">{isAr ? 'ابدأ مجاناً' : 'Start Free'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link></div></section>
      <Footer />
    </div>
  );
}