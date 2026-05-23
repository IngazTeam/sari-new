// @ts-nocheck
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  Briefcase, ArrowRight, Star, Sparkles, Clock, Shield, Calendar,
  MessageSquare, Users, Bell, CreditCard, BarChart3, CheckCircle2,
  FileText, Phone, Zap, UserCheck, Scale, Video, Globe,
} from 'lucide-react';

const BASE = 'https://sary.live';
const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "SoftwareApplication", "name": "ساري للاستشارات - مساعد واتساب ذكي للمستشارين", "applicationCategory": "BusinessApplication", "url": `${BASE}/solutions/consultants`, "description": "مساعد ذكي للمستشارين والمحامين والمكاتب المهنية عبر واتساب. حجز استشارات، دفع إلكتروني، وإدارة العملاء — بالذكاء الاصطناعي.", "offers": { "@type": "Offer", "price": "0", "priceCurrency": "SAR" } },
    { "@type": "FAQPage", "mainEntity": [
      { "@type": "Question", "name": "كيف يساعد ساري المستشارين؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري يستقبل طلبات الاستشارة عبر واتساب، يعرض الخدمات والأسعار، يحجز الموعد، يقبض الرسوم مقدماً، ويرسل تذكير قبل الجلسة. يوفر على المستشار وقت الإدارة ليركز على العملاء." }},
      { "@type": "Question", "name": "هل يدعم الاستشارات الأونلاين والحضورية؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يدعم الاستشارات عن بعد (زوم/تيمز) والحضورية. يرسل رابط الاجتماع أو عنوان المكتب تلقائياً حسب نوع الجلسة." }},
      { "@type": "Question", "name": "هل يمكن تحصيل الرسوم مقدماً؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يرسل رابط دفع آمن لتحصيل رسوم الاستشارة مقدماً. هذا يضمن جدية العميل ويقلل الإلغاءات بنسبة 90%." }},
      { "@type": "Question", "name": "هل يناسب المحامين والمكاتب القانونية؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري مناسب للمحامين والمستشارين الماليين والإداريين. يحافظ على سرية البيانات ويدير المواعيد والمتابعات باحترافية." }},
      { "@type": "Question", "name": "هل يمكن تخصيص أنواع الاستشارات؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، يمكنك تحديد أنواع الخدمات (استشارة أولية، متابعة، جلسة كاملة)، مدة كل نوع، وسعره. ساري يعرضها للعميل ويحجز حسب الاختيار." }},
    ]},
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": BASE },
      { "@type": "ListItem", "position": 2, "name": "الاستشارات", "item": `${BASE}/solutions/consultants` },
    ]}
  ]
};

