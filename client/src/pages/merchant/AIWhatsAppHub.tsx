import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Bot,
  Sparkles,
  MessageSquare,
  Zap,
  Key,
  Mic,
  Calendar,
  BellRing,
  BarChart3,
  TestTube,
  ArrowLeft,
  Lightbulb,
} from "lucide-react";

interface HubCard {
  icon: React.ElementType;
  title: string;
  description: string;
  path: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  color: string;
}

export default function AIWhatsAppHub() {
  const { t } = useTranslation();

  const cards: HubCard[] = [
    {
      icon: Bot,
      title: "تخصيص الشخصية",
      description: "حدد نبرة ساري وأسلوبه في الردود — رسمي، ودود، أو احترافي.",
      path: "/merchant/sari-personality",
      badge: "مهم",
      badgeVariant: "default",
      color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      icon: TestTube,
      title: "تجربة ساري",
      description: "اختبر كيف يرد ساري على أسئلة عملائك قبل التفعيل الفعلي.",
      path: "/merchant/test-sari",
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      icon: Sparkles,
      title: "ساحة التجربة",
      description: "جرب سيناريوهات محادثة متقدمة مع إعدادات مخصصة.",
      path: "/merchant/sari-playground",
      badge: "تجريبي",
      badgeVariant: "secondary",
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      icon: Key,
      title: "الكلمات المفتاحية",
      description: "أضف كلمات مفتاحية ليتعرف عليها ساري ويرد بردود محددة.",
      path: "/merchant/keywords",
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: Lightbulb,
      title: "اقتراحات الذكاء الاصطناعي",
      description: "اطلع على اقتراحات ساري لتحسين ردودك ومنتجاتك.",
      path: "/merchant/ai-suggestions",
      badge: "جديد",
      badgeVariant: "default",
      color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    },
    {
      icon: Mic,
      title: "الرسائل الصوتية",
      description: "إعدادات استقبال وتحويل الرسائل الصوتية لنصوص.",
      path: "/merchant/voice-messages",
      color: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    },
    {
      icon: Calendar,
      title: "الرسائل المجدولة",
      description: "جدول رسائل واتساب لإرسالها تلقائياً في أوقات محددة.",
      path: "/merchant/scheduled-messages",
      color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    },
    {
      icon: BellRing,
      title: "الإشعارات التلقائية",
      description: "أعد رسائل تذكير الحجز وتنبيهات المتابعة التلقائية.",
      path: "/merchant/whatsapp-auto-notifications",
      color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    },
    {
      icon: BarChart3,
      title: "تحليلات ساري",
      description: "تابع أداء البوت — معدل الرد، رضا العملاء، والمحادثات.",
      path: "/merchant/sari-analytics",
      color: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    },
  ];

  return (
    <div className="container mx-auto py-6 space-y-8" dir="rtl">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 text-white shadow-lg">
            <Sparkles className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">مركز المساعد الذكي</h1>
            <p className="text-muted-foreground">
              إعدادات متقدمة لتخصيص ساري وقنوات التواصل التلقائية
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-violet-600">9</div>
            <p className="text-xs text-muted-foreground mt-1">أدوات ذكية</p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-blue-600">AI</div>
            <p className="text-xs text-muted-foreground mt-1">مدعوم بالذكاء</p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">24/7</div>
            <p className="text-xs text-muted-foreground mt-1">رد تلقائي</p>
          </CardContent>
        </Card>
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-2xl font-bold text-amber-600">
              <MessageSquare className="h-6 w-6 mx-auto" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">واتساب</p>
          </CardContent>
        </Card>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link key={card.path} href={card.path}>
            <Card className="group cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5 h-full">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className={`p-2.5 rounded-lg ${card.color}`}>
                    <card.icon className="h-5 w-5" />
                  </div>
                  {card.badge && (
                    <Badge variant={card.badgeVariant || "default"} className="text-xs">
                      {card.badge}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-base mt-3 group-hover:text-primary transition-colors">
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <CardDescription className="text-sm leading-relaxed">
                  {card.description}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
