import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, FileText, Send, Calendar, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function SheetsReports() {
  const { t } = useTranslation();
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);

  // توليد تقرير يومي
  const dailyMutation = trpc.sheets.generateDailyReport.useMutation({
    onSuccess: (data: any) => {
      setGeneratingReport(null);
      if (data.success) {
        toast.success("نجح التوليد", {
          description: "تم توليد التقرير اليومي بنجاح",
        });
      } else {
        toast.error("فشل التوليد", { description: data.message });
      }
    },
    onError: error => {
      setGeneratingReport(null);
      toast.error(error.message);
    },
  });

  // توليد تقرير أسبوعي
  const weeklyMutation = trpc.sheets.generateWeeklyReport.useMutation({
    onSuccess: (data: any) => {
      setGeneratingReport(null);
      if (data.success) {
        toast.success("نجح التوليد", {
          description: "تم توليد التقرير الأسبوعي بنجاح",
        });
      } else {
        toast.error("فشل التوليد", { description: data.message });
      }
    },
    onError: error => {
      setGeneratingReport(null);
      toast.error(error.message);
    },
  });

  // توليد تقرير شهري
  const monthlyMutation = trpc.sheets.generateMonthlyReport.useMutation({
    onSuccess: (data: any) => {
      setGeneratingReport(null);
      if (data.success) {
        toast.success("نجح التوليد", {
          description: "تم توليد التقرير الشهري بنجاح",
        });
      } else {
        toast.error("فشل التوليد", { description: data.message });
      }
    },
    onError: error => {
      setGeneratingReport(null);
      toast.error(error.message);
    },
  });

  // إرسال تقرير عبر WhatsApp
  const sendMutation = trpc.sheets.sendReportViaWhatsApp.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success("تم الإرسال", { description: data.message });
      } else {
        toast.error("فشل الإرسال", { description: data.message });
      }
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const handleGenerateReport = (type: "daily" | "weekly" | "monthly") => {
    setGeneratingReport(type);
    switch (type) {
      case "daily":
        dailyMutation.mutate();
        break;
      case "weekly":
        weeklyMutation.mutate();
        break;
      case "monthly":
        monthlyMutation.mutate();
        break;
    }
  };

  const handleSendReport = (type: string) => {
    if (type === 'يومي' || type === 'أسبوعي' || type === 'شهري') sendMutation.mutate({ reportType: type });
  };

  const reports = [
    {
      id: "daily",
      title: "تقرير يومي",
      description: "ملخص الأداء لليوم الحالي",
      icon: Calendar,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      schedule: "يتم توليده تلقائياً في الساعة 11:59 مساءً",
    },
    {
      id: "weekly",
      title: "تقرير أسبوعي",
      description: "ملخص الأداء للأسبوع الماضي",
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
      schedule: "يتم توليده تلقائياً كل يوم أحد",
    },
    {
      id: "monthly",
      title: "تقرير شهري",
      description: "إحصائيات شاملة للشهر الماضي",
      icon: FileText,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      schedule: "يتم توليده تلقائياً في آخر يوم من الشهر",
    },
  ];

  return (
    <>
      <div className="container max-w-6xl py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            {t("workspacePages.sheetReports")}
          </h1>
          <p className="text-muted-foreground">{t("sheetsReports.auto_0")}</p>
        </div>

        {/* بطاقات التقارير */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {reports.map(report => {
            const Icon = report.icon;
            const isGenerating = generatingReport === report.id;
            const isSending = sendMutation.isPending;

            return (
              <Card key={report.id} className="p-6">
                <div
                  className={`w-12 h-12 rounded-lg ${report.bgColor} flex items-center justify-center mb-4`}
                >
                  <Icon className={`w-6 h-6 ${report.color}`} />
                </div>

                <h3 className="text-xl font-semibold mb-2">{report.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {report.description}
                </p>

                <div className="space-y-3">
                  <Button
                    onClick={() =>
                      handleGenerateReport(
                        report.id as "daily" | "weekly" | "monthly"
                      )
                    }
                    disabled={isGenerating}
                    className="w-full"
                    variant="outline"
                  >
                    {isGenerating && (
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    )}
                    <FileText className="w-4 h-4 ml-2" />
                    {t("sheetsReports.auto_1")}
                  </Button>

                  <Button
                    onClick={() => handleSendReport(report.title.split(" ")[1])}
                    disabled={isSending}
                    className="w-full"
                  >
                    {isSending && (
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    )}
                    <Send className="w-4 h-4 ml-2" />
                    {t("sheetsReports.auto_2")}
                  </Button>
                </div>

                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    📅 {report.schedule}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>

        {/* معلومات التقارير */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            {t("sheetsReportsPage.text21")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium mb-2">
                {t("sheetsReportsPage.text22")}
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>{t("sheetsReportsPage.text23")}</li>
                <li>{t("sheetsReportsPage.text24")}</li>
                <li>{t("sheetsReportsPage.text25")}</li>
                <li>{t("sheetsReportsPage.text26")}</li>
                <li>{t("sheetsReportsPage.text27")}</li>
              </ul>
            </div>

            <div>
              <h3 className="font-medium mb-2">
                {t("sheetsReportsPage.text28")}
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>{t("sheetsReportsPage.text29")}</li>
                <li>{t("sheetsReportsPage.text30")}</li>
                <li>{t("sheetsReportsPage.text31")}</li>
                <li>{t("sheetsReportsPage.text32")}</li>
                <li>{t("sheetsReportsPage.text33")}</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* ملاحظات */}
        <Card className="p-4 mt-6 bg-amber-50 border-amber-200">
          <h3 className="font-semibold mb-2 text-amber-900">
            {t("sheetsReportsPage.text34")}
          </h3>
          <ul className="text-sm text-amber-800 space-y-1">
            <li>{t("sheetsReportsPage.text35")}</li>
            <li>{t("sheetsReportsPage.text36")}</li>
            <li>{t("sheetsReportsPage.text37")}</li>
            <li>{t("sheetsReportsPage.text38")}</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
