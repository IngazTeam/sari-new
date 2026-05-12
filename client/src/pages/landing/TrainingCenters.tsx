import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  GraduationCap, ArrowRight, Star, Sparkles, Clock, Shield, Calendar,
  MessageSquare, Users, Bell, CreditCard, BarChart3, CheckCircle2,
  BookOpen, FileText, Phone, Zap, UserCheck, Award, Video,
} from 'lucide-react';

const BASE = 'https://sary.live';
const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "SoftwareApplication", "name": "ساري لمراكز التدريب - مساعد واتساب ذكي للتعليم", "applicationCategory": "EducationalApplication", "url": `${BASE}/solutions/training-centers`, "description": "مساعد ذكي لمراكز التدريب والتعليم عبر واتساب. تسجيل الدورات، جدولة الحصص، تذكيرات، ومتابعة المتدربين — بالذكاء الاصطناعي.", "offers": { "@type": "Offer", "price": "0", "priceCurrency": "SAR" } },
    { "@type": "FAQPage", "mainEntity": [
      { "@type": "Question", "name": "كيف يساعد ساري مراكز التدريب؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري يستقبل استفسارات المتدربين عبر واتساب، يعرض الدورات المتاحة بتفاصيلها، يسجل المتدربين ويقبض الرسوم، ويرسل تذكيرات الحصص تلقائياً." }},
      { "@type": "Question", "name": "هل يدعم ساري عرض تفاصيل الدورات؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يعرض كل تفاصيل الدورة: المحتوى، المدرب، المدة، الأسعار، المقاعد المتبقية، وجدول الحصص. المتدرب يسجل مباشرة من المحادثة." }},
      { "@type": "Question", "name": "هل يمكن إرسال الشهادات عبر ساري؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يمكنه إرسال الشهادات والملفات التعليمية للمتدربين عبر واتساب تلقائياً بعد إتمام الدورة." }},
      { "@type": "Question", "name": "هل يتعامل مع دورات الحضور والأونلاين؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يدعم الدورات الحضورية وعن بعد. يرسل روابط الزوم أو المنصة التعليمية تلقائياً قبل كل حصة." }},
      { "@type": "Question", "name": "هل يدعم عدة دورات بنفس الوقت؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يدير عشرات الدورات بالتوازي مع مدربين مختلفين وجداول منفصلة بدون أي تعارض." }},
    ]},
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": BASE },
      { "@type": "ListItem", "position": 2, "name": "مراكز التدريب", "item": `${BASE}/solutions/training-centers` },
    ]}
  ]
};

