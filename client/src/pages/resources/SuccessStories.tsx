import { useTranslation } from "react-i18next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Quote, TrendingUp, Users, DollarSign, Star, ArrowLeft } from "lucide-react";
import { SeoHead, useSeoConfig } from "@/components/SeoHead";

export default function SuccessStories() {
  const { t } = useTranslation();

  const stories = [
    {
      id: 1,
      merchantName: "متجر الهدايا الفاخرة",
      industry: "هدايا ومناسبات",
      location: "الرياض، السعودية",
      image: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&h=600&fit=crop",
      quote: "ساري غيّرت طريقة عملنا بالكامل. زادت مبيعاتنا 300% في أول شهرين فقط!",
      author: "أحمد الشمري",
      position: "مدير المتجر",
      stats: [
        { label: "زيادة المبيعات", value: "300%", icon: TrendingUp },
        { label: "عملاء جدد", value: "450+", icon: Users },
        { label: "معدل التحويل", value: "42%", icon: DollarSign }
      ],
      story: "كنا نعاني من ضياع الكثير من الفرص البيعية بسبب عدم قدرتنا على الرد السريع على استفسارات العملاء. بعد استخدام ساري، أصبح لدينا مساعد ذكي يعمل 24/7 ويرد على جميع الأسئلة بشكل احترافي. النتائج كانت مذهلة!",
      results: [
        "تقليل وقت الرد من 4 ساعات إلى أقل من دقيقة",
        "زيادة معدل إتمام الطلبات بنسبة 65%",
        "توفير وقت الموظفين للتركيز على المهام الأهم",
        "تحسين رضا العملاء بشكل ملحوظ"
      ]
    },
    {
      id: 2,
      merchantName: "بوتيك الأزياء العصرية",
      industry: "أزياء وموضة",
      location: "جدة، السعودية",
      image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=600&fit=crop",
      quote: "الذكاء الاصطناعي في ساري يفهم عملائنا أفضل مما توقعنا. إنه كأن لدينا مندوب مبيعات خبير متاح دائماً!",
      author: "فاطمة العتيبي",
      position: "صاحبة البوتيك",
      stats: [
        { label: "زيادة الإيرادات", value: "250%", icon: TrendingUp },
        { label: "محادثات يومية", value: "200+", icon: Users },
        { label: "رضا العملاء", value: "4.8/5", icon: Star }
      ],
      story: "كان التحدي الأكبر لدينا هو إدارة الاستفسارات الكثيرة عن المقاسات والألوان والتوفر. ساري لا تجيب فقط، بل تقترح منتجات بديلة وتساعد العملاء في اتخاذ القرار. هذا رفع مبيعاتنا بشكل كبير.",
      results: [
        "معالجة أكثر من 6000 محادثة شهرياً",
        "زيادة متوسط قيمة الطلب بنسبة 35%",
        "تقليل نسبة الطلبات الملغاة إلى 5% فقط",
        "بناء قاعدة عملاء مخلصين"
      ]
    },
    {
      id: 3,
      merchantName: "متجر الإلكترونيات الذكية",
      industry: "إلكترونيات وتقنية",
      location: "الدمام، السعودية",
      image: "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800&h=600&fit=crop",
      quote: "الحملات التسويقية عبر ساري حققت نتائج أفضل من أي قناة تسويقية أخرى جربناها!",
      author: "خالد المطيري",
      position: "مدير التسويق",
      stats: [
        { label: "معدل فتح الرسائل", value: "89%", icon: TrendingUp },
        { label: "معدل التحويل", value: "31%", icon: DollarSign },
        { label: "عائد الاستثمار", value: "520%", icon: Star }
      ],
      story: "جربنا الإعلانات المدفوعة، البريد الإلكتروني، ووسائل التواصل الاجتماعي. لكن لا شيء قارب نتائج الحملات التسويقية عبر واتساب باستخدام ساري. العملاء يفتحون الرسائل ويتفاعلون معها بشكل لم نره من قبل.",
      results: [
        "معدل فتح 89% مقارنة بـ 20% للبريد الإلكتروني",
        "تكلفة اكتساب عميل أقل بـ 60%",
        "زيادة المبيعات الموسمية بنسبة 180%",
        "بناء علاقة مباشرة مع العملاء"
      ]
    },
    {
      id: 4,
      merchantName: "مطعم المأكولات الصحية",
      industry: "مطاعم وأغذية",
      location: "الخبر، السعودية",
      image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&h=600&fit=crop",
      quote: "ساري ساعدتنا في أتمتة الطلبات والحجوزات. وفرنا الكثير من الوقت والجهد!",
      author: "سارة الدوسري",
      position: "صاحبة المطعم",
      stats: [
        { label: "طلبات يومية", value: "150+", icon: TrendingUp },
        { label: "توفير الوقت", value: "70%", icon: Users },
        { label: "دقة الطلبات", value: "98%", icon: Star }
      ],
      story: "كنا نستقبل الطلبات عبر المكالمات الهاتفية، مما كان يسبب أخطاء وتأخيرات. الآن ساري تستقبل الطلبات، تؤكدها، وترسلها مباشرة للمطبخ. النظام يعمل بسلاسة تامة.",
      results: [
        "تقليل أخطاء الطلبات بنسبة 95%",
        "زيادة عدد الطلبات المعالجة بنسبة 120%",
        "تحسين تجربة العملاء بشكل كبير",
        "توفير تكاليف موظفي الاستقبال"
      ]
    },
    {
      id: 5,
      merchantName: "صالون التجميل الراقي",
      industry: "تجميل وعناية",
      location: "مكة المكرمة، السعودية",
      image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&h=600&fit=crop",
      quote: "نظام الحجوزات الآلي عبر ساري قلل المواعيد الملغاة بنسبة 80%. إنجاز رائع!",
      author: "منى القحطاني",
      position: "مديرة الصالون",
      stats: [
        { label: "تقليل الإلغاءات", value: "80%", icon: TrendingUp },
        { label: "حجوزات شهرية", value: "600+", icon: Users },
        { label: "رضا العملاء", value: "4.9/5", icon: Star }
      ],
      story: "المواعيد الملغاة في اللحظة الأخيرة كانت تكلفنا الكثير. ساري ترسل تذكيرات تلقائية، تؤكد الحجوزات، وتتيح للعملاء إعادة الجدولة بسهولة. النتيجة: صالون ممتلئ دائماً!",
      results: [
        "زيادة معدل الحضور إلى 95%",
        "تقليل الوقت الضائع بنسبة 70%",
        "زيادة الإيرادات الشهرية بنسبة 45%",
        "تحسين إدارة الوقت والموارد"
      ]
    },
    {
      id: 6,
      merchantName: "متجر الأثاث المنزلي",
      industry: "أثاث وديكور",
      location: "المدينة المنورة، السعودية",
      image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&h=600&fit=crop",
      quote: "ساري تجيب على أسئلة العملاء التفصيلية عن المقاسات والمواد والتوصيل. خدمة عملاء من الدرجة الأولى!",
      author: "عبدالله الزهراني",
      position: "صاحب المتجر",
      stats: [
        { label: "استفسارات يومية", value: "180+", icon: Users },
        { label: "معدل التحويل", value: "38%", icon: DollarSign },
        { label: "وقت الرد", value: "< 30 ثانية", icon: TrendingUp }
      ],
      story: "منتجاتنا تحتاج شرح تفصيلي (المقاسات، المواد، التركيب، التوصيل). كان من المستحيل الرد على الجميع بسرعة. ساري تعلمت كل شيء عن منتجاتنا وتجيب بدقة واحترافية.",
      results: [
        "معالجة أكثر من 5000 استفسار شهرياً",
        "زيادة المبيعات عبر واتساب بنسبة 220%",
        "تقليل الحاجة لموظفي خدمة العملاء",
        "تحسين سمعة المتجر وثقة العملاء"
      ]
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <SeoHead {...useSeoConfig('resourcesSuccessStories')} />
      <Navbar />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-primary/10 to-background py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <Star className="h-16 w-16 text-primary mx-auto mb-6" />
              <h1 className="text-4xl md:text-5xl font-bold mb-6">{t('successStories.auto_0')}<span className="text-primary">{t('successStories.auto_1')}</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8">{t('successStories.auto_2')}</p>
            </div>
          </div>
        </section>

        {/* Stats Overview */}
        <section className="py-16 bg-accent/30">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
              <div className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">500+</div>
                <div className="text-muted-foreground">{t('successStories.auto_3')}</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">250%</div>
                <div className="text-muted-foreground">{t('successStories.auto_4')}</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">50K+</div>
                <div className="text-muted-foreground">{t('successStories.auto_5')}</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">4.9/5</div>
                <div className="text-muted-foreground">{t('successStories.auto_6')}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Success Stories */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="space-y-16 max-w-6xl mx-auto">
              {stories.map((story, index) => (
                <Card key={story.id} className="overflow-hidden">
                  <div className={`grid grid-cols-1 lg:grid-cols-2 gap-0 ${index % 2 === 1 ? 'lg:grid-flow-dense' : ''}`}>
                    {/* Image */}
                    <div className={`relative h-64 lg:h-auto ${index % 2 === 1 ? 'lg:col-start-2' : ''}`}>
                      <img
                        src={story.image}
                        alt={story.merchantName}
                        className="w-full h-full object-cover"
                      />
                      <Badge className="absolute top-4 right-4 bg-primary">
                        {story.industry}
                      </Badge>
                    </div>

                    {/* Content */}
                    <div className="p-8 lg:p-12">
                      <div className="mb-6">
                        <h3 className="text-2xl font-bold mb-2">{story.merchantName}</h3>
                        <p className="text-muted-foreground">{story.location}</p>
                      </div>

                      {/* Quote */}
                      <div className="relative mb-6">
                        <Quote className="absolute -top-2 -right-2 h-8 w-8 text-primary/20" />
                        <blockquote className="text-lg italic pr-6">
                          "{story.quote}"
                        </blockquote>
                        <div className="mt-4 flex items-center gap-3">
                          <div>
                            <div className="font-semibold">{story.author}</div>
                            <div className="text-sm text-muted-foreground">{story.position}</div>
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-4 mb-6">
                        {story.stats.map((stat, idx) => (
                          <div key={idx} className="text-center p-3 bg-accent/50 rounded-lg">
                            <stat.icon className="h-5 w-5 text-primary mx-auto mb-2" />
                            <div className="font-bold text-lg">{stat.value}</div>
                            <div className="text-xs text-muted-foreground">{stat.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Story */}
                      <p className="text-muted-foreground mb-4">{story.story}</p>

                      {/* Results */}
                      <div className="space-y-2">
                        <h4 className="font-semibold mb-3">{t('successStories.auto_7')}</h4>
                        <ul className="space-y-2">
                          {story.results.map((result, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <div className="h-1.5 w-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                              <span className="text-sm text-muted-foreground">{result}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-gradient-to-r from-primary to-primary/80 text-white">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">{t('successStories.auto_8')}</h2>
              <p className="text-xl mb-8 opacity-90">{t('successStories.auto_9')}</p>
              
              <div className="flex gap-4 justify-center flex-wrap">
                <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-white/90">{t('successStories.auto_10')}<ArrowLeft className="mr-2 h-5 w-5" />
                </Button>
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">{t('successStories.auto_11')}</Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
