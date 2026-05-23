// @ts-nocheck
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  Stethoscope, ArrowRight, Star, Sparkles, Clock, Shield, Calendar,
  MessageSquare, Users, Bell, CreditCard, BarChart3, CheckCircle2,
  Heart, Brain, ClipboardList, Phone, UserCheck, FileText, Zap,
} from 'lucide-react';

const BASE = 'https://sary.live';

const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "ساري للعيادات - مساعد واتساب ذكي للقطاع الطبي",
      "alternateName": "Sari for Clinics - AI WhatsApp Assistant for Healthcare",
      "applicationCategory": "HealthApplication",
      "operatingSystem": "Web",
      "url": `${BASE}/solutions/clinics`,
      "description": "مساعد ذكي بالذكاء الاصطناعي مصمم خصيصاً للعيادات والمراكز الطبية. حجز مواعيد، تذكيرات، استفسارات المرضى، وإدارة الجدول عبر واتساب.",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "SAR" },
      "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.8", "ratingCount": "320" },
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "كيف يساعد ساري العيادات في إدارة المواعيد؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري يستقبل طلبات الحجز عبر واتساب، يعرض الأوقات المتاحة لكل طبيب، يؤكد الحجز فوراً، ويرسل تذكيرات تلقائية قبل الموعد. هذا يقلل عدم الحضور بنسبة 85%." }},
        { "@type": "Question", "name": "هل يمكن لساري الرد على الاستفسارات الطبية؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري لا يقدم استشارات طبية، لكنه يجيب على الأسئلة العامة مثل ساعات العمل، التخصصات المتوفرة، الأسعار، التأمينات المقبولة، وتعليمات ما قبل الزيارة." }},
        { "@type": "Question", "name": "هل يدعم ساري عدة أطباء في نفس العيادة؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يدير جداول عدة أطباء ومختصين. يعرض للمريض التخصصات المتاحة ويوجهه للطبيب المناسب بناءً على حالته." }},
        { "@type": "Question", "name": "هل بيانات المرضى آمنة مع ساري؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يستخدم تشفير متقدم ولا يخزن أي بيانات طبية حساسة. كل البيانات محمية وفقاً لمعايير حماية البيانات الصحية." }},
        { "@type": "Question", "name": "هل يمكن ربط ساري مع نظام العيادة الحالي؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري يعمل كنظام مستقل لإدارة المواعيد والتواصل مع المرضى عبر واتساب. يمكن تصدير البيانات بسهولة لنظامك الحالي." }},
      ]
    },
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": BASE },
      { "@type": "ListItem", "position": 2, "name": "الحلول", "item": `${BASE}/solutions/sales` },
      { "@type": "ListItem", "position": 3, "name": "العيادات", "item": `${BASE}/solutions/clinics` },
    ]}
  ]
};