export default function TrainingCenters() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || 'ar') === 'ar';

  const painPoints = [
    { icon: Phone, ar: 'استفسارات متكررة لا تنتهي', en: 'Endless Repetitive Inquiries', arD: 'نفس الأسئلة عن الأسعار والمواعيد والمتطلبات كل يوم', enD: 'Same questions about prices, schedules, and requirements every day', arS: 'ساري يجيب فوراً على كل الأسئلة المتكررة 24/7', enS: 'Sari instantly answers all repetitive questions 24/7' },
    { icon: FileText, ar: 'تسجيل يدوي مرهق', en: 'Exhausting Manual Registration', arD: 'استمارات ورقية وإكسل ومتابعة يدوية للدفعات', enD: 'Paper forms, Excel, and manual payment follow-up', arS: 'تسجيل ودفع تلقائي من المحادثة مباشرة', enS: 'Auto registration and payment directly from chat' },
    { icon: Users, ar: 'مقاعد فاضية', en: 'Empty Seats', arD: 'دورات تبدأ بمقاعد فارغة بسبب ضعف التسويق', enD: 'Courses start with empty seats due to weak marketing', arS: 'حملات واتساب ذكية تملأ الدورات بسرعة', enS: 'Smart WhatsApp campaigns fill courses quickly' },
    { icon: Bell, ar: 'متدربين يتغيبون', en: 'Trainees Absent', arD: 'المتدربين ينسون مواعيد الحصص ويتغيبون', enD: 'Trainees forget class schedules and are absent', arS: 'تذكيرات تلقائية قبل كل حصة تقلل الغياب 75%', enS: 'Auto reminders before each class reduce absence 75%' },
  ];

  const features = [
    { icon: BookOpen, ar: 'عرض الدورات', en: 'Course Display', arD: 'كتالوج دورات متكامل: المحتوى، المدرب، المدة، السعر', enD: 'Complete course catalog: content, instructor, duration, price' },
    { icon: UserCheck, ar: 'تسجيل تلقائي', en: 'Auto Registration', arD: 'المتدرب يسجل ويدفع من المحادثة مباشرة', enD: 'Trainee registers and pays directly from chat' },
    { icon: CreditCard, ar: 'دفع إلكتروني', en: 'E-Payment', arD: 'روابط دفع آمنة مع دعم التقسيط', enD: 'Secure payment links with installment support' },
    { icon: Calendar, ar: 'جدول الحصص', en: 'Class Schedule', arD: 'إرسال جدول الحصص الأسبوعي تلقائياً', enD: 'Auto-send weekly class schedule' },
    { icon: Bell, ar: 'تذكيرات الحصص', en: 'Class Reminders', arD: 'تذكير قبل كل حصة بساعة مع رابط الزوم إن وجد', enD: 'Reminder 1 hour before each class with Zoom link if applicable' },
    { icon: Video, ar: 'دعم أونلاين', en: 'Online Support', arD: 'إرسال روابط المنصات التعليمية والتسجيلات', enD: 'Send platform links and recordings' },
    { icon: Award, ar: 'شهادات تلقائية', en: 'Auto Certificates', arD: 'إرسال الشهادات عبر واتساب فور إتمام الدورة', enD: 'Send certificates via WhatsApp upon course completion' },
    { icon: Sparkles, ar: 'حملات تسويقية', en: 'Marketing Campaigns', arD: 'أعلن عن دورات جديدة لقاعدة المتدربين', enD: 'Announce new courses to your trainee database' },
    { icon: BarChart3, ar: 'تقارير التسجيل', en: 'Enrollment Reports', arD: 'نسب الامتلاء والإيرادات وأداء كل دورة', enD: 'Occupancy rates, revenue, and performance per course' },
  ];

  const testimonials = [
    { name: isAr ? 'أكاديمية المهارات' : 'Skills Academy', role: isAr ? 'مركز تدريب مهني — الرياض' : 'Vocational Training Center — Riyadh', text: isAr ? 'ساري وفّر علينا 3 ساعات يومياً من الرد على الاستفسارات. التسجيل أصبح تلقائي بالكامل.' : 'Sari saved us 3 hours daily from answering inquiries. Registration is now fully automated.' },
    { name: isAr ? 'معهد لغات المستقبل' : 'Future Languages Institute', role: isAr ? 'معهد لغات — جدة' : 'Language Institute — Jeddah', text: isAr ? 'الدورات تمتلئ بسرعة بعد حملات الواتساب. المتدربين يحبون سهولة التسجيل عبر المحادثة.' : 'Courses fill up quickly after WhatsApp campaigns. Trainees love the ease of chat registration.' },
    { name: isAr ? 'مركز تمكين للتطوير' : 'Tamkeen Development Center', role: isAr ? 'تدريب الشركات — الدمام' : 'Corporate Training — Dammam', text: isAr ? 'ساري يدير 15 دورة بالتوازي بدون أي مشكلة. التقارير ممتازة وتساعدنا في التخطيط.' : 'Sari manages 15 courses simultaneously without any issues. Reports are excellent and help us plan.' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead title={isAr ? 'ساري لمراكز التدريب — تسجيل وإدارة دورات عبر واتساب | Sari AI' : 'Sari for Training Centers — Course Registration & Management via WhatsApp | Sari AI'} description={isAr ? 'مساعد ذكي لمراكز التدريب عبر واتساب. تسجيل دورات، دفع إلكتروني، تذكيرات حصص، وحملات تسويقية — بالذكاء الاصطناعي.' : 'AI assistant for training centers via WhatsApp. Course registration, e-payment, class reminders, and marketing campaigns — powered by AI.'} keywords="تسجيل دورات واتساب, مركز تدريب واتساب, training center WhatsApp, course registration bot, تسجيل تلقائي دورات, معهد تدريب" canonicalUrl={`${BASE}/solutions/training-centers`} ogType="product" structuredData={schemaData} />
      <Navbar />

      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-blue-50/30 to-white dark:from-indigo-950/20 dark:via-gray-900 dark:to-background py-20 md:py-28">
        <div className="container relative"><div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-sm font-medium"><GraduationCap className="w-4 h-4" /><span>{isAr ? 'مصمم لمراكز التدريب والتعليم' : 'Designed for Training & Education'}</span></div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight"><span className="text-indigo-600 dark:text-indigo-400">{isAr ? 'ساري لمراكز التدريب' : 'Sari for Training Centers'}</span><br />{isAr ? 'تسجيل وإدارة دورات عبر واتساب' : 'Course Registration via WhatsApp'}</h1>
          <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">{isAr ? 'المتدربون يسجلون في دوراتك ويدفعون عبر واتساب. ساري يرد على الاستفسارات، يرسل الجداول والتذكيرات — تلقائياً.' : 'Trainees register for your courses and pay via WhatsApp. Sari answers inquiries, sends schedules and reminders — automatically.'}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup"><a><Button size="lg" className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-lg h-14 px-8 shadow-lg">{isAr ? 'فعّل ساري لمركزك' : 'Activate Sari for Your Center'}<Sparkles className="ms-2 w-5 h-5" /></Button></a></Link>
            <Link href="/try-sari"><a><Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">{isAr ? 'جرّب مجاناً' : 'Try Free'}</Button></a></Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 max-w-2xl mx-auto">
            {[{ v: '75%', ar: 'تقليل الغياب', en: 'Absence Reduction' }, { v: '3h', ar: 'توفير يومي', en: 'Daily Time Saved' }, { v: '2x', ar: 'سرعة امتلاء الدورات', en: 'Course Fill Speed' }, { v: '24/7', ar: 'تسجيل متاح', en: 'Registration Available' }].map(s => (<div key={s.v} className="text-center"><div className="text-3xl font-bold text-indigo-600">{s.v}</div><div className="text-sm text-muted-foreground">{isAr ? s.ar : s.en}</div></div>))}
          </div>
        </div></div>
      </section>

      <section className="py-20 bg-white dark:bg-background"><div className="container max-w-5xl"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'تحديات مراكز التدريب التي يحلها ساري' : 'Training Center Challenges Sari Solves'}</h2><div className="grid md:grid-cols-2 gap-8">{painPoints.map((p, i) => (<div key={i} className="rounded-2xl border-2 p-6 hover:border-indigo-400 transition-all"><div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><p.icon className="w-5 h-5 text-red-600" /></div><h3 className="text-lg font-bold">{isAr ? p.ar : p.en}</h3></div><p className="text-muted-foreground text-sm mb-3">{isAr ? p.arD : p.enD}</p><div className="flex items-center gap-2 text-indigo-600 text-sm font-medium"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /><span>{isAr ? p.arS : p.enS}</span></div></div>))}</div></div></section>

      <section className="py-20 bg-muted/30"><div className="container"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'مزايا ساري لمراكز التدريب' : 'Sari Features for Training Centers'}</h2><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">{features.map((f, i) => (<Card key={i} className="border-2 hover:border-indigo-500 transition-all hover:shadow-lg group"><CardContent className="p-6"><div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><f.icon className="w-6 h-6 text-indigo-600" /></div><h3 className="text-lg font-bold mb-2">{isAr ? f.ar : f.en}</h3><p className="text-muted-foreground text-sm">{isAr ? f.arD : f.enD}</p></CardContent></Card>))}</div></div></section>

      <section className="py-20 bg-white dark:bg-background"><div className="container"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'مراكز تدريب تثق بساري' : 'Training Centers Trust Sari'}</h2><div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">{testimonials.map((t, i) => (<Card key={i} className="border-2"><CardContent className="p-6"><div className="flex gap-1 mb-3">{[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}</div><p className="text-muted-foreground mb-4 text-sm">{t.text}</p><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">{t.role}</div></CardContent></Card>))}</div></div></section>

      <section className="py-20 bg-muted/30"><div className="container max-w-4xl"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'أسئلة شائعة' : 'FAQ'}</h2><div className="space-y-4">{schemaData["@graph"][1].mainEntity.map((q: any, i: number) => (<Card key={i} className="border"><CardContent className="p-6"><h3 className="font-bold mb-2">{q.name}</h3><p className="text-muted-foreground text-sm">{q.acceptedAnswer.text}</p></CardContent></Card>))}</div></div></section>

      <section className="py-20 bg-indigo-600 text-white"><div className="container text-center"><h2 className="text-3xl md:text-5xl font-bold mb-4">{isAr ? 'فعّل ساري لمركزك الآن' : 'Activate Sari for Your Center Now'}</h2><p className="text-xl mb-8 opacity-90">{isAr ? 'مجاناً — تفعيل خلال 5 دقائق' : 'Free — activate in 5 minutes'}</p><Link href="/signup"><a><Button size="lg" variant="secondary" className="text-lg h-14 px-8">{isAr ? 'ابدأ مجاناً' : 'Start Free'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link></div></section>
      <Footer />
    </div>
  );
}
