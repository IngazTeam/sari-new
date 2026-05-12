import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Globe, ShoppingCart, FileText, MessageSquare, Loader2,
  CheckCircle2, XCircle, AlertCircle, Search, ExternalLink,
  ArrowRight, Replace, Plus, SkipForward, Trash2, Package,
  Download, TrendingUp, Eye, Zap, BarChart3
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

type ActionType = 'replace' | 'merge' | 'skip';
type Phase = 'input' | 'comparing' | 'applying' | 'done';

interface PreviewData {
  websiteUrl: string;
  platform: string;
  products: any[];
  pages: any[];
  faqs: any[];
  contactInfo: any;
}

export default function SmartAnalysis() {
  const { t } = useTranslation();
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [phase, setPhase] = useState<Phase>('input');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [productsAction, setProductsAction] = useState<ActionType>('replace');
  const [faqsAction, setFaqsAction] = useState<ActionType>('replace');
  const [pagesAction, setPagesAction] = useState<ActionType>('replace');
  const utils = trpc.useUtils();

  const { data: status } = trpc.analysis.getStatus.useQuery(
    undefined,
    { refetchInterval: (query) => {
      const data = query.state.data as any;
      return data?.analysisStatus === 'analyzing' ? 3000 : false;
    }}
  );
  const { data: existingData } = trpc.analysis.getExistingData.useQuery();
  const { data: pages, refetch: refetchPages } = trpc.analysis.getDiscoveredPages.useQuery();
  const { data: faqs, refetch: refetchFaqs } = trpc.analysis.getExtractedFaqs.useQuery();
  const { data: stats } = trpc.analysis.getStats.useQuery();

  // ── Website Analysis APIs (merged from website-analysis page) ──
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<number | null>(null);
  const { data: analyses, isLoading: isLoadingAnalyses } = trpc.websiteAnalysis.listAnalyses.useQuery(undefined, {
    refetchInterval: (query) => {
      const list = query.state.data;
      return list?.some((a) => a.status === "analyzing") ? 5000 : false;
    },
  });
  const { data: currentAnalysis } = trpc.websiteAnalysis.getAnalysis.useQuery(
    { id: selectedAnalysisId! },
    { enabled: !!selectedAnalysisId, refetchInterval: (query) => {
      const data = query.state.data as any;
      return data?.status === 'analyzing' ? 3000 : false;
    }},
  );
  const { data: insights } = trpc.websiteAnalysis.getInsights.useQuery(
    { analysisId: selectedAnalysisId! },
    { enabled: !!selectedAnalysisId && currentAnalysis?.status === 'completed' },
  );
  const deepAnalyzeMutation = trpc.websiteAnalysis.analyze.useMutation({
    onSuccess: (data) => {
      setSelectedAnalysisId(data.analysisId);
      utils.websiteAnalysis.listAnalyses.invalidate();
    },
  });
  const deleteAnalysisMutation = trpc.websiteAnalysis.deleteAnalysis.useMutation({
    onSuccess: () => {
      toast.success("تم حذف التحليل");
      utils.websiteAnalysis.listAnalyses.invalidate();
      setSelectedAnalysisId(null);
    },
  });

  // Score helpers
  const getScoreColor = (score: number) => score >= 80 ? 'text-green-600' : score >= 60 ? 'text-yellow-600' : 'text-red-600';
  const getScoreBg = (score: number) => score >= 80 ? 'bg-green-100' : score >= 60 ? 'bg-yellow-100' : 'bg-red-100';

  // Export analysis as JSON
  const handleExportAnalysis = () => {
    if (!currentAnalysis) return;
    const blob = new Blob([JSON.stringify({ url: currentAnalysis.url, title: currentAnalysis.title, scores: { overall: currentAnalysis.overallScore, seo: currentAnalysis.seoScore, performance: currentAnalysis.performanceScore, ux: currentAnalysis.uxScore, content: currentAnalysis.contentQuality }, insights: insights || [], analyzedAt: currentAnalysis.createdAt }, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = u;
    link.download = `analysis-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(u);
    toast.success('تم تصدير التقرير');
  };

  const previewMutation = trpc.analysis.previewAnalysis.useMutation({
    onSuccess: (data) => {
      setPreview(data as any);
      const totalFound = (data.products?.length || 0) + (data.pages?.length || 0) + (data.faqs?.length || 0);
      if (totalFound === 0) {
        toast.warning("لم يتم استخراج بيانات من الموقع", {
          description: "قد يكون الموقع محمياً أو لا يحتوي على بيانات قابلة للاستخراج. تحقق من تاب 'التقييم' للنتائج العميقة.",
          duration: 8000,
        });
      }
      setPhase('comparing');
      // Smart defaults
      const hasExisting = (existingData?.products?.length || 0) > 0;
      setProductsAction(hasExisting ? 'skip' : 'replace');
      setFaqsAction((existingData?.faqs?.length || 0) > 0 ? 'skip' : 'replace');
      setPagesAction((existingData?.pages?.length || 0) > 0 ? 'skip' : 'replace');
    },
    onError: (error) => {
      toast.error("فشل تحليل الموقع", { description: error.message });
    },
  });

  const applyMutation = trpc.analysis.applyAnalysis.useMutation({
    onSuccess: (data) => {
      toast.success("تم اعتماد التغييرات بنجاح! 🎉", {
        description: `${data.savedProducts} منتج، ${data.savedFaqs} سؤال، ${data.savedPages} صفحة`,
      });
      setPhase('done');
      utils.analysis.getStatus.invalidate();
      utils.analysis.getExistingData.invalidate();
      utils.analysis.getDiscoveredPages.invalidate();
      utils.analysis.getExtractedFaqs.invalidate();
      utils.analysis.getStats.invalidate();
    },
    onError: (error) => {
      toast.error("فشل حفظ البيانات", { description: error.message });
    },
  });

  const deletePage = trpc.analysis.deletePage.useMutation({
    onSuccess: () => { toast.success("تم حذف الصفحة"); refetchPages(); },
  });
  const deleteFaq = trpc.analysis.deleteFaq.useMutation({
    onSuccess: () => { toast.success("تم حذف السؤال"); refetchFaqs(); },
  });

  const handleAnalyze = () => {
    if (!websiteUrl) { toast.error("أدخل رابط الموقع"); return; }
    let url = websiteUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    setWebsiteUrl(url);
    previewMutation.mutate({ websiteUrl: url });
    // Also trigger deep analysis for scores/insights (runs in background)
    deepAnalyzeMutation.mutate({ url });
  };

  const handleApply = () => {
    if (!preview) return;
    setPhase('applying');
    applyMutation.mutate({
      websiteUrl: preview.websiteUrl,
      platform: preview.platform as any,
      productsAction,
      products: productsAction !== 'skip' ? preview.products : [],
      faqsAction,
      faqs: faqsAction !== 'skip' ? preview.faqs : [],
      pagesAction,
      pages: pagesAction !== 'skip' ? preview.pages : [],
      applyContactInfo: true,
      contactInfo: preview.contactInfo,
    });
  };

  const handleReset = () => {
    setPhase('input');
    setPreview(null);
  };

  const getPlatformBadge = (platform: string | null) => {
    const colors: Record<string, string> = {
      salla: "bg-purple-100 text-purple-800", zid: "bg-blue-100 text-blue-800",
      shopify: "bg-green-100 text-green-800", woocommerce: "bg-orange-100 text-orange-800",
      custom: "bg-gray-100 text-gray-800", unknown: "bg-red-100 text-red-800",
    };
    return <Badge className={colors[platform || "unknown"] || ""}>{platform || "غير معروف"}</Badge>;
  };

  const ActionButtons = ({ value, onChange, label }: { value: ActionType; onChange: (v: ActionType) => void; label: string }) => (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant={value === 'replace' ? 'default' : 'outline'} onClick={() => onChange('replace')}
        className={value === 'replace' ? 'bg-red-600 hover:bg-red-700' : ''}>
        <Replace className="w-3.5 h-3.5 ml-1" />{t('smartAnalysis.auto_0')}</Button>
      <Button size="sm" variant={value === 'merge' ? 'default' : 'outline'} onClick={() => onChange('merge')}
        className={value === 'merge' ? 'bg-blue-600 hover:bg-blue-700' : ''}>
        <Plus className="w-3.5 h-3.5 ml-1" />{t('smartAnalysis.auto_1')}</Button>
      <Button size="sm" variant={value === 'skip' ? 'default' : 'outline'} onClick={() => onChange('skip')}
        className={value === 'skip' ? 'bg-gray-600 hover:bg-gray-700' : ''}>
        <SkipForward className="w-3.5 h-3.5 ml-1" />{t('smartAnalysis.auto_2')}</Button>
    </div>
  );

  const ComparisonSection = ({ title, icon: Icon, existingItems, newItems, action, onAction, renderItem }: {
    title: string; icon: any; existingItems: any[]; newItems: any[]; action: ActionType;
    onAction: (v: ActionType) => void; renderItem: (item: any, type: 'existing' | 'new') => React.ReactNode;
  }) => (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon className="w-5 h-5" /> {title}
          </CardTitle>
          <ActionButtons value={action} onChange={onAction} label={title} />
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{t('smartAnalysis.auto_3')}<strong className="text-foreground">{existingItems.length}</strong></span>
          <span>{t('smartAnalysis.auto_4')}<strong className="text-emerald-600">{newItems.length}</strong></span>
          {action === 'replace' && <Badge variant="destructive" className="text-xs">{t('smartAnalysis.auto_5')}</Badge>}
          {action === 'merge' && <Badge className="bg-blue-100 text-blue-800 text-xs">{t('smartAnalysis.auto_6')}</Badge>}
          {action === 'skip' && <Badge variant="secondary" className="text-xs">{t('smartAnalysis.auto_7')}</Badge>}
        </div>
      </CardHeader>
      {action !== 'skip' && (
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Existing */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground mb-2">📦 البيانات الحالية ({existingItems.length})</p>
              {existingItems.length === 0 ? (
                <p className="text-xs text-muted-foreground italic p-3 bg-muted rounded-lg text-center">{t('smartAnalysis.auto_8')}</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {existingItems.slice(0, 10).map((item, i) => (
                    <div key={i} className="text-sm p-2 bg-muted/50 rounded border">{renderItem(item, 'existing')}</div>
                  ))}
                  {existingItems.length > 10 && <p className="text-xs text-muted-foreground text-center">+{existingItems.length - 10} المزيد...</p>}
                </div>
              )}
            </div>
            {/* New */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-emerald-700 mb-2">✨ البيانات الجديدة ({newItems.length})</p>
              {newItems.length === 0 ? (
                <p className="text-xs text-muted-foreground italic p-3 bg-emerald-50 rounded-lg text-center">{t('smartAnalysis.auto_9')}</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {newItems.slice(0, 10).map((item, i) => (
                    <div key={i} className="text-sm p-2 bg-emerald-50 rounded border border-emerald-200">{renderItem(item, 'new')}</div>
                  ))}
                  {newItems.length > 10 && <p className="text-xs text-emerald-600 text-center">+{newItems.length - 10} المزيد...</p>}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );

  // ══════════════════════════════════════
  // PHASE: Comparing (Preview + Apply)
  // ══════════════════════════════════════
  if (phase === 'comparing' && preview) {
    return (
      <div className="container mx-auto py-8 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Globe className="w-6 h-6" />{t('smartAnalysis.auto_10')}</h1>
            <p className="text-muted-foreground text-sm mt-1">{t('smartAnalysis.auto_11')}</p>
          </div>
          <div className="flex items-center gap-2">
            {getPlatformBadge(preview.platform)}
            <Badge variant="outline" className="text-xs">{preview.websiteUrl}</Badge>
          </div>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <Package className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
            <p className="text-xl font-bold">{preview.products.length}</p>
            <p className="text-xs text-muted-foreground">{t('smartAnalysis.auto_12')}</p>
          </Card>
          <Card className="p-3 text-center">
            <FileText className="w-4 h-4 mx-auto mb-1 text-blue-600" />
            <p className="text-xl font-bold">{preview.pages.length}</p>
            <p className="text-xs text-muted-foreground">{t('smartAnalysis.auto_13')}</p>
          </Card>
          <Card className="p-3 text-center">
            <MessageSquare className="w-4 h-4 mx-auto mb-1 text-purple-600" />
            <p className="text-xl font-bold">{preview.faqs.length}</p>
            <p className="text-xs text-muted-foreground">{t('smartAnalysis.auto_14')}</p>
          </Card>
        </div>

        {/* Products comparison */}
        <ComparisonSection
          title={t('smartAnalysis.auto_46')}
          icon={ShoppingCart}
          existingItems={existingData?.products || []}
          newItems={preview.products}
          action={productsAction}
          onAction={setProductsAction}
          renderItem={(item, type) => (
            <div className="flex justify-between items-center">
              <span className="truncate flex-1">{item.name}</span>
              {item.price > 0 && <span className="text-xs font-medium mr-2 whitespace-nowrap">{item.price} {item.currency || 'ر.س'}</span>}
            </div>
          )}
        />

        {/* FAQs comparison */}
        <ComparisonSection
          title={t('smartAnalysis.auto_47')}
          icon={MessageSquare}
          existingItems={existingData?.faqs || []}
          newItems={preview.faqs}
          action={faqsAction}
          onAction={setFaqsAction}
          renderItem={(item) => (
            <div>
              <p className="font-medium text-xs">{item.question}</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{item.answer}</p>
            </div>
          )}
        />

        {/* Pages comparison */}
        <ComparisonSection
          title={t('smartAnalysis.auto_48')}
          icon={FileText}
          existingItems={existingData?.pages || []}
          newItems={preview.pages}
          action={pagesAction}
          onAction={setPagesAction}
          renderItem={(item) => (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] shrink-0">{item.pageType}</Badge>
              <span className="truncate text-xs">{item.title || item.url}</span>
            </div>
          )}
        />

        {/* Action buttons */}
        <div className="flex gap-3 pt-2 sticky bottom-4">
          <Button variant="outline" onClick={handleReset} className="flex-shrink-0">{t('smartAnalysis.auto_15')}</Button>
          <Button onClick={handleApply} className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={applyMutation.isPending}>
            {applyMutation.isPending ? (
              <><Loader2 className="w-4 h-4 ml-2 animate-spin" />{t('smartAnalysis.auto_16')}</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 ml-2" />{t('smartAnalysis.auto_17')}</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════
  // PHASE: Applying (loading)
  // ══════════════════════════════════════
  if (phase === 'applying') {
    return (
      <div className="container mx-auto py-20 text-center">
        <Loader2 className="w-12 h-12 animate-spin text-emerald-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold">{t('smartAnalysis.auto_18')}</h2>
        <p className="text-muted-foreground mt-2">{t('smartAnalysis.auto_19')}</p>
      </div>
    );
  }

  // ══════════════════════════════════════
  // PHASE: Input + Done (default view)
  // ══════════════════════════════════════
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('smartAnalysisPage.text3')}</h1>
        <p className="text-muted-foreground mt-2">{t('smartAnalysis.auto_20')}</p>
      </div>

      {/* Success message after applying */}
      {phase === 'done' && (
        <Alert className="border-emerald-300 bg-emerald-50">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertDescription className="text-emerald-800">{t('smartAnalysis.auto_21')}</AlertDescription>
        </Alert>
      )}

      {/* Analysis Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />{t('smartAnalysis.auto_22')}</CardTitle>
          <CardDescription>{t('smartAnalysis.auto_23')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              disabled={previewMutation.isPending}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            />
            <Button onClick={handleAnalyze} disabled={previewMutation.isPending || !websiteUrl}>
              {previewMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('smartAnalysis.auto_24')}</>
              ) : (
                <><Search className="mr-2 h-4 w-4" />{t('smartAnalysis.auto_25')}</>
              )}
            </Button>
          </div>

          {status?.hasWebsite && (
            <Alert>
              <AlertDescription className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {status.analysisStatus === 'completed' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> :
                   status.analysisStatus === 'analyzing' ? <Loader2 className="h-5 w-5 text-blue-500 animate-spin" /> :
                   status.analysisStatus === 'failed' ? <XCircle className="h-5 w-5 text-red-500" /> :
                   <AlertCircle className="h-5 w-5 text-gray-400" />}
                  <span>آخر تحليل: {status.websiteUrl}</span>
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
            <CardContent><div className="text-2xl font-bold">{stats.totalPages}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('smartAnalysisPage.text5')}</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.totalFaqs}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('smartAnalysisPage.text6')}</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.pagesByType?.shipping || 0}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('smartAnalysisPage.text7')}</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.pagesByType?.faq || 0}</div></CardContent>
          </Card>
        </div>
      )}

      {/* Unified data tabs */}
      <Tabs defaultValue="pages" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pages"><FileText className="mr-2 h-4 w-4" /> الصفحات ({pages?.length || 0})</TabsTrigger>
          <TabsTrigger value="faqs"><MessageSquare className="mr-2 h-4 w-4" /> الأسئلة ({faqs?.length || 0})</TabsTrigger>
          <TabsTrigger value="history"><BarChart3 className="mr-2 h-4 w-4" /> التحليلات ({analyses?.length || 0})</TabsTrigger>
          <TabsTrigger value="scores"><TrendingUp className="mr-2 h-4 w-4" />{t('smartAnalysis.auto_26')}</TabsTrigger>
        </TabsList>

        {/* Pages tab (existing) */}
        <TabsContent value="pages" className="space-y-4">
          {pages && pages.length > 0 ? pages.map((page: any) => (
            <Card key={page.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{page.title || page.pageType}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <Badge variant="outline">{page.pageType}</Badge>
                      {page.useInBot && <Badge className="bg-green-100 text-green-800">{t('smartAnalysis.auto_27')}</Badge>}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deletePage.mutate({ pageId: page.id })}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                <a href={page.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  {page.url} <ExternalLink className="h-3 w-3" />
                </a>
              </CardContent>
            </Card>
          )) : (
            <Card><CardContent className="py-8 text-center text-muted-foreground">{t('smartAnalysis.auto_28')}</CardContent></Card>
          )}
        </TabsContent>

        {/* FAQs tab (existing) */}
        <TabsContent value="faqs" className="space-y-4">
          {faqs && faqs.length > 0 ? faqs.map((faq: any) => (
            <Card key={faq.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{faq.question}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      {faq.category && <Badge variant="outline">{faq.category}</Badge>}
                      {faq.useInBot && <Badge className="bg-green-100 text-green-800">{t('smartAnalysis.auto_29')}</Badge>}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteFaq.mutate({ faqId: faq.id })}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{faq.answer}</p></CardContent>
            </Card>
          )) : (
            <Card><CardContent className="py-8 text-center text-muted-foreground">{t('smartAnalysis.auto_30')}</CardContent></Card>
          )}
        </TabsContent>

        {/* History tab (merged from website-analysis) */}
        <TabsContent value="history" className="space-y-4">
          {isLoadingAnalyses ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : analyses && analyses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {analyses.map((analysis) => (
                <Card key={analysis.id} className={`cursor-pointer transition-all hover:shadow-md ${selectedAnalysisId === analysis.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedAnalysisId(analysis.id)}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg line-clamp-1">{analysis.title || 'بدون عنوان'}</CardTitle>
                        <CardDescription className="line-clamp-1">{analysis.url}</CardDescription>
                      </div>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); if (confirm('هل أنت متأكد من حذف هذا التحليل؟')) deleteAnalysisMutation.mutate({ id: analysis.id }); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        {analysis.status === 'analyzing' ? (<><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">{t('smartAnalysis.auto_31')}</span></>) :
                         analysis.status === 'completed' ? (<><CheckCircle2 className="h-4 w-4 text-green-600" /><span className="text-sm">{t('smartAnalysis.auto_32')}</span></>) :
                         (<><XCircle className="h-4 w-4 text-red-600" /><span className="text-sm">{t('smartAnalysis.auto_33')}</span></>)}
                      </div>
                      {analysis.status === 'completed' && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{t('smartAnalysis.auto_34')}</span>
                            <span className={`text-2xl font-bold ${getScoreColor(analysis.overallScore)}`}>{analysis.overallScore}</span>
                          </div>
                          <Progress value={analysis.overallScore} className="h-2" />
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">{new Date(analysis.createdAt).toLocaleDateString('ar-SA')}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p>{t('smartAnalysis.auto_35')}</p>
              <p className="text-sm">{t('smartAnalysis.auto_36')}</p>
            </CardContent></Card>
          )}
        </TabsContent>

        {/* Scores & Insights tab (merged from website-analysis) */}
        <TabsContent value="scores" className="space-y-6">
          {currentAnalysis && currentAnalysis.status === 'completed' ? (
            <>
              {/* Score Cards */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{currentAnalysis.title}</h3>
                <Button variant="outline" size="sm" onClick={handleExportAnalysis}><Download className="h-4 w-4 ml-1" />{t('smartAnalysis.auto_37')}</Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className={`p-3 rounded-lg ${getScoreBg(currentAnalysis.seoScore)}`}><Search className={`h-6 w-6 ${getScoreColor(currentAnalysis.seoScore)}`} /></div><div><p className="text-sm text-muted-foreground">SEO</p><p className={`text-2xl font-bold ${getScoreColor(currentAnalysis.seoScore)}`}>{currentAnalysis.seoScore}</p></div></div></CardContent></Card>
                <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className={`p-3 rounded-lg ${getScoreBg(currentAnalysis.performanceScore)}`}><Zap className={`h-6 w-6 ${getScoreColor(currentAnalysis.performanceScore)}`} /></div><div><p className="text-sm text-muted-foreground">{t('smartAnalysis.auto_38')}</p><p className={`text-2xl font-bold ${getScoreColor(currentAnalysis.performanceScore)}`}>{currentAnalysis.performanceScore}</p></div></div></CardContent></Card>
                <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className={`p-3 rounded-lg ${getScoreBg(currentAnalysis.uxScore)}`}><Eye className={`h-6 w-6 ${getScoreColor(currentAnalysis.uxScore)}`} /></div><div><p className="text-sm text-muted-foreground">{t('smartAnalysis.auto_39')}</p><p className={`text-2xl font-bold ${getScoreColor(currentAnalysis.uxScore)}`}>{currentAnalysis.uxScore}</p></div></div></CardContent></Card>
                <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><div className={`p-3 rounded-lg ${getScoreBg(currentAnalysis.contentQuality)}`}><FileText className={`h-6 w-6 ${getScoreColor(currentAnalysis.contentQuality)}`} /></div><div><p className="text-sm text-muted-foreground">{t('smartAnalysis.auto_40')}</p><p className={`text-2xl font-bold ${getScoreColor(currentAnalysis.contentQuality)}`}>{currentAnalysis.contentQuality}</p></div></div></CardContent></Card>
              </div>

              {/* SEO Issues */}
              {currentAnalysis.seoIssues && currentAnalysis.seoIssues.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-lg">{t('smartAnalysis.auto_41')}</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {currentAnalysis.seoIssues.map((issue: string, i: number) => (
                        <li key={i} className="flex items-start gap-2"><AlertCircle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" /><span className="text-sm">{issue}</span></li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Insights */}
              {insights && insights.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-lg">{t('smartAnalysis.auto_42')}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {insights.map((insight: any) => (
                      <div key={insight.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          {insight.type === 'strength' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
                           insight.type === 'weakness' ? <XCircle className="h-4 w-4 text-red-600" /> :
                           insight.type === 'opportunity' ? <TrendingUp className="h-4 w-4 text-blue-600" /> :
                           <AlertCircle className="h-4 w-4 text-orange-600" />}
                          <span className="font-medium">{insight.title}</span>
                          <Badge variant={insight.priority === 'critical' ? 'destructive' : insight.priority === 'high' ? 'default' : 'secondary'}>
                            {insight.priority === 'critical' ? 'حرج' : insight.priority === 'high' ? 'عالي' : insight.priority === 'medium' ? 'متوسط' : 'منخفض'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{insight.description}</p>
                        {insight.recommendation && <div className="bg-blue-50 p-3 rounded-lg"><p className="text-sm font-medium text-blue-900 mb-1">{t('smartAnalysis.auto_43')}</p><p className="text-sm text-blue-800">{insight.recommendation}</p></div>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : currentAnalysis && currentAnalysis.status === 'analyzing' ? (
            <Card><CardContent className="py-12 text-center">
              <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-primary" />
              <p className="font-medium">جاري تحليل {currentAnalysis.title}...</p>
              <p className="text-sm text-muted-foreground mt-1">{t('smartAnalysis.auto_44')}</p>
            </CardContent></Card>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4" />
              <p>{t('smartAnalysis.auto_45')}</p>
            </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