export default function Clinics() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || 'ar') === 'ar';

  const painPoints = [
    { icon: Phone, ar: 'مكالمات لا تنتهي', en: 'Endless Phone Calls', arD: 'الموظفات يقضين ساعات في الرد على المكالمات بدل خدمة المرضى', enD: 'Staff spend hours answering calls instead of serving patients', arSolution: 'ساري يرد على واتساب فوراً — المكالمات تنخفض 70%', enSolution: 'Sari replies on WhatsApp instantly — calls drop by 70%' },
    { icon: Calendar, ar: 'مواعيد ضائعة', en: 'Missed Appointments', arD: 'المرضى ينسون مواعيدهم وتضيع فترات على الأطباء', enD: 'Patients forget appointments and doctors lose time slots', arSolution: 'تذكيرات تلقائية تقلل عدم الحضور 85%', enSolution: 'Auto reminders reduce no-shows by 85%' },
    { icon: Clock, ar: 'حجز خارج الدوام مستحيل', en: 'No After-Hours Booking', arD: 'المرضى يريدون الحجز مساءً لكن العيادة مغلقة', enD: 'Patients want to book at night but clinic is closed', arSolution: 'ساري يحجز 24/7 — حتى في الإجازات والعطل', enSolution: 'Sari books 24/7 — even on holidays and weekends' },
    { icon: ClipboardList, ar: 'فوضى الجدول', en: 'Schedule Chaos', arD: 'تعارض مواعيد وحجوزات مكررة وإدارة يدوية مرهقة', enD: 'Conflicting appointments, double bookings, exhausting manual management', arSolution: 'نظام ذكي يمنع التعارضات تلقائياً ويوزع بذكاء', enSolution: 'Smart system prevents conflicts automatically and distributes intelligently' },
  ];

  const features = [
    { icon: Calendar, ar: 'حجز مواعيد ذكي', en: 'Smart Appointment Booking', arD: 'المريض يحجز بمحادثة طبيعية عبر واتساب', enD: 'Patient books with natural WhatsApp conversation' },
    { icon: Users, ar: 'إدارة أطباء متعددين', en: 'Multi-Doctor Management', arD: 'جداول منفصلة لكل طبيب مع توزيع ذكي', enD: 'Separate schedules per doctor with smart distribution' },
    { icon: Bell, ar: 'تذكيرات تلقائية', en: 'Auto Reminders', arD: 'تذكير قبل 24 ساعة وساعة من الموعد', enD: 'Reminders 24 hours and 1 hour before appointment' },
    { icon: MessageSquare, ar: 'رد على الاستفسارات', en: 'Answer Inquiries', arD: 'أوقات العمل، الأسعار، التأمينات، والتخصصات', enD: 'Working hours, prices, insurance, and specialties' },
    { icon: CreditCard, ar: 'دفع مقدم / عربون', en: 'Advance Payment', arD: 'رابط دفع آمن لتأكيد الحجز وتقليل الإلغاءات', enD: 'Secure payment link to confirm booking and reduce cancellations' },
    { icon: FileText, ar: 'تعليمات ما قبل الزيارة', en: 'Pre-Visit Instructions', arD: 'إرسال تعليمات التحضير تلقائياً حسب نوع الزيارة', enD: 'Auto-send preparation instructions based on visit type' },
    { icon: UserCheck, ar: 'ملف المريض', en: 'Patient Profile', arD: 'يتذكر بيانات المريض للزيارات القادمة', enD: 'Remembers patient data for future visits' },
    { icon: BarChart3, ar: 'تقارير وإحصائيات', en: 'Reports & Analytics', arD: 'تقارير عن الحجوزات وأوقات الذروة والإلغاءات', enD: 'Reports on bookings, peak times, and cancellations' },
    { icon: Shield, ar: 'خصوصية وأمان', en: 'Privacy & Security', arD: 'تشفير متقدم وحماية بيانات المرضى', enD: 'Advanced encryption and patient data protection' },
  ];

  const useCases = [
    { ar: 'مريض يسأل: "أبغى أحجز عند دكتور أسنان يوم السبت"', en: 'Patient asks: "I want to book with a dentist on Saturday"', arR: 'ساري يعرض الأوقات المتاحة، المريض يختار، يتم تأكيد الحجز + تذكير تلقائي', enR: 'Sari shows available times, patient chooses, booking confirmed + auto reminder' },
    { ar: 'مريض يسأل: "كم سعر الكشف؟ وهل تقبلون تأمين بوبا؟"', en: 'Patient asks: "How much is a consultation? Do you accept Bupa insurance?"', arR: 'ساري يرد بالأسعار والتأمينات المقبولة ويعرض الحجز مباشرة', enR: 'Sari responds with prices and accepted insurance, offers booking directly' },
    { ar: 'مريض يريد إلغاء موعده', en: 'Patient wants to cancel appointment', arR: 'ساري يلغي الموعد ويعرض إعادة الجدولة فوراً — الفترة تتاح لمريض آخر', enR: 'Sari cancels and offers rescheduling — slot becomes available for another patient' },
  ];

  const testimonials = [
    { name: isAr ? 'د. خالد المطيري' : 'Dr. Khalid Al-Mutairi', role: isAr ? 'طبيب أسنان — الرياض' : 'Dentist — Riyadh', text: isAr ? 'ساري وفّر علينا موظفة استقبال كاملة. المرضى يحجزون عبر الواتساب ليلاً ونهاراً والمواعيد منظمة بشكل ممتاز.' : 'Sari saved us a full receptionist. Patients book via WhatsApp day and night and appointments are perfectly organized.' },
    { name: isAr ? 'د. نورة الحربي' : 'Dr. Noura Al-Harbi', role: isAr ? 'طبيبة جلدية — جدة' : 'Dermatologist — Jeddah', text: isAr ? 'عدم الحضور انخفض بشكل كبير بعد التذكيرات التلقائية. ساري يرد على الأسئلة المتكررة ويوفر وقتنا.' : 'No-shows dropped significantly after auto reminders. Sari answers repetitive questions and saves our time.' },
    { name: isAr ? 'مركز الشفاء الطبي' : 'Al-Shifa Medical Center', role: isAr ? 'مركز طبي متعدد التخصصات — الدمام' : 'Multi-specialty Medical Center — Dammam', text: isAr ? 'ساري يدير حجوزات 8 أطباء بدون أي تعارض. الأثر كان واضح من أول أسبوع — تقليل المكالمات بنسبة 60%.' : 'Sari manages bookings for 8 doctors without any conflicts. Impact was clear from the first week — 60% call reduction.' },
  ];

  const stats = [
    { value: '85%', ar: 'تقليل عدم الحضور', en: 'No-Show Reduction' },
    { value: '70%', ar: 'انخفاض المكالمات', en: 'Call Reduction' },
    { value: '24/7', ar: 'حجز متاح دائماً', en: 'Always-On Booking' },
    { value: '<10s', ar: 'وقت تأكيد الحجز', en: 'Booking Confirmation' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead
        title={isAr ? 'ساري للعيادات — مساعد واتساب ذكي للقطاع الطبي | Sari AI' : 'Sari for Clinics — AI WhatsApp Assistant for Healthcare | Sari AI'}
        description={isAr
          ? 'مساعد ذكي للعيادات والمراكز الطبية عبر واتساب. حجز مواعيد، تذكيرات تلقائية، رد على استفسارات المرضى، وإدارة جداول الأطباء — بالذكاء الاصطناعي.'
          : 'AI assistant for clinics and medical centers via WhatsApp. Appointment booking, auto reminders, patient inquiry responses, and doctor schedule management — powered by AI.'}
        keywords="واتساب عيادات, حجز مواعيد عيادة واتساب, بوت طبي واتساب, AI clinic WhatsApp, medical appointment booking, تذكير مواعيد, clinic automation Saudi"
        canonicalUrl={`${BASE}/solutions/clinics`}
        ogType="product"
        structuredData={schemaData}
      />
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-teal-50 via-cyan-50/30 to-white dark:from-teal-950/20 dark:via-gray-900 dark:to-background py-20 md:py-28">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] dark:bg-grid-slate-700/25" />
        <div className="container relative">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-sm font-medium">
              <Stethoscope className="w-4 h-4" />
              <span>{isAr ? 'مصمم خصيصاً للقطاع الطبي' : 'Designed Specifically for Healthcare'}</span>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight">
              <span className="text-teal-600 dark:text-teal-400">{isAr ? 'ساري للعيادات' : 'Sari for Clinics'}</span>
              <br />{isAr ? 'مساعد واتساب ذكي للقطاع الطبي' : 'AI WhatsApp Healthcare Assistant'}
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              {isAr
                ? 'مرضاك يحجزون مواعيدهم عبر واتساب، يتلقون تذكيرات تلقائية، ويحصلون على إجابات فورية — بدون ما تشغّل موظف إضافي.'
                : 'Your patients book appointments via WhatsApp, receive auto reminders, and get instant answers — without hiring extra staff.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup"><a><Button size="lg" className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-lg h-14 px-8 shadow-lg">{isAr ? 'فعّل ساري لعيادتك' : 'Activate Sari for Your Clinic'}<Sparkles className="ms-2 w-5 h-5" /></Button></a></Link>
              <Link href="/try-sari"><a><Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">{isAr ? 'جرّب مجاناً' : 'Try Free'}</Button></a></Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 max-w-2xl mx-auto">
              {stats.map(s => (<div key={s.value} className="text-center"><div className="text-3xl font-bold text-teal-600">{s.value}</div><div className="text-sm text-muted-foreground">{isAr ? s.ar : s.en}</div></div>))}
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container max-w-5xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-4">{isAr ? 'مشاكل العيادات التي يحلها ساري' : 'Clinic Problems Sari Solves'}</h2>
          <p className="text-xl text-muted-foreground text-center mb-16 max-w-3xl mx-auto">{isAr ? 'كل يوم تخسر عيادتك مرضى ووقت بسبب هذه المشاكل' : 'Every day your clinic loses patients and time due to these problems'}</p>
          <div className="grid md:grid-cols-2 gap-8">
            {painPoints.map((p, i) => (
              <div key={i} className="rounded-2xl border-2 p-6 hover:border-teal-400 transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><p.icon className="w-5 h-5 text-red-600" /></div>
                  <h3 className="text-lg font-bold">{isAr ? p.ar : p.en}</h3>
                </div>
                <p className="text-muted-foreground text-sm mb-3">{isAr ? p.arD : p.enD}</p>
                <div className="flex items-center gap-2 text-teal-600 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{isAr ? p.arSolution : p.enSolution}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20 bg-muted/30">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'سيناريوهات حقيقية من العيادات' : 'Real Clinic Scenarios'}</h2>
          <div className="space-y-8">
            {useCases.map((u, i) => (
              <div key={i} className="rounded-2xl border bg-card p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0"><MessageSquare className="w-5 h-5 text-blue-600" /></div>
                  <div><p className="font-semibold text-sm text-blue-600">{isAr ? 'المريض:' : 'Patient:'}</p><p className="text-foreground italic">"{isAr ? u.ar : u.en}"</p></div>
                </div>
                <div className="flex items-start gap-4 mr-6 md:mr-14">
                  <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0"><Zap className="w-5 h-5 text-teal-600" /></div>
                  <div><p className="font-semibold text-sm text-teal-600">{isAr ? 'ساري:' : 'Sari:'}</p><p className="text-muted-foreground">{isAr ? u.arR : u.enR}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-4">{isAr ? 'مزايا ساري للقطاع الطبي' : 'Sari Features for Healthcare'}</h2>
          <p className="text-xl text-muted-foreground text-center mb-16">{isAr ? '9 قدرات مصممة خصيصاً للعيادات والمراكز الطبية' : '9 capabilities designed specifically for clinics and medical centers'}</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <Card key={i} className="border-2 hover:border-teal-500 transition-all hover:shadow-lg group">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><f.icon className="w-6 h-6 text-teal-600" /></div>
                  <h3 className="text-lg font-bold mb-2">{isAr ? f.ar : f.en}</h3>
                  <p className="text-muted-foreground text-sm">{isAr ? f.arD : f.enD}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'ماذا يقول أطباؤنا؟' : 'What Our Doctors Say'}</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {testimonials.map((t, i) => (
              <Card key={i} className="border-2"><CardContent className="p-6">
                <div className="flex gap-1 mb-3">{[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}</div>
                <p className="text-muted-foreground mb-4 text-sm">{t.text}</p>
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.role}</div>
              </CardContent></Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'أسئلة شائعة — العيادات' : 'FAQ — Clinics'}</h2>
          <div className="space-y-4">
            // @ts-ignore
            {schemaData["@graph"][1].mainEntity.map((q: any, i: number) => (
              <Card key={i} className="border"><CardContent className="p-6"><h3 className="font-bold mb-2">{q.name}</h3><p className="text-muted-foreground text-sm">{q.acceptedAnswer.text}</p></CardContent></Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-teal-600 text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">{isAr ? 'فعّل ساري لعيادتك الآن' : 'Activate Sari for Your Clinic Now'}</h2>
          <p className="text-xl mb-8 opacity-90">{isAr ? 'مجاناً — بدون بطاقة ائتمان — تفعيل خلال 5 دقائق' : 'Free — no credit card — activate in 5 minutes'}</p>
          <Link href="/signup"><a><Button size="lg" variant="secondary" className="text-lg h-14 px-8">{isAr ? 'ابدأ مجاناً الآن' : 'Start Free Now'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}