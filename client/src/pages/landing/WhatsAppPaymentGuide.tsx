import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  CreditCard, ArrowRight, CheckCircle2, Shield, Zap,
  Smartphone, Link2, QrCode, Banknote, Globe, Clock, Star,
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
        { "@type": "HowToStep", "position": 1, "name": "ربط بوابة الدفع", "text": "اربط حسابك في Tap أو Moyasar أو أي بوابة دفع مدعومة من إعدادات ساري." },
        { "@type": "HowToStep", "position": 2, "name": "إعداد المنتجات", "text": "تأكد من إضافة أسعار منتجاتك. ساري يستخدمها تلقائياً عند إنشاء روابط الدفع." },
        { "@type": "HowToStep", "position": 3, "name": "البيع التلقائي", "text": "عندما يريد العميل الشراء، ساري يرسل رابط دفع مباشر في المحادثة تلقائياً." },
        { "@type": "HowToStep", "position": 4, "name": "التأكيد والمتابعة", "text": "بعد الدفع، ساري يؤكد الطلب ويرسل تفاصيل الشحن والفاتورة للعميل تلقائياً." },
      ],
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "ما هي بوابات الدفع المدعومة؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري يدعم Tap Payments و Moyasar و Apple Pay و مدى. يمكنك ربط بوابة الدفع من إعدادات لوحة التحكم." }},
        { "@type": "Question", "name": "هل الدفع آمن؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم. كل عمليات الدفع تتم عبر بوابات مرخصة ومشفرة بمعيار PCI DSS. ساري لا يخزن أي بيانات بطاقات." }},
        { "@type": "Question", "name": "هل يمكن للعميل الدفع بأكثر من طريقة؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم. رابط الدفع يدعم فيزا وماستركارد ومدى وApple Pay وSTCPay حسب بوابة الدفع المربوطة." }},
        { "@type": "Question", "name": "هل يرسل ساري فاتورة بعد الدفع؟", "acceptedAnswer": { "@type": "Answer", "text": "نعم. ساري يرسل تأكيد الطلب وتفاصيل الفاتورة تلقائياً عبر واتساب بعد إتمام الدفع." }},
        { "@type": "Question", "name": "كم نسبة العمولة؟", "acceptedAnswer": { "@type": "Answer", "text": "ساري لا يأخذ أي عمولة على المبيعات. العمولة الوحيدة هي رسوم بوابة الدفع (عادة 2.5% + 0.5 ريال)." }},
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
  const isAr = i18n.language === 'ar';

  const paymentMethods = [
    { icon: <CreditCard className="w-6 h-6" />, name: isAr ? 'فيزا / ماستركارد' : 'Visa / Mastercard' },
    { icon: <Banknote className="w-6 h-6" />, name: isAr ? 'مدى' : 'Mada' },
    { icon: <Smartphone className="w-6 h-6" />, name: 'Apple Pay' },
    { icon: <QrCode className="w-6 h-6" />, name: 'STC Pay' },
  ];

  const steps = [
    { n: '1', color: 'bg-emerald-600', title: isAr ? 'اربط بوابة الدفع' : 'Connect Payment Gateway', desc: isAr ? 'من إعدادات ساري، اربط حسابك في Tap أو Moyasar. التفعيل فوري ولا يحتاج خبرة تقنية.' : 'From Sari settings, connect your Tap or Moyasar account. Activation is instant, no technical expertise needed.' },
    { n: '2', color: 'bg-blue-600', title: isAr ? 'العميل يطلب الشراء' : 'Customer Wants to Buy', desc: isAr ? 'العميل يراسلك على واتساب ويختار المنتج. ساري يشرح المميزات ويجيب الأسئلة حتى يقتنع العميل.' : 'Customer messages you on WhatsApp and picks a product. Sari explains features and answers questions until convinced.' },
    { n: '3', color: 'bg-purple-600', title: isAr ? 'رابط دفع فوري' : 'Instant Payment Link', desc: isAr ? 'ساري يرسل رابط دفع مباشرة في المحادثة. العميل يضغط، يدفع بالطريقة المفضلة — خلال 30 ثانية.' : 'Sari sends a payment link directly in chat. Customer clicks, pays with preferred method — in 30 seconds.' },
    { n: '4', color: 'bg-orange-600', title: isAr ? 'تأكيد وشحن' : 'Confirmation & Shipping', desc: isAr ? 'بعد الدفع، ساري يرسل تأكيد الطلب + رقم الفاتورة + تفاصيل الشحن — كل شيء تلقائي.' : 'After payment, Sari sends order confirmation + invoice number + shipping details — all automatic.' },
  ];

  return (
    <>
      <SeoHead title={isAr ? 'دليل الدفع عبر واتساب — روابط دفع ذكية من ساري' : 'WhatsApp Payment Guide — Smart Payment Links by Sari'} description={isAr ? 'تعرف على كيفية إرسال روابط دفع إلكترونية عبر واتساب مع ساري. دعم فيزا، مدى، Apple Pay وSTCPay.' : 'Learn how to send electronic payment links via WhatsApp with Sari. Supports Visa, Mada, Apple Pay, and STCPay.'} url={`${BASE}/docs/whatsapp-payment-guide`} schemaMarkup={JSON.stringify(schemaData)} />
      <Navbar />
      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-emerald-50 to-background dark:from-emerald-950/20">
        <div className="container text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 text-emerald-700 text-sm font-medium mb-6"><CreditCard className="w-4 h-4" />{isAr ? 'دليل الدفع' : 'Payment Guide'}</div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6">{isAr ? 'الدفع عبر واتساب' : 'WhatsApp Payments'}</h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">{isAr ? 'حوّل محادثات واتساب إلى نقطة بيع. أرسل روابط دفع ذكية واستقبل المدفوعات مباشرة — بدون موقع إلكتروني.' : 'Turn WhatsApp conversations into a point of sale. Send smart payment links and receive payments directly — no website needed.'}</p>
          <div className="flex flex-wrap gap-4 justify-center">
            {paymentMethods.map((m, i) => (<div key={i} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-muted border shadow-sm text-sm font-medium">{m.icon}{m.name}</div>))}
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
              { icon: <Shield className="w-8 h-8" />, title: isAr ? 'تشفير PCI DSS' : 'PCI DSS Encryption', desc: isAr ? 'كل عمليات الدفع مشفرة بأعلى معايير الأمان العالمية' : 'All payments encrypted with highest global security standards' },
              { icon: <CheckCircle2 className="w-8 h-8" />, title: isAr ? 'بوابات مرخصة' : 'Licensed Gateways', desc: isAr ? 'نستخدم بوابات دفع مرخصة من البنك المركزي السعودي' : 'We use gateways licensed by Saudi Central Bank' },
              { icon: <Clock className="w-8 h-8" />, title: isAr ? 'تحويل فوري' : 'Instant Transfer', desc: isAr ? 'المبالغ تُحول لحسابك مباشرة — بدون تأخير' : 'Amounts transferred to your account directly — no delay' },
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
          <h2 className="text-3xl md:text-5xl font-bold mb-6">{isAr ? 'جاهز تبدأ تقبض؟' : 'Ready to Get Paid?'}</h2>
          <p className="text-xl opacity-90 mb-8">{isAr ? 'فعّل الدفع عبر واتساب مجاناً — بدون عمولة من ساري' : 'Activate WhatsApp payments for free — no commission from Sari'}</p>
          <Link href="/signup"><a><Button size="lg" variant="secondary" className="text-lg h-14 px-8">{isAr ? 'ابدأ مجاناً' : 'Start Free'}<ArrowRight className="ms-2 w-5 h-5" /></Button></a></Link>
        </div>
      </section>
      <Footer />
    </>
  );
}
