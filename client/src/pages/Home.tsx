import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import LiveChatDemo from '@/components/LiveChatDemo';
import LiveStats from '@/components/LiveStats';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  MessageSquare,
  Zap,
  TrendingUp,
  Clock,
  Shield,
  CheckCircle2,
  ArrowRight,
  Star,
  Users,
  BarChart3,
  Sparkles,
  Mic,
  ShoppingCart,
  ShoppingBag,
  FileText,
  Package,
  Gift,
  Bell,
  Check,
  HelpCircle,
} from 'lucide-react';

export default function Home() {
  const { t } = useTranslation();
  
  const features = [
    {
      icon: Mic,
      title: t('home.features.voiceOrder.title'),
      description: t('home.features.voiceOrder.description'),
    },
    {
      icon: Bot,
      title: t('home.features.smartReply.title'),
      description: t('home.features.smartReply.description'),
    },
    {
      icon: ShoppingCart,
      title: t('home.features.autoOrders.title'),
      description: t('home.features.autoOrders.description'),
    },
    {
      icon: ShoppingBag,
      title: t('home.features.abandonedCarts.title'),
      description: t('home.features.abandonedCarts.description'),
    },
    {
      icon: FileText,
      title: t('home.features.invoices.title'),
      description: t('home.features.invoices.description'),
    },
    {
      icon: Package,
      title: t('home.features.tracking.title'),
      description: t('home.features.tracking.description'),
    },
    {
      icon: Gift,
      title: t('home.features.gifts.title'),
      description: t('home.features.gifts.description'),
    },
    {
      icon: Bell,
      title: t('home.features.notifications.title'),
      description: t('home.features.notifications.description'),
    },
    {
      icon: BarChart3,
      title: t('home.features.analytics.title'),
      description: t('home.features.analytics.description'),
    },
    {
      icon: TrendingUp,
      title: t('home.features.sales.title'),
      description: t('home.features.sales.description'),
    },
    {
      icon: Clock,
      title: t('home.features.available.title'),
      description: t('home.features.available.description'),
    },
    {
      icon: Shield,
      title: t('home.features.secure.title'),
      description: t('home.features.secure.description'),
    },
  ];

  const steps = [
    {
      number: '1',
      title: t('home.steps.step1.title'),
      description: t('home.steps.step1.description'),
    },
    {
      number: '2',
      title: t('home.steps.step2.title'),
      description: t('home.steps.step2.description'),
    },
    {
      number: '3',
      title: t('home.steps.step3.title'),
      description: t('home.steps.step3.description'),
    },
    {
      number: '4',
      title: t('home.steps.step4.title'),
      description: t('home.steps.step4.description'),
    },
  ];

  const testimonials = [
    {
      name: t('home.testimonials.testimonial1.name'),
      role: t('home.testimonials.testimonial1.role'),
      content: t('home.testimonials.testimonial1.content'),
      rating: 5,
    },
    {
      name: t('home.testimonials.testimonial2.name'),
      role: t('home.testimonials.testimonial2.role'),
      content: t('home.testimonials.testimonial2.content'),
      rating: 5,
    },
    {
      name: t('home.testimonials.testimonial3.name'),
      role: t('home.testimonials.testimonial3.role'),
      content: t('home.testimonials.testimonial3.content'),
      rating: 5,
    },
  ];

  const stats = [
    { value: '10,000+', label: t('home.stats.merchants') },
    { value: '500,000+', label: t('home.stats.conversations') },
    { value: '95%', label: t('home.stats.satisfaction') },
    { value: '24/7', label: t('home.stats.support') },
  ];

  const pricingPlans = [
    {
      name: t('home.pricingPlans.free.name'),
      price: t('home.pricingPlans.free.price'),
      period: t('home.pricingPlans.free.period'),
      description: t('home.pricingPlans.free.description'),
      features: t('home.pricingPlans.free.features', { returnObjects: true }) as string[],
      cta: t('home.pricingPlans.free.cta'),
      popular: false,
    },
    {
      name: t('home.pricingPlans.professional.name'),
      price: t('home.pricingPlans.professional.price'),
      period: t('home.pricingPlans.professional.period'),
      description: t('home.pricingPlans.professional.description'),
      features: t('home.pricingPlans.professional.features', { returnObjects: true }) as string[],
      cta: t('home.pricingPlans.professional.cta'),
      popular: true,
    },
    {
      name: t('home.pricingPlans.advanced.name'),
      price: t('home.pricingPlans.advanced.price'),
      period: t('home.pricingPlans.advanced.period'),
      description: t('home.pricingPlans.advanced.description'),
      features: t('home.pricingPlans.advanced.features', { returnObjects: true }) as string[],
      cta: t('home.pricingPlans.advanced.cta'),
      popular: false,
    },
  ];

  const faqs = [
    {
      question: t('home.faqs.q1.question'),
      answer: t('home.faqs.q1.answer'),
    },
    {
      question: t('home.faqs.q2.question'),
      answer: t('home.faqs.q2.answer'),
    },
    {
      question: t('home.faqs.q3.question'),
      answer: t('home.faqs.q3.answer'),
    },
    {
      question: t('home.faqs.q4.question'),
      answer: t('home.faqs.q4.answer'),
    },
    {
      question: t('home.faqs.q5.question'),
      answer: t('home.faqs.q5.answer'),
    },
    {
      question: t('home.faqs.q6.question'),
      answer: t('home.faqs.q6.answer'),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-blue-50/50 to-white dark:from-primary/5 dark:via-gray-900 dark:to-background">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] dark:bg-grid-slate-700/25" />
        <div className="container relative py-20 md:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8 animate-fade-in">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 dark:bg-primary/30 text-primary dark:text-primary text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                <span>{t('home.hero.badge')}</span>
              </div>
              
              <h1 className="text-4xl md:text-6xl font-bold leading-tight">
                <span className="text-primary">
                  {t('home.hero.title')}
                </span>
                <br />
                {t('home.hero.subtitle')}
              </h1>
              
              <p className="text-xl text-muted-foreground leading-relaxed">
                {t('home.hero.description')}
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/try-sari">
                  <a>
                    <Button size="lg" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-lg h-14 px-8 shadow-lg hover:shadow-xl transition-all">
                      {t('home.hero.cta')}
                      <Sparkles className="mr-2 w-5 h-5" />
                    </Button>
                  </a>
                </Link>
                <Link href="/login">
                  <a>
                    <Button size="lg" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-lg h-14 px-8 shadow-lg hover:shadow-xl transition-all">
                      {t('home.hero.startFree')}
                      <ArrowRight className="mr-2 w-5 h-5" />
                    </Button>
                  </a>
                </Link>
                <Link href="/pricing">
                  <a>
                    <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">
                      {t('home.hero.watchPrices')}
                    </Button>
                  </a>
                </Link>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-8">
                {stats.map((stat) => (
                  <div key={stat.label} className="text-center">
                    <div className="text-2xl md:text-3xl font-bold text-primary">{stat.value}</div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative animate-fade-in-up">
              <div className="relative z-10 rounded-2xl overflow-hidden shadow-2xl border bg-card">
                <div className="bg-primary p-4 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                    <Bot className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">{t('home.hero.title')}</div>
                    <div className="text-sm text-white/80">{t('home.chat.subtitle')}</div>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 bg-muted p-4 rounded-2xl rounded-tl-none">
                      <p className="text-sm">مرحباً! أنا ساري، مساعدك الذكي. كيف أقدر أساعدك اليوم؟ 😊</p>
                    </div>
                  </div>
                  <div className="flex gap-3 justify-end">
                    <div className="bg-primary text-white p-4 rounded-2xl rounded-tr-none max-w-[80%]">
                      <p className="text-sm">عندكم جوالات آيفون؟</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 bg-muted p-4 rounded-2xl rounded-tl-none">
                      <p className="text-sm">أهلاً وسهلاً! نعم عندنا مجموعة رائعة من أجهزة آيفون. عندنا آيفون 15 برو ماكس بسعر 4,999 ريال، وآيفون 15 بسعر 3,799 ريال. أي موديل يهمك؟</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -z-10 top-10 -right-10 w-72 h-72 bg-primary/30 rounded-full blur-3xl" />
              <div className="absolute -z-10 -bottom-10 -left-10 w-72 h-72 bg-blue-400/30 rounded-full blur-3xl" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              لماذا تختار ساري؟
            </h2>
            <p className="text-lg text-muted-foreground">
              ساري يوفر لك كل ما تحتاجه لتحسين خدمة العملاء وزيادة مبيعاتك
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={feature.title} 
                className="border-2 hover:border-primary/50 dark:hover:border-primary/50 transition-all hover:shadow-lg group"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <CardContent className="p-6 space-y-4">
                  <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20">
        <div className="container">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              كيف يعمل ساري؟
            </h2>
            <p className="text-lg text-muted-foreground">
              ابدأ مع ساري في 4 خطوات بسيطة
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={step.number} className="relative">
                <div className="text-center space-y-4">
                  <div className="relative inline-flex">
                    <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                      {step.number}
                    </div>
                    {index < steps.length - 1 && (
                      <div className="hidden lg:block absolute top-1/2 right-full w-full h-0.5 bg-primary/30 -translate-y-1/2" style={{ width: 'calc(100% + 2rem)' }} />
                    )}
                  </div>
                  <h3 className="text-xl font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Stats Section */}
      <section className="py-16 bg-gradient-to-b from-white to-primary/5 dark:from-background dark:to-primary/5">
        <div className="container">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              في الوقت الفعلي
            </h2>
            <p className="text-lg text-muted-foreground">
              شاهد نشاط ساري مباشرة - محادثات وطلبات تتم الآن
            </p>
          </div>
          <div className="max-w-2xl mx-auto">
            <LiveStats targetConversations={12847} targetOrders={8956} duration={2500} />
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('home.pricingPlans.title')}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t('home.pricingPlans.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {pricingPlans.map((plan) => (
              <Card 
                key={plan.name} 
                className={`relative border-2 ${
                  plan.popular 
                    ? 'border-primary shadow-xl scale-105' 
                    : 'border-border hover:border-primary/30'
                } transition-all`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-semibold">
                    {t('home.pricingPlans.professional.popular')}
                  </div>
                )}
                <CardContent className="p-6 space-y-6">
                  <div>
                    <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                    <p className="text-muted-foreground text-sm">{plan.description}</p>
                  </div>
                  
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">ريال</span>
                    <span className="text-muted-foreground text-sm">/ {plan.period}</span>
                  </div>

                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href="/login">
                    <a>
                      <Button 
                        className={`w-full ${
                          plan.popular 
                            ? 'bg-primary hover:bg-primary/90' 
                            : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
                        }`}
                        size="lg"
                      >
                        {plan.cta}
                      </Button>
                    </a>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20">
        <div className="container">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('home.testimonials.title')}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t('home.testimonials.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial) => (
              <Card key={testimonial.name} className="border-2 hover:shadow-lg transition-shadow">
                <CardContent className="p-6 space-y-4">
                  <div className="flex gap-1">
                    {Array.from({ length: testimonial.rating }).map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-muted-foreground">{testimonial.content}</p>
                  <div>
                    <div className="font-semibold">{testimonial.name}</div>
                    <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Voice Order Feature Section */}
      <section className="py-20 bg-gradient-to-br from-primary/10 to-blue-50 dark:from-primary/5 dark:to-background">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <LiveChatDemo />
            </div>

            <div className="order-1 lg:order-2 space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 dark:bg-primary/30 text-primary dark:text-primary text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                <span>ميزة جديدة</span>
              </div>
              
              <h2 className="text-3xl md:text-5xl font-bold leading-tight">
                محادثة ذكية تتحول
                <br />
                <span className="text-primary">إلى طلب مكتمل</span>
              </h2>
              
              <p className="text-xl text-muted-foreground leading-relaxed">
                شاهد كيف يتحدث ساري مع عملائك بشكل طبيعي، يفهم احتياجاتهم، يعرض المنتجات المناسبة، ويحول المحادثة إلى طلب مكتمل مع رابط الدفع تلقائياً!
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">محادثة طبيعية</h3>
                    <p className="text-muted-foreground">يتحدث باللهجة السعودية ويفهم السياق بذكاء</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">عرض منتجات مخصص</h3>
                    <p className="text-muted-foreground">يقترح المنتجات المناسبة مع الأسعار والتفاصيل</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">إتمام الطلب تلقائياً</h3>
                    <p className="text-muted-foreground">يجمع التفاصيل ويرسل رابط الدفع فوراً</p>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <Link href="/login">
                  <a>
                    <Button size="lg" className="bg-primary hover:bg-primary/90 text-lg h-14 px-8 shadow-lg">
                      جرب الميزة الآن
                      <ArrowRight className="mr-2 w-5 h-5" />
                    </Button>
                  </a>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('home.faqs.title')}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t('home.faqs.subtitle')}
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {faqs.map((faq, index) => (
              <Card key={index} className="border-2">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <HelpCircle className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">{faq.question}</h3>
                      <p className="text-muted-foreground">{faq.answer}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary text-white">
        <div className="container text-center space-y-8">
          <h2 className="text-3xl md:text-5xl font-bold">
            {t('home.cta.title')}
          </h2>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            {t('home.cta.description')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <a>
                <Button size="lg" variant="secondary" className="w-full sm:w-auto text-lg h-14 px-8 shadow-lg hover:shadow-xl">
                  {t('home.cta.button')}
                  <ArrowRight className="mr-2 w-5 h-5" />
                </Button>
              </a>
            </Link>
            <Link href="/support">
              <a>
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8 bg-transparent border-white text-white hover:bg-white/10">
                  {t('home.cta.contact')}
                </Button>
              </a>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
