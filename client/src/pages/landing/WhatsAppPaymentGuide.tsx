// @ts-nocheck
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  CreditCard, ArrowRight, CheckCircle2, Shield,
} from 'lucide-react';

const BASE = 'https://sary.live';

const schemaData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "HowTo",
      "name": "دليل الدفع عبر واتساب مع ساري",
      "description": "دليل شامل لإعداد واستخدام روابط الدفع الإلكتروني عبر محادثات واتساب مع ساري",
      "step": [
        { "@type": "HowToStep", "position": 1, "name": "إعداد Tap", "text": "أدخل مفاتيح Tap المطابقة لوضع الاختبار أو الإنتاج، ثم اختبر الاتصال قبل التفعيل." },
        { "@type": "HowToStep", "position": 2, "name": "مراجعة الطلب", "text": "يأخذ الخادم السعر والعملة والمرجع من السجل المحفوظ، لا من نص يرسله المتصفح." },
        { "@type": "HowToStep", "position": 3, "name": "إنشاء الرابط", "text": "يرسل ساري رابط الدفع فقط إذا أعادت Tap رابط عملية صالحًا؛ وإلا تظهر نتيجة فشل صريحة." },
        { "@type": "HowToStep", "position": 4, "name": "التحقق من النتيجة", "text": "تتغير حالة الدفع بعد callback موثّق ومطابقة المبلغ والعملة والمرجع." },
      ],
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "ما بوابة الدفع المدعومة في المسار الحالي؟", "acceptedAnswer": { "@type": "Answer", "text": "المسار الحالي يدعم Tap Payments بمفاتيح يملكها التاجر ويجب التحقق منها قبل الاستخدام." }},
        { "@type": "Question", "name": "كيف تُحمى بيانات البطاقة؟", "acceptedAnswer": { "@type": "Answer", "text": "يفتح العميل الرابط المستضاف الذي تعيده Tap؛ لا يطلب ساري رقم البطاقة أو رمزها داخل محادثة واتساب." }},
        { "@type": "Question", "name": "ما وسائل الدفع المتاحة؟", "acceptedAnswer": { "@type": "Answer", "text": "تحدد Tap وحساب التاجر والبلد وسائل الدفع التي تظهر داخل صفحة المزود. لا تعد صفحة ساري بطريقة غير مفعلة في حسابك." }},
        { "@type": "Question", "name": "متى يؤكد ساري نجاح الدفع؟", "acceptedAnswer": { "@type": "Answer", "text": "بعد callback موثّق ومطابقة حالة العملية والمبلغ والعملة والمرجع؛ فتح الرابط وحده لا يعني نجاح الدفع." }},
        { "@type": "Question", "name": "كم رسوم الدفع؟", "acceptedAnswer": { "@type": "Answer", "text": "رسوم المعاملة ووسائل الدفع المتاحة يحددها عقد التاجر مع بوابة الدفع وقد تتغير. راجع لوحة البوابة واتفاقيتك قبل نشر السعر لعملائك." }},
      ]
    },
    { "@type": "BreadcrumbList", "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "ساري", "item": BASE },
      { "@type": "ListItem", "position": 2, "name": "دليل الدفع عبر واتساب", "item": `${BASE}/docs/whatsapp-payment-guide` },
    ]}
  ]
};

