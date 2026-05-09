import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Globe, ShoppingCart, FileText, MessageSquare, Loader2,
  CheckCircle2, XCircle, AlertCircle, Search, ExternalLink,
  ArrowRight, Replace, Plus, SkipForward, Trash2, Package
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

  const previewMutation = trpc.analysis.previewAnalysis.useMutation({
    onSuccess: (data) => {
      setPreview(data as any);
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
        <Replace className="w-3.5 h-3.5 ml-1" /> استبدال
      </Button>
      <Button size="sm" variant={value === 'merge' ? 'default' : 'outline'} onClick={() => onChange('merge')}
        className={value === 'merge' ? 'bg-blue-600 hover:bg-blue-700' : ''}>
        <Plus className="w-3.5 h-3.5 ml-1" /> دمج
      </Button>
      <Button size="sm" variant={value === 'skip' ? 'default' : 'outline'} onClick={() => onChange('skip')}
        className={value === 'skip' ? 'bg-gray-600 hover:bg-gray-700' : ''}>
        <SkipForward className="w-3.5 h-3.5 ml-1" /> تخطي
      </Button>
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
          <span>الحالي: <strong className="text-foreground">{existingItems.length}</strong></span>
          <span>الجديد: <strong className="text-emerald-600">{newItems.length}</strong></span>
          {action === 'replace' && <Badge variant="destructive" className="text-xs">سيتم حذف الحالي</Badge>}
          {action === 'merge' && <Badge className="bg-blue-100 text-blue-800 text-xs">سيتم إضافة الجديد فقط</Badge>}
          {action === 'skip' && <Badge variant="secondary" className="text-xs">بدون تغيير</Badge>}
        </div>
      </CardHeader>
      {action !== 'skip' && (
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Existing */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground mb-2">📦 البيانات الحالية ({existingItems.length})</p>
              {existingItems.length === 0 ? (
                <p className="text-xs text-muted-foreground italic p-3 bg-muted rounded-lg text-center">لا توجد بيانات حالية</p>
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
                <p className="text-xs text-muted-foreground italic p-3 bg-emerald-50 rounded-lg text-center">لم يتم استخراج بيانات</p>
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
              <Globe className="w-6 h-6" /> مراجعة نتائج التحليل
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              راجع البيانات المستخرجة واختر الإجراء المناسب لكل قسم قبل الاعتماد
            </p>
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
            <p className="text-xs text-muted-foreground">منتج مستخرج</p>
          </Card>
          <Card className="p-3 text-center">
            <FileText className="w-4 h-4 mx-auto mb-1 text-blue-600" />
            <p className="text-xl font-bold">{preview.pages.length}</p>
            <p className="text-xs text-muted-foreground">صفحة مكتشفة</p>
          </Card>
          <Card className="p-3 text-center">
            <MessageSquare className="w-4 h-4 mx-auto mb-1 text-purple-600" />
            <p className="text-xl font-bold">{preview.faqs.length}</p>
            <p className="text-xs text-muted-foreground">سؤال شائع</p>
          </Card>
        </div>

        {/* Products comparison */}
        <ComparisonSection
          title="المنتجات"
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
          title="الأسئلة الشائعة"
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
          title="الصفحات المكتشفة"
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
          <Button variant="outline" onClick={handleReset} className="flex-shrink-0">
            إلغاء
          </Button>
          <Button onClick={handleApply} className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={applyMutation.isPending}>
            {applyMutation.isPending ? (
              <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> جاري الحفظ...</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 ml-2" /> اعتماد التغييرات</>
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
        <h2 className="text-xl font-bold">جاري حفظ التغييرات...</h2>
        <p className="text-muted-foreground mt-2">يتم تحديث البيانات وتزويد البوت بالمعلومات الجديدة</p>
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
        <p className="text-muted-foreground mt-2">
          اكتشف منصة متجرك واستخرج المنتجات والصفحات والأسئلة الشائعة تلقائياً
        </p>
      </div>

      {/* Success message after applying */}
      {phase === 'done' && (
        <Alert className="border-emerald-300 bg-emerald-50">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertDescription className="text-emerald-800">
            تم اعتماد التغييرات بنجاح! البوت الآن يعرف المنتجات والمعلومات الجديدة. 🎉
          </AlertDescription>
        </Alert>
      )}

      {/* Analysis Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" /> تحليل موقع جديد
          </CardTitle>
          <CardDescription>أدخل رابط موقعك لبدء التحليل الذكي — ستراجع النتائج قبل الاعتماد</CardDescription>
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
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> جاري التحليل...</>
              ) : (
                <><Search className="mr-2 h-4 w-4" /> تحليل الموقع</>
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

      {/* Existing data tabs */}
      <Tabs defaultValue="pages" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pages"><FileText className="mr-2 h-4 w-4" /> الصفحات ({pages?.length || 0})</TabsTrigger>
          <TabsTrigger value="faqs"><MessageSquare className="mr-2 h-4 w-4" /> الأسئلة الشائعة ({faqs?.length || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="pages" className="space-y-4">
          {pages && pages.length > 0 ? pages.map((page: any) => (
            <Card key={page.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{page.title || page.pageType}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <Badge variant="outline">{page.pageType}</Badge>
                      {page.useInBot && <Badge className="bg-green-100 text-green-800">مفعّل في البوت</Badge>}
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
            <Card><CardContent className="py-8 text-center text-muted-foreground">لا توجد صفحات مكتشفة بعد. قم بتحليل موقعك أولاً.</CardContent></Card>
          )}
        </TabsContent>
        <TabsContent value="faqs" className="space-y-4">
          {faqs && faqs.length > 0 ? faqs.map((faq: any) => (
            <Card key={faq.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{faq.question}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      {faq.category && <Badge variant="outline">{faq.category}</Badge>}
                      {faq.useInBot && <Badge className="bg-green-100 text-green-800">مفعّل في البوت</Badge>}
                      {faq.usageCount > 0 && <Badge variant="secondary">استخدم {faq.usageCount} مرة</Badge>}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteFaq.mutate({ faqId: faq.id })}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{faq.answer}</p></CardContent>
            </Card>
          )) : (
            <Card><CardContent className="py-8 text-center text-muted-foreground">لا توجد أسئلة شائعة بعد. قم بتحليل موقعك أولاً.</CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
