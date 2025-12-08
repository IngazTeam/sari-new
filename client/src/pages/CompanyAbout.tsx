import { Link } from "wouter";
import { ArrowRight, Target, Users, Zap, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function CompanyAbout() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50">
      {/* Hero Section */}
      <section className="container py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-l from-blue-600 to-blue-800 bg-clip-text text-transparent">
            نحن ساري
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            منصة سعودية رائدة في مجال الذكاء الاصطناعي للمبيعات عبر واتساب. نساعد التجار والشركات على تحويل محادثاتهم إلى مبيعات ونمو مستدام.
          </p>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="container py-16">
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <Card className="p-8 border-blue-200">
            <Target className="w-12 h-12 text-blue-600 mb-4" />
            <h2 className="text-3xl font-bold mb-4">رسالتنا</h2>
            <p className="text-gray-600 leading-relaxed">
              تمكين التجار والشركات السعودية من الاستفادة من قوة الذكاء الاصطناعي لتحسين تجربة العملاء وزيادة المبيعات عبر واتساب، القناة المفضلة للتواصل في المنطقة.
            </p>
          </Card>

          <Card className="p-8 border-blue-200">
            <Zap className="w-12 h-12 text-blue-600 mb-4" />
            <h2 className="text-3xl font-bold mb-4">رؤيتنا</h2>
            <p className="text-gray-600 leading-relaxed">
              أن نكون المنصة الأولى في المملكة والخليج العربي لحلول الذكاء الاصطناعي التجارية عبر واتساب، ونساهم في التحول الرقمي للشركات الصغيرة والمتوسطة.
            </p>
          </Card>
        </div>
      </section>

      {/* Our Story */}
      <section className="bg-white py-20">
        <div className="container max-w-4xl">
          <h2 className="text-4xl font-bold mb-8 text-center">قصتنا</h2>
          <div className="prose prose-lg max-w-none text-gray-600">
            <p className="leading-relaxed mb-6">
              بدأت ساري من فكرة بسيطة: كيف يمكننا مساعدة التجار السعوديين على خدمة عملائهم بشكل أفضل عبر واتساب؟ لاحظنا أن معظم العملاء في المملكة يفضلون التواصل عبر واتساب، لكن التجار يواجهون صعوبة في إدارة المحادثات والرد السريع على الاستفسارات.
            </p>
            <p className="leading-relaxed mb-6">
              قررنا بناء حل ذكي يجمع بين قوة الذكاء الاصطناعي وفهم عميق للثقافة واللهجة السعودية. ساري ليست مجرد روبوت دردشة، بل وكيلة مبيعات ذكية تفهم عملاءك وتساعدهم في إيجاد ما يبحثون عنه.
            </p>
            <p className="leading-relaxed">
              اليوم، نخدم مئات التجار في المملكة، ونساعدهم على زيادة مبيعاتهم وتحسين تجربة عملائهم. ونواصل العمل على تطوير منصتنا لتقديم أفضل الحلول الذكية للسوق السعودي.
            </p>
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="container py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">قيمنا</h2>
          <p className="text-xl text-gray-600">المبادئ التي توجه عملنا</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card className="p-8 text-center hover:shadow-xl transition-all">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">العميل أولاً</h3>
            <p className="text-gray-600 leading-relaxed">
              نضع احتياجات عملائنا في المقام الأول ونعمل باستمرار على تحسين تجربتهم
            </p>
          </Card>

          <Card className="p-8 text-center hover:shadow-xl transition-all">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Zap className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">الابتكار المستمر</h3>
            <p className="text-gray-600 leading-relaxed">
              نبتكر حلولاً جديدة ونتبنى أحدث التقنيات لخدمة عملائنا بشكل أفضل
            </p>
          </Card>

          <Card className="p-8 text-center hover:shadow-xl transition-all">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Award className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">الجودة والاحترافية</h3>
            <p className="text-gray-600 leading-relaxed">
              نلتزم بأعلى معايير الجودة في كل ما نقدمه من منتجات وخدمات
            </p>
          </Card>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-gradient-to-l from-blue-600 to-blue-800 text-white py-20">
        <div className="container">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-5xl font-bold mb-2">500+</div>
              <div className="text-blue-100">تاجر نشط</div>
            </div>
            <div>
              <div className="text-5xl font-bold mb-2">100K+</div>
              <div className="text-blue-100">محادثة شهرياً</div>
            </div>
            <div>
              <div className="text-5xl font-bold mb-2">95%</div>
              <div className="text-blue-100">رضا العملاء</div>
            </div>
            <div>
              <div className="text-5xl font-bold mb-2">24/7</div>
              <div className="text-blue-100">دعم فني</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <Card className="bg-gradient-to-l from-blue-600 to-blue-800 text-white p-12 text-center">
          <h2 className="text-4xl font-bold mb-4">انضم إلى عائلة ساري</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">
            كن جزءاً من التحول الرقمي في المملكة وابدأ رحلتك معنا اليوم
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-8">
                ابدأ الآن مجاناً
                <ArrowRight className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/company/contact">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 text-lg px-8">
                تواصل معنا
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