export default function Consultants() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || 'ar') === 'ar';

  const painPoints = [
    { icon: Phone, ar: 'مكالمات تقاطع العمل', en: 'Calls Interrupt Work', arD: 'مكالمات حجز وأسئلة تقاطع جلساتك مع العملاء', enD: 'Booking calls and questions interrupt your client sessions', arS: 'ساري يرد ويحجز عبر واتساب — تركز أنت على عملائك', enS: 'Sari responds and books via WhatsApp — you focus on clients' },
    { icon: CreditCard, ar: 'عملاء لا يدفعون', en: 'Clients Don\'t Pay', arD: 'عملاء يحجزون ولا يحضرون ولا يدفعون', enD: 'Clients book but don\'t show up and don\'t pay', arS: 'دفع مقدم إلزامي يضمن جدية العميل', enS: 'Mandatory advance payment ensures client seriousness' },
    { icon: Calendar, ar: 'جدول فوضوي', en: 'Chaotic Schedule', arD: 'مواعيد متداخلة وصعوبة في تنظيم الأسبوع', enD: 'Overlapping appointments and difficulty organizing the week', arS: 'نظام ذكي يمنع التعارضات ويحسن توزيع الوقت', enS: 'Smart system prevents conflicts and optimizes time distribution' },
    { icon: Users, ar: 'لا متابعة بعد الجلسة', en: 'No Post-Session Follow-up', arD: 'تنسى تتابع العملاء بعد الاستشارة', enD: 'You forget to follow up with clients after consultation', arS: 'ساري يتابع تلقائياً ويسأل عن الحاجة لجلسة أخرى', enS: 'Sari auto follows up and asks about need for another session' },
  ];

  const features = [
    { icon: FileText, ar: 'قائمة الخدمات', en: 'Service Menu', arD: 'عرض أنواع الاستشارات والأسعار والمدة', enD: 'Display consultation types, prices, and duration' },
    { icon: Calendar, ar: 'حجز ذكي', en: 'Smart Booking', arD: 'العميل يحجز بالمحادثة مع اختيار نوع الجلسة', enD: 'Client books via chat choosing session type' },
    { icon: CreditCard, ar: 'دفع مقدم', en: 'Advance Payment', arD: 'رابط دفع آمن قبل تأكيد الحجز', enD: 'Secure payment link before booking confirmation' },
    { icon: Video, ar: 'جلسات أونلاين', en: 'Online Sessions', arD: 'إرسال روابط زوم/تيمز تلقائياً قبل الجلسة', enD: 'Auto-send Zoom/Teams links before session' },
    { icon: Bell, ar: 'تذكيرات', en: 'Reminders', arD: 'تذكير العميل والمستشار قبل كل جلسة', enD: 'Remind both client and consultant before each session' },
    { icon: UserCheck, ar: 'ملف العميل', en: 'Client Profile', arD: 'تاريخ الجلسات والملاحظات لكل عميل', enD: 'Session history and notes for each client' },
    { icon: Globe, ar: 'متعدد اللغات', en: 'Multilingual', arD: 'رد بالعربية والإنجليزية حسب لغة العميل', enD: 'Respond in Arabic or English based on client language' },
    { icon: Shield, ar: 'سرية تامة', en: 'Full Confidentiality', arD: 'تشفير متقدم وحماية بيانات العملاء', enD: 'Advanced encryption and client data protection' },
    { icon: BarChart3, ar: 'تقارير مالية', en: 'Financial Reports', arD: 'إيرادات الشهر وعدد الجلسات ومعدل الإلغاء', enD: 'Monthly revenue, session count, and cancellation rate' },
  ];

  const testimonials = [
    { name: isAr ? 'المحامي فهد العتيبي' : 'Lawyer Fahd Al-Otaibi', role: isAr ? 'مكتب محاماة — الرياض' : 'Law Firm — Riyadh', text: isAr ? 'ساري حل مشكلة المواعيد تماماً. الدفع المقدم قلل الإلغاءات بشكل كبير والعملاء يحبون سهولة الحجز.' : 'Sari completely solved the appointment problem. Advance payment significantly reduced cancellations and clients love the booking ease.' },
    { name: isAr ? 'د. منى الشهراني' : 'Dr. Mona Al-Shahrani', role: isAr ? 'مستشارة إدارية — جدة' : 'Management Consultant — Jeddah', text: isAr ? 'أدير استشاراتي أونلاين وحضورياً وساري ينظم كل شيء. روابط الزوم تُرسل تلقائياً وأنا أركز على عملي.' : 'I manage consultations online and in-person and Sari organizes everything. Zoom links are sent automatically and I focus on my work.' },
    { name: isAr ? 'مكتب رؤية للاستشارات' : 'Rooya Consulting', role: isAr ? 'استشارات مالية — الدمام' : 'Financial Consulting — Dammam', text: isAr ? 'فريقنا من 4 مستشارين وساري يدير جداولهم بدون أي تعارض. التقارير المالية ممتازة.' : 'Our team of 4 consultants and Sari manages their schedules without any conflicts. Financial reports are excellent.' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead title={isAr ? 'ساري للاستشارات — حجز وإدارة استشارات عبر واتساب | Sari AI' : 'Sari for Consultants — Consultation Booking & Management via WhatsApp | Sari AI'} description={isAr ? 'مساعد ذكي للمستشارين والمحامين عبر واتساب. حجز استشارات، دفع مقدم، تذكيرات، ومتابعة عملاء — بالذكاء الاصطناعي.' : 'AI assistant for consultants and lawyers via WhatsApp. Consultation booking, advance payment, reminders, and client follow-up — powered by AI.'} keywords="حجز استشارة واتساب, مستشار واتساب, consultant WhatsApp booking, محامي واتساب, consultation management AI" canonicalUrl={`${BASE}/solutions/consultants`} ogType="product" structuredData={schemaData} />
      <Navbar />

      <section className="relative overflow-hidden bg-gradient-to-b from-violet-50 via-purple-50/30 to-white dark:from-violet-950/20 dark:via-gray-900 dark:to-background py-20 md:py-28">
        <div className="container relative"><div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-sm font-medium"><Briefcase className="w-4 h-4" /><span>{isAr ? 'مصمم للمستشارين والمهنيين' : 'Designed for Consultants & Professionals'}</span></div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight"><span className="text-violet-600 dark:text-violet-400">{isAr ? 'ساري للاستشارات' : 'Sari for Consultants'}</span><br />{isAr ? 'حجز وإدارة استشارات عبر واتساب' : 'Consultation Management via WhatsApp'}</h1>
          <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">{isAr ? 'عملاؤك يحجزون استشاراتهم ويدفعون عبر واتساب. ساري يدير جدولك، يذكّر عملاءك، ويتابعهم بعد الجلسة — تلقائياً.' : 'Your clients book consultations and pay via WhatsApp. Sari manages your schedule, reminds clients, and follows up after sessions — automatically.'}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup"><a><Button size="lg" className="w-full sm:w-auto bg-violet-600 hover:bg-violet-700 text-lg h-14 px-8 shadow-lg">{isAr ? 'فعّل ساري لاستشاراتك' : 'Activate Sari for Consulting'}<Sparkles className="ms-2 w-5 h-5" /></Button></a></Link>
            <Link href="/try-sari"><a><Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">{isAr ? 'جرّب مجاناً' : 'Try Free'}</Button></a></Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 max-w-2xl mx-auto">
            {[{ v: '90%', ar: 'تقليل الإلغاءات', en: 'Cancellation Reduction' }, { v: '100%', ar: 'تحصيل مقدم', en: 'Advance Collection' }, { v: '24/7', ar: 'حجز متاح', en: 'Booking Available' }, { v: '5min', ar: 'تفعيل سريع', en: 'Quick Setup' }].map(s => (<div key={s.v} className="text-center"><div className="text-3xl font-bold text-violet-600">{s.v}</div><div className="text-sm text-muted-foreground">{isAr ? s.ar : s.en}</div></div>))}
          </div>
        </div></div>
      </section>

      <section className="py-20 bg-white dark:bg-background"><div className="container max-w-5xl"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'تحديات المستشارين التي يحلها ساري' : 'Consultant Challenges Sari Solves'}</h2><div className="grid md:grid-cols-2 gap-8">{painPoints.map((p, i) => (<div key={i} className="rounded-2xl border-2 p-6 hover:border-violet-400 transition-all"><div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><p.icon className="w-5 h-5 text-red-600" /></div><h3 className="text-lg font-bold">{isAr ? p.ar : p.en}</h3></div><p className="text-muted-foreground text-sm mb-3">{isAr ? p.arD : p.enD}</p><div className="flex items-center gap-2 text-violet-600 text-sm font-medium"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /><span>{isAr ? p.arS : p.enS}</span></div></div>))}</div></div></section>

      <section className="py-20 bg-muted/30"><div className="container"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'مزايا ساري للمستشارين' : 'Sari Features for Consultants'}</h2><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">{features.map((f, i) => (<Card key={i} className="border-2 hover:border-violet-500 transition-all hover:shadow-lg group"><CardContent className="p-6"><div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><f.icon className="w-6 h-6 text-violet-600" /></div><h3 className="text-lg font-bold mb-2">{isAr ? f.ar : f.en}</h3><p className="text-muted-foreground text-sm">{isAr ? f.arD : f.enD}</p></CardContent></Card>))}</div></div></section>

      <section className="py-20 bg-white dark:bg-background"><div className="container"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'مستشارون يثقون بساري' : 'Consultants Trust Sari'}</h2><div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">{testimonials.map((t, i) => (<Card key={i} className="border-2"><CardContent className="p-6"><div className="flex gap-1 mb-3">{[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}</div><p className="text-muted-foreground mb-4 text-sm">{t.text}</p><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">{t.role}</div></CardContent></Card>))}</div></div></section>

      // @ts-ignore
      <section className="py-20 bg-muted/30"><div className="container max-w-4xl"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'أسئلة شائعة' : 'FAQ'}</h2><div className="space-y-4">{schemaData["@graph"][1].mainEntity.map((q: any, i: number) => (<Card key={i} className="border"><CardContent className="p-6"><h3 className="font-bold mb-2">{q.name}</h3><p className="text-muted-foreground text-sm">{q.acceptedAnswer.text}</p></CardContent></Card>))}</div></div></section>

      <section className="py-20 bg-violet-600 text-white"><div className="container text-center"><h2 className="text-3xl md:text-5xl font-bold mb-4">{isAr ? 'فعّل ساري لاستشاراتك الآن' : 'Activate Sari for Consulting Now'}</h2><p className="text-xl mb-8 opacity-90">{isAr ? 'مجاناً — بدون بطاقة ائتمان' : 'Free — no credit card required'}</p><Link href="/signup"><a><Button size="lg" variant="secondary" className="text-lg h-14 px-8">{isAr ? 'ابدأ مجاناً' : 'Start Free'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link></div></section>
      <Footer />
    </div>
  );
}