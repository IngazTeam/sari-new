// @ts-nocheck
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  MessageSquare, ArrowRight, Sparkles, ShoppingCart, CreditCard, Bot,
  TrendingUp, Globe, BarChart3, Zap, Shield, Smartphone, Users,
  Package, Repeat, Target,
} from 'lucide-react';

const BASE = 'https://sary.live';
const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "SoftwareApplication", "name": "ساري - منصة التجارة المحادثية", "applicationCategory": "BusinessApplication", "url": `${BASE}/conversational-commerce-platform`, "description": "منصة التجارة المحادثية الأولى في السعودية. حوّل كل محادثة واتساب إلى فرصة بيع حقيقية باستخدام الذكاء الاصطناعي.", "offers": { "@type": "Offer", "price": "0", "priceCurrency": "SAR" } },
    { "@type": "FAQPage", "mainEntity": [
      { "@type": "Question", "name": "ما هي التجارة المحادثية؟", "acceptedAnswer": { "@type": "Answer", "text": "التجارة المحادثية (Conversational Commerce) هي نموذج بيع حديث يتم فيه البيع من خلال المحادثات الفورية عبر تطبيقات المراسلة مثل واتساب. بدلاً من أن يزور العميل موقعك، يتحدث مباشرة مع وكيل ذكي يعرض المنتجات ويتم عملية الشراء في نفس المحادثة." }},
      { "@type": "Question", "name": "لماذا التجارة المحادثية مهمة في السعودية؟", "acceptedAnswer": { "@type": "Answer", "text": "أكثر من 90% من السعوديين يستخدمون واتساب يومياً. التجارة المحادثية تقابل العملاء حيث يقضون وقتهم فعلاً، مما يزيد معدل التحويل 3-5 أضعاف مقارنة بالمواقع التقليدية." }},
      { "@type": "Question", "name": "كيف تختلف عن التجارة الإلكترونية التقليدية؟", "acceptedAnswer": { "@type": "Answer", "text": "في التجارة التقليدية، العميل يبحث بنفسه. في التجارة المحادثية، وكيل ذكي يفهم احتياج العميل ويقترح المنتج المناسب ويكمل عملية الشراء — كأنك في متجر مع بائع خبير." }},
      { "@type": "Question", "name": "هل التجارة المحادثية مناسبة لمتجري الصغير؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم! التجارة المحادثية تناسب كل الأحجام. المتاجر الصغيرة تستفيد أكثر لأنها توفر عليهم تكلفة فريق مبيعات كامل." }},
      { "@type": "Question", "name": "ما هو معدل التحويل في التجارة المحادثية؟", "acceptedAnswer": { "@type": "Answer", "text": "معدل التحويل في التجارة المحادثية يتراوح بين 10-25%، مقارنة بـ 2-3% في المتاجر الإلكترونية التقليدية. السبب: المحادثة الشخصية تبني ثقة وتزيل اعتراضات الشراء." }},
    ]},
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "الرئيسية", "item": BASE },
      { "@type": "ListItem", "position": 2, "name": "التجارة المحادثية", "item": `${BASE}/conversational-commerce-platform` },
    ]}
  ]
};

