import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';

export default function Pricing() {
  const plans = [
    {
      name: 'الباقة الأساسية',
      nameEn: 'Starter',
      price: 90,
      period: 'شهرياً',
      description: 'مثالية للمتاجر الصغيرة والناشئة',
      features: [
        '150 محادثة شهرياً',
        '50 رسالة صوتية',
        'رد آلي ذكي',
        'إدارة المنتجات',
        'تقارير أساسية',
        'دعم فني عبر البريد',
      ],
      popular: false,
    },
    {
      name: 'باقة النمو',
      nameEn: 'Growth',
      price: 230,
      period: 'شهرياً',
      description: 'الأنسب للمتاجر المتوسطة',
      features: [
        '600 محادثة شهرياً',
        'رسائل صوتية غير محدودة',
        'رد آلي ذكي',
        'إدارة المنتجات',
        'حملات تسويقية',
        'تقارير متقدمة',
        'دعم فني عبر الواتساب',
        'أولوية في الدعم',
      ],
      popular: true,
    },
    {
      name: 'الباقة الاحترافية',
      nameEn: 'Professional',
      price: 845,
      period: 'شهرياً',
      description: 'للمتاجر الكبيرة والمؤسسات',
      features: [
        '2000 محادثة شهرياً',
        'رسائل صوتية غير محدودة',
        'رد آلي ذكي',
        'إدارة المنتجات',
        'حملات تسويقية متقدمة',
        'تقارير وتحليلات شاملة',
        'دعم فني مخصص 24/7',
        'مدير حساب مخصص',
        'تكامل مع الأنظمة الأخرى',
        'تدريب مجاني',
      ],
      popular: false,
    },
  ];

  const faqs = [
    {
      question: 'هل يمكنني تغيير الباقة لاحقاً؟',
      answer: 'نعم، يمكنك الترقية أو التخفيض في أي وقت. سيتم احتساب الفرق في السعر بشكل تناسبي.',
    },
    {
      question: 'ماذا يحدث إذا تجاوزت حد المحادثات؟',
      answer: 'سيتم إيقاف الرد الآلي مؤقتاً حتى الشهر التالي، أو يمكنك الترقية للباقة الأعلى فوراً.',
    },
    {
      question: 'هل هناك فترة تجريبية مجانية؟',
      answer: 'نعم، نوفر فترة تجريبية مجانية لمدة 7 أيام لجميع الباقات بدون الحاجة لبطاقة ائتمانية.',
    },
    {
      question: 'هل يمكنني إلغاء الاشتراك في أي وقت؟',
      answer: 'نعم، يمكنك إلغاء الاشتراك في أي وقت دون أي رسوم إضافية. ستستمر الخدمة حتى نهاية الفترة المدفوعة.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-background">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] dark:bg-grid-slate-700/25" />
        <div className="container relative py-20 md:py-32">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <h1 className="text-4xl md:text-6xl font-bold">
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                خطط تسعير واضحة
              </span>
            </h1>
            <p className="text-xl text-muted-foreground">
              اختر الباقة المناسبة لحجم متجرك. جميع الباقات تشمل فترة تجريبية مجانية 7 أيام
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-20">
        <div className="container">
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <Card
                key={plan.nameEn}
                className={`relative border-2 ${
                  plan.popular
                    ? 'border-blue-600 shadow-xl scale-105'
                    : 'border-border hover:border-blue-200 dark:hover:border-blue-800'
                } transition-all`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-1 rounded-full text-sm font-semibold flex items-center gap-1">
                      <Sparkles className="w-4 h-4" />
                      الأكثر شعبية
                    </div>
                  </div>
                )}

                <CardHeader className="text-center space-y-4 pt-8">
                  <div>
                    <h3 className="text-2xl font-bold">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground">{plan.nameEn}</p>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-center gap-2">
                      <span className="text-5xl font-bold">{plan.price}</span>
                      <span className="text-muted-foreground">ريال</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{plan.period}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </CardHeader>

                <CardContent className="space-y-6">
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href="/login">
                    <a className="block">
                      <Button
                        className={`w-full ${
                          plan.popular
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
                            : ''
                        }`}
                        variant={plan.popular ? 'default' : 'outline'}
                        size="lg"
                      >
                        ابدأ الآن
                        <ArrowRight className="mr-2 w-4 h-4" />
                      </Button>
                    </a>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-muted-foreground">
              جميع الأسعار بالريال السعودي ولا تشمل ضريبة القيمة المضافة (15%)
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              الأسئلة الشائعة
            </h2>
            <p className="text-lg text-muted-foreground">
              إجابات على أكثر الأسئلة شيوعاً حول التسعير
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {faqs.map((faq) => (
              <Card key={faq.question}>
                <CardContent className="p-6 space-y-2">
                  <h3 className="font-semibold text-lg">{faq.question}</h3>
                  <p className="text-muted-foreground">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="container text-center space-y-8">
          <h2 className="text-3xl md:text-5xl font-bold">
            جاهز للبدء؟
          </h2>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            ابدأ فترتك التجريبية المجانية الآن ولا تحتاج لبطاقة ائتمانية
          </p>
          <Link href="/login">
            <a>
              <Button size="lg" variant="secondary" className="text-lg h-14 px-8">
                ابدأ الآن مجاناً
                <ArrowRight className="mr-2 w-5 h-5" />
              </Button>
            </a>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
