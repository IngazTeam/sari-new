import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  BarChart3,
  TrendingUp,
  Activity,
  Gauge,
  FileText,
  Clock,
  MessageCircle,
  Search,
  Globe,
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

export default function AnalyticsHub() {
  const { t } = useTranslation();

  const cards: HubCard[] = [
    {
      icon: BarChart3,
      title: "تحليلات المبيعات",
      description: "نظرة شاملة على إيراداتك، الطلبات، ومعدلات التحويل.",
      path: "/merchant/analytics",
      badge: "أساسي",
      badgeVariant: "default",
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      icon: TrendingUp,
      title: "التحليلات المتقدمة",
      description: "تحليل عميق للاتجاهات والأنماط مع مقارنات زمنية.",
      path: "/merchant/advanced-analytics",
      color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      icon: Gauge,
      title: "مقاييس الأداء",
      description: "سرعة الرد، معدل الإغلاق، ومؤشرات الأداء الرئيسية.",
      path: "/merchant/performance-metrics",
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: Activity,
      title: "لوحة الرؤى",
      description: "رؤى ذكية مدعومة بالذكاء الاصطناعي حول أداء متجرك.",
      path: "/merchant/insights",
      badge: "AI",
      badgeVariant: "secondary",
      color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    },
    {
      icon: Search,
      title: "تحليل الموقع",
      description: "تحليل SEO وأداء موقعك الإلكتروني وتوصيات التحسين.",
      path: "/merchant/website-analysis",
      color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    },
    {
      icon: FileText,
      title: "التقارير الأسبوعية",
      description: "ملخص أسبوعي تلقائي لأداء متجرك وساري.",
      path: "/merchant/weekly-reports",
      color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    },
    {
      icon: MessageCircle,
      title: "استخدام الرسائل",
      description: "تتبع حجم الرسائل المرسلة واستهلاك الباقة.",
      path: "/merchant/usage",
      color: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    },
    {
      icon: Clock,
      title: "التقارير المجدولة",
      description: "جدول تقارير تلقائية تصلك عبر البريد الإلكتروني.",
      path: "/merchant/scheduled-reports",
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      icon: Globe,
      title: "تحليلات تجربة ساري",
      description: "تتبع أداء صفحة تجربة ساري العامة ومعدلات التفاعل.",
      path: "/merchant/try-sari-analytics",
      color: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    },
  ];

  return (
    <div className="container mx-auto py-6 space-y-8" dir="rtl">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-600 text-white shadow-lg">
            <BarChart3 className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('analyticsHub.auto_0')}</h1>
            <p className="text-muted-foreground">{t('analyticsHub.auto_1')}</p>
          </div>
        </div>
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
