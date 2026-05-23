// @ts-nocheck
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  Bot, MessageSquare, Zap, ArrowRight, CheckCircle2, Star,
  ShoppingCart, Settings, Database, Brain, Send, BarChart3,
} from 'lucide-react';

const BASE = 'https://sary.live';

const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "HowTo",
      "name": "كيف يعمل ساري - وكيل المبيعات الذكي",
      "description": "دليل شامل لفهم كيف يعمل ساري كموظف مبيعات ذكي عبر واتساب لمتجرك الإلكتروني",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "ربط المتجر", "text": "اربط متجرك من سلة أو زد أو أضف منتجاتك يدوياً. ساري يسحب الكتالوج تلقائياً." },
        { "@type": "HowToStep", "position": 2, "name": "توصيل واتساب", "text": "فعّل رقم واتساب الأعمال الخاص بك عبر مسح رمز QR أو ربط API." },
        { "@type": "HowToStep", "position": 3, "name": "تخصيص الشخصية", "text": "حدد اسم ساري ونبرة الحديث والردود السريعة ليتناسب مع هوية متجرك." },
        { "@type": "HowToStep", "position": 4, "name": "الإطلاق والبيع", "text": "ساري يبدأ بالرد على العملاء تلقائياً، عرض المنتجات، ومعالجة الطلبات 24/7." },
      ],
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "كم يستغرق تفعيل ساري؟", "acceptedAnswer": { "@type": "Answer", "text": "أقل من 10 دقائق. سجّل، اربط واتساب، أضف منتجاتك — وساري جاهز للعمل فوراً." }},
        { "@type": "Question", "name": "هل أحتاج خبرة تقنية؟", "acceptedAnswer": { "@type": "Answer", "text": "لا. ساري مصمم ليكون سهل الاستخدام. كل شيء يتم عبر لوحة تحكم بسيطة بدون أي برمجة." }},
        { "@type": "Question", "name": "كيف يتعلم ساري عن منتجاتي؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري يسحب كتالوج منتجاتك تلقائياً من سلة/زد أو من ملف Excel. يفهم الأسماء والأسعار والأوصاف ويستخدمها في المحادثات." }},
        { "@type": "Question", "name": "هل يمكنني مراقبة محادثات ساري؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم. لوحة التحكم تعرض كل المحادثات في الوقت الحقيقي مع تحليلات مفصلة عن المبيعات ورضا العملاء." }},
        { "@type": "Question", "name": "ماذا يحدث إذا لم يعرف ساري الإجابة؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري يحول المحادثة للفريق البشري تلقائياً مع ملخص كامل للمحادثة حتى لا يحتاج العميل لإعادة شرح المشكلة." }},
      ]
    },
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "ساري", "item": BASE },
      { "@type": "ListItem", "position": 2, "name": "كيف يعمل ساري", "item": `${BASE}/docs/how-sari-works` },
    ]}
  ]
};

