// @ts-nocheck
import { WebsiteReportsWorkspace } from '@/components/WebsiteReportsWorkspace';
import { KnowledgeWebsiteWorkspace } from '@/components/KnowledgeWebsiteWorkspace';
import { KnowledgeFaqWorkspace } from '@/components/KnowledgeFaqWorkspace';
import { useWebsiteReportsCopy } from '@/hooks/useWebsiteReportsCopy';
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
  const reportsCopy = useWebsiteReportsCopy();
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

  const previewMutation = trpc.analysis.previewAnalysis.useMutation({
    onSuccess: (data: any) => {
      setPreview(data as any);
      const totalFound = (data.products?.length || 0) + (data.pages?.length || 0) + (data.faqs?.length || 0);
      if (totalFound === 0) {
        toast.warning("لم يتم استخراج بيانات من الموقع", {
          description: reportsCopy.previewEmpty,
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
    onError: (error: any) => {
      toast.error("فشل تحليل الموقع", { description: error.message });
    },
  });

  const applyMutation = trpc.analysis.applyAnalysis.useMutation({
    onSuccess: (data: any) => {
      toast.success("تم اعتماد التغييرات بنجاح! 🎉", {
        description: `${data.savedProducts} منتج، ${data.savedFaqs} سؤال، ${data.savedPages} صفحة`,
      });
      setPhase('done');
      utils.analysis.getStatus.invalidate();
      utils.analysis.getExistingData.invalidate();
      utils.analysis.getDiscoveredPages.invalidate();
      utils.analysis.getExtractedFaqs.invalidate();
      utils.analysis.getStats.invalidate();
      void utils.sariBrain.invalidate();
    },
    onError: (error: any) => {
      setPhase('comparing');
      void utils.sariBrain.invalidate();
      toast.error("فشل حفظ البيانات", { description: error.message });
    },
  });

  const handleAnalyze = () => {
    if (!websiteUrl) { toast.error("أدخل رابط الموقع"); return; }
    let url = websiteUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    setWebsiteUrl(url);
    previewMutation.mutate({ websiteUrl: url });
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

  const ActionButtons = ({ value, onChange, label, existingCount, newCount }: { value: ActionType; onChange: (v: ActionType) => void; label: string; existingCount?: number; newCount?: number }) => (
    <div className="space-y-2">
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
      {/* Contextual explanation of chosen action */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        {value === 'replace' && (
          <span className="text-red-600">
            ⚠️ سيتم <strong>حذف جميع البيانات الحالية</strong> ({existingCount || 0}) واستبدالها بالبيانات الجديدة ({newCount || 0}).
            {(existingCount || 0) > 0 && " لا يمكن التراجع عن هذا الإجراء."}
          </span>
        )}
        {value === 'merge' && (
          <span className="text-blue-600">
            ✅ سيتم <strong>إضافة البيانات الجديدة</strong> ({newCount || 0}) إلى البيانات الحالية ({existingCount || 0}) مع تجاهل المكرر.
            {(existingCount || 0) > 0 ? ` النتيجة المتوقعة: حتى ${(existingCount || 0) + (newCount || 0)} عنصر.` : ''}
          </span>
        )}
        {value === 'skip' && (
          <span className="text-gray-500">
            ⏭️ لن يتم تغيير أي شيء — <strong>البيانات الحالية</strong> ({existingCount || 0}) ستبقى كما هي.
          </span>
        )}
      </p>
    </div>
  );

  const ComparisonSection = ({ title, icon: Icon, existingItems, newItems, action, onAction, renderItem, helpText }: {
    title: string; icon: any; existingItems: any[]; newItems: any[]; action: ActionType;
    onAction: (v: ActionType) => void; renderItem: (item: any, type: 'existing' | 'new') => React.ReactNode;
    helpText?: string;
  }) => (
    <Card className="border-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon className="w-5 h-5" /> {title}
          </CardTitle>
          <ActionButtons value={action} onChange={onAction} label={title} existingCount={existingItems.length} newCount={newItems.length} />
        </div>
        {/* Summary badges */}
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{t('smartAnalysis.auto_3')}<strong className="text-foreground">{existingItems.length}</strong></span>
          <span>{t('smartAnalysis.auto_4')}<strong className="text-emerald-600">{newItems.length}</strong></span>
          {action === 'replace' && <Badge variant="destructive" className="text-xs">{t('smartAnalysis.auto_5')}</Badge>}
          {action === 'merge' && <Badge className="bg-blue-100 text-blue-800 text-xs">{t('smartAnalysis.auto_6')}</Badge>}
          {action === 'skip' && <Badge variant="secondary" className="text-xs">{t('smartAnalysis.auto_7')}</Badge>}
        </div>
        {/* Help text */}
        {helpText && (
          <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg p-2 mt-2">
            💡 {helpText}
          </p>
        )}
      </CardHeader>
      {action !== 'skip' && (
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Existing */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground mb-2">📦 البيانات الحالية ({existingItems.length})</p>
              {existingItems.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-center">
                  <p className="text-xs text-amber-700 font-medium">لا توجد بيانات حالية</p>
                  <p className="text-[11px] text-amber-600 mt-1">سيتم إضافة البيانات الجديدة مباشرة — لا يوجد شيء للمقارنة.</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {existingItems.slice(0, 10).map((item, i) => (
                    <div key={i} className={`text-sm p-2 rounded border ${action === 'replace' ? 'bg-red-50/50 border-red-200 line-through opacity-70' : 'bg-muted/50'}`}>{renderItem(item, 'existing')}</div>
                  ))}
                  {existingItems.length > 10 && <p className="text-xs text-muted-foreground text-center">+{existingItems.length - 10} المزيد...</p>}
                </div>
              )}
            </div>
            {/* New */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-emerald-700 mb-2">✨ البيانات الجديدة ({newItems.length})</p>
              {newItems.length === 0 ? (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
                  <p className="text-xs text-gray-600 font-medium">لم يتم استخراج بيانات جديدة</p>
                  <p className="text-[11px] text-gray-500 mt-1">قد يكون الموقع محمياً أو لا يحتوي على هذا النوع من البيانات.</p>
                </div>
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
          {/* Result preview */}
          {(existingItems.length > 0 || newItems.length > 0) && (
            <div className="mt-3 p-3 bg-muted/30 rounded-lg border border-dashed">
              <p className="text-xs font-medium text-muted-foreground">📊 النتيجة بعد التطبيق:</p>
              <p className="text-sm font-medium mt-1">
                {action === 'replace' && (
                  <span>{existingItems.length > 0 ? `سيتم حذف ${existingItems.length} عنصر حالي → ` : ''}إجمالي: <strong className="text-emerald-600">{newItems.length}</strong> عنصر</span>
                )}
                {action === 'merge' && (
                  <span>الحالي ({existingItems.length}) + الجديد ({newItems.length}) = <strong className="text-blue-600">حتى {existingItems.length + newItems.length}</strong> عنصر (بدون مكرر)</span>
                )}
              </p>
            </div>
          )}
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
          helpText="المنتجات هي ما يستخدمه ساري للإجابة على استفسارات العملاء حول الأسعار والتوفر. إذا كان لديك منتجات حالية وتريد تحديثها، اختر 'استبدال'. إذا تريد إضافة منتجات جديدة مع الاحتفاظ بالحالية، اختر 'دمج'."
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
          helpText="الأسئلة الشائعة تساعد ساري في الرد على استفسارات العملاء المتكررة (سياسات الشحن، الإرجاع، طرق الدفع). كل سؤال يُحسّن دقة ردود البوت."
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
          helpText="الصفحات المكتشفة تُثري معرفة ساري بمحتوى موقعك (صفحة 'من نحن'، سياسة الشحن، صفحة التواصل). يستخدمها البوت لتقديم روابط ومعلومات دقيقة للعملاء."
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
            <Globe className="h-5 w-5" />{reportsCopy.previewImport}</CardTitle>
          <CardDescription>{reportsCopy.previewHelp}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              aria-label={reportsCopy.url}
              type="url"
              dir="ltr"
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
                <><Search className="mr-2 h-4 w-4" />{reportsCopy.previewImport}</>
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

      <Tabs defaultValue="history" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pages">{reportsCopy.tabsPages}</TabsTrigger>
          <TabsTrigger value="faqs">{reportsCopy.tabsFaqs}</TabsTrigger>
          <TabsTrigger value="history">{reportsCopy.tabsReports}</TabsTrigger>
        </TabsList>
        <TabsContent value="pages"><KnowledgeWebsiteWorkspace /></TabsContent>
        <TabsContent value="faqs"><KnowledgeFaqWorkspace /></TabsContent>
        <TabsContent value="history"><WebsiteReportsWorkspace /></TabsContent>
      </Tabs>
    </div>
  );
}
