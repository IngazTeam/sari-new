import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Globe, 
  ShoppingCart, 
  FileText, 
  MessageSquare, 
  Loader2, 
  CheckCircle2, 
  XCircle,
  AlertCircle,
  Search,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

export default function SmartAnalysis() {
  const { t } = useTranslation();
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const { data: status, refetch: refetchStatus } = trpc.analysis.getStatus.useQuery();
  const { data: pages, refetch: refetchPages } = trpc.analysis.getDiscoveredPages.useQuery();
  const { data: faqs, refetch: refetchFaqs } = trpc.analysis.getExtractedFaqs.useQuery();
  const { data: stats } = trpc.analysis.getStats.useQuery();

  const analyzeWebsite = trpc.analysis.analyzeWebsite.useMutation({
    onSuccess: (data) => {
      setIsAnalyzing(false);
      toast.success("تم تحليل الموقع بنجاح!", {
        description: `تم اكتشاف ${data.pagesCount} صفحة و ${data.faqsCount} سؤال شائع`,
      });
      refetchStatus();
      refetchPages();
      refetchFaqs();
    },
    onError: (error) => {
      setIsAnalyzing(false);
      toast.error("فشل تحليل الموقع", {
        description: error.message,
      });
    },
  });

  const deletePage = trpc.analysis.deletePage.useMutation({
    onSuccess: () => {
      toast.success(t('smartAnalysisPage.text0'));
      refetchPages();
    },
  });

  const deleteFaq = trpc.analysis.deleteFaq.useMutation({
    onSuccess: () => {
      toast.success(t('smartAnalysisPage.text1'));
      refetchFaqs();
    },
  });

  const handleAnalyze = () => {
    if (!websiteUrl) {
      toast.error(t('smartAnalysisPage.text2'));
      return;
    }

    setIsAnalyzing(true);
    analyzeWebsite.mutate({ websiteUrl });
  };

  const getPlatformBadge = (platform: string | null) => {
    const platformColors: Record<string, string> = {
      salla: "bg-purple-100 text-purple-800",
      zid: "bg-blue-100 text-blue-800",
      shopify: "bg-green-100 text-green-800",
      woocommerce: "bg-orange-100 text-orange-800",
      custom: "bg-gray-100 text-gray-800",
      unknown: "bg-red-100 text-red-800",
    };

    return (
      <Badge className={platformColors[platform || "unknown"] || ""}>
        {platform || "غير معروف"}
      </Badge>
    );
  };

  const getStatusIcon = (analysisStatus: string | null) => {
    switch (analysisStatus) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "analyzing":
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('smartAnalysisPage.text3')}</h1>
        <p className="text-muted-foreground mt-2">
          اكتشف منصة متجرك واستخرج المنتجات والصفحات والأسئلة الشائعة تلقائياً
        </p>
      </div>

      {/* Analysis Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            تحليل موقع جديد
          </CardTitle>
          <CardDescription>
            أدخل رابط موقعك لبدء التحليل الذكي
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              disabled={isAnalyzing}
            />
            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !websiteUrl}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  جاري التحليل...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  تحليل الموقع
                </>
              )}
            </Button>
          </div>

          {status?.hasWebsite && (
            <Alert>
              <AlertDescription className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon(status.analysisStatus)}
                  <span>
                    آخر تحليل: {status.websiteUrl}
                  </span>
                  {getPlatformBadge(status.platformType)}
                </div>
                {status.lastAnalysisDate && (
                  <span className="text-sm text-muted-foreground">
                    {new Date(status.lastAnalysisDate).toLocaleDateString("ar-SA")}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Statistics */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('smartAnalysisPage.text4')}</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPages}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('smartAnalysisPage.text5')}</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalFaqs}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('smartAnalysisPage.text6')}</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.pagesByType?.shipping || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('smartAnalysisPage.text7')}</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.pagesByType?.faq || 0}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs for Pages and FAQs */}
      <Tabs defaultValue="pages" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pages">
            <FileText className="mr-2 h-4 w-4" />
            الصفحات المكتشفة ({pages?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="faqs">
            <MessageSquare className="mr-2 h-4 w-4" />
            الأسئلة الشائعة ({faqs?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pages" className="space-y-4">
          {pages && pages.length > 0 ? (
            pages.map((page: any) => (
              <Card key={page.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{page.title || page.pageType}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Badge variant="outline">{page.pageType}</Badge>
                        {page.useInBot && (
                          <Badge className="bg-green-100 text-green-800">
                            مفعّل في البوت
                          </Badge>
                        )}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deletePage.mutate({ pageId: page.id })}
                    >
                      حذف
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {page.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                لا توجد صفحات مكتشفة بعد. قم بتحليل موقعك أولاً.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="faqs" className="space-y-4">
          {faqs && faqs.length > 0 ? (
            faqs.map((faq: any) => (
              <Card key={faq.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{faq.question}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        {faq.category && (
                          <Badge variant="outline">{faq.category}</Badge>
                        )}
                        {faq.useInBot && (
                          <Badge className="bg-green-100 text-green-800">
                            مفعّل في البوت
                          </Badge>
                        )}
                        {faq.usageCount > 0 && (
                          <Badge variant="secondary">
                            استخدم {faq.usageCount} مرة
                          </Badge>
                        )}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteFaq.mutate({ faqId: faq.id })}
                    >
                      حذف
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{faq.answer}</p>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                لا توجد أسئلة شائعة مستخرجة بعد. قم بتحليل موقعك أولاً.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
