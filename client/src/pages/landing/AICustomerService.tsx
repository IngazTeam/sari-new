// @ts-nocheck
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  HeadphonesIcon, ArrowRight, Sparkles, Clock, Shield, Zap, MessageSquare,
  Brain, Globe, BarChart3, BookOpen, Users, ThumbsUp, Bot,
} from 'lucide-react';

const BASE = 'https://sary.live';
const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "SoftwareApplication", "name": "ساري - خدمة عملاء واتساب بالذكاء الاصطناعي", "applicationCategory": "BusinessApplication", "url": `${BASE}/ai-customer-service-whatsapp`, "description": "خدمة عملاء ذكية عبر واتساب تعمل 24/7. ترد على الاستفسارات، تحل المشاكل، وتحول العملاء غير الراضين إلى عملاء مخلصين.", "offers": { "@type": "Offer", "price": "0", "priceCurrency": "SAR" } },
    { "@type": "FAQPage", "mainEntity": [
      { "@type": "Question", "name": "كيف يتعامل ساري مع شكاوى العملاء؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري مدرب على التعامل مع الشكاوى بذكاء عاطفي. يعتذر، يفهم المشكلة، ويقدم حلول عملية. وإذا كانت المشكلة معقدة، يحولها لموظف بشري مع ملخص كامل." }},
      { "@type": "Question", "name": "هل يمكنني تدريب ساري على معلومات شركتي؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، يمكنك إضافة قاعدة معرفية كاملة عن منتجاتك وسياساتك وأسعارك. ساري يستخدمها للرد بدقة على أي سؤال." }},
      { "@type": "Question", "name": "متى يحول ساري للموظف البشري؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري يحول تلقائياً عندما يكتشف أن العميل غاضب جداً، أو عندما يطلب العميل التحدث مع شخص، أو عندما تكون المشكلة خارج نطاق معرفته." }},
      { "@type": "Question", "name": "هل يدعم عدة لغات؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يدعم العربية (بما فيها اللهجة السعودية) والإنجليزية. يكتشف لغة العميل تلقائياً ويرد بنفس اللغة." }},
    ]},
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": BASE },
      { "@type": "ListItem", "position": 2, "name": "خدمة عملاء AI", "item": `${BASE}/ai-customer-service-whatsapp` },
    ]}
  ]
};

