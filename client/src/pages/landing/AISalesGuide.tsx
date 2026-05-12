import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  TrendingUp, ArrowRight, Target, Users, Repeat,
  MessageSquare, Star, Sparkles, BarChart3, DollarSign,
  Heart, Lightbulb, Zap, Clock, Bot,
} from 'lucide-react';

const BASE = 'https://sary.live';

const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "headline": "دليل البيع بالذكاء الاصطناعي عبر واتساب",
      "description": "دليل شامل لاستراتيجيات البيع بالذكاء الاصطناعي عبر واتساب للمتاجر الإلكترونية في السعودية",
      "author": { "@type": "Organization", "name": "ساري | Sari" },
      "publisher": { "@type": "Organization", "name": "ساري | Sari", "logo": { "@type": "ImageObject", "url": `${BASE}/sari-logo.png` }},
      "datePublished": "2025-01-01",
      "dateModified": new Date().toISOString().split('T')[0],
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "ما هو البيع بالذكاء الاصطناعي؟", "acceptedAnswer": { "@type": "Answer", "text": "البيع بالذكاء الاصطناعي هو استخدام تقنيات AI لأتمتة عملية البيع — من فهم احتياج العميل حتى إتمام الشراء — بدون تدخل بشري مباشر." }},
        { "@type": "Question", "name": "لماذا واتساب للبيع وليس الموقع فقط؟", "acceptedAnswer": { "@type": "Answer", "text": "معدل التحويل من واتساب في السعودية 15-20% مقابل 1-3% من المواقع. السبب: واتساب يقدم تجربة محادثية شخصية وفورية." }},
        { "@type": "Question", "name": "كيف يزيد الذكاء الاصطناعي المبيعات؟", "acceptedAnswer": { "@type": "Answer", "text": "AI يرد فوراً 24/7، يفهم احتياج كل عميل بشكل شخصي، يقترح المنتج المناسب، ويتابع تلقائياً — مما يرفع معدل التحويل والمتوسط." }},
        { "@type": "Question", "name": "هل الذكاء الاصطناعي يستبدل فريق المبيعات؟", "acceptedAnswer": { "@type": "Answer", "text": "لا يستبدل — بل يُعزز. AI يتولى 80% من المحادثات الروتينية ويحول الحالات المعقدة للفريق البشري مع ملخص كامل." }},
        { "@type": "Question", "name": "ما هي أفضل استراتيجيات البيع عبر واتساب؟", "acceptedAnswer": { "@type": "Answer", "text": "أهم 3 استراتيجيات: 1) الرد السريع (أقل من 30 ثانية)، 2) التخصيص (اقتراح منتجات مبنية على سلوك العميل)، 3) المتابعة الذكية (رسائل المتابعة واستعادة السلات المتروكة)." }},
      ]
    },
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "ساري", "item": BASE },
      { "@type": "ListItem", "position": 2, "name": "دليل البيع بالذكاء الاصطناعي", "item": `${BASE}/docs/ai-sales-guide` },
    ]}
  ]
};

