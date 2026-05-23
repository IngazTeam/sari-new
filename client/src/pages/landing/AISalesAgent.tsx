// @ts-nocheck
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  Bot, MessageSquare, Zap, TrendingUp, Clock, Shield, CheckCircle2,
  ArrowRight, Star, ShoppingCart, Sparkles, BarChart3, Users, Phone,
  Target, Repeat, DollarSign, HeadphonesIcon, Globe, Mic,
} from 'lucide-react';

const BASE = 'https://sary.live';

const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "ساري - موظف مبيعات واتساب بالذكاء الاصطناعي",
      "alternateName": "Sari AI WhatsApp Sales Agent",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "url": `${BASE}/ai-whatsapp-sales-agent`,
      "description": "موظف مبيعات ذكي يعمل على واتساب بالذكاء الاصطناعي. يرد على العملاء، يعالج الطلبات، ويحول المحادثات إلى مبيعات 24/7.",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "SAR" },
      "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "ratingCount": "850" },
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "ما هو موظف المبيعات الذكي من ساري؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري هو وكيل مبيعات يعمل بالذكاء الاصطناعي على واتساب. يرد على العملاء بلغة طبيعية، يفهم احتياجاتهم، يعرض المنتجات المناسبة، ويكمل عملية البيع تلقائياً بدون تدخل بشري." }},
        { "@type": "Question", "name": "هل يدعم ساري اللهجة السعودية؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري مصمم خصيصاً للسوق السعودي ويتحدث باللهجة السعودية بطلاقة. كما يدعم الفصحى والإنجليزية." }},
        { "@type": "Question", "name": "كم يكلف ساري؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري يقدم باقة مجانية للبدء. الباقات المدفوعة تبدأ من 99 ريال شهرياً وتشمل محادثات غير محدودة وحملات تسويقية." }},
        { "@type": "Question", "name": "هل يتكامل ساري مع سلة وزد؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، ساري يتكامل مباشرة مع سلة وزد وووكومرس. يسحب منتجاتك تلقائياً ويستخدمها في المحادثات مع العملاء." }},
        { "@type": "Question", "name": "كيف يختلف ساري عن بوتات الواتساب العادية؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري ليس بوت ردود جاهزة. هو موظف مبيعات حقيقي يفهم السياق، يتذكر المحادثات السابقة، يقترح منتجات بناءً على احتياج العميل، ويتعامل مع الاعتراضات بذكاء." }},
        { "@type": "Question", "name": "هل يمكنني تخصيص شخصية ساري؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم، يمكنك تخصيص اسم ساري وشخصيته ونبرة الحديث ليتناسب مع هوية متجرك. كما يمكنك إضافة ردود سريعة مخصصة." }},
      ]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": BASE },
        { "@type": "ListItem", "position": 2, "name": "موظف مبيعات AI", "item": `${BASE}/ai-whatsapp-sales-agent` },
      ]
    }
  ]
};

