import { useTranslation } from "react-i18next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";

export default function Privacy() {
  const { t } = useTranslation();

  const sections = [
    {
      title: "1. المعلومات التي نجمعها",
      subsections: [
        {
          subtitle: "معلومات الحساب",
          content: [
            "عند التسجيل في ساري، نجمع معلومات أساسية مثل: الاسم، البريد الإلكتروني، رقم الهاتف، اسم المتجر، ومعلومات الدفع.",
            "هذه المعلومات ضرورية لإنشاء حسابك وتقديم الخدمة."
          ]
        },
        {
          subtitle: "بيانات الاستخدام",
          content: [
            "نجمع معلومات حول كيفية استخدامك للمنصة، بما في ذلك: عدد الرسائل المرسلة، المحادثات، الحملات، والتفاعلات مع النظام.",
            "نستخدم هذه البيانات لتحسين الخدمة وتوفير تحليلات مفيدة لك."
          ]
        },
        {
          subtitle: "بيانات المحادثات",
          content: [
            "نخزن محادثات واتساب بينك وبين عملائك لتوفير خدمة الرد الآلي وتحليل الأداء.",
            "هذه البيانات مشفرة ومحمية ولا يتم مشاركتها مع أطراف ثالثة."
          ]
        },
        {
          subtitle: "معلومات المنتجات",
          content: [
            "نخزن معلومات المنتجات التي تضيفها (الاسم، السعر، الوصف، الصور) لتمكين الذكاء الاصطناعي من الرد على استفسارات العملاء."
          ]
        }
      ]
    },
    {
      title: "2. كيف نستخدم معلوماتك",
      content: [
        "تقديم وتشغيل خدمات ساري، بما في ذلك الرد الآلي وإدارة الحملات.",
        "معالجة المدفوعات وإدارة الاشتراكات.",
        "إرسال إشعارات مهمة حول حسابك والخدمة.",
        "تحسين المنصة وتطوير ميزات جديدة بناءً على أنماط الاستخدام.",
        "تقديم دعم فني وخدمة عملاء.",
        "الامتثال للمتطلبات القانونية والتنظيمية.",
        "منع الاحتيال وحماية أمن المنصة."
      ]
    },
    {
      title: "3. مشاركة المعلومات",
      subsections: [
        {
          subtitle: "مقدمو الخدمات",
          content: [
            "نشارك بياناتك مع مقدمي خدمات موثوقين لتشغيل المنصة:",
            "• Green API: لإرسال واستقبال رسائل واتساب",
            "• OpenAI: لتوفير الذكاء الاصطناعي للرد الآلي",
            "• Tap Payments: لمعالجة المدفوعات",
            "• خدمات الاستضافة السحابية: لتخزين البيانات بشكل آمن"
          ]
        },
        {
          subtitle: "المتطلبات القانونية",
          content: [
            "قد نكشف عن معلوماتك إذا كان ذلك مطلوباً بموجب القانون أو استجابة لأمر قضائي صالح.",
            "سنبذل قصارى جهدنا لإخطارك مسبقاً إلا إذا كان ذلك محظوراً قانونياً."
          ]
        },
        {
          subtitle: "ما لا نفعله",
          content: [
            "لا نبيع معلوماتك الشخصية لأطراف ثالثة.",
            "لا نشارك بيانات محادثاتك مع أي جهة خارجية لأغراض تسويقية.",
            "لا نستخدم بياناتك لأغراض غير مذكورة في هذه السياسة."
          ]
        }
      ]
    },
    {
      title: "4. أمن البيانات",
      content: [
        "نستخدم تشفير SSL/TLS لحماية البيانات أثناء النقل.",
        "جميع كلمات المرور مشفرة باستخدام خوارزميات آمنة (bcrypt).",
        "نستخدم خوادم آمنة ومحمية بجدران نارية.",
        "نجري مراجعات أمنية منتظمة لضمان حماية بياناتك.",
        "الوصول إلى البيانات مقيد فقط للموظفين المصرح لهم الذين يحتاجونها لأداء وظائفهم.",
        "نحتفظ بنسخ احتياطية منتظمة لحماية بياناتك من الفقدان."
      ]
    },
    {
      title: "5. حقوقك",
      content: [
        "الوصول: يمكنك طلب نسخة من بياناتك الشخصية في أي وقت.",
        "التصحيح: يمكنك تحديث أو تصحيح معلوماتك من خلال لوحة التحكم.",
        "الحذف: يمكنك طلب حذف حسابك وجميع بياناتك المرتبطة به.",
        "التصدير: يمكنك تصدير بياناتك بتنسيق قابل للقراءة آلياً.",
        "الاعتراض: يمكنك الاعتراض على معالجة معينة لبياناتك.",
        "للممارسة أي من هذه الحقوق، يرجى التواصل معنا على privacy@sari.sa"
      ]
    },
    {
      title: "6. الاحتفاظ بالبيانات",
      content: [
        "نحتفظ ببياناتك طالما كان حسابك نشطاً أو حسب الحاجة لتقديم الخدمة.",
        "عند حذف حسابك، سنحذف معظم بياناتك خلال 30 يوماً.",
        "قد نحتفظ ببعض البيانات لفترة أطول للامتثال للمتطلبات القانونية أو المحاسبية (حتى 7 سنوات للفواتير).",
        "البيانات المجمعة والمجهولة الهوية قد يتم الاحتفاظ بها لأغراض إحصائية وتحليلية."
      ]
    },
    {
      title: "7. ملفات تعريف الارتباط (Cookies)",
      content: [
        "نستخدم ملفات تعريف الارتباط لتحسين تجربتك على المنصة:",
        "• ملفات تعريف ارتباط أساسية: ضرورية لتشغيل المنصة (مثل تسجيل الدخول).",
        "• ملفات تعريف ارتباط تحليلية: لفهم كيفية استخدام المنصة وتحسينها.",
        "• ملفات تعريف ارتباط التفضيلات: لتذكر إعداداتك (مثل اللغة).",
        "يمكنك التحكم في ملفات تعريف الارتباط من خلال إعدادات متصفحك."
      ]
    },
    {
      title: "8. خدمات الطرف الثالث",
      content: [
        "تتكامل ساري مع خدمات طرف ثالث (Green API، OpenAI، Tap Payments). كل خدمة لها سياسة خصوصية خاصة بها.",
        "نوصي بمراجعة سياسات الخصوصية لهذه الخدمات:",
        "• Green API: https://green-api.com/privacy",
        "• OpenAI: https://openai.com/privacy",
        "• Tap Payments: https://www.tap.company/privacy",
        "نحن غير مسؤولين عن ممارسات الخصوصية لخدمات الطرف الثالث."
      ]
    },
    {
      title: "9. خصوصية الأطفال",
      content: [
        "خدماتنا غير موجهة للأشخاص دون سن 18 عاماً.",
        "لا نجمع عن قصد معلومات شخصية من الأطفال.",
        "إذا علمنا أننا جمعنا معلومات من طفل دون موافقة الوالدين، سنحذف هذه المعلومات فوراً."
      ]
    },
    {
      title: "10. التغييرات على سياسة الخصوصية",
      content: [
        "قد نحدث هذه السياسة من وقت لآخر لتعكس التغييرات في ممارساتنا أو المتطلبات القانونية.",
        "سنخطرك بأي تغييرات جوهرية عبر البريد الإلكتروني أو من خلال إشعار بارز على المنصة.",
        "ننصحك بمراجعة هذه السياسة بشكل دوري للبقاء على اطلاع بكيفية حماية معلوماتك."
      ]
    },
    {
      title: "11. الامتثال للقوانين",
      content: [
        "نلتزم بقوانين حماية البيانات في المملكة العربية السعودية.",
        "نتبع أفضل الممارسات الدولية لحماية البيانات، بما في ذلك مبادئ GDPR حيثما أمكن.",
        "نتعاون مع السلطات المختصة عند الضرورة للامتثال للمتطلبات القانونية."
      ]
    },
    {
      title: "12. التواصل",
      content: [
        "لأي استفسارات أو مخاوف بشأن خصوصيتك، يرجى التواصل معنا:",
        "البريد الإلكتروني: privacy@sari.sa",
        "الهاتف: +966 50 123 4567",
        "العنوان: الرياض، المملكة العربية السعودية",
        "سنرد على استفساراتك خلال 48 ساعة عمل."
      ]
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <SeoHead {...useSeoConfig('companyPrivacy')} />
      <Navbar />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-primary/10 to-background py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <Shield className="h-16 w-16 text-primary mx-auto mb-6" />
              <h1 className="text-4xl md:text-5xl font-bold mb-6">{t('privacy.auto_0')}<span className="text-primary">{t('privacy.auto_1')}</span>
              </h1>
              <p className="text-xl text-muted-foreground">{t('privacy.auto_2')}</p>
            </div>
          </div>
        </section>

        {/* Introduction */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="text-2xl">{t('privacy.auto_3')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-muted-foreground">
                  <p>{t('privacy.auto_4')}</p>
                  <p>{t('privacy.auto_5')}</p>
                </CardContent>
              </Card>

              {/* Privacy Sections */}
              <div className="space-y-6">
                {sections.map((section, index) => (
                  <Card key={index}>
                    <CardHeader>
                      <CardTitle className="text-xl">{section.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {section.subsections ? (
                        section.subsections.map((subsection, subIndex) => (
                          <div key={subIndex} className="space-y-2">
                            <h4 className="font-semibold text-foreground">{subsection.subtitle}</h4>
                            {subsection.content.map((paragraph, pIndex) => (
                              <p key={pIndex} className="text-muted-foreground">
                                {paragraph}
                              </p>
                            ))}
                          </div>
                        ))
                      ) : (
                        section.content?.map((paragraph, pIndex) => (
                          <p key={pIndex} className="text-muted-foreground">
                            {paragraph}
                          </p>
                        ))
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Footer Note */}
              <Card className="mt-8 bg-accent/30">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground text-center font-semibold">{t('privacy.auto_6')}</p>
                    <p className="text-sm text-muted-foreground text-center">{t('privacy.auto_7')}</p>
                  </div>
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
