import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Brain, Trash2, RotateCcw, FileText, Package, Globe, Settings, Clock, Upload, Search, CheckCircle2, XCircle, AlertTriangle, MessageSquare, Sparkles, Shield, HelpCircle, Plus, Eye, EyeOff, BarChart3, ExternalLink, TrendingUp, Target, Zap, BookOpen, Link } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useIntegration, IntegrationLockBanner } from '@/hooks/useIntegration';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

  // Knowledge Engine v4 hooks
  const { data: healthScore } = trpc.sariBrain.getHealthScore.useQuery();
  const { data: knowledgeSections, isLoading: sectionsLoading } = trpc.sariBrain.getKnowledgeSections.useQuery();
  const { data: pendingReviews } = trpc.sariBrain.getPendingReviews.useQuery();

  // FAQ state
  const [newFaqQ, setNewFaqQ] = useState('');
  const [newFaqA, setNewFaqA] = useState('');

  // Smart Intake state
  const [previewText, setPreviewText] = useState('');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [testQuestion, setTestQuestion] = useState('');
  const [testResult, setTestResult] = useState<{ question: string; answer: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Knowledge v4 state
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionType, setNewSectionType] = useState('custom');
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionContent, setNewSectionContent] = useState('');

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
      utils.sariBrain.getWebsiteKnowledge.invalidate();
      utils.sariBrain.getKnowledgeSections.invalidate();
      utils.sariBrain.getHealthScore.invalidate();
    },
    onError: (error) => toast.error('فشل التحليل: ' + error.message),
  });

  // Knowledge v4 mutations
  const createSectionMut = trpc.sariBrain.createSection.useMutation({
    onSuccess: () => {
      toast.success('تم إضافة القسم بنجاح');
      setAddSectionOpen(false);
      setNewSectionTitle(''); setNewSectionContent('');
      utils.sariBrain.getKnowledgeSections.invalidate();
      utils.sariBrain.getHealthScore.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
    },
    onError: (e) => toast.error('فشل الإضافة: ' + e.message),
  });

  const deleteSectionMut = trpc.sariBrain.deleteSection.useMutation({
    onSuccess: () => {
      toast.success('تم حذف القسم');
      utils.sariBrain.getKnowledgeSections.invalidate();
      utils.sariBrain.getHealthScore.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
    },
    onError: (e) => toast.error('فشل الحذف: ' + e.message),
  });

  const approveSectionMut = trpc.sariBrain.approveSection.useMutation({
    onSuccess: () => {
      toast.success('تم حل التعارض');
      utils.sariBrain.getKnowledgeSections.invalidate();
      utils.sariBrain.getPendingReviews.invalidate();
      utils.sariBrain.getHealthScore.invalidate();
    },
    onError: (e) => toast.error('فشل: ' + e.message),
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

  // Website Knowledge Dashboard
  const { data: websiteKnowledge, isLoading: knowledgeLoading } = trpc.sariBrain.getWebsiteKnowledge.useQuery();
  const [customUrl, setCustomUrl] = useState('');
  const addUrlMutation = trpc.sariBrain.addCustomUrl.useMutation({
    onSuccess: (data) => {
      toast.success(`تم إضافة "${data.title}" — ${data.wordCount} كلمة`);
      setCustomUrl('');
      utils.sariBrain.getWebsiteKnowledge.invalidate();
      utils.sariBrain.getSources.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
    },
    onError: (e) => toast.error('فشل إضافة الصفحة: ' + e.message),
  });
  const togglePageMutation = trpc.sariBrain.togglePageInBot.useMutation({
    onSuccess: () => {
      utils.sariBrain.getWebsiteKnowledge.invalidate();
    },
    onError: (e) => toast.error('فشل التحديث: ' + e.message),
  });

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

      {/* ═══ Knowledge Engine v4: Health Score + Sections + Conflicts ═══ */}

      {/* Pending Conflicts Banner */}
      {pendingReviews && pendingReviews.length > 0 && (
        <Card className="border-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/20">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertTriangle className="h-8 w-8 text-yellow-500 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-yellow-800 dark:text-yellow-200">⚠️ {pendingReviews.length} تعارض يحتاج مراجعتك</p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-0.5">ساري وجد معلومات متعارضة — البوت يستخدم البيانات القديمة حتى تراجع</p>
            </div>
            <div className="flex gap-2">
              {pendingReviews.slice(0, 3).map((review: any) => (
                <div key={review.id} className="flex gap-1">
                  <Button size="sm" variant="outline" className="text-xs h-7 border-green-300 text-green-700 hover:bg-green-50" onClick={() => approveSectionMut.mutate({ sectionId: review.id, action: 'approve' })}>
                    ✅ قبول
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-7 border-red-300 text-red-700 hover:bg-red-50" onClick={() => approveSectionMut.mutate({ sectionId: review.id, action: 'reject' })}>
                    ❌ رفض
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Health Score Card */}
      {healthScore && (
        <Card className="border-primary/20 overflow-hidden">
          <CardHeader className="bg-gradient-to-l from-primary/10 via-primary/5 to-transparent pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
              🏥 صحة المعرفة
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex items-center gap-6">
              {/* Score Ring */}
              <div className="relative w-20 h-20 shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/20" />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" strokeWidth="3" strokeDasharray={`${healthScore.total}, 100`} className={healthScore.total >= 70 ? 'stroke-green-500' : healthScore.total >= 40 ? 'stroke-yellow-500' : 'stroke-red-500'} strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s ease-in-out' }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold">{healthScore.total}%</span>
                </div>
              </div>
              {/* Breakdown */}
              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2">
                {healthScore.breakdown.map((item: any) => (
                  <div key={item.label} className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${item.filled ? 'bg-green-50 dark:bg-green-950/20 border-green-200' : 'bg-muted/30 border-dashed'}`}>
                    <span className="text-base">{item.filled ? '✅' : '⬜'}</span>
                    <div>
                      <p className="font-medium">{item.label}</p>
                      {!item.filled && item.tip && <p className="text-[10px] text-muted-foreground">{item.tip}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Knowledge Sections Tree */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                🧠 أقسام المعرفة المصنفة
              </CardTitle>
              <CardDescription>أقسام مهيكلة بالذكاء الاصطناعي — يمكنك تعديلها أو إضافة أقسام يدوية</CardDescription>
            </div>
            <Dialog open={addSectionOpen} onOpenChange={setAddSectionOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 ml-1" />
                  إضافة قسم
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-right">إضافة قسم معرفة جديد</DialogTitle>
                  <DialogDescription className="text-right">أضف معلومات يدوية لساري (خدمات، سياسات، أسئلة شائعة...)</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>نوع القسم</Label>
                    <Select value={newSectionType} onValueChange={setNewSectionType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="identity">🏢 هوية النشاط</SelectItem>
                        <SelectItem value="services">🛍️ خدمات/منتجات</SelectItem>
                        <SelectItem value="policies">📋 سياسات</SelectItem>
                        <SelectItem value="faq">❓ أسئلة شائعة</SelectItem>
                        <SelectItem value="contact">📞 بيانات تواصل</SelectItem>
                        <SelectItem value="team">👥 فريق العمل</SelectItem>
                        <SelectItem value="achievements">🏆 إنجازات</SelectItem>
                        <SelectItem value="custom">📝 مخصص</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>العنوان</Label>
                    <Input value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)} placeholder="مثل: سياسة الشحن والتوصيل" dir="auto" />
                  </div>
                  <div className="space-y-2">
                    <Label>المحتوى</Label>
                    <Textarea value={newSectionContent} onChange={(e) => setNewSectionContent(e.target.value)} placeholder="اكتب المعلومات التي تريد أن يعرفها ساري..." className="min-h-[120px]" dir="auto" />
                  </div>
                </div>
                <DialogFooter className="flex-row-reverse gap-2">
                  <Button onClick={() => createSectionMut.mutate({ sectionType: newSectionType as any, title: newSectionTitle, content: newSectionContent })} disabled={!newSectionTitle.trim() || !newSectionContent.trim() || createSectionMut.isPending}>
                    {createSectionMut.isPending ? 'جاري الحفظ...' : '💾 حفظ'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {sectionsLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : knowledgeSections && knowledgeSections.length > 0 ? (
            <div className="space-y-2">
              {(() => {
                const SECTION_ICONS: Record<string, string> = {
                  identity: '🏢', services: '🛍️', policies: '📋', faq: '❓', contact: '📞',
                  team: '👥', achievements: '🏆', sales_intel: '💡', opportunities: '🎯', custom: '📝',
                };
                const SECTION_LABELS: Record<string, string> = {
                  identity: 'هوية', services: 'خدمات', policies: 'سياسات', faq: 'أسئلة', contact: 'تواصل',
                  team: 'فريق', achievements: 'إنجازات', sales_intel: 'ذكاء مبيعات', opportunities: 'فرص', custom: 'مخصص',
                };
                // Group by parent
                const roots = (knowledgeSections as any[]).filter((s: any) => !s.parent_id && !s.parentId);
                const children = (knowledgeSections as any[]).filter((s: any) => s.parent_id || s.parentId);
                return roots.map((section: any) => {
                  const sType = section.section_type || section.sectionType || 'custom';
                  const sChildren = children.filter((c: any) => (c.parent_id || c.parentId) === section.id);
                  const isBot = section.use_in_bot !== undefined ? section.use_in_bot : section.useInBot;
                  return (
                    <div key={section.id} className={`rounded-lg border overflow-hidden ${isBot ? 'bg-card' : 'bg-muted/50 opacity-70'}`}>
                      <div className="flex items-center gap-3 p-3">
                        <span className="text-xl">{SECTION_ICONS[sType] || '📄'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{section.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="outline" className="text-[10px] h-4">{SECTION_LABELS[sType] || sType}</Badge>
                            <Badge variant={section.source === 'manual' ? 'default' : 'secondary'} className="text-[10px] h-4">
                              {section.source === 'manual' ? '✋ يدوي' : section.source === 'website' ? '🌐 موقع' : section.source === 'document' ? '📄 ملف' : '🤖 AI'}
                            </Badge>
                            {sChildren.length > 0 && <Badge variant="outline" className="text-[10px] h-4">📁 {sChildren.length} فرعي</Badge>}
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground max-w-[200px] truncate hidden md:block">{(section.summary || section.content || '').substring(0, 80)}</p>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-right">حذف "{section.title}"</AlertDialogTitle>
                              <AlertDialogDescription className="text-right">سيتم حذف هذا القسم وجميع أقسامه الفرعية من ذاكرة ساري.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-row-reverse gap-2">
                              <AlertDialogCancel>إلغاء</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteSectionMut.mutate({ sectionId: section.id })} className="bg-destructive text-destructive-foreground">حذف</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                      {sChildren.length > 0 && (
                        <div className="border-t bg-muted/30 divide-y">
                          {sChildren.map((child: any) => (
                            <div key={child.id} className="flex items-center gap-3 px-3 py-2 pr-10">
                              <span className="text-muted-foreground">└</span>
                              <span className="text-sm">{SECTION_ICONS[child.section_type || child.sectionType || sType] || '📄'}</span>
                              <p className="text-xs font-medium flex-1 truncate">{child.title}</p>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={() => deleteSectionMut.mutate({ sectionId: child.id })}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <div className="text-center py-10">
              <Brain className="mx-auto h-12 w-12 text-muted-foreground/40" />
              <p className="mt-3 font-medium">لا توجد أقسام معرفة مصنفة بعد</p>
              <p className="text-xs text-muted-foreground mt-1">حلل موقعك أو ارفع ملفاً ليصنفه ساري تلقائياً، أو أضف أقسام يدوية</p>
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* ═══ Website Knowledge Dashboard ═══ */}
      {websiteKnowledge && (
        <Card className="border-primary/20 overflow-hidden">
          <CardHeader className="bg-gradient-to-l from-primary/10 via-primary/5 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  🌐 معرفة الموقع
                </CardTitle>
                <CardDescription className="mt-1">
                  {websiteKnowledge.analysis.title} — {websiteKnowledge.totalPages} صفحة مسحوبة
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                {/* Knowledge Score Ring */}
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/20" />
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" strokeWidth="3" strokeDasharray={`${websiteKnowledge.knowledgeScore}, 100`} className={websiteKnowledge.knowledgeScore >= 70 ? 'stroke-green-500' : websiteKnowledge.knowledgeScore >= 40 ? 'stroke-yellow-500' : 'stroke-red-500'} strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s ease-in-out' }} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-bold">{websiteKnowledge.knowledgeScore}%</span>
                  </div>
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground">تغطية المعرفة</p>
                  <p className={`text-sm font-semibold ${websiteKnowledge.knowledgeScore >= 70 ? 'text-green-600' : websiteKnowledge.knowledgeScore >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {websiteKnowledge.knowledgeScore >= 70 ? 'ممتاز' : websiteKnowledge.knowledgeScore >= 40 ? 'جيد' : 'يحتاج تحسين'}
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            {/* Content Categories */}
            {websiteKnowledge.categories.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  تصنيفات المحتوى المسحوب
                </h4>
                <div className="flex flex-wrap gap-2">
                  {websiteKnowledge.categories.map((cat: any) => (
                    <Badge key={cat.type} variant="secondary" className="text-xs px-3 py-1.5 gap-1.5">
                      <span>{cat.icon}</span>
                      {cat.label}
                      <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full text-[10px] font-bold">{cat.count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Crawled Pages Grid */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                الصفحات المسحوبة ({websiteKnowledge.totalPages})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {websiteKnowledge.pages.map((page: any) => {
                  const typeIcons: Record<string, string> = {
                    about: '🏢', contact: '📞', faq: '❓', shipping: '🚚',
                    returns: '🔄', privacy: '🔒', terms: '📋', content: '📄', other: '📑',
                  };
                  return (
                    <div key={page.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all hover:shadow-sm ${page.useInBot ? 'bg-card' : 'bg-muted/50 opacity-60'}`}>
                      <span className="text-lg shrink-0">{typeIcons[page.pageType] || '📄'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={page.title}>{page.title}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          ~{page.wordCount.toLocaleString()} كلمة
                          <span className="mx-1">•</span>
                          <a href={page.url} target="_blank" rel="noopener" className="text-primary hover:underline inline-flex items-center gap-0.5">
                            عرض <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </p>
                      </div>
                      <Button
                        variant="ghost" size="sm" className="shrink-0 h-7 w-7 p-0"
                        onClick={() => togglePageMutation.mutate({ pageId: page.id, useInBot: !page.useInBot })}
                        title={page.useInBot ? 'إيقاف استخدام هذه الصفحة في الردود' : 'تفعيل استخدام هذه الصفحة في الردود'}
                      >
                        {page.useInBot ? <Eye className="h-3.5 w-3.5 text-green-600" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Coverage Topics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {websiteKnowledge.coverageTopics.length > 0 && (
                <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                  <h4 className="text-sm font-semibold text-green-800 dark:text-green-300 mb-2 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    ساري يقدر يرد على
                  </h4>
                  <ul className="space-y-1">
                    {websiteKnowledge.coverageTopics.map((topic: string, i: number) => (
                      <li key={i} className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1.5">
                        <Zap className="h-3 w-3" /> {topic}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {websiteKnowledge.missingTopics.length > 0 && (
                <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
                  <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    يحتاج تحسين
                  </h4>
                  <ul className="space-y-1">
                    {websiteKnowledge.missingTopics.map((topic: string, i: number) => (
                      <li key={i} className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3" /> {topic}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-yellow-600 dark:text-yellow-500 mt-2">أضف صفحات تحتوي على هذه المعلومات لتحسين ردود ساري</p>
                </div>
              )}
            </div>

            {/* Add Custom URL */}
            <div className="p-4 rounded-lg border border-dashed border-primary/30 space-y-3">
              <p className="text-sm font-medium flex items-center gap-1">
                <Link className="h-4 w-4" /> إضافة صفحة مخصصة
              </p>
              <p className="text-xs text-muted-foreground">أضف رابط صفحة محددة من موقعك ليسحب ساري محتواها ويستخدمه في الردود</p>
              <div className="flex gap-2">
                <Input
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://example.com/services"
                  dir="ltr"
                  className="font-mono text-sm"
                />
                <Button
                  size="sm" className="shrink-0"
                  onClick={() => addUrlMutation.mutate({ url: customUrl })}
                  disabled={!customUrl.trim() || addUrlMutation.isPending}
                >
                  <Plus className="h-4 w-4 ml-1" />
                  {addUrlMutation.isPending ? 'جاري السحب...' : 'سحب'}
                </Button>
              </div>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold text-primary">{websiteKnowledge.totalPages}</p>
                <p className="text-[10px] text-muted-foreground">صفحة مسحوبة</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold text-blue-600">{(websiteKnowledge.analysis.wordCount || 0).toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">كلمة في المعرفة</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold text-green-600">{websiteKnowledge.faqCount}</p>
                <p className="text-[10px] text-muted-foreground">سؤال شائع</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold text-purple-600">{websiteKnowledge.analysis.overallScore}/100</p>
                <p className="text-[10px] text-muted-foreground">جودة الموقع</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
      {/* ═══ Quality Metrics Dashboard ═══ */}
      {(() => {
        const { data: qualityData } = trpc.sariBrain.getQualityDashboard.useQuery({ days: 30 });
        if (!qualityData || qualityData.totalResponses === 0) return null;
        const trendEmoji = qualityData.trend === 'improving' ? '📈' : qualityData.trend === 'declining' ? '📉' : '➡️';
        const trendLabel = qualityData.trend === 'improving' ? 'تحسن' : qualityData.trend === 'declining' ? 'تراجع' : 'مستقر';
        const trendColor = qualityData.trend === 'improving' ? 'text-green-600' : qualityData.trend === 'declining' ? 'text-red-600' : 'text-muted-foreground';
        const totalSentiment = qualityData.sentimentBreakdown.positive + qualityData.sentimentBreakdown.neutral + qualityData.sentimentBreakdown.negative;
        return (
          <Card className="border-primary/10">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    📊 مقاييس الجودة
                  </CardTitle>
                  <CardDescription>آخر 30 يوم — {qualityData.totalResponses} رد</CardDescription>
                </div>
                <div className={`flex items-center gap-1 text-sm font-semibold ${trendColor}`}>
                  <span>{trendEmoji}</span>
                  <span>{trendLabel}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-blue-600">{qualityData.avgResponseTimeMs < 1000 ? `${qualityData.avgResponseTimeMs}ms` : `${(qualityData.avgResponseTimeMs / 1000).toFixed(1)}s`}</p>
                  <p className="text-[10px] text-muted-foreground">⏱️ متوسط الرد</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-green-600">{qualityData.cacheHitRate}%</p>
                  <p className="text-[10px] text-muted-foreground">⚡ كاش</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className={`text-2xl font-bold ${qualityData.emptyResponseRate > 10 ? 'text-red-600' : 'text-green-600'}`}>{qualityData.emptyResponseRate}%</p>
                  <p className="text-[10px] text-muted-foreground">🚫 ردود فارغة</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className={`text-2xl font-bold ${qualityData.escalationRate > 20 ? 'text-orange-600' : 'text-green-600'}`}>{qualityData.escalationRate}%</p>
                  <p className="text-[10px] text-muted-foreground">🔄 تحويل للتاجر</p>
                </div>
              </div>

              {/* Sentiment Bar */}
              {totalSentiment > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium mb-2">😊 مزاج العملاء</p>
                  <div className="flex h-3 rounded-full overflow-hidden">
                    {qualityData.sentimentBreakdown.positive > 0 && (
                      <div className="bg-green-500 transition-all" style={{ width: `${(qualityData.sentimentBreakdown.positive / totalSentiment) * 100}%` }} title={`إيجابي: ${qualityData.sentimentBreakdown.positive}`} />
                    )}
                    {qualityData.sentimentBreakdown.neutral > 0 && (
                      <div className="bg-gray-300" style={{ width: `${(qualityData.sentimentBreakdown.neutral / totalSentiment) * 100}%` }} title={`محايد: ${qualityData.sentimentBreakdown.neutral}`} />
                    )}
                    {qualityData.sentimentBreakdown.negative > 0 && (
                      <div className="bg-red-400" style={{ width: `${(qualityData.sentimentBreakdown.negative / totalSentiment) * 100}%` }} title={`سلبي: ${qualityData.sentimentBreakdown.negative}`} />
                    )}
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                    <span>😊 {qualityData.sentimentBreakdown.positive}</span>
                    <span>😐 {qualityData.sentimentBreakdown.neutral}</span>
                    <span>😠 {qualityData.sentimentBreakdown.negative}</span>
                  </div>
                </div>
              )}

              {/* Top Questions */}
              {qualityData.topQuestions.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-2">🔥 أكثر الأسئلة تكراراً</p>
                  <div className="space-y-1">
                    {qualityData.topQuestions.slice(0, 5).map((q: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                        <span className="text-muted-foreground font-mono">{i + 1}.</span>
                        <span className="truncate">{q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

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
