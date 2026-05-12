import { useState } from "react";
import { useTranslation } from "react-i18next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Search, Book, MessageCircle, Settings, CreditCard, Smartphone, TrendingUp, HelpCircle } from "lucide-react";

export default function HelpCenter() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");

  const categories = [
    {
      icon: Book,
      title: "البدء السريع",
      description: "كل ما تحتاجه للبدء مع ساري",
      color: "text-blue-500"
    },
    {
      icon: Smartphone,
      title: "ربط واتساب",
      description: "دليل ربط حسابك بواتساب",
      color: "text-green-500"
    },
    {
      icon: MessageCircle,
      title: "إدارة المحادثات",
      description: "كيفية إدارة محادثات العملاء",
      color: "text-purple-500"
    },
    {
      icon: TrendingUp,
      title: "الحملات التسويقية",
      description: "إنشاء وإدارة حملاتك",
      color: "text-orange-500"
    },
    {
      icon: CreditCard,
      title: "الفواتير والدفع",
      description: "إدارة اشتراكك والمدفوعات",
      color: "text-pink-500"
    },
    {
      icon: Settings,
      title: "الإعدادات المتقدمة",
      description: "تخصيص ساري حسب احتياجاتك",
      color: "text-indigo-500"
    }
  ];

  const faqs = [
    {
      category: "البدء السريع",
      questions: [
        {
          q: "كيف أبدأ مع ساري؟",
          a: "البدء مع ساري سهل جداً! قم بإنشاء حساب، اختر الباقة المناسبة، اربط حساب واتساب الخاص بك، وابدأ بإضافة منتجاتك. يمكنك إطلاق أول حملة تسويقية في أقل من 10 دقائق."
        },
        {
          q: "هل أحتاج لخبرة تقنية لاستخدام ساري؟",
          a: "لا على الإطلاق! ساري مصمم ليكون سهل الاستخدام للجميع. واجهة المستخدم بسيطة وواضحة، ونوفر دروس فيديو ودعم فني متواصل لمساعدتك."
        },
        {
          q: "ما هي المتطلبات الأساسية؟",
          a: "تحتاج فقط إلى: حساب واتساب بزنس، رقم هاتف مخصص للأعمال، وقائمة بمنتجاتك أو خدماتك. هذا كل شيء!"
        }
      ]
    },
    {
      category: "ربط واتساب",
      questions: [
        {
          q: "كيف أربط حساب واتساب الخاص بي؟",
          a: "انتقل إلى صفحة 'ربط واتساب' في لوحة التحكم، اطلب الربط، وسيقوم فريقنا بإرسال رمز QR لك. امسح الرمز بهاتفك وستكون جاهزاً للانطلاق!"
        },
        {
          q: "هل يمكنني استخدام رقم واتساب الشخصي؟",
          a: "نوصي بشدة باستخدام رقم واتساب بزنس منفصل لضمان احترافية التواصل وعدم خلط الرسائل الشخصية بالتجارية."
        },
        {
          q: "ماذا لو انقطع الاتصال؟",
          a: "ساري يراقب حالة الاتصال باستمرار ويرسل لك إشعارات فورية إذا حدث انقطاع. يمكنك إعادة الربط بسهولة من خلال مسح رمز QR جديد."
        }
      ]
    },
    {
      category: "إدارة المحادثات",
      questions: [
        {
          q: "كيف يعمل الرد الآلي الذكي؟",
          a: "ساري تستخدم الذكاء الاصطناعي المتقدم (GPT-4) للرد على استفسارات العملاء بشكل طبيعي وذكي. تفهم الأسئلة، تبحث في منتجاتك، وتقدم إجابات دقيقة ومفيدة - كل ذلك تلقائياً!"
        },
        {
          q: "هل يمكنني تخصيص الردود؟",
          a: "نعم! يمكنك تعديل شخصية ساري، إضافة معلومات خاصة بمتجرك، وتحديد كيفية التعامل مع أنواع مختلفة من الاستفسارات."
        },
        {
          q: "ماذا عن الرسائل الصوتية؟",
          a: "ساري تدعم الرسائل الصوتية! نستخدم تقنية Whisper من OpenAI لتحويل الصوت إلى نص، ثم نرد عليها بذكاء كما لو كانت رسالة نصية."
        }
      ]
    },
    {
      category: "الحملات التسويقية",
      questions: [
        {
          q: "كيف أنشئ حملة تسويقية؟",
          a: "من لوحة التحكم، اذهب إلى 'الحملات' ← 'إنشاء حملة جديدة'. اختر قائمة العملاء، اكتب رسالتك، أضف صورة إن أردت، وحدد وقت الإرسال. بسيط جداً!"
        },
        {
          q: "كم عدد الرسائل التي يمكنني إرسالها؟",
          a: "يعتمد ذلك على باقتك: الباقة الأساسية (500 رسالة/شهر)، الاحترافية (2000 رسالة/شهر)، المؤسسات (10000 رسالة/شهر)."
        },
        {
          q: "هل يمكنني جدولة الحملات؟",
          a: "بالتأكيد! يمكنك جدولة حملاتك لتُرسل في أوقات محددة. ساري أيضاً تضيف تأخيراً عشوائياً بين الرسائل (3-6 ثواني) لتبدو طبيعية أكثر."
        }
      ]
    },
    {
      category: "الفواتير والدفع",
      questions: [
        {
          q: "ما هي طرق الدفع المتاحة؟",
          a: "نقبل الدفع عبر بطاقات الائتمان (Visa, Mastercard, Mada) من خلال Tap Payments. الدفع آمن ومشفر بالكامل."
        },
        {
          q: "هل يمكنني تغيير باقتي؟",
          a: "نعم! يمكنك الترقية أو التخفيض في أي وقت. عند الترقية، ستدفع الفرق فقط للفترة المتبقية من الشهر."
        },
        {
          q: "ماذا يحدث إذا تجاوزت حدود باقتي؟",
          a: "سيتوقف النظام عن إرسال الرسائل تلقائياً حتى تقوم بالترقية أو ينتهي الشهر الحالي. ستتلقى إشعارات مسبقة عند اقترابك من الحد."
        }
      ]
    },
    {
      category: "الإعدادات المتقدمة",
      questions: [
        {
          q: "كيف أضيف منتجاتي؟",
          a: "يمكنك إضافة المنتجات يدوياً واحداً تلو الآخر، أو رفع ملف CSV/Excel يحتوي على جميع منتجاتك دفعة واحدة. النظام يدعم أيضاً التكامل مع سلة."
        },
        {
          q: "هل يمكنني ربط أكثر من رقم واتساب؟",
          a: "نعم! يمكنك إضافة عدة أرقام واتساب وتحديد رقم أساسي. مفيد جداً إذا كان لديك عدة فروع أو أقسام."
        },
        {
          q: "كيف أراقب أداء متجري؟",
          a: "لوحة التحليلات توفر لك تقارير شاملة: عدد المحادثات، معدل التحويل، الإيرادات، المنتجات الأكثر مبيعاً، وأكثر من ذلك بكثير!"
        }
      ]
    }
  ];

  const filteredFaqs = searchQuery
    ? faqs.map(category => ({
        ...category,
        questions: category.questions.filter(
          q => q.q.includes(searchQuery) || q.a.includes(searchQuery)
        )
      })).filter(category => category.questions.length > 0)
    : faqs;

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <SeoHead {...useSeoConfig('resourcesHelpCenter')} />
      <Navbar />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-primary/10 to-background py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <HelpCircle className="h-16 w-16 text-primary mx-auto mb-6" />
              <h1 className="text-4xl md:text-5xl font-bold mb-6">{t('helpCenter.auto_0')}<span className="text-primary">{t('helpCenter.auto_1')}</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8">{t('helpCenter.auto_2')}</p>
              
              {/* Search Bar */}
              <div className="relative max-w-xl mx-auto">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
                <Input
                  type="text"
                  placeholder={t('helpCenter.auto_10')}
                  className="pr-10 h-12"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Categories Grid */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12">{t('helpCenter.auto_3')}</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {categories.map((category, index) => (
                <Card key={index} className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-lg bg-accent ${category.color}`}>
                        <category.icon className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{category.title}</CardTitle>
                        <CardDescription>{category.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 bg-accent/30">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12">{t('helpCenter.auto_4')}</h2>
            
            <div className="max-w-4xl mx-auto space-y-8">
              {filteredFaqs.map((category, catIndex) => (
                <div key={catIndex}>
                  <h3 className="text-2xl font-bold mb-4 text-primary">
                    {category.category}
                  </h3>
                  
                  <Accordion type="single" collapsible className="space-y-2">
                    {category.questions.map((faq, qIndex) => (
                      <AccordionItem
                        key={qIndex}
                        value={`${catIndex}-${qIndex}`}
                        className="bg-background rounded-lg px-4"
                      >
                        <AccordionTrigger className="text-right hover:no-underline">
                          <span className="font-semibold">{faq.q}</span>
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground">
                          {faq.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              ))}
            </div>

            {filteredFaqs.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-lg">{t('helpCenter.auto_5')}</p>
              </div>
            )}
          </div>
        </section>

        {/* Contact Support Section */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-4">{t('helpCenter.auto_6')}</h2>
              <p className="text-muted-foreground mb-8">{t('helpCenter.auto_7')}</p>
              
              <div className="flex gap-4 justify-center">
                <Button size="lg" className="bg-primary hover:bg-primary/90">
                  <MessageCircle className="ml-2 h-5 w-5" />{t('helpCenter.auto_8')}</Button>
                <Button size="lg" variant="outline">
                  <Book className="ml-2 h-5 w-5" />{t('helpCenter.auto_9')}</Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
