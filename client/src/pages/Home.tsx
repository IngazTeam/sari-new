import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SeoHead, seoConfigs } from '@/components/SeoHead';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import LiveChatDemo from '@/components/LiveChatDemo';
import LiveStats from '@/components/LiveStats';
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
      title: t('home.features.reports.title'),
      description: t('home.features.reports.description'),
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
      name: t('home.pricing.free.name'),
      price: t('home.pricing.free.price'),
      period: t('home.pricing.free.period'),
      description: t('home.pricing.free.description'),
      features: [
        t('home.pricing.free.feature1'),
        t('home.pricing.free.feature2'),
        t('home.pricing.free.feature3'),
        t('home.pricing.free.feature4'),
      ],
      cta: t('home.pricing.free.cta'),
      popular: false,
    },
    {
      name: t('home.pricing.pro.name'),
      price: t('home.pricing.pro.price'),
      period: t('home.pricing.pro.period'),
      description: t('home.pricing.pro.description'),
      features: [
        t('home.pricing.pro.feature1'),
        t('home.pricing.pro.feature2'),
        t('home.pricing.pro.feature3'),
        t('home.pricing.pro.feature4'),
        t('home.pricing.pro.feature5'),
        t('home.pricing.pro.feature6'),
      ],
      cta: t('home.pricing.pro.cta'),
      popular: true,
    },
    {
      name: t('home.pricing.advanced.name'),
      price: t('home.pricing.advanced.price'),
      period: t('home.pricing.advanced.period'),
      description: t('home.pricing.advanced.description'),
      features: [
        t('home.pricing.advanced.feature1'),
        t('home.pricing.advanced.feature2'),
        t('home.pricing.advanced.feature3'),
        t('home.pricing.advanced.feature4'),
        t('home.pricing.advanced.feature5'),
        t('home.pricing.advanced.feature6'),
      ],
      cta: t('home.pricing.advanced.cta'),
      popular: false,
    },
  ];

  const faqs = [
    {
      question: t('home.faq.q1.question'),
      answer: t('home.faq.q1.answer'),
    },
    {
      question: t('home.faq.q2.question'),
      answer: t('home.faq.q2.answer'),
    },
    {
      question: t('home.faq.q3.question'),
      answer: t('home.faq.q3.answer'),
    },
    {
      question: t('home.faq.q4.question'),
      answer: t('home.faq.q4.answer'),
    },
    {
      question: t('home.faq.q5.question'),
      answer: t('home.faq.q5.answer'),
    },
    {
      question: t('home.faq.q6.question'),
      answer: t('home.faq.q6.answer'),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead {...seoConfigs.home} />
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
                      {t('home.hero.ctaTrySari')}
                      <Sparkles className="mr-2 w-5 h-5" />
                    </Button>
                  </a>
                </Link>
                <Link href="/login">
                  <a>
                    <Button size="lg" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-lg h-14 px-8 shadow-lg hover:shadow-xl transition-all">
                      {t('home.hero.ctaStartFree')}
                      <ArrowRight className="mr-2 w-5 h-5" />
                    </Button>
                  </a>
                </Link>
                <Link href="/pricing">
                  <a>
                    <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8">
                      {t('home.hero.ctaPricing')}
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
                    <div className="font-semibold text-white">{t('home.chat.title')}</div>
                    <div className="text-sm text-white/80">{t('home.chat.subtitle')}</div>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 bg-muted p-4 rounded-2xl rounded-tl-none">
                      <p className="text-sm">{t('home.chat.greeting')}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 justify-end">
                    <div className="flex-1 bg-primary text-white p-4 rounded-2xl rounded-tr-none max-w-[80%]">
                      <p className="text-sm">{t('home.chat.customerQuestion')}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Users className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="bg-muted p-4 rounded-2xl rounded-tl-none">
                        <p className="text-sm">{t('home.chat.botResponse1')}</p>
                      </div>
                      <div className="bg-muted p-4 rounded-2xl rounded-tl-none">
                        <p className="text-sm">{t('home.chat.botResponse2')}</p>
                      </div>
                      <div className="bg-muted p-4 rounded-2xl rounded-tl-none">
                        <p className="text-sm font-semibold text-primary">{t('home.chat.botResponse3')}</p>
                      </div>
                      <div className="bg-muted p-4 rounded-2xl rounded-tl-none">
                        <p className="text-sm">{t('home.chat.botResponse4')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 justify-end">
                    <div className="flex-1 bg-primary text-white p-4 rounded-2xl rounded-tr-none max-w-[80%]">
                      <p className="text-sm">{t('home.chat.customerReply')}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <Users className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 bg-muted p-4 rounded-2xl rounded-tl-none">
                      <p className="text-sm">{t('home.chat.botConfirm')}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -z-10 top-8 left-8 w-full h-full bg-primary/10 rounded-2xl" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">{t('home.features.title')}</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {t('home.features.subtitle')}
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-2 hover:border-primary transition-all hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-20 bg-muted/50">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">{t('home.steps.title')}</h2>
            <p className="text-xl text-muted-foreground">{t('home.steps.subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-2xl font-bold mb-4">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-primary/20" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">{t('home.testimonials.title')}</h2>
            <p className="text-xl text-muted-foreground">{t('home.testimonials.subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="border-2">
                <CardContent className="p-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-muted-foreground mb-4">{testimonial.content}</p>
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

      {/* Pricing Section */}
      <section className="py-20 bg-muted/50">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">{t('home.pricing.title')}</h2>
            <p className="text-xl text-muted-foreground">{t('home.pricing.subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {pricingPlans.map((plan, index) => (
              <Card key={index} className={`relative border-2 ${plan.popular ? 'border-primary shadow-xl scale-105' : ''}`}>
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-medium">
                    {t('home.pricing.pro.popular')}
                  </div>
                )}
                <CardContent className="p-8">
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-muted-foreground mb-4">{plan.description}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    {plan.price !== '0' && plan.price !== t('home.pricing.advanced.price') && (
                      <span className="text-muted-foreground"> {plan.period}</span>
                    )}
                  </div>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/login">
                    <a>
                      <Button className="w-full" variant={plan.popular ? 'default' : 'outline'}>
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

      {/* FAQ Section */}
      <section className="py-20 bg-white dark:bg-background">
        <div className="container max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">{t('home.faq.title')}</h2>
            <p className="text-xl text-muted-foreground">{t('home.faq.subtitle')}</p>
          </div>
          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <Card key={index} className="border-2">
                <CardContent className="p-6">
                  <div className="flex gap-4">
                    <HelpCircle className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="text-lg font-semibold mb-2">{faq.question}</h3>
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
        <div className="container text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">{t('home.cta.title')}</h2>
          <p className="text-xl mb-8 opacity-90">{t('home.cta.subtitle')}</p>
          <Link href="/login">
            <a>
              <Button size="lg" variant="secondary" className="text-lg h-14 px-8">
                {t('home.cta.button')}
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