export default function AISalesGuide() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const strategies = [
    { icon: <Zap className="w-6 h-6" />, title: isAr ? 'السرعة = مبيعات' : 'Speed = Sales', desc: isAr ? 'الرد خلال 30 ثانية يزيد احتمال البيع 21 ضعف. ساري يرد فوراً — بينما منافسيك ينتظرون ساعات.' : 'Responding within 30 seconds increases sale probability 21x. Sari responds instantly — while competitors wait hours.' },
    { icon: <Target className="w-6 h-6" />, title: isAr ? 'التخصيص الذكي' : 'Smart Personalization', desc: isAr ? 'بدل عرض كل المنتجات، ساري يفهم احتياج العميل ويقترح 2-3 منتجات مناسبة فقط. هذا يرفع التحويل من 3% لـ 18%.' : 'Instead of showing all products, Sari understands needs and suggests only 2-3 relevant ones. This raises conversion from 3% to 18%.' },
    { icon: <Repeat className="w-6 h-6" />, title: isAr ? 'المتابعة التلقائية' : 'Auto Follow-up', desc: isAr ? '68% من السلات تُترك بدون شراء. ساري يتابع تلقائياً عبر واتساب ويسترد 25% منها — بدون أي تدخل.' : '68% of carts are abandoned. Sari follows up automatically via WhatsApp and recovers 25% — without any intervention.' },
    { icon: <Heart className="w-6 h-6" />, title: isAr ? 'بناء العلاقات' : 'Relationship Building', desc: isAr ? 'ساري يتذكر كل عميل — ماذا اشترى سابقاً، ما يفضله، ومتى آخر تواصل. هذا يخلق تجربة شخصية تبني ولاء.' : 'Sari remembers every customer — past purchases, preferences, last contact. This creates personal experiences that build loyalty.' },
    { icon: <Sparkles className="w-6 h-6" />, title: isAr ? 'البيع العابر' : 'Cross-selling', desc: isAr ? '"عميل يشتري جوال؟ ساري يقترح جراب + شاحن لاسلكي تلقائياً." البيع العابر يرفع متوسط الطلب 30%.' : '"Customer buying a phone? Sari auto-suggests case + wireless charger." Cross-selling raises average order by 30%.' },
    { icon: <BarChart3 className="w-6 h-6" />, title: isAr ? 'قرارات بالبيانات' : 'Data-Driven Decisions', desc: isAr ? 'ساري يحلل كل محادثة ويعطيك تقارير: أكثر المنتجات طلباً، أسباب عدم الشراء، وأفضل أوقات البيع.' : 'Sari analyzes every conversation and gives you reports: most requested products, purchase blockers, and best selling times.' },
  ];

  const stats = [
    { v: '21x', ar: 'زيادة احتمال البيع بالرد السريع', en: 'Sale probability increase with fast response' },
    { v: '18%', ar: 'معدل تحويل واتساب في السعودية', en: 'WhatsApp conversion rate in Saudi Arabia' },
    { v: '25%', ar: 'استرداد السلات المتروكة', en: 'Abandoned cart recovery rate' },
    { v: '30%', ar: 'زيادة متوسط الطلب بالبيع العابر', en: 'Average order increase with cross-selling' },
  ];

  return (
    <>
      <SeoHead title={isAr ? 'دليل البيع بالذكاء الاصطناعي عبر واتساب — استراتيجيات 2025' : 'AI Sales Guide for WhatsApp — 2025 Strategies'} description={isAr ? 'دليل شامل لاستراتيجيات البيع بالذكاء الاصطناعي عبر واتساب. تعلم كيف ترفع مبيعاتك 5 أضعاف باستخدام ساري.' : 'Complete guide to AI sales strategies via WhatsApp. Learn how to increase your sales 5x using Sari.'} url={`${BASE}/docs/ai-sales-guide`} schemaMarkup={JSON.stringify(schemaData)} />
      <Navbar />
      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-amber-50 to-background dark:from-amber-950/20">
        <div className="container text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-700 text-sm font-medium mb-6"><TrendingUp className="w-4 h-4" />{isAr ? 'دليل البيع الذكي' : 'Smart Sales Guide'}</div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6">{isAr ? 'البيع بالذكاء الاصطناعي' : 'AI-Powered Sales'}</h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">{isAr ? '6 استراتيجيات مثبتة لرفع مبيعاتك عبر واتساب باستخدام الذكاء الاصطناعي. من التجارة التقليدية إلى التجارة المحادثية.' : '6 proven strategies to boost your WhatsApp sales using AI. From traditional commerce to conversational commerce.'}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-4 max-w-2xl mx-auto">
            {stats.map(s => (<div key={s.v} className="text-center"><div className="text-3xl font-bold text-amber-600">{s.v}</div><div className="text-xs text-muted-foreground">{isAr ? s.ar : s.en}</div></div>))}
          </div>
        </div>
      </section>

      {/* Strategies */}
      <section className="py-20">
        <div className="container">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-4">{isAr ? '6 استراتيجيات مثبتة' : '6 Proven Strategies'}</h2>
          <p className="text-xl text-muted-foreground text-center mb-16 max-w-2xl mx-auto">{isAr ? 'كل استراتيجية يطبقها ساري تلقائياً — بدون أي تدخل منك' : 'Every strategy is applied by Sari automatically — without any intervention'}</p>
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {strategies.map((s, i) => (<Card key={i} className="border hover:shadow-lg transition-shadow"><CardContent className="p-6"><div className="flex items-center gap-3 mb-4"><div className="w-12 h-12 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">{s.icon}</div><h3 className="text-lg font-bold">{s.title}</h3></div><p className="text-muted-foreground leading-relaxed">{s.desc}</p></CardContent></Card>))}
          </div>
        </div>
      </section>

      {/* Before/After */}
      <section className="py-20 bg-muted/30">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'قبل وبعد ساري' : 'Before & After Sari'}</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="border-red-200 bg-red-50/50"><CardContent className="p-6"><h3 className="text-xl font-bold text-red-700 mb-4">{isAr ? '❌ بدون ساري' : '❌ Without Sari'}</h3><ul className="space-y-3 text-sm text-red-800">{[isAr ? 'الرد بعد ساعات — العميل يروح للمنافس' : 'Reply after hours — customer goes to competitor', isAr ? 'نفس الرد لكل عميل — تجربة عامة' : 'Same reply for everyone — generic experience', isAr ? '68% سلات متروكة — بدون متابعة' : '68% abandoned carts — no follow-up', isAr ? 'لا تحليلات — قرارات بالحدس' : 'No analytics — gut-feeling decisions'].map((t, i) => (<li key={i} className="flex gap-2"><span>•</span>{t}</li>))}</ul></CardContent></Card>
            <Card className="border-green-200 bg-green-50/50"><CardContent className="p-6"><h3 className="text-xl font-bold text-green-700 mb-4">{isAr ? '✅ مع ساري' : '✅ With Sari'}</h3><ul className="space-y-3 text-sm text-green-800">{[isAr ? 'رد فوري 24/7 — لا عميل يُفقد' : 'Instant 24/7 response — no customer lost', isAr ? 'اقتراحات مخصصة لكل عميل — تحويل عالي' : 'Personalized suggestions — high conversion', isAr ? 'متابعة تلقائية — استرداد 25% من السلات' : 'Auto follow-up — 25% cart recovery', isAr ? 'تحليلات مفصلة — قرارات بالبيانات' : 'Detailed analytics — data-driven decisions'].map((t, i) => (<li key={i} className="flex gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />{t}</li>))}</ul></CardContent></Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'أسئلة شائعة' : 'FAQ'}</h2>
          <div className="space-y-4">{schemaData["@graph"][1].mainEntity.map((q: any, i: number) => (<Card key={i} className="border"><CardContent className="p-6"><h3 className="font-bold mb-2">{q.name}</h3><p className="text-muted-foreground text-sm">{q.acceptedAnswer.text}</p></CardContent></Card>))}</div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-amber-600 text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">{isAr ? 'طبّق هذه الاستراتيجيات اليوم' : 'Apply These Strategies Today'}</h2>
          <p className="text-xl opacity-90 mb-8">{isAr ? 'ساري يطبقها كلها تلقائياً — ابدأ مجاناً' : 'Sari applies them all automatically — start free'}</p>
          <Link href="/signup"><a><Button size="lg" variant="secondary" className="text-lg h-14 px-8">{isAr ? 'ابدأ مجاناً' : 'Start Free'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link>
        </div>
      </section>
      <Footer />
    </>
  );
}
