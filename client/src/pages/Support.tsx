import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Link } from 'wouter';
import {
  Mail,
  Phone,
  MessageCircle,
  BookOpen,
  Video,
  HelpCircle,
  Send,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';
export default function Support() {
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement form submission
    toast.success(t('toast.support.msg1'));
    setFormData({ name: '', email: '', subject: '', message: '' });
  };

  const supportChannels = [
    {
      icon: MessageCircle,
      title: 'الدعم عبر الواتساب',
      description: 'تواصل معنا مباشرة عبر الواتساب',
      action: 'ابدأ المحادثة',
      link: 'https://wa.me/966500000000',
    },
    {
      icon: Mail,
      title: 'البريد الإلكتروني',
      description: 'أرسل لنا استفسارك عبر البريد',
      action: 'support@sari.sa',
      link: 'mailto:support@sari.sa',
    },
    {
      icon: Phone,
      title: 'الهاتف',
      description: 'اتصل بنا مباشرة',
      action: '+966 50 000 0000',
      link: 'tel:+966500000000',
    },
  ];

  const resources = [
    {
      icon: BookOpen,
      title: 'قاعدة المعرفة',
      description: 'مقالات وأدلة شاملة لاستخدام ساري',
      link: '#',
    },
    {
      icon: Video,
      title: 'فيديوهات تعليمية',
      description: 'شروحات مصورة خطوة بخطوة',
      link: '#',
    },
    {
      icon: HelpCircle,
      title: 'الأسئلة الشائعة',
      description: 'إجابات على أكثر الأسئلة شيوعاً',
      link: '#',
    },
  ];

  const faqs = [
    {
      question: 'كيف أبدأ مع ساري؟',
      answer: 'سجل حساباً مجانياً، اربط رقم واتساب متجرك، أضف منتجاتك، وابدأ باستخدام الرد الآلي فوراً.',
    },
    {
      question: 'هل يدعم ساري اللغة العربية؟',
      answer: 'نعم، ساري مصمم خصيصاً للسوق السعودي ويتحدث باللهجة السعودية بشكل طبيعي.',
    },
    {
      question: 'كيف أربط رقم الواتساب؟',
      answer: 'من لوحة التحكم، اذهب إلى "ربط الواتساب" وامسح رمز QR باستخدام هاتفك.',
    },
    {
      question: 'هل يمكنني تعطيل الرد الآلي مؤقتاً؟',
      answer: 'نعم، يمكنك تفعيل أو تعطيل الرد الآلي في أي وقت من صفحة الإعدادات.',
    },
    {
      question: 'ماذا يحدث إذا لم يفهم ساري السؤال؟',
      answer: 'سيطلب ساري من العميل إعادة صياغة السؤال، أو يمكنك الرد يدوياً من لوحة التحكم.',
    },
    {
      question: 'هل بياناتي آمنة؟',
      answer: 'نعم، نستخدم أعلى معايير الأمان لحماية بياناتك ومحادثاتك.',
    },
  ];

  const supportHours = [
    { day: 'الأحد - الخميس', hours: '9:00 ص - 6:00 م' },
    { day: 'الجمعة - السبت', hours: 'مغلق' },
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
                <span className="text-primary">
                كيف يمكننا مساعدتك؟
              </span>
            </h1>
            <p className="text-xl text-muted-foreground">
              فريق الدعم الفني جاهز لمساعدتك في أي وقت
            </p>
          </div>
        </div>
      </section>

      {/* Support Channels */}
      <section className="py-20">
        <div className="container">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              تواصل معنا
            </h2>
            <p className="text-lg text-muted-foreground">
              اختر الطريقة المناسبة للتواصل معنا
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {supportChannels.map((channel) => (
              <Card key={channel.title} className="border-2 hover:border-primary/30 dark:hover:border-blue-800 transition-colors">
                <CardContent className="p-6 text-center space-y-4">
                  <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mx-auto">
                    <channel.icon className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">{channel.title}</h3>
                    <p className="text-sm text-muted-foreground">{channel.description}</p>
                  </div>
                  <a href={channel.link} target="_blank" rel="noopener noreferrer">
                    <Button className="w-full" variant="outline">
                      {channel.action}
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Support Hours */}
          <Card className="max-w-2xl mx-auto">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="w-6 h-6 text-primary" />
                <h3 className="text-xl font-semibold">ساعات العمل</h3>
              </div>
              <div className="space-y-2">
                {supportHours.map((item) => (
                  <div key={item.day} className="flex justify-between items-center py-2 border-b last:border-0">
                    <span className="text-muted-foreground">{item.day}</span>
                    <span className="font-medium">{item.hours}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Contact Form */}
      <section className="py-20 bg-muted/30">
        <div className="container">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                أرسل لنا رسالة
              </h2>
              <p className="text-lg text-muted-foreground">
                املأ النموذج وسنرد عليك في أقرب وقت
              </p>
            </div>

            <Card>
              <CardContent className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">الاسم</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="أدخل اسمك"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">البريد الإلكتروني</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="example@email.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">الموضوع</Label>
                    <Input
                      id="subject"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      placeholder="موضوع الرسالة"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">الرسالة</Label>
                    <Textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="اكتب رسالتك هنا..."
                      rows={6}
                      required
                    />
                  </div>

                  <Button type="submit" size="lg" className="w-full bg-primary hover:bg-primary/90">
                    إرسال الرسالة
                    <Send className="mr-2 w-4 h-4" />
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Resources */}
      <section className="py-20">
        <div className="container">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              مصادر المساعدة
            </h2>
            <p className="text-lg text-muted-foreground">
              ابحث عن الإجابات بنفسك في مصادرنا التعليمية
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {resources.map((resource) => (
              <Card key={resource.title} className="border-2 hover:border-primary/30 dark:hover:border-blue-800 transition-colors">
                <CardContent className="p-6 text-center space-y-4">
                  <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mx-auto">
                    <resource.icon className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">{resource.title}</h3>
                    <p className="text-sm text-muted-foreground">{resource.description}</p>
                  </div>
                  <a href={resource.link}>
                    <Button className="w-full" variant="outline">
                      استكشف
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
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
              إجابات سريعة على أكثر الأسئلة شيوعاً
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {faqs.map((faq) => (
              <Card key={faq.question}>
                <CardContent className="p-6 space-y-2">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-1" />
                    <div className="space-y-2">
                      <h3 className="font-semibold text-lg">{faq.question}</h3>
                      <p className="text-muted-foreground">{faq.answer}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
