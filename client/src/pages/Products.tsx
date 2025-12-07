import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import {
  Bot,
  MessageSquare,
  BarChart3,
  Package,
  Megaphone,
  Headphones,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

export default function Products() {
  const products = [
    {
      icon: Bot,
      title: 'الرد الآلي الذكي',
      description: 'مساعد ذكي يرد على استفسارات عملائك باللهجة السعودية على مدار الساعة',
      features: [
        'رد تلقائي على الاستفسارات',
        'فهم اللهجة السعودية',
        'البحث في المنتجات',
        'اقتراح المنتجات المناسبة',
        'متاح 24/7',
      ],
    },
    {
      icon: MessageSquare,
      title: 'إدارة المحادثات',
      description: 'نظام متقدم لإدارة جميع محادثاتك مع العملاء في مكان واحد',
      features: [
        'عرض جميع المحادثات',
        'تصنيف المحادثات',
        'البحث في المحادثات',
        'الرد اليدوي عند الحاجة',
        'تاريخ كامل للمحادثات',
      ],
    },
    {
      icon: Package,
      title: 'إدارة المنتجات',
      description: 'أضف وأدر منتجاتك بسهولة ليتعرف عليها ساري',
      features: [
        'إضافة منتجات غير محدودة',
        'تصنيف المنتجات',
        'إدارة المخزون',
        'تحديث الأسعار',
        'صور المنتجات',
      ],
    },
    {
      icon: Megaphone,
      title: 'الحملات التسويقية',
      description: 'أرسل حملات تسويقية مستهدفة لعملائك عبر الواتساب',
      features: [
        'إنشاء حملات مخصصة',
        'جدولة الحملات',
        'استهداف العملاء',
        'تتبع الأداء',
        'رسائل صوتية وصور',
      ],
    },
    {
      icon: BarChart3,
      title: 'التقارير والتحليلات',
      description: 'تقارير مفصلة عن أداء متجرك ومحادثاتك',
      features: [
        'إحصائيات المحادثات',
        'تحليل أداء المبيعات',
        'تقارير الحملات',
        'معدلات التحويل',
        'رضا العملاء',
      ],
    },
    {
      icon: Headphones,
      title: 'الدعم الفني',
      description: 'دعم فني متواصل لمساعدتك في أي وقت',
      features: [
        'دعم عبر الواتساب',
        'دعم عبر البريد',
        'قاعدة معرفية شاملة',
        'فيديوهات تعليمية',
        'استجابة سريعة',
      ],
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
                منتجات ساري
              </span>
            </h1>
            <p className="text-xl text-muted-foreground">
              حلول متكاملة لأتمتة خدمة العملاء وزيادة المبيعات على الواتساب
            </p>
          </div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-20">
        <div className="container">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((product) => (
              <Card key={product.title} className="border-2 hover:border-blue-200 dark:hover:border-blue-800 transition-all hover:shadow-lg">
                <CardContent className="p-6 space-y-6">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                    <product.icon className="w-7 h-7 text-white" />
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold">{product.title}</h3>
                    <p className="text-muted-foreground">{product.description}</p>
                  </div>

                  <ul className="space-y-3">
                    {product.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
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
            جرب ساري مجاناً الآن
          </h2>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            ابدأ بتحسين خدمة عملائك وزيادة مبيعاتك اليوم
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <a>
                <Button size="lg" variant="secondary" className="w-full sm:w-auto text-lg h-14 px-8">
                  ابدأ الآن مجاناً
                  <ArrowRight className="mr-2 w-5 h-5" />
                </Button>
              </a>
            </Link>
            <Link href="/pricing">
              <a>
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8 bg-transparent border-white text-white hover:bg-white/10">
                  شاهد الأسعار
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
