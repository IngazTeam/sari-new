import { useTranslation } from "react-i18next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { SeoHead, useSeoConfig } from "@/components/SeoHead";

export default function Terms() {
  const { t } = useTranslation();

  const sections = [
    {
      title: "1. قبول الشروط",
      content: [
        "باستخدامك لخدمات ساري، فإنك توافق على الالتزام بهذه الشروط والأحكام. إذا كنت لا توافق على أي جزء من هذه الشروط، يجب عليك عدم استخدام خدماتنا.",
        "نحتفظ بالحق في تعديل هذه الشروط في أي وقت. سيتم إخطارك بأي تغييرات جوهرية عبر البريد الإلكتروني أو من خلال إشعار على المنصة."
      ]
    },
    {
      title: "2. وصف الخدمة",
      content: [
        "ساري هي منصة ذكاء اصطناعي للمبيعات عبر واتساب تساعد التجار على أتمتة المحادثات وإدارة الحملات التسويقية وتحسين خدمة العملاء.",
        "تشمل الخدمة: الرد الآلي الذكي، إدارة المنتجات، إرسال الحملات التسويقية، التحليلات والتقارير، والتكامل مع Green API وOpenAI."
      ]
    },
    {
      title: "3. التسجيل والحساب",
      content: [
        "يجب عليك تقديم معلومات دقيقة وكاملة عند التسجيل. أنت مسؤول عن الحفاظ على سرية بيانات حسابك.",
        "يجب أن تكون بعمر 18 عاماً على الأقل أو أن تمتلك الصلاحية القانونية لإبرام عقود ملزمة.",
        "يحق لنا تعليق أو إنهاء حسابك إذا قدمت معلومات غير دقيقة أو انتهكت هذه الشروط."
      ]
    },
    {
      title: "4. الباقات والدفع",
      content: [
        "نقدم ثلاث باقات: المبتدئ (99 ريال/شهر)، الاحترافي (299 ريال/شهر)، والمؤسسات (999 ريال/شهر).",
        "جميع الرسوم مستحقة الدفع مقدماً على أساس شهري. الدفع يتم عبر بطاقات الائتمان من خلال Tap Payments.",
        "في حالة تجاوز حدود باقتك (عدد الرسائل أو المحادثات)، سيتوقف النظام عن العمل حتى تقوم بالترقية.",
        "لا نقدم استرداداً للمبالغ المدفوعة إلا في حالات خاصة يتم تقييمها بشكل فردي."
      ]
    },
    {
      title: "5. الاستخدام المقبول",
      content: [
        "يُحظر استخدام ساري لإرسال رسائل غير مرغوب فيها (spam) أو محتوى مسيء أو غير قانوني.",
        "يجب عليك الامتثال لسياسات واتساب وجميع القوانين المحلية والدولية ذات الصلة.",
        "يُحظر محاولة اختراق النظام أو الوصول غير المصرح به إلى بيانات المستخدمين الآخرين.",
        "نحتفظ بالحق في تعليق أو إنهاء حسابك فوراً في حالة انتهاك سياسة الاستخدام المقبول."
      ]
    },
    {
      title: "6. الملكية الفكرية",
      content: [
        "جميع الحقوق والملكية الفكرية في منصة ساري (بما في ذلك الشعار، التصميم، والبرمجيات) مملوكة لنا.",
        "يُمنح لك ترخيص محدود وغير حصري لاستخدام المنصة لأغراضك التجارية الخاصة فقط.",
        "لا يحق لك نسخ أو تعديل أو توزيع أو بيع أي جزء من المنصة دون إذن كتابي مسبق."
      ]
    },
    {
      title: "7. حماية البيانات والخصوصية",
      content: [
        "نحن ملتزمون بحماية بياناتك الشخصية وفقاً لسياسة الخصوصية الخاصة بنا.",
        "نستخدم بياناتك فقط لتقديم الخدمة وتحسينها، ولن نشاركها مع أطراف ثالثة دون موافقتك.",
        "أنت مسؤول عن بيانات عملائك التي تجمعها عبر ساري. يجب عليك الامتثال لقوانين حماية البيانات المعمول بها."
      ]
    },
    {
      title: "8. إخلاء المسؤولية",
      content: [
        "يتم تقديم الخدمة 'كما هي' دون أي ضمانات صريحة أو ضمنية.",
        "لا نضمن أن الخدمة ستكون متاحة دون انقطاع أو خالية من الأخطاء.",
        "لا نتحمل مسؤولية أي خسائر مباشرة أو غير مباشرة ناتجة عن استخدام أو عدم القدرة على استخدام الخدمة.",
        "أنت مسؤول عن المحتوى الذي ترسله عبر ساري والتفاعلات مع عملائك."
      ]
    },
    {
      title: "9. تحديد المسؤولية",
      content: [
        "في جميع الأحوال، لن تتجاوز مسؤوليتنا تجاهك المبلغ الذي دفعته لنا خلال الثلاثة أشهر السابقة.",
        "لا نتحمل مسؤولية أي أضرار غير مباشرة أو تبعية أو عرضية أو خاصة أو عقابية."
      ]
    },
    {
      title: "10. إنهاء الخدمة",
      content: [
        "يمكنك إلغاء اشتراكك في أي وقت من خلال لوحة التحكم. سيستمر الوصول حتى نهاية الفترة المدفوعة.",
        "نحتفظ بالحق في تعليق أو إنهاء حسابك في حالة انتهاك هذه الشروط أو لأسباب تشغيلية.",
        "عند إنهاء الخدمة، قد نحتفظ ببعض البيانات للأغراض القانونية أو المحاسبية."
      ]
    },
    {
      title: "11. القانون الحاكم",
      content: [
        "تخضع هذه الشروط وتفسر وفقاً لقوانين المملكة العربية السعودية.",
        "أي نزاع ينشأ عن هذه الشروط سيتم حله من خلال المحاكم المختصة في المملكة العربية السعودية."
      ]
    },
    {
      title: "12. التواصل",
      content: [
        "لأي استفسارات حول هذه الشروط والأحكام، يرجى التواصل معنا عبر:",
        "البريد الإلكتروني: legal@sari.sa",
        "الهاتف: +966 50 123 4567",
        "العنوان: الرياض، المملكة العربية السعودية"
      ]
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <SeoHead {...useSeoConfig('companyTerms')} />
      <Navbar />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-primary/10 to-background py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <FileText className="h-16 w-16 text-primary mx-auto mb-6" />
              <h1 className="text-4xl md:text-5xl font-bold mb-6">{t('terms.auto_0')}<span className="text-primary">{t('terms.auto_1')}</span>
              </h1>
              <p className="text-xl text-muted-foreground">{t('terms.auto_2')}</p>
            </div>
          </div>
        </section>

        {/* Introduction */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="text-2xl">{t('terms.auto_3')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-muted-foreground">
                  <p>{t('terms.auto_4')}</p>
                  <p>{t('terms.auto_5')}</p>
                </CardContent>
              </Card>

              {/* Terms Sections */}
              <div className="space-y-6">
                {sections.map((section, index) => (
                  <Card key={index}>
                    <CardHeader>
                      <CardTitle className="text-xl">{section.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {section.content.map((paragraph, pIndex) => (
                        <p key={pIndex} className="text-muted-foreground">
                          {paragraph}
                        </p>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Footer Note */}
              <Card className="mt-8 bg-accent/30">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center">{t('terms.auto_6')}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
