import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Brain, Trash2, RotateCcw, FileText, Package, Globe, Settings, Clock, Upload, Search, CheckCircle2, XCircle, AlertTriangle, MessageSquare, Sparkles, Shield, HelpCircle, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useIntegration, IntegrationLockBanner } from '@/hooks/useIntegration';

const ACTION_ICONS: Record<string, string> = {
  document_deleted: '🗑️', products_deleted: '🗑️', website_deleted: '🗑️',
  brain_reset: '⚠️', file_uploaded: '📁', file_approved: '✅',
  website_analyzed: '🌐', products_imported: '🛍️', settings_changed: '⚙️',
  content_analyzed: '🔬',
  faq_created: '➕',
  faq_updated: '✏️',
  faq_deleted: '🗑️',
  faqs_deleted: '🗑️',
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  document: <FileText className="h-5 w-5 text-blue-500" />,
  products: <Package className="h-5 w-5 text-green-500" />,
  website: <Globe className="h-5 w-5 text-purple-500" />,
  settings: <Settings className="h-5 w-5 text-gray-500" />,
  faqs: <HelpCircle className="h-5 w-5 text-orange-500" />,
};

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800 border-green-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-red-100 text-red-800 border-red-200',
};

const RISK_LABELS: Record<string, string> = {
  low: '🟢 منخفض',
  medium: '🟡 متوسط',
  high: '🔴 مرتفع',
};

