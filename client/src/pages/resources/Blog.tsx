import { useTranslation } from "react-i18next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, User, ArrowRight, ArrowLeft, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SeoHead, useSeoConfig } from "@/components/SeoHead";

export default function Blog() {
  const { t } = useTranslation();

  const blogPosts = [
    {
      id: 1,
      title: "كيف تقيس أثر الذكاء الاصطناعي على مبيعات واتساب؟",
      excerpt: "منهج عملي لربط المحادثة بالطلب المدفوع دون نسب مبالغ فيها أو إسناد غير موثق.",
      category: "القياس والتحليلات",
      author: "فريق ساري",
      date: "2026-08-21",
      readTime: "5 دقائق",
      image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=400&fit=crop"
    },
    {
      id: 2,
      title: "قائمة تحقق لبدء تجربة ساري",
      excerpt: "خطوات إعداد الحساب وربط القناة وإضافة المعرفة واختبار التحويل إلى موظف قبل استقبال العملاء.",
      category: "دروس تعليمية",
      author: "فريق ساري",
      date: "2026-08-21",
      readTime: "10 دقائق",
      image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&h=400&fit=crop"
    },
    {
      id: 3,
      title: "أفضل الممارسات للرد الآلي على واتساب: دليل 2026",
      excerpt: "صمّم ردوداً واضحة، وحدود معرفة صريحة، ومسار تحويل بشري يمكن قياسه ومراجعته.",
      category: "خدمة العملاء",
      author: "فريق ساري",
      date: "2026-08-21",
      readTime: "7 دقائق",
      image: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800&h=400&fit=crop"
    },
    {
      id: 4,
      title: "كيف تستخدم الرسائل الصوتية لزيادة تفاعل العملاء",
      excerpt: "متى تستخدم التفريغ الصوتي، وكيف تختبر الدقة والخصوصية قبل تفعيله للعملاء.",
      category: "نصائح وحيل",
      author: "فريق ساري",
      date: "2026-08-21",
      readTime: "6 دقائق",
      image: "https://images.unsplash.com/photo-1590650153855-d9e808231d41?w=800&h=400&fit=crop"
    },
    {
      id: 5,
      title: "تحليل البيانات: كيف تقرأ تقارير ساري لتحسين أدائك",
      excerpt: "دليل لفهم المقاييس الفعلية وتمييز بيانات التشغيل عن مؤشرات المبيعات والرضا.",
      category: "التحليلات",
      author: "فريق ساري",
      date: "2026-08-21",
      readTime: "8 دقائق",
      image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=400&fit=crop"
    },
    {
      id: 6,
      title: "من تجربة بيتا إلى دراسة حالة موثقة",
      excerpt: "ما البيانات والموافقات والمنهج الذي نحتاجه قبل نشر نسبة تحويل أو إيراد باسم عميل؟",
      category: "دراسات الحالة",
      author: "فريق ساري",
      date: "2026-08-21",
      readTime: "5 دقائق",
      image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&h=400&fit=crop"
    }
  ];

  const categories = ["الكل", "القياس والتحليلات", "دروس تعليمية", "خدمة العملاء", "نصائح وحيل", "التحليلات", "دراسات الحالة"];

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <SeoHead {...useSeoConfig('blog')} />
      <Navbar />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-accent/50 to-background py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl font-bold mb-6">{t('blog.auto_0')}<span className="text-primary">{t('blog.auto_1')}</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8">{t('blog.auto_2')}</p>
              
              {/* Search Bar */}
              <div className="relative max-w-xl mx-auto">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
                <Input
                  type="text"
                  placeholder={t('blog.auto_8')}
                  className="pr-10 h-12"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="py-8 border-b">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap gap-2 justify-center">
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={category === "الكل" ? "default" : "outline"}
                  size="sm"
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>
        </section>

        {/* Blog Posts Grid */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {blogPosts.map((post) => (
                <Card key={post.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={post.image}
                      alt={post.title}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    />
                    <Badge className="absolute top-4 right-4 bg-primary">
                      {post.category}
                    </Badge>
                  </div>
                  
                  <CardHeader>
                    <CardTitle className="text-xl line-clamp-2 hover:text-primary transition-colors">
                      {post.title}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {post.excerpt}
                    </CardDescription>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                      <div className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        <span>{post.author}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(post.date).toLocaleDateString('ar-SA')}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>{post.readTime}</span>
                      </div>
                    </div>
                    
                    <Button variant="ghost" className="w-full group">{t('blog.auto_3')}<ArrowLeft className="mr-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Load More Button */}
            <div className="text-center mt-12">
              <Button size="lg" variant="outline">{t('blog.auto_4')}</Button>
            </div>
          </div>
        </section>

        {/* Newsletter Section */}
        <section className="py-16 bg-accent/30">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-4">{t('blog.auto_5')}</h2>
              <p className="text-muted-foreground mb-8">{t('blog.auto_6')}</p>
              
              <div className="flex gap-2 max-w-md mx-auto">
                <Input
                  type="email"
                  placeholder={t('blog.auto_9')}
                  className="flex-1"
                />
                <Button className="bg-primary hover:bg-primary/90">{t('blog.auto_7')}</Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
