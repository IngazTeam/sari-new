import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { BarChart3, CheckCircle2, FlaskConical, ShieldCheck, Users } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { SeoHead, useSeoConfig } from '@/components/SeoHead';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SuccessStories() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || 'ar').startsWith('ar');

  const evidence = [
    { value: '3', labelAr: 'عملاء تجريبيون', labelEn: 'Pilot clients' },
    { value: '≈100', labelAr: 'عميل نهائي شهرياً لكل تجربة', labelEn: 'Monthly end customers per pilot' },
    { value: '≈300', labelAr: 'عميل نهائي شهرياً عبر التجارب', labelEn: 'Monthly end customers across pilots' },
  ];

  const metrics = [
    ['التحويل من محادثة إلى طلب مدفوع', 'Conversation-to-paid-order conversion'],
    ['نسبة الحل دون تدخل بشري مع سبب التحويل', 'Automated resolution and handoff reason'],
    ['زمن الرد P50 وP95 بحسب القناة', 'P50 and P95 response time by channel'],
    ['رضا العميل من عينة موثقة', 'Customer satisfaction from a documented sample'],
    ['الاحتفاظ بالمتجر بعد 30 و90 يوماً', 'Merchant retention after 30 and 90 days'],
    ['الإيراد المنسوب لساري بمنهج واضح', 'Sari-attributed revenue with a defined method'],
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background" dir={isAr ? 'rtl' : 'ltr'}>
      <SeoHead {...useSeoConfig('resourcesSuccessStories')} />
      <Navbar />

      <main className="flex-1">
        <section className="bg-gradient-to-b from-primary/10 to-background py-20">
          <div className="container max-w-4xl text-center">
            <FlaskConical className="h-14 w-14 text-primary mx-auto mb-6" aria-hidden="true" />
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              {isAr ? 'نتائج البيتا ودراسات الحالة' : 'Beta Evidence and Case Studies'}
            </h1>
            <p className="text-xl text-muted-foreground">
              {isAr
                ? 'ننشر ما نعرفه بوضوح، ونترك مؤشرات المبيعات والرضا والتحويل حتى يكتمل قياسها.'
                : 'We publish what is known clearly and leave sales, satisfaction and conversion claims until measurement is complete.'}
            </p>
          </div>
        </section>

        <section className="py-14">
          <div className="container max-w-5xl">
            <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 mb-10">
              <CardContent className="p-6 flex gap-4 items-start">
                <ShieldCheck className="h-7 w-7 text-amber-700 flex-none" aria-hidden="true" />
                <div>
                  <h2 className="font-bold text-lg mb-2">{isAr ? 'حالة الدليل' : 'Evidence status'}</h2>
                  <p className="text-muted-foreground">
                    {isAr
                      ? 'الأرقام أدناه بحسب إفادة مالك المنتج عن تجارب أغسطس 2026. لم تُنشر بعد دراسة حالة مستقلة أو تصدير تحليلات يثبت أثر المبيعات أو الرضا.'
                      : 'The figures below are based on the product owner\'s report for August 2026 pilots. No independent case study or analytics export has yet verified sales or satisfaction impact.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-3 gap-6">
              {evidence.map((item) => (
                <Card key={item.value} className="text-center">
                  <CardContent className="p-7">
                    <div className="text-4xl font-bold text-primary mb-3">{item.value}</div>
                    <div className="text-muted-foreground">{isAr ? item.labelAr : item.labelEn}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 bg-muted/30">
          <div className="container max-w-5xl">
            <div className="grid lg:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <Users className="h-6 w-6 text-primary" aria-hidden="true" />
                    {isAr ? 'ما يمكن قوله الآن' : 'What can be said now'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-muted-foreground">
                  <p>{isAr ? 'ثلاثة عملاء استخدموا المنتج بنجاح تشغيلياً.' : 'Three clients used the product successfully in operation.'}</p>
                  <p>{isAr ? 'الحجم المبلغ عنه نحو 100 عميل نهائي شهرياً لكل تجربة.' : 'Reported volume is about 100 end customers monthly per pilot.'}</p>
                  <p>{isAr ? 'هذا يثبت قابلية الاستخدام الأولية، لا مضاعفة الإيراد أو رضا بنسبة محددة.' : 'This supports initial usability, not a specific revenue uplift or satisfaction rate.'}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <BarChart3 className="h-6 w-6 text-primary" aria-hidden="true" />
                    {isAr ? 'بوابة نشر دراسة الحالة' : 'Case-study publication gate'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {metrics.map(([ar, en]) => (
                      <li key={ar} className="flex gap-3 items-start text-muted-foreground">
                        <CheckCircle2 className="h-5 w-5 text-primary flex-none mt-0.5" aria-hidden="true" />
                        <span>{isAr ? ar : en}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-16 bg-primary text-primary-foreground">
          <div className="container text-center max-w-3xl">
            <h2 className="text-3xl font-bold mb-4">{isAr ? 'اختبر ساري وشارك في القياس' : 'Try Sari and join the measurement program'}</h2>
            <p className="text-lg opacity-90 mb-8">
              {isAr ? 'ابدأ تجربة المنتج، وحدد معنا مؤشرات النجاح قبل التشغيل.' : 'Start a product trial and define success metrics with us before launch.'}
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Link href="/try-sari"><a><Button size="lg" variant="secondary">{isAr ? 'جرّب ساري' : 'Try Sari'}</Button></a></Link>
              <Link href="/company/contact"><a><Button size="lg" variant="outline" className="border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10">{isAr ? 'تواصل معنا' : 'Contact us'}</Button></a></Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
