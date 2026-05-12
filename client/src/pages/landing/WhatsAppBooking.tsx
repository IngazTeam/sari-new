import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  Calendar, ArrowRight, Star, Sparkles, Clock, Users, Bell,
  CheckCircle2, Shield, Smartphone, CreditCard, BarChart3, Repeat, MapPin,
} from 'lucide-react';

const BASE = 'https://sary.live';
const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication", "name": "ساري - حجز مواعيد واتساب", "applicationCategory": "BusinessApplication",
      "url": `${BASE}/whatsapp-booking-system`,
      "description": "نظام حجز مواعيد عبر واتساب بالذكاء الاصطناعي. يحجز المواعيد، يرسل التذكيرات، ويدير الجدول تلقائياً.",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "SAR" },
    },
    {
      "@type": "FAQPage", "mainEntity": [
        { "@type": "Question", "name": "كيف يعمل الحجز عبر واتساب؟", "acceptedAnswer": { "@type": "Answer", "text": "العميل يراسل رقمك على واتساب ويطلب حجز موعد. ساري يعرض الأوقات المتاحة، العميل يختار، ويتم تأكيد الحجز وإرسال تذكير تلقائياً." }},
        { "@type": "Question", "name": "هل يدعم حجز متعدد الموظفين؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، يمكنك إضافة عدة موظفين/أطباء/مختصين، وساري يعرض جدول كل واحد منهم ويوزع الحجوزات بذكاء." }},
        { "@type": "Question", "name": "هل يرسل تذكيرات تلقائية؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يرسل تذكيرات قبل الموعد بـ 24 ساعة وساعة واحدة عبر واتساب تلقائياً. يمكنك تخصيص التوقيت." }},
        { "@type": "Question", "name": "هل يدعم الدفع المقدم؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، يمكنك طلب دفع مقدم كامل أو عربون. ساري يرسل رابط الدفع تلقائياً عند تأكيد الحجز." }},
        { "@type": "Question", "name": "ما هي القطاعات المناسبة؟", "acceptedAnswer": { "@type": "Answer", "text": "العيادات، صالونات التجميل، مراكز التدريب، الاستشارات، المطاعم (حجز طاولات)، والخدمات المهنية عموماً." }},
      ]
    },
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": BASE },
      { "@type": "ListItem", "position": 2, "name": "حجز واتساب", "item": `${BASE}/whatsapp-booking-system` },
    ]}
  ]
};