export default function SariBrain() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: sources, isLoading } = trpc.sariBrain.getSources.useQuery();
  const { data: activityLog } = trpc.sariBrain.getActivityLog.useQuery({ limit: 30 });
  const { data: faqs } = trpc.sariBrain.getFaqs.useQuery();

  // FAQ state
  const [newFaqQ, setNewFaqQ] = useState('');
  const [newFaqA, setNewFaqA] = useState('');

  // Smart Intake state
  const [previewText, setPreviewText] = useState('');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [testQuestion, setTestQuestion] = useState('');
  const [testResult, setTestResult] = useState<{ question: string; answer: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const deleteSourceMutation = trpc.sariBrain.deleteSource.useMutation({
    onSuccess: () => {
      toast.success('تم حذف المصدر بنجاح');
      utils.sariBrain.getSources.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
    },
    onError: (error) => toast.error('فشل الحذف: ' + error.message),
  });

  const resetBrainMutation = trpc.sariBrain.resetBrain.useMutation({
    onSuccess: (data) => {
      toast.success(`تم إعادة ضبط عقل ساري — حذف ${data.deletedSources.length} مصادر`);
      utils.sariBrain.getSources.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
    },
    onError: (error) => toast.error('فشل إعادة الضبط: ' + error.message),
  });

  const reanalyzeMutation = trpc.sariBrain.reanalyzeWebsite.useMutation({
    onSuccess: (data) => {
      toast.success(`تم تحليل الموقع بنجاح — ${data.title || 'بدون عنوان'} (${data.score}/100)`);
      utils.sariBrain.getSources.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
    },
    onError: (error) => toast.error('فشل التحليل: ' + error.message),
  });

  const analyzeMutation = trpc.sariBrain.analyzeContent.useMutation({
    onSuccess: (data) => {
      setAnalysisResult(data.analysis);
      toast.success('تم تحليل المحتوى بنجاح');
      utils.sariBrain.getActivityLog.invalidate();
    },
    onError: (error) => toast.error('فشل التحليل: ' + error.message),
  });

  const testSariMutation = trpc.sariBrain.testSari.useMutation({
    onSuccess: (data) => {
      setTestResult({ question: data.question, answer: data.answer });
    },
    onError: (error) => toast.error('فشل الاختبار: ' + error.message),
  });

  const handleTest = () => {
    if (!testQuestion.trim()) {
      toast.error('اكتب سؤال أولاً');
      return;
    }
    testSariMutation.mutate({ question: testQuestion });
  };

  const createFaqMutation = trpc.sariBrain.createFaq.useMutation({
    onSuccess: () => {
      toast.success('تم إضافة السؤال');
      utils.sariBrain.getFaqs.invalidate();
      utils.sariBrain.getSources.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
      setNewFaqQ(''); setNewFaqA('');
    },
    onError: (e) => toast.error('فشل الإضافة: ' + e.message),
  });

  const deleteFaqMutation = trpc.sariBrain.deleteFaq.useMutation({
    onSuccess: () => {
      toast.success('تم حذف السؤال');
      utils.sariBrain.getFaqs.invalidate();
      utils.sariBrain.getSources.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
    },
    onError: (e) => toast.error('فشل الحذف: ' + e.message),
  });

  const handleAddFaq = () => {
    if (!newFaqQ.trim() || !newFaqA.trim()) {
      toast.error('اكتب السؤال والجواب');
      return;
    }
    createFaqMutation.mutate({ question: newFaqQ, answer: newFaqA });
  };

  const handleAnalyze = () => {
    if (!previewText.trim()) {
      toast.error('الصق محتوى الملف أولاً');
      return;
    }
    analyzeMutation.mutate({
      content: previewText,
      contentType: 'document',
      fileName: 'محتوى للفحص',
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'text/plain' || file.type === 'text/csv' || file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
      const text = await file.text();
      setPreviewText(text.substring(0, 30000));
      setAnalysisResult(null);
      toast.success(`تم تحميل "${file.name}" — اضغط "فحص المحتوى" للتحليل`);
    } else {
      toast.error('ادعم حالياً ملفات TXT/CSV فقط للفحص المسبق. للملفات الأخرى استخدم صفحة الإعدادات.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const totalSources = sources?.filter(s => s.hasContent && s.type !== 'settings').length || 0;

  // Integration awareness
  const { term } = useIntegration();

  return (
    <div className="space-y-6">
      {/* Integration Lock Banner */}
      <IntegrationLockBanner />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            عقل ساري
          </h1>
          <p className="text-muted-foreground mt-2">
            إدارة مصادر المعرفة التي يستخدمها ساري للرد على عملائك
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation('/merchant/settings')}>
            <Upload className="h-4 w-4 ml-2" />
            رفع ملف جديد
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={totalSources === 0}>
                <RotateCcw className="h-4 w-4 ml-2" />
                إعادة ضبط كاملة
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-right">⚠️ إعادة ضبط عقل ساري بالكامل</AlertDialogTitle>
                <AlertDialogDescription className="text-right">
                  سيتم حذف جميع مصادر المعرفة (الملفات، المنتجات، تحليل الموقع).
                  <br />
                  <strong className="text-destructive">هذا الإجراء لا يمكن التراجع عنه!</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={() => resetBrainMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {resetBrainMutation.isPending ? 'جاري الحذف...' : 'نعم، أعد الضبط'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">مصادر المعرفة</CardTitle>
            <Brain className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{totalSources}</div>
            <p className="text-xs text-muted-foreground mt-1">مصدر نشط يغذي ساري</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الملفات المرفقة</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{sources?.filter(s => s.type === 'document').length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">ملف تعريفي</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{term('products')}</CardTitle>
            <Package className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{sources?.find(s => s.type === 'products')?.contentLength || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{term('item')} في ذاكرة ساري</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => reanalyzeMutation.mutate()} disabled={reanalyzeMutation.isPending}>
          <Globe className="h-4 w-4 ml-2" />
          {reanalyzeMutation.isPending ? 'جاري التحليل...' : '🔄 إعادة تحليل الموقع'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setLocation('/merchant/products')}>
          <Package className="h-4 w-4 ml-2" />
          إدارة {term('products')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setLocation('/merchant/website-analysis')}>
          <Globe className="h-4 w-4 ml-2" />
          تحليل الموقع المتقدم
        </Button>
        <Button variant="outline" size="sm" onClick={() => setLocation('/merchant/settings')}>
          <Settings className="h-4 w-4 ml-2" />
          الإعدادات
        </Button>
      </div>

      {/* ═══ Test Sari — Ask a test question ═══ */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            🧪 اختبر ساري
          </CardTitle>
          <CardDescription>
            اسأل سؤال تجريبي وشاهد كيف يرد ساري بناءً على مصادر المعرفة الحالية
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Textarea
              value={testQuestion}
              onChange={(e) => setTestQuestion(e.target.value)}
              placeholder="اكتب سؤال مثل: كم سعر الدورة؟ وش الخدمات المتاحة؟ فين موقعكم؟"
              className="min-h-[60px] text-sm flex-1"
              dir="auto"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTest(); } }}
            />
            <Button onClick={handleTest} disabled={!testQuestion.trim() || testSariMutation.isPending} className="self-end">
              {testSariMutation.isPending ? '...' : '🤖 اسأل'}
            </Button>
          </div>

          {testResult && (
            <div className="space-y-3 mt-2">
              {/* Customer bubble */}
              <div className="flex justify-end">
                <div className="bg-primary text-primary-foreground px-4 py-2 rounded-2xl rounded-tr-sm max-w-[80%]">
                  <p className="text-sm">{testResult.question}</p>
                </div>
              </div>
              {/* Sari bubble */}
              <div className="flex justify-start">
                <div className="bg-muted px-4 py-2 rounded-2xl rounded-tl-sm max-w-[80%]">
                  <p className="text-sm whitespace-pre-wrap">{testResult.answer}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">🤖 رد ساري بناءً على المعرفة الحالية</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            {['كم الأسعار؟', 'وش الخدمات المتاحة؟', 'فين موقعكم؟', 'كيف أطلب؟'].map((q) => (
              <Button key={q} variant="outline" size="sm" className="text-xs h-7" onClick={() => { setTestQuestion(q); setTestResult(null); }}>
                {q}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Knowledge Sources */}
      <Card>
        <CardHeader>
          <CardTitle>📦 مصادر المعرفة</CardTitle>
          <CardDescription>كل مصدر يؤثر على ردود ساري — يمكنك حذف أي مصدر بشكل مستقل</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : sources && sources.length > 0 ? (
            <div className="space-y-3">
              {sources.map((source: any) => (
                <div key={source.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
                      {SOURCE_ICONS[source.type] || <FileText className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {source.name}
                        <Badge variant={source.status === 'active' || source.status === 'completed' ? 'default' : source.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px]">
                          {source.status === 'active' || source.status === 'completed' ? 'نشط' : source.status === 'failed' ? 'فشل' : source.status === 'pending' ? 'قيد المعالجة' : source.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {source.type === 'products' ? `${source.contentLength} ${term('item')}` : source.type === 'document' ? `${Math.round((source.contentLength || 0) / 1000)}K حرف` : ''}
                        {source.date && ` • ${new Date(source.date).toLocaleDateString('ar-SA')}`}
                      </p>
                    </div>
                  </div>
                  {source.deletable ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-right">حذف "{source.name}"</AlertDialogTitle>
                          <AlertDialogDescription className="text-right">
                            سيتم حذف هذا المصدر من ذاكرة ساري. لن يستطيع ساري الرد على أسئلة متعلقة بهذه البيانات بعد الحذف.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="flex-row-reverse gap-2">
                          <AlertDialogCancel>إلغاء</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteSourceMutation.mutate({ sourceId: source.id, sourceType: source.type })} className="bg-destructive text-destructive-foreground">
                            حذف
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Badge variant="outline" className="text-xs">أساسي</Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Brain className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-lg font-medium">لا توجد مصادر معرفة</p>
              <p className="text-sm text-muted-foreground mt-1">ارفع ملف تعريفي أو أضف منتجات ليتعلم ساري عن متجرك</p>
              <Button className="mt-4" onClick={() => setLocation('/merchant/settings')}>
                <Upload className="h-4 w-4 ml-2" />
                رفع ملف تعريفي
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ FAQ Management — Custom Q&A ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-orange-500" />
            ❓ الأسئلة الشائعة
          </CardTitle>
          <CardDescription>أضف أسئلة وأجوبة مخصصة ليستخدمها ساري مباشرة في الردود</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add New FAQ */}
          <div className="p-4 rounded-lg border border-dashed border-primary/30 space-y-3">
            <p className="text-sm font-medium flex items-center gap-1">
              <Plus className="h-4 w-4" /> إضافة سؤال جديد
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                value={newFaqQ}
                onChange={(e) => setNewFaqQ(e.target.value)}
                placeholder="السؤال (مثل: كم مدة التوصيل؟)"
                dir="auto"
              />
              <Input
                value={newFaqA}
                onChange={(e) => setNewFaqA(e.target.value)}
                placeholder="الجواب (مثل: يتم التوصيل خلال 2-3 أيام عمل)"
                dir="auto"
              />
            </div>
            <Button size="sm" onClick={handleAddFaq} disabled={!newFaqQ.trim() || !newFaqA.trim() || createFaqMutation.isPending}>
              <Plus className="h-4 w-4 ml-1" />
              {createFaqMutation.isPending ? 'جاري الإضافة...' : 'إضافة'}
            </Button>
          </div>

          {/* FAQ List */}
          {faqs && faqs.length > 0 ? (
            <div className="space-y-2">
              {faqs.map((faq: any) => (
                <div key={faq.id} className={`p-3 rounded-lg border ${faq.isActive ? 'bg-card' : 'bg-muted/50 opacity-60'} transition-colors`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        س: {faq.question}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        ج: {faq.answer}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {faq.category && <Badge variant="outline" className="text-[10px]">{faq.category}</Badge>}
                        <Badge variant={faq.useInBot ? 'default' : 'secondary'} className="text-[10px]">
                          {faq.useInBot ? '🤖 نشط في البوت' : '⏸️ متوقف'}
                        </Badge>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                      onClick={() => deleteFaqMutation.mutate({ id: faq.id })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <HelpCircle className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">لا توجد أسئلة شائعة بعد</p>
              <p className="text-xs mt-1">أضف أسئلة وأجوبة ليستخدمها ساري في الردود التلقائية</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Phase 2: Smart Intake — Content Preview & Analysis ═══ */}
      <Card className="border-2 border-dashed border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            🔬 الفحص الذكي — Smart Intake
          </CardTitle>
          <CardDescription>
            الصق محتوى ملف أو ارفع ملف نصي لفحصه بالذكاء الاصطناعي قبل إضافته لذاكرة ساري
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Input area */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".txt,.csv" className="hidden" />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 ml-2" />
                اختر ملف TXT/CSV
              </Button>
              <span className="text-xs text-muted-foreground self-center">أو الصق المحتوى مباشرة ↓</span>
            </div>
            <Textarea
              value={previewText}
              onChange={(e) => { setPreviewText(e.target.value); setAnalysisResult(null); }}
              placeholder="الصق هنا محتوى الملف الذي تريد فحصه... (أسعار، منتجات، سياسات، معلومات عامة)"
              className="min-h-[120px] text-sm"
              dir="auto"
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">{previewText.length.toLocaleString()} حرف</span>
              <Button onClick={handleAnalyze} disabled={!previewText.trim() || analyzeMutation.isPending}>
                <Search className="h-4 w-4 ml-2" />
                {analyzeMutation.isPending ? 'جاري الفحص...' : 'فحص المحتوى بالذكاء الاصطناعي'}
              </Button>
            </div>
          </div>

          {/* Analysis Result */}
          {analysisResult && (
            <div className="mt-4 space-y-4 border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  📊 تقرير الفحص الذكي
                </h3>
                <span className={`px-3 py-1 rounded-full text-sm font-medium border ${RISK_COLORS[analysisResult.riskLevel] || RISK_COLORS.medium}`}>
                  الخطورة: {RISK_LABELS[analysisResult.riskLevel] || analysisResult.riskLevel}
                </span>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-background border">
                  <p className="text-xs text-muted-foreground">النوع</p>
                  <p className="font-medium">{analysisResult.contentType}</p>
                </div>
                <div className="p-3 rounded-lg bg-background border">
                  <p className="text-xs text-muted-foreground">الملخص</p>
                  <p className="font-medium">{analysisResult.summary}</p>
                </div>
              </div>

              {/* Impact */}
              <div className="p-3 rounded-lg bg-background border">
                <p className="text-xs text-muted-foreground mb-1">📈 التأثير على ردود ساري</p>
                <p className="text-sm">{analysisResult.impact}</p>
              </div>

              {/* Conflicts */}
              {analysisResult.conflicts && analysisResult.conflicts.length > 0 && (
                <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
                  <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    ⚠️ تعارضات مكتشفة ({analysisResult.conflicts.length})
                  </p>
                  <ul className="space-y-1">
                    {analysisResult.conflicts.map((conflict: string, i: number) => (
                      <li key={i} className="text-sm text-yellow-700 dark:text-yellow-300 flex items-start gap-2">
                        <span className="mt-0.5">•</span> {conflict}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sample Q&A */}
              {analysisResult.sampleQA && analysisResult.sampleQA.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    💬 نماذج أسئلة وأجوبة بعد الإضافة
                  </p>
                  <div className="space-y-2">
                    {analysisResult.sampleQA.map((qa: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg bg-background border">
                        <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                          <span className="text-muted-foreground">العميل:</span> {qa.question}
                        </p>
                        <p className="text-sm mt-1 text-green-700 dark:text-green-400">
                          <span className="text-muted-foreground">ساري:</span> {qa.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendation + Actions */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-background border">
                <div>
                  <p className="text-xs text-muted-foreground">التوصية</p>
                  <p className="font-medium flex items-center gap-1">
                    {analysisResult.recommendation === 'approve' && <><CheckCircle2 className="h-4 w-4 text-green-500" /> موافقة</>}
                    {analysisResult.recommendation === 'review' && <><AlertTriangle className="h-4 w-4 text-yellow-500" /> مراجعة</>}
                    {analysisResult.recommendation === 'reject' && <><XCircle className="h-4 w-4 text-red-500" /> رفض</>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{analysisResult.recommendationReason}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setAnalysisResult(null); setPreviewText(''); }}>
                    <XCircle className="h-4 w-4 ml-1" /> تجاهل
                  </Button>
                  <Button size="sm" onClick={() => { setLocation('/merchant/settings'); toast.success('انتقل لصفحة الإعدادات لرفع الملف'); }}>
                    <CheckCircle2 className="h-4 w-4 ml-1" /> رفع الملف
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle>📋 مسار ساري</CardTitle>
          <CardDescription>سجل بكل التغييرات التي أثرت على ذاكرة ساري</CardDescription>
        </CardHeader>
        <CardContent>
          {activityLog && activityLog.length > 0 ? (
            <div className="relative">
              <div className="absolute right-5 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {activityLog.map((entry: any) => (
                  <div key={entry.id} className="flex items-start gap-4 relative">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted border-2 border-background z-10 text-lg">
                      {ACTION_ICONS[entry.actionType] || '📝'}
                    </div>
                    <div className="flex-1 pt-1.5">
                      <p className="text-sm font-medium">{entry.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(entry.createdAt).toLocaleDateString('ar-SA', {
                          year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p>لا توجد أنشطة مسجلة بعد</p>
              <p className="text-xs mt-1">ستظهر هنا كل التغييرات على مصادر معرفة ساري</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