export default function HowSariWorks() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const steps = [
    { icon: <Database className="w-8 h-8" />, n: '1', color: 'bg-blue-600', title: isAr ? 'اربط متجرك' : 'Connect Your Store', desc: isAr ? 'اربط متجرك من سلة، زد، أو ووكومرس — أو ارفع منتجاتك من ملف Excel. ساري يسحب كل المنتجات والأسعار والصور تلقائياً ويبني قاعدة معرفة ذكية.' : 'Connect your store from Salla, Zid, or WooCommerce — or upload from Excel. Sari auto-pulls all products, prices, and images to build a smart knowledge base.' },
    { icon: <MessageSquare className="w-8 h-8" />, n: '2', color: 'bg-green-600', title: isAr ? 'فعّل واتساب' : 'Activate WhatsApp', desc: isAr ? 'امسح رمز QR أو اربط API واتساب الأعمال. ساري يصبح جاهزاً لاستقبال رسائل العملاء والرد عليهم بذكاء.' : 'Scan QR code or connect WhatsApp Business API. Sari becomes ready to receive and intelligently respond to customer messages.' },
    { icon: <Settings className="w-8 h-8" />, n: '3', color: 'bg-purple-600', title: isAr ? 'خصّص الشخصية' : 'Customize Personality', desc: isAr ? 'حدد اسم ساري، نبرة الحديث (رسمي/ودي)، اللغة، والردود السريعة. اجعله يتحدث بهوية متجرك تماماً.' : 'Set Sari\'s name, tone (formal/friendly), language, and quick responses. Make it speak exactly in your brand voice.' },
    { icon: <Brain className="w-8 h-8" />, n: '4', color: 'bg-orange-600', title: isAr ? 'ساري يتعلم ويبيع' : 'Sari Learns & Sells', desc: isAr ? 'ساري يقرأ كتالوجك، يفهم المنتجات، ويبدأ بالرد على العملاء تلقائياً. يعرض المنتجات المناسبة، يجيب الأسئلة، ويرسل روابط الدفع.' : 'Sari reads your catalog, understands products, and starts responding automatically. Shows relevant products, answers questions, and sends payment links.' },
  ];

  const capabilities = [
    { icon: <Bot className="w-6 h-6" />, title: isAr ? 'محادثة طبيعية' : 'Natural Conversation', desc: isAr ? 'يتحدث باللهجة السعودية والعربية الفصحى والإنجليزية بطلاقة' : 'Fluent in Saudi dialect, formal Arabic, and English' },
    { icon: <ShoppingCart className="w-6 h-6" />, title: isAr ? 'عرض المنتجات' : 'Product Display', desc: isAr ? 'يعرض المنتجات مع الصور والأسعار مباشرة في المحادثة' : 'Shows products with images and prices directly in chat' },
    { icon: <Send className="w-6 h-6" />, title: isAr ? 'روابط الدفع' : 'Payment Links', desc: isAr ? 'يرسل رابط دفع إلكتروني ويتابع حتى إتمام عملية الشراء' : 'Sends payment link and follows up until purchase completion' },
    { icon: <BarChart3 className="w-6 h-6" />, title: isAr ? 'تحليلات ذكية' : 'Smart Analytics', desc: isAr ? 'يتتبع كل محادثة ويوفر تحليلات عن المبيعات ورضا العملاء' : 'Tracks every conversation with sales and satisfaction analytics' },
    { icon: <Zap className="w-6 h-6" />, title: isAr ? 'سرعة الرد' : 'Instant Response', desc: isAr ? 'يرد خلال ثوانٍ 24/7 — لا انتظار ولا إجازات' : 'Responds in seconds 24/7 — no waiting, no holidays' },
    { icon: <Star className="w-6 h-6" />, title: isAr ? 'تخصيص كامل' : 'Full Customization', desc: isAr ? 'خصّص الاسم والشخصية والنبرة ليتناسب مع هوية متجرك' : 'Customize name, personality, and tone to match your brand' },
  ];

  return (
    <>
      // @ts-ignore
      <SeoHead title={isAr ? 'كيف يعمل ساري — الدليل الشامل لوكيل المبيعات الذكي' : 'How Sari Works — Complete AI Sales Agent Guide'} description={isAr ? 'تعرف على كيف يعمل ساري كموظف مبيعات ذكي عبر واتساب. من ربط المتجر حتى البيع التلقائي في 4 خطوات بسيطة.' : 'Learn how Sari works as an AI sales agent on WhatsApp. From connecting your store to automatic selling in 4 simple steps.'} url={`${BASE}/docs/how-sari-works`} schemaMarkup={JSON.stringify(schemaData)} />
      <Navbar />
      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-blue-50 to-background dark:from-blue-950/20">
        <div className="container text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 text-blue-700 text-sm font-medium mb-6"><Bot className="w-4 h-4" />{isAr ? 'دليل شامل' : 'Complete Guide'}</div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6">{isAr ? 'كيف يعمل ساري؟' : 'How Does Sari Work?'}</h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">{isAr ? 'من التسجيل حتى أول عملية بيع — في أقل من 10 دقائق. اكتشف كيف يتحول واتساب إلى قناة مبيعات ذكية تعمل 24/7.' : 'From signup to first sale — in less than 10 minutes. Discover how WhatsApp becomes a smart 24/7 sales channel.'}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup"><a><Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-lg h-14 px-8">{isAr ? 'ابدأ مجاناً الآن' : 'Start Free Now'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link>
          </div>
        </div>
      </section>

      {/* 4 Steps */}
      <section className="py-20">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? '4 خطوات فقط' : 'Just 4 Steps'}</h2>
          <div className="space-y-12">
            {steps.map((s, i) => (
              <div key={i} className="flex gap-6 items-start">
                <div className={`w-16 h-16 rounded-2xl ${s.color} text-white flex items-center justify-center text-2xl font-bold flex-shrink-0`}>{s.n}</div>
                <div className="flex-1"><h3 className="text-2xl font-bold mb-2">{s.title}</h3><p className="text-muted-foreground text-lg leading-relaxed">{s.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-4">{isAr ? 'ماذا يستطيع ساري أن يفعل؟' : 'What Can Sari Do?'}</h2>
          <p className="text-xl text-muted-foreground text-center mb-16 max-w-2xl mx-auto">{isAr ? 'قدرات متقدمة في موظف واحد يعمل بلا توقف' : 'Advanced capabilities in one tireless employee'}</p>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {capabilities.map((c, i) => (<Card key={i} className="border hover:shadow-lg transition-shadow"><CardContent className="p-6"><div className="w-12 h-12 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-4">{c.icon}</div><h3 className="font-bold mb-2">{c.title}</h3><p className="text-sm text-muted-foreground">{c.desc}</p></CardContent></Card>))}
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
      <section className="py-20 bg-blue-600 text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">{isAr ? 'جاهز تبدأ؟' : 'Ready to Start?'}</h2>
          <p className="text-xl opacity-90 mb-8">{isAr ? 'سجّل مجاناً وفعّل ساري في أقل من 10 دقائق' : 'Sign up free and activate Sari in less than 10 minutes'}</p>
          <Link href="/signup"><a><Button size="lg" variant="secondary" className="text-lg h-14 px-8">{isAr ? 'ابدأ مجاناً' : 'Start Free'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link>
        </div>
      </section>
      <Footer />
    </>
  );
}