export default function WhatsAppBooking() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || 'ar') === 'ar';

  const features = [
    { icon: Calendar, ar: 'حجز مواعيد ذكي', en: 'Smart Appointment Booking', arD: 'العميل يحجز بالكلام العادي وساري يفهم التاريخ والوقت', enD: 'Customer books in natural language and Sari understands date & time' },
    { icon: Users, ar: 'جدولة متعددة الموظفين', en: 'Multi-Staff Scheduling', arD: 'إدارة جداول عدة موظفين/أطباء بذكاء', enD: 'Manage schedules for multiple staff/doctors intelligently' },
    { icon: Bell, ar: 'تذكيرات تلقائية', en: 'Auto Reminders', arD: 'رسائل تذكير قبل الموعد لتقليل عدم الحضور', enD: 'Reminder messages before appointment to reduce no-shows' },
    { icon: CreditCard, ar: 'دفع مقدم / عربون', en: 'Advance Payment / Deposit', arD: 'اطلب دفع مقدم لتأكيد الحجز', enD: 'Request advance payment to confirm booking' },
    { icon: Repeat, ar: 'حجوزات متكررة', en: 'Recurring Bookings', arD: 'جدولة مواعيد أسبوعية أو شهرية تلقائياً', enD: 'Schedule weekly or monthly appointments automatically' },
    { icon: Clock, ar: 'متاح 24/7', en: 'Available 24/7', arD: 'العملاء يحجزون في أي وقت بدون انتظار', enD: 'Customers book anytime without waiting' },
    { icon: Shield, ar: 'منع التعارضات', en: 'Conflict Prevention', arD: 'لا حجوزات مكررة — النظام يمنع التعارض تلقائياً', enD: 'No double bookings — system prevents conflicts automatically' },
    { icon: MapPin, ar: 'متعدد الفروع', en: 'Multi-Branch', arD: 'إدارة حجوزات عدة فروع من مكان واحد', enD: 'Manage bookings for multiple branches from one place' },
    { icon: BarChart3, ar: 'تحليلات الحجوزات', en: 'Booking Analytics', arD: 'تقارير عن أوقات الذروة ومعدل الحضور', enD: 'Reports on peak times and attendance rate' },
  ];

  const industries = [
    { ar: '🏥 العيادات والمراكز الطبية', en: '🏥 Clinics & Medical Centers' },
    { ar: '💇 صالونات التجميل والحلاقة', en: '💇 Beauty Salons & Barbershops' },
    { ar: '📚 مراكز التدريب والتعليم', en: '📚 Training & Education Centers' },
    { ar: '🍽️ المطاعم (حجز طاولات)', en: '🍽️ Restaurants (Table Reservations)' },
    { ar: '⚖️ الاستشارات والمحاماة', en: '⚖️ Consulting & Law Firms' },
    { ar: '🏋️ النوادي الرياضية', en: '🏋️ Fitness & Gyms' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead
        title={isAr ? 'حجز مواعيد واتساب بالذكاء الاصطناعي | ساري' : 'AI WhatsApp Booking System | Sari'}
        description={isAr ? 'نظام حجز مواعيد عبر واتساب بالذكاء الاصطناعي. حجز تلقائي، تذكيرات، دفع مقدم، وإدارة جداول — كل شيء عبر واتساب.' : 'AI-powered WhatsApp appointment booking system. Auto booking, reminders, advance payment, and schedule management — all via WhatsApp.'}
        keywords="حجز مواعيد واتساب, booking WhatsApp, حجز عيادات واتساب, حجز صالونات, WhatsApp appointment booking, حجز ذكي"
        canonicalUrl={`${BASE}/whatsapp-booking-system`}
        ogType="product"
        structuredData={schemaData}
      />
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-purple-50 via-violet-50/30 to-white dark:from-purple-950/20 dark:via-gray-900 dark:to-background py-20 md:py-28">
        <div className="container relative">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-sm font-medium">
              <Calendar className="w-4 h-4" />
              <span>{isAr ? 'حجز ذكي عبر واتساب' : 'Smart WhatsApp Booking'}</span>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight">
              <span className="text-purple-600 dark:text-purple-400">{isAr ? 'حجز مواعيد واتساب' : 'WhatsApp Booking'}</span>
              <br />{isAr ? 'بالذكاء الاصطناعي' : 'Powered by AI'}
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              {isAr ? 'عملاؤك يحجزون مواعيدهم عبر واتساب بمحادثة بسيطة. ساري يدير الجدول، يؤكد الحجز، ويرسل التذكيرات — تلقائياً.' : 'Your customers book appointments via WhatsApp with a simple chat. Sari manages the schedule, confirms booking, and sends reminders — automatically.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup"><a><Button size="lg" className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-lg h-14 px-8 shadow-lg">{isAr ? 'فعّل الحجز الذكي' : 'Activate Smart Booking'}<Sparkles className="ms-2 w-5 h-5" /></Button></a></Link>
              <Link href="/try-sari"><a><Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">{isAr ? 'جرّب مجاناً' : 'Try Free'}</Button></a></Link>
            </div>
            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-6 pt-8 max-w-xl mx-auto">
              {[
                { v: '85%', ar: 'تقليل عدم الحضور', en: 'No-Show Reduction' },
                { v: '< 10s', ar: 'وقت الحجز', en: 'Booking Time' },
                { v: '24/7', ar: 'متاح للعملاء', en: 'Available to Clients' },
              ].map(s => (
                <div key={s.v} className="text-center">
                  <div className="text-3xl font-bold text-purple-600">{s.v}</div>
                  <div className="text-sm text-muted-foreground">{isAr ? s.ar : s.en}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="py-16 bg-white dark:bg-background">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">{isAr ? 'مثالي لهذه القطاعات' : 'Perfect for These Industries'}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {industries.map((ind, i) => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-xl border-2 hover:border-purple-400 transition-all bg-card">
                <span className="text-lg font-medium">{isAr ? ind.ar : ind.en}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-4">{isAr ? 'مزايا نظام الحجز الذكي' : 'Smart Booking System Features'}</h2>
          <p className="text-xl text-muted-foreground text-center mb-16">{isAr ? 'كل ما يحتاجه عملك لإدارة المواعيد باحترافية' : 'Everything your business needs for professional appointment management'}</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <Card key={i} className="border-2 hover:border-purple-500 transition-all hover:shadow-lg group">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <f.icon className="w-6 h-6 text-purple-600" />
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

      {/* CTA */}
      <section className="py-20 bg-purple-600 text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">{isAr ? 'فعّل الحجز الذكي عبر واتساب الآن' : 'Activate Smart WhatsApp Booking Now'}</h2>
          <p className="text-xl mb-8 opacity-90">{isAr ? 'مجاناً — بدون بطاقة ائتمان' : 'Free — no credit card required'}</p>
          <Link href="/signup"><a><Button size="lg" variant="secondary" className="text-lg h-14 px-8">{isAr ? 'ابدأ مجاناً' : 'Start Free'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link>
        </div>
      </section>
      <Footer />
    </div>
  );
}