export default function ConversationalCommerce() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || 'ar') === 'ar';

  const pillars = [
    { icon: MessageSquare, ar: 'البيع عبر المحادثة', en: 'Selling via Conversation', arD: 'العميل يتحدث طبيعياً وساري يحول الحديث لطلب شراء', enD: 'Customer talks naturally and Sari converts conversation into a purchase' },
    { icon: Bot, ar: 'وكيل مبيعات AI', en: 'AI Sales Agent', arD: 'ذكاء اصطناعي يفهم السياق ويقنع ويبيع', enD: 'AI that understands context, persuades, and sells' },
    { icon: CreditCard, ar: 'دفع داخل المحادثة', en: 'In-Chat Payment', arD: 'العميل يدفع بدون مغادرة واتساب', enD: 'Customer pays without leaving WhatsApp' },
    { icon: Package, ar: 'كتالوج ذكي', en: 'Smart Catalog', arD: 'يعرض المنتج المناسب حسب احتياج العميل', enD: 'Shows the right product based on customer need' },
    { icon: Repeat, ar: 'استعادة السلات', en: 'Cart Recovery', arD: 'يتابع العملاء الذين لم يكملوا الشراء', enD: 'Follows up with customers who didn\'t complete purchase' },
    { icon: Target, ar: 'توصيات شخصية', en: 'Personal Recommendations', arD: 'يقترح منتجات بناءً على تاريخ وتفضيلات العميل', enD: 'Suggests products based on customer history and preferences' },
    { icon: TrendingUp, ar: 'زيادة التحويل 3-5x', en: '3-5x Conversion Increase', arD: 'معدل تحويل 10-25% مقارنة بـ 2-3% تقليدياً', enD: '10-25% conversion rate vs. 2-3% traditional' },
    { icon: Globe, ar: 'سوق سعودي متخصص', en: 'Saudi Market Specialized', arD: 'مصمم لعادات الشراء السعودية واللهجة المحلية', enD: 'Designed for Saudi buying habits and local dialect' },
    { icon: BarChart3, ar: 'تحليلات المحادثات', en: 'Conversation Analytics', arD: 'اعرف ماذا يسأل عملاؤك وكيف يشترون', enD: 'Know what customers ask and how they buy' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead title={isAr ? 'منصة التجارة المحادثية | ساري - Conversational Commerce' : 'Conversational Commerce Platform | Sari AI'} description={isAr ? 'ساري هي منصة التجارة المحادثية الأولى في السعودية. حوّل كل محادثة واتساب إلى فرصة بيع — بالذكاء الاصطناعي.' : 'Sari is Saudi Arabia\'s first conversational commerce platform. Turn every WhatsApp conversation into a sales opportunity — powered by AI.'} keywords="التجارة المحادثية, conversational commerce, تجارة واتساب, WhatsApp commerce Saudi, بيع عبر المحادثة, c-commerce" canonicalUrl={`${BASE}/conversational-commerce-platform`} ogType="product" structuredData={schemaData} />
      <Navbar />
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-rose-50 via-pink-50/30 to-white dark:from-rose-950/20 dark:via-gray-900 dark:to-background py-20 md:py-28">
        <div className="container relative">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-sm font-medium"><Sparkles className="w-4 h-4" /><span>{isAr ? 'مستقبل التجارة الإلكترونية' : 'The Future of E-commerce'}</span></div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight"><span className="text-rose-600 dark:text-rose-400">{isAr ? 'التجارة المحادثية' : 'Conversational Commerce'}</span><br />{isAr ? 'حيث المحادثة = مبيعات' : 'Where Conversation = Sales'}</h1>
            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">{isAr ? 'بدل ما ينتظر عميلك في الموقع — كلّمه مباشرة عبر واتساب. ساري يحول كل محادثة إلى فرصة بيع حقيقية باستخدام الذكاء الاصطناعي.' : 'Instead of waiting for customers on your website — talk to them directly via WhatsApp. Sari converts every conversation into a real sales opportunity using AI.'}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup"><a><Button size="lg" className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-lg h-14 px-8 shadow-lg">{isAr ? 'ابدأ البيع المحادثي' : 'Start Conversational Selling'}<Sparkles className="ms-2 w-5 h-5" /></Button></a></Link>
              <Link href="/try-sari"><a><Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">{isAr ? 'جرّب مجاناً' : 'Try Free'}</Button></a></Link>
            </div>
            <div className="grid grid-cols-3 gap-6 pt-8 max-w-xl mx-auto">
              {[{ v: '10-25%', ar: 'معدل تحويل', en: 'Conversion Rate' }, { v: '90%+', ar: 'سعوديين على واتساب', en: 'Saudis on WhatsApp' }, { v: '3-5x', ar: 'زيادة المبيعات', en: 'Sales Increase' }].map(s => (<div key={s.v} className="text-center"><div className="text-3xl font-bold text-rose-600">{s.v}</div><div className="text-sm text-muted-foreground">{isAr ? s.ar : s.en}</div></div>))}
            </div>
          </div>
        </div>
      </section>
      {/* What is C-Commerce */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-8">{isAr ? 'ما هي التجارة المحادثية؟' : 'What is Conversational Commerce?'}</h2>
          <div className="prose prose-lg dark:prose-invert max-w-none text-center">
            <p className="text-xl text-muted-foreground leading-relaxed">{isAr ? 'التجارة المحادثية هي مستقبل البيع الإلكتروني. بدلاً من أن يزور العميل موقعك ويبحث بنفسه، يتحدث مع وكيل ذكي عبر واتساب يفهم احتياجه، يعرض المنتج المناسب، ويتم عملية الشراء — كلها في محادثة واحدة.' : 'Conversational Commerce is the future of online selling. Instead of customers visiting your site and searching on their own, they talk to a smart agent via WhatsApp that understands their needs, shows the right product, and completes the purchase — all in one conversation.'}</p>
          </div>
        </div>
      </section>
      {/* How It Works */}
      <section className="py-20 bg-muted/30">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'كيف تعمل التجارة المحادثية؟' : 'How Does Conversational Commerce Work?'}</h2>
          <div className="space-y-8">
            {[
              { n: '1', ar: 'العميل يراسلك على واتساب', en: 'Customer messages you on WhatsApp', arD: '"أبغى هدية لزوجتي ميزانيتي 300 ريال"', enD: '"I want a gift for my wife, budget 300 SAR"' },
              { n: '2', ar: 'ساري يفهم الاحتياج', en: 'Sari understands the need', arD: 'يحلل الطلب ويبحث في منتجاتك عن الأنسب', enD: 'Analyzes request and searches your products for the best match' },
              { n: '3', ar: 'يعرض ويقنع', en: 'Shows and persuades', arD: 'يعرض 3 خيارات مع الصور والأسعار ويشرح المميزات', enD: 'Shows 3 options with photos, prices, and explains features' },
              { n: '4', ar: 'يتم البيع', en: 'Sale complete', arD: 'العميل يختار ← رابط دفع ← تأكيد ← شحن', enD: 'Customer chooses ← payment link ← confirmation ← shipping' },
            ].map((s, i) => (
              <div key={i} className="flex gap-6 items-start">
                <div className="w-14 h-14 rounded-full bg-rose-600 text-white flex items-center justify-center text-xl font-bold flex-shrink-0">{s.n}</div>
                <div><h3 className="text-xl font-bold mb-1">{isAr ? s.ar : s.en}</h3><p className="text-muted-foreground italic">"{isAr ? s.arD : s.enD}"</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Pillars */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'أركان التجارة المحادثية مع ساري' : 'Pillars of Conversational Commerce with Sari'}</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pillars.map((f, i) => (<Card key={i} className="border-2 hover:border-rose-500 transition-all hover:shadow-lg group"><CardContent className="p-6"><div className="w-12 h-12 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><f.icon className="w-6 h-6 text-rose-600" /></div><h3 className="text-lg font-bold mb-2">{isAr ? f.ar : f.en}</h3><p className="text-muted-foreground text-sm">{isAr ? f.arD : f.enD}</p></CardContent></Card>))}
          </div>
        </div>
      </section>
      {/* Testimonials */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'نتائج حقيقية' : 'Real Results'}</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { name: isAr ? 'متجر أزياء' : 'Fashion Store', role: isAr ? 'أزياء نسائية — الرياض' : 'Women Fashion — Riyadh', text: isAr ? 'معدل التحويل من واتساب 18% مقارنة بـ 2% من الموقع. التجارة المحادثية غيّرت اللعبة.' : 'WhatsApp conversion rate 18% vs. 2% from the website. Conversational commerce is a game changer.' },
              { name: isAr ? 'متجر عطور' : 'Perfume Store', role: isAr ? 'عطور فاخرة — جدة' : 'Luxury Perfumes — Jeddah', text: isAr ? 'ساري يقترح العطور حسب تفضيلات كل عميل. المبيعات تضاعفت والعملاء يرجعون.' : 'Sari suggests perfumes based on each client\'s preferences. Sales doubled and clients return.' },
              { name: isAr ? 'متجر إلكترونيات' : 'Electronics Store', role: isAr ? 'إلكترونيات — الدمام' : 'Electronics — Dammam', text: isAr ? 'استعادة السلات المتروكة عبر واتساب وفّرت لنا 25% مبيعات إضافية شهرياً.' : 'Cart recovery via WhatsApp saved us 25% additional monthly sales.' },
            // @ts-ignore
            ].map((t, i) => (<Card key={i} className="border-2"><CardContent className="p-6"><div className="flex gap-1 mb-3">{[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}</div><p className="text-muted-foreground mb-4 text-sm">{t.text}</p><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">{t.role}</div></CardContent></Card>))}
          </div>
        </div>
      </section>
      {/* FAQ */}
      <section className="py-20 bg-muted/30">
        <div className="container max-w-4xl"><h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'أسئلة شائعة' : 'FAQ'}</h2>
          // @ts-ignore
          <div className="space-y-4">{schemaData["@graph"][1].mainEntity.map((q: any, i: number) => (<Card key={i} className="border"><CardContent className="p-6"><h3 className="font-bold mb-2">{q.name}</h3><p className="text-muted-foreground text-sm">{q.acceptedAnswer.text}</p></CardContent></Card>))}</div>
        </div>
      </section>
      {/* CTA */}
      <section className="py-20 bg-rose-600 text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">{isAr ? 'ادخل عصر التجارة المحادثية' : 'Enter the Era of Conversational Commerce'}</h2>
          <p className="text-xl mb-8 opacity-90">{isAr ? 'ابدأ مجاناً وحوّل محادثاتك إلى مبيعات' : 'Start free and turn your conversations into sales'}</p>
          <Link href="/signup"><a><Button size="lg" variant="secondary" className="text-lg h-14 px-8">{isAr ? 'ابدأ مجاناً' : 'Start Free'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link>
        </div>
      </section>
      <Footer />
    </div>
  );
}