export default function WhatsAppPaymentGuide() {
  const { i18n } = useTranslation();
  const isAr = (i18n.resolvedLanguage || i18n.language).startsWith('ar');

  const paymentFacts = [
    isAr ? 'Tap Payments هو المسار الحالي' : 'Tap Payments is the current path',
    isAr ? 'فصل صريح بين test وlive' : 'Explicit test/live separation',
    isAr ? 'وسائل الدفع يحددها حساب التاجر لدى Tap' : 'Payment methods depend on the merchant Tap account',
  ];

  const steps = [
    { n: '1', color: 'bg-emerald-600', title: isAr ? 'تحقق من إعداد Tap' : 'Verify Tap Setup', desc: isAr ? 'استخدم مفاتيح test للاختبار وlive للإنتاج. لا يعمل الدفع إذا كانت المفاتيح أو الوضع غير متطابقين أو لم ينجح اختبار الاتصال.' : 'Use test keys for testing and live keys for production. Payments remain disabled when keys, mode, or verification do not match.' },
    { n: '2', color: 'bg-blue-600', title: isAr ? 'احفظ الطلب أولًا' : 'Persist the Order First', desc: isAr ? 'يحفظ ساري الطلب والسعر والعملة والمرجع خادميًا قبل طلب رابط الدفع.' : 'Sari persists the order, price, currency, and reference server-side before requesting a payment URL.' },
    { n: '3', color: 'bg-purple-600', title: isAr ? 'أرسل رابط المزود عند نجاحه' : 'Send the Provider URL on Success', desc: isAr ? 'إذا أعادت Tap رابطًا صالحًا يمكن إرساله في المحادثة؛ فشل المزود لا يتحول إلى رسالة نجاح.' : 'When Tap returns a valid URL it can be sent in chat; provider failure is never presented as success.' },
    { n: '4', color: 'bg-orange-600', title: isAr ? 'أكد النتيجة الموثقة' : 'Confirm the Verified Result', desc: isAr ? 'يؤكد الخادم الدفع بعد callback صحيح ومطابقة المبلغ والعملة والمرجع. تفاصيل الفاتورة والتسوية تتبع إعدادات التاجر والمزود.' : 'The server confirms payment after a valid callback and amount, currency, and reference checks. Invoicing and settlement follow merchant and provider settings.' },
  ];

  return (
    <>
      <SeoHead title={isAr ? 'دليل الدفع عبر واتساب — ربط Tap والتحقق من النتيجة' : 'WhatsApp Payment Guide — Tap Setup and Verification'} description={isAr ? 'تعرّف على إنشاء رابط Tap من طلب محفوظ والتحقق من callback والمبلغ والعملة قبل تأكيد الدفع.' : 'Learn how Sari creates a Tap URL from a persisted order and verifies the callback, amount, and currency before confirming payment.'} url={`${BASE}/docs/whatsapp-payment-guide`} schemaMarkup={JSON.stringify(schemaData)} />
      <Navbar />
      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-emerald-50 to-background dark:from-emerald-950/20">
        <div className="container text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 text-emerald-700 text-sm font-medium mb-6"><CreditCard className="w-4 h-4" />{isAr ? 'دليل الدفع' : 'Payment Guide'}</div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6">{isAr ? 'الدفع عبر واتساب' : 'WhatsApp Payments'}</h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">{isAr ? 'أرسل رابط Tap الذي ينشئه الخادم من طلب محفوظ، وتابع النتيجة بعد تحقق callback بدل اعتبار فتح الرابط دفعًا ناجحًا.' : 'Send the Tap URL created server-side from a persisted order, then follow the verified callback instead of treating a link visit as a successful payment.'}</p>
          <div className="flex flex-wrap gap-4 justify-center">
            {paymentFacts.map(fact => (<div key={fact} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-muted border shadow-sm text-sm font-medium"><CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" />{fact}</div>))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-20">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'كيف يعمل الدفع؟' : 'How Does Payment Work?'}</h2>
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

      {/* Security */}
      <section className="py-20 bg-muted/30">
        <div className="container max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">{isAr ? 'أمان الدفع' : 'Payment Security'}</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: <Shield className="w-8 h-8" />, title: isAr ? 'إدخال البطاقة لدى المزود' : 'Provider-Hosted Card Entry', desc: isAr ? 'ساري لا يطلب رقم البطاقة أو رمزها داخل محادثة واتساب؛ يستخدم الرابط الذي تعيده Tap.' : 'Sari does not request card numbers or codes in WhatsApp; it uses the URL returned by Tap.' },
              { icon: <CheckCircle2 className="w-8 h-8" />, title: isAr ? 'تحقق قبل التفعيل' : 'Verification Before Enablement', desc: isAr ? 'يجب أن تتطابق مفاتيح Tap مع وضع test أو live وأن ينجح فحص الاتصال.' : 'Tap keys must match test or live mode and pass connection verification.' },
              { icon: <CreditCard className="w-8 h-8" />, title: isAr ? 'تأكيد من callback' : 'Callback-Based Confirmation', desc: isAr ? 'لا تصبح العملية مدفوعة حتى ينجح تحقق callback وتطابق المبلغ والعملة والمرجع.' : 'A transaction is not marked paid until callback, amount, currency, and reference checks pass.' },
            ].map((f, i) => (<Card key={i}><CardContent className="p-6 text-center"><div className="w-14 h-14 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">{f.icon}</div><h3 className="font-bold mb-2">{f.title}</h3><p className="text-sm text-muted-foreground">{f.desc}</p></CardContent></Card>))}
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
      <section className="py-20 bg-emerald-600 text-white">
        <div className="container text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">{isAr ? 'اختبر الدفع قبل تشغيله للعملاء' : 'Test Payments Before Going Live'}</h2>
          <p className="text-xl opacity-90 mb-8">{isAr ? 'ابدأ بحساب تجريبي، اربط مفاتيح Tap الاختبارية، وتحقق من النجاح والفشل وcallback قبل استخدام live.' : 'Start a trial, connect Tap test keys, and verify success, failure, and callbacks before using live mode.'}</p>
          <Button asChild size="lg" variant="secondary" className="text-lg h-14 px-8">
            <Link href="/signup">{isAr ? 'ابدأ التجربة' : 'Start Trial'}<ArrowRight aria-hidden="true" className="ms-2 w-5 h-5" /></Link>
          </Button>
        </div>
      </section>
      <Footer />
    </>
  );
}