export default function AISalesAgent() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || 'ar') === 'ar';

  const title = isAr
    ? 'موظف مبيعات واتساب بالذكاء الاصطناعي | ساري AI'
    : 'AI WhatsApp Sales Agent | Sari AI';
  const desc = isAr
    ? 'ساري موظف مبيعات ذكي يعمل على واتساب 24/7. يرد على العملاء، يعالج الطلبات، يستعيد السلات المتروكة، ويحول المحادثات إلى مبيعات فعلية بالذكاء الاصطناعي.'
    : 'Sari is an AI-powered WhatsApp sales agent that works 24/7. Responds to customers, processes orders, recovers abandoned carts, and converts conversations into actual sales.';

  const features = [
    { icon: Bot, ar: 'رد ذكي بالذكاء الاصطناعي', en: 'AI-Powered Smart Replies', arDesc: 'يفهم سياق المحادثة ويرد بلغة طبيعية كأنه موظف حقيقي', enDesc: 'Understands conversation context and responds naturally like a real employee' },
    { icon: ShoppingCart, ar: 'معالجة الطلبات تلقائياً', en: 'Automatic Order Processing', arDesc: 'يستقبل الطلبات ويعالجها ويرسل روابط الدفع بدون تدخل', enDesc: 'Receives, processes orders and sends payment links without intervention' },
    { icon: Repeat, ar: 'استعادة السلات المتروكة', en: 'Abandoned Cart Recovery', arDesc: 'يتابع العملاء الذين لم يكملوا الشراء ويقنعهم بالعودة', enDesc: 'Follows up with customers who didn\'t complete purchase and persuades them to return' },
    { icon: Mic, ar: 'فهم الرسائل الصوتية', en: 'Voice Message Understanding', arDesc: 'يستمع للرسائل الصوتية ويحولها لنص ويرد عليها بذكاء', enDesc: 'Listens to voice messages, converts to text, and responds intelligently' },
    { icon: Target, ar: 'توصيات منتجات ذكية', en: 'Smart Product Recommendations', arDesc: 'يقترح المنتجات المناسبة بناءً على احتياج كل عميل', enDesc: 'Suggests suitable products based on each customer\'s needs' },
    { icon: Globe, ar: 'يتحدث باللهجة السعودية', en: 'Speaks Saudi Dialect', arDesc: 'مصمم خصيصاً للسوق السعودي ويفهم اللهجات المحلية', enDesc: 'Specifically designed for the Saudi market and understands local dialects' },
    { icon: DollarSign, ar: 'روابط دفع فورية', en: 'Instant Payment Links', arDesc: 'يرسل روابط دفع آمنة للعميل مباشرة في المحادثة', enDesc: 'Sends secure payment links to customers directly in the chat' },
    { icon: BarChart3, ar: 'تحليلات وتقارير متقدمة', en: 'Advanced Analytics & Reports', arDesc: 'تقارير مفصلة عن المبيعات والمحادثات وأداء الوكيل', enDesc: 'Detailed reports on sales, conversations, and agent performance' },
    { icon: Clock, ar: 'يعمل 24/7 بدون توقف', en: 'Works 24/7 Non-Stop', arDesc: 'لا إجازات ولا تأخير — موظف لا ينام أبداً', enDesc: 'No holidays, no delays — an employee that never sleeps' },
  ];

  const stats = [
    { value: '95%', ar: 'معدل رضا العملاء', en: 'Customer Satisfaction' },
    { value: '3x', ar: 'زيادة في المبيعات', en: 'Sales Increase' },
    { value: '< 5s', ar: 'متوسط وقت الرد', en: 'Avg Response Time' },
    { value: '24/7', ar: 'متاح دائماً', en: 'Always Available' },
  ];

  const comparisons = [
    { ar: 'الرد على العملاء', en: 'Customer Response', before: isAr ? '15-30 دقيقة' : '15-30 min', after: isAr ? 'أقل من 5 ثوانٍ' : 'Under 5 seconds' },
    { ar: 'معالجة الطلبات', en: 'Order Processing', before: isAr ? 'يدوي بالكامل' : 'Fully manual', after: isAr ? 'تلقائي 100%' : '100% automated' },
    { ar: 'التوفر', en: 'Availability', before: isAr ? '8 ساعات/يوم' : '8 hours/day', after: isAr ? '24 ساعة/7 أيام' : '24/7' },
    { ar: 'التكلفة الشهرية', en: 'Monthly Cost', before: isAr ? '5,000+ ريال (موظف)' : '5,000+ SAR (employee)', after: isAr ? 'من 99 ريال فقط' : 'From 99 SAR only' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead
        title={title}
        description={desc}
        keywords="موظف مبيعات واتساب, ذكاء اصطناعي واتساب, AI WhatsApp sales agent, بوت مبيعات, وكيل مبيعات ذكي, أتمتة واتساب, WhatsApp AI agent Saudi"
        canonicalUrl={`${BASE}/ai-whatsapp-sales-agent`}
        ogType="product"
        structuredData={schemaData}
      />
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50 via-blue-50/30 to-white dark:from-emerald-950/20 dark:via-gray-900 dark:to-background py-20 md:py-28">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] dark:bg-grid-slate-700/25" />
        <div className="container relative">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-sm font-medium">
              <Sparkles className="w-4 h-4" />
              <span>{isAr ? 'الأول من نوعه في السعودية' : 'First of its Kind in Saudi Arabia'}</span>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight">
              <span className="text-emerald-600 dark:text-emerald-400">
                {isAr ? 'موظف مبيعات واتساب' : 'AI WhatsApp'}
              </span>
              <br />
              {isAr ? 'بالذكاء الاصطناعي' : 'Sales Agent'}
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              {isAr
                ? 'ساري يحول واتساب متجرك إلى آلة مبيعات ذكية. يرد على العملاء، يعرض المنتجات، يعالج الطلبات، ويغلق الصفقات — تلقائياً وبدون تدخل بشري.'
                : 'Sari transforms your store\'s WhatsApp into a smart sales machine. Responds to customers, showcases products, processes orders, and closes deals — automatically without human intervention.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/try-sari"><a>
                <Button size="lg" className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-lg h-14 px-8 shadow-lg">
                  {isAr ? 'جرّب ساري مجاناً' : 'Try Sari Free'}
                  <Sparkles className="ms-2 w-5 h-5" />
                </Button>
              </a></Link>
              <Link href="/pricing"><a>
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">
                  {isAr ? 'شاهد الأسعار' : 'View Pricing'}
                </Button>
              </a></Link>
            </div>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 max-w-2xl mx-auto">
              {stats.map((s) => (
                <div key={s.value} className="text-center">
                  <div className="text-3xl font-bold text-emerald-600">{s.value}</div>
                  <div className="text-sm text-muted-foreground">{isAr ? s.ar : s.en}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Problem/Solution */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              {isAr ? 'لماذا تحتاج موظف مبيعات AI؟' : 'Why Do You Need an AI Sales Agent?'}
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {isAr
                ? 'كل يوم يضيع عليك عملاء لأن لا أحد يرد عليهم. ساري يحل هذه المشكلة نهائياً.'
                : 'Every day you lose customers because nobody responds to them. Sari solves this problem permanently.'}
            </p>
          </div>
          <div className="rounded-2xl border overflow-hidden">
            <div className="grid grid-cols-3 bg-muted/50 font-semibold text-sm p-4 border-b">
              <div>{isAr ? 'المقارنة' : 'Comparison'}</div>
              <div className="text-red-600">{isAr ? '❌ بدون ساري' : '❌ Without Sari'}</div>
              <div className="text-emerald-600">{isAr ? '✅ مع ساري' : '✅ With Sari'}</div>
            </div>
            {comparisons.map((c, i) => (
              <div key={i} className="grid grid-cols-3 p-4 border-b last:border-0 items-center">
                <div className="font-medium">{isAr ? c.ar : c.en}</div>
                <div className="text-red-600 text-sm">{c.before}</div>
                <div className="text-emerald-600 font-semibold text-sm">{c.after}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              {isAr ? 'كل ما يفعله موظف المبيعات الذكي' : 'Everything Your AI Sales Agent Does'}
            </h2>
            <p className="text-xl text-muted-foreground">
              {isAr ? '9 قدرات خارقة في موظف واحد لا ينام' : '9 superpowers in one employee that never sleeps'}
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <Card key={i} className="border-2 hover:border-emerald-500 transition-all hover:shadow-lg group">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <f.icon className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{isAr ? f.ar : f.en}</h3>
                  <p className="text-muted-foreground text-sm">{isAr ? f.arDesc : f.enDesc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">
            {isAr ? 'كيف يعمل ساري؟' : 'How Does Sari Work?'}
          </h2>
          <div className="space-y-8">
            {[
              { n: '1', ar: 'اربط واتسابك', en: 'Connect WhatsApp', arD: 'اربط رقم واتساب بزنس بساري خلال دقيقتين فقط', enD: 'Connect your WhatsApp Business number to Sari in just 2 minutes' },
              { n: '2', ar: 'أضف منتجاتك', en: 'Add Products', arD: 'ارفع كتالوج منتجاتك يدوياً أو اربط متجرك (سلة/زد/ووكومرس)', enD: 'Upload your product catalog manually or connect your store (Salla/Zid/WooCommerce)' },
              { n: '3', ar: 'خصّص شخصية ساري', en: 'Customize Personality', arD: 'اختر اسم وشخصية ونبرة حديث الوكيل لتتناسب مع علامتك التجارية', enD: 'Choose agent name, personality, and tone to match your brand' },
              { n: '4', ar: 'ساري يبدأ البيع!', en: 'Sari Starts Selling!', arD: 'يستقبل المحادثات ويحولها إلى طلبات ومدفوعات تلقائياً', enD: 'Receives conversations and converts them to orders and payments automatically' },
            ].map((s, i) => (
              <div key={i} className="flex gap-6 items-start">
                <div className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xl font-bold flex-shrink-0">
                  {s.n}
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-1">{isAr ? s.ar : s.en}</h3>
                  <p className="text-muted-foreground">{isAr ? s.arD : s.enD}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">
            {isAr ? 'ماذا يقول عملاؤنا؟' : 'What Our Customers Say'}
          </h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { name: isAr ? 'أحمد العتيبي' : 'Ahmed Al-Otaibi', role: isAr ? 'صاحب متجر إلكتروني' : 'E-commerce Store Owner', text: isAr ? 'ساري غيّر طريقة تعاملنا مع العملاء بالكامل. المبيعات زادت 3 أضعاف والعملاء أصبحوا أكثر رضاً.' : 'Sari completely changed how we deal with customers. Sales tripled and customers are much more satisfied.' },
              { name: isAr ? 'نورة الشمري' : 'Noura Al-Shammari', role: isAr ? 'مديرة صالون تجميل' : 'Beauty Salon Manager', text: isAr ? 'الحجوزات عبر الواتساب أصبحت تلقائية بالكامل. وفّرنا وقت الموظفات وقللنا الأخطاء.' : 'WhatsApp bookings are now fully automated. We saved staff time and reduced errors.' },
              { name: isAr ? 'د. فهد القحطاني' : 'Dr. Fahad Al-Qahtani', role: isAr ? 'طبيب أسنان' : 'Dentist', text: isAr ? 'المرضى يحجزون مواعيدهم عبر الواتساب بسهولة. ساري يتعامل معهم باحترافية عالية.' : 'Patients book their appointments via WhatsApp easily. Sari handles them with high professionalism.' },
            ].map((t, i) => (
              <Card key={i} className="border-2">
                <CardContent className="p-6">
                  <div className="flex gap-1 mb-3">{[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}</div>
                  <p className="text-muted-foreground mb-4 text-sm">{t.text}</p>
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">
            {isAr ? 'أسئلة شائعة' : 'Frequently Asked Questions'}
          </h2>
          <div className="space-y-4">
            // @ts-ignore
            {schemaData["@graph"][1].mainEntity.map((q: any, i: number) => (
              <Card key={i} className="border">
                <CardContent className="p-6">
                  <h3 className="font-bold mb-2">{q.name}</h3>
                  <p className="text-muted-foreground text-sm">{q.acceptedAnswer.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-emerald-600 text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            {isAr ? 'ابدأ مع موظف المبيعات الذكي الآن' : 'Start with Your AI Sales Agent Now'}
          </h2>
          <p className="text-xl mb-8 opacity-90">
            {isAr ? 'جرّب ساري مجاناً — بدون بطاقة ائتمان' : 'Try Sari free — no credit card required'}
          </p>
          <Link href="/signup"><a>
            <Button size="lg" variant="secondary" className="text-lg h-14 px-8">
              {isAr ? 'ابدأ مجاناً الآن' : 'Start Free Now'}
              <ArrowRight className="ms-2 w-5 h-5" />
            </Button>
          </a></Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}