export default function AICustomerService() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || 'ar') === 'ar';

  const features = [
    { icon: Brain, ar: 'ذكاء عاطفي', en: 'Emotional Intelligence', arD: 'يفهم مشاعر العميل ويتعامل معها بذكاء', enD: 'Understands customer emotions and handles them intelligently' },
    { icon: BookOpen, ar: 'قاعدة معرفية', en: 'Knowledge Base', arD: 'يتعلم عن منتجاتك وسياساتك ويرد بدقة', enD: 'Learns about your products and policies and responds accurately' },
    { icon: Globe, ar: 'متعدد اللغات', en: 'Multilingual', arD: 'عربي وإنجليزي مع كشف تلقائي للغة', enD: 'Arabic and English with automatic language detection' },
    { icon: Users, ar: 'تحويل ذكي للموظف', en: 'Smart Handoff', arD: 'يحول للبشري عند الحاجة مع ملخص كامل', enD: 'Transfers to human when needed with full summary' },
    { icon: Clock, ar: 'رد فوري 24/7', en: 'Instant Reply 24/7', arD: 'لا انتظار — كل عميل يحصل على رد فوري', enD: 'No waiting — every customer gets an instant response' },
    { icon: ThumbsUp, ar: 'تقييم الرضا', en: 'Satisfaction Rating', arD: 'يسأل العميل عن رضاه بعد كل محادثة', enD: 'Asks customer about satisfaction after every conversation' },
    { icon: Shield, ar: 'خصوصية تامة', en: 'Complete Privacy', arD: 'بيانات العملاء محمية ومشفرة بالكامل', enD: 'Customer data fully protected and encrypted' },
    { icon: BarChart3, ar: 'تحليل الاستفسارات', en: 'Inquiry Analysis', arD: 'تقارير عن أكثر الأسئلة شيوعاً وأوقات الذروة', enD: 'Reports on most common questions and peak times' },
    { icon: Zap, ar: 'حل المشاكل فوراً', en: 'Instant Problem Solving', arD: 'يحل 80% من المشاكل بدون تدخل بشري', enD: 'Solves 80% of issues without human intervention' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead title={isAr ? 'خدمة عملاء واتساب بالذكاء الاصطناعي | ساري' : 'AI WhatsApp Customer Service | Sari'} description={isAr ? 'خدمة عملاء ذكية عبر واتساب تعمل 24/7. ترد على الاستفسارات، تحل المشاكل، وتحول العملاء غير الراضين إلى عملاء مخلصين — بالذكاء الاصطناعي.' : 'Smart WhatsApp customer service powered by AI, available 24/7. Answers inquiries, solves problems, and turns unhappy customers into loyal ones.'} keywords="خدمة عملاء واتساب, دعم عملاء ذكي, AI customer service WhatsApp, بوت خدمة عملاء, دعم 24/7" canonicalUrl={`${BASE}/ai-customer-service-whatsapp`} ogType="product" structuredData={schemaData} />
      <Navbar />
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-orange-50 via-amber-50/30 to-white dark:from-orange-950/20 dark:via-gray-900 dark:to-background py-20 md:py-28">
        <div className="container relative">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-sm font-medium"><HeadphonesIcon className="w-4 h-4" /><span>{isAr ? 'دعم عملاء لا ينام' : 'Customer Support That Never Sleeps'}</span></div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight"><span className="text-orange-600 dark:text-orange-400">{isAr ? 'خدمة عملاء واتساب' : 'AI Customer Service'}</span><br />{isAr ? 'بالذكاء الاصطناعي' : 'via WhatsApp'}</h1>
            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">{isAr ? 'ساري يرد على عملاءك فوراً، يحل مشاكلهم بذكاء عاطفي، ويحول التجارب السلبية إلى ولاء — على مدار الساعة.' : 'Sari responds to your customers instantly, solves problems with emotional intelligence, and turns negative experiences into loyalty — around the clock.'}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup"><a><Button size="lg" className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 text-lg h-14 px-8 shadow-lg">{isAr ? 'فعّل الدعم الذكي' : 'Activate Smart Support'}<Sparkles className="ms-2 w-5 h-5" /></Button></a></Link>
              <Link href="/try-sari"><a><Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">{isAr ? 'جرّب مجاناً' : 'Try Free'}</Button></a></Link>
            </div>
            <div className="grid grid-cols-3 gap-6 pt-8 max-w-xl mx-auto">
              {[{ v: '< 5s', ar: 'وقت الرد', en: 'Response Time' }, { v: '80%', ar: 'حل بدون بشري', en: 'Solved Without Human' }, { v: '95%', ar: 'رضا العملاء', en: 'Customer Satisfaction' }].map(s => (<div key={s.v} className="text-center"><div className="text-3xl font-bold text-orange-600">{s.v}</div><div className="text-sm text-muted-foreground">{isAr ? s.ar : s.en}</div></div>))}
            </div>
          </div>
        </div>
      </section>
      {/* How It Works */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'كيف يعمل الدعم الذكي؟' : 'How Smart Support Works'}</h2>
          <div className="space-y-8">
            {[
              { n: '1', ar: 'العميل يتواصل عبر واتساب', en: 'Customer contacts via WhatsApp', arD: '"عندي مشكلة في طلبي رقم 1234"', enD: '"I have a problem with order #1234"' },
              { n: '2', ar: 'ساري يفهم المشكلة', en: 'Sari understands the problem', arD: 'يحلل الرسالة ويبحث في قاعدة المعرفة والطلبات', enD: 'Analyzes message and searches knowledge base and orders' },
              { n: '3', ar: 'يقدم حل فوري', en: 'Provides instant solution', arD: 'يرد بالحل المناسب — إلغاء، استبدال، أو شرح', enD: 'Responds with appropriate solution — cancel, replace, or explain' },
              { n: '4', ar: 'تحويل ذكي إن لزم', en: 'Smart handoff if needed', arD: 'يحول للموظف البشري مع ملخص كامل إذا كانت المشكلة معقدة', enD: 'Transfers to human agent with full summary if issue is complex' },
            ].map((s, i) => (
              <div key={i} className="flex gap-6 items-start">
                <div className="w-14 h-14 rounded-full bg-orange-600 text-white flex items-center justify-center text-xl font-bold flex-shrink-0">{s.n}</div>
                <div><h3 className="text-xl font-bold mb-1">{isAr ? s.ar : s.en}</h3><p className="text-muted-foreground italic">"{isAr ? s.arD : s.enD}"</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Features */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'خدمة عملاء خارقة بالـ AI' : 'Supercharged AI Customer Service'}</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (<Card key={i} className="border-2 hover:border-orange-500 transition-all hover:shadow-lg group"><CardContent className="p-6"><div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><f.icon className="w-6 h-6 text-orange-600" /></div><h3 className="text-lg font-bold mb-2">{isAr ? f.ar : f.en}</h3><p className="text-muted-foreground text-sm">{isAr ? f.arD : f.enD}</p></CardContent></Card>))}
          </div>
        </div>
      </section>
      {/* Testimonials */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'شركات تثق بدعم ساري' : 'Companies Trust Sari Support'}</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { name: isAr ? 'متجر إلكتروني' : 'E-commerce Store', role: isAr ? 'تجزئة — الرياض' : 'Retail — Riyadh', text: isAr ? 'ساري يحل 85% من مشاكل العملاء بدون تدخلنا. وقت الرد انخفض من ساعات لثوانٍ.' : 'Sari solves 85% of customer issues without our intervention. Response time dropped from hours to seconds.' },
              { name: isAr ? 'شركة SaaS' : 'SaaS Company', role: isAr ? 'تقنية — جدة' : 'Technology — Jeddah', text: isAr ? 'العملاء يحصلون على إجابات فورية على أسئلتهم التقنية. الفريق يركز على المشاكل المعقدة فقط.' : 'Customers get instant answers to their technical questions. The team focuses only on complex issues.' },
              { name: isAr ? 'مركز خدمات' : 'Service Center', role: isAr ? 'خدمات — الدمام' : 'Services — Dammam', text: isAr ? 'رضا العملاء ارتفع 30% بعد تفعيل ساري. الدعم 24/7 كان حلم والآن تحقق.' : 'Customer satisfaction increased 30% after activating Sari. 24/7 support was a dream and now it\'s real.' },
            // @ts-ignore
            ].map((t, i) => (<Card key={i} className="border-2"><CardContent className="p-6"><div className="flex gap-1 mb-3">{[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}</div><p className="text-muted-foreground mb-4 text-sm">{t.text}</p><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">{t.role}</div></CardContent></Card>))}
          </div>
        </div>
      </section>
      {/* FAQ */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'أسئلة شائعة' : 'FAQ'}</h2>
          // @ts-ignore
          <div className="space-y-4">{schemaData["@graph"][1].mainEntity.map((q: any, i: number) => (<Card key={i} className="border"><CardContent className="p-6"><h3 className="font-bold mb-2">{q.name}</h3><p className="text-muted-foreground text-sm">{q.acceptedAnswer.text}</p></CardContent></Card>))}</div>
        </div>
      </section>
      {/* CTA */}
      <section className="py-20 bg-orange-600 text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">{isAr ? 'ارفع مستوى خدمة عملائك الآن' : 'Elevate Your Customer Service Now'}</h2>
          <p className="text-xl mb-8 opacity-90">{isAr ? 'ابدأ مجاناً — بدون بطاقة ائتمان' : 'Start free — no credit card required'}</p>
          <Link href="/signup"><a><Button size="lg" variant="secondary" className="text-lg h-14 px-8">{isAr ? 'ابدأ مجاناً' : 'Start Free'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link>
        </div>
      </section>
      <Footer />
    </div>
  );
}