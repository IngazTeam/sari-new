import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Brain, Trash2, RotateCcw, FileText, Package, Globe, Settings, Clock, Upload, Search, CheckCircle2, XCircle, AlertTriangle, MessageSquare, Sparkles, Shield, HelpCircle, Plus, Eye, EyeOff, BarChart3, ExternalLink, TrendingUp, Target, Zap, BookOpen, Link, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState, useRef, useEffect } from 'react';
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
  const { data: knowledgeSections, isLoading: sectionsLoading, error: sectionsError } = trpc.sariBrain.getKnowledgeSections.useQuery();
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

  // Reanalyze progress modal
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [fakeProgress, setFakeProgress] = useState(0);
  const [reassuranceIdx, setReassuranceIdx] = useState(0);

  // Fake progressive progress targets per step (never shows 0%)
  const STEP_PROGRESS = [8, 22, 41, 67, 85, 93, 100];
  // Cycling reassurance messages
  const REASSURANCE = [
    'ساري يبني فهمًا عميقًا لنشاطك...',
    'يتعرف على خدماتك ومنتجاتك...',
    'يحلل نقاط القوة في نشاطك...',
    'يجهّز ردود ذكية لعملائك...',
    'عادةً أقل من دقيقة...',
  ];
  // AI insight messages per step
  const STEP_INSIGHTS: string[][] = [
    ['🌐 جارٍ الاتصال بالموقع والتحقق من استجابته...'],
    ['📄 يقرأ المحتوى ويتعرف على طبيعة نشاطك...'],
    ['🔍 يبحث عن كل الصفحات الداخلية ويسحبها...'],
    ['🧠 يصنّف المعرفة ويبني خريطة ذهنية لنشاطك...'],
    ['💎 يحلل نقاط القوة ويجهّز عبارات بيعية...'],
    ['🎯 يبحث عن فرص تحسين تزيد مبيعاتك...'],
    ['✨ يحفظ كل شيء في قاعدة المعرفة...'],
  ];

  const ANALYSIS_STEPS = [
    { label: 'فهم الموقع', detail: 'جارٍ الاتصال واكتشاف نشاطك التجاري',
      svg: <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6"><circle cx="12" cy="12" r="10" stroke="url(#g1)" strokeWidth="2"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" stroke="url(#g1)" strokeWidth="2"/><defs><linearGradient id="g1" x1="0" y1="0" x2="24" y2="24"><stop stopColor="#6366f1"/><stop offset="1" stopColor="#06b6d4"/></linearGradient></defs></svg> },
    { label: 'تحليل المحتوى', detail: 'تحليل الخدمات والمنتجات والمعلومات الرئيسية',
      svg: <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="url(#g2)" strokeWidth="2" strokeLinejoin="round"/><path d="M14 2v6h6M8 13h8M8 17h5" stroke="url(#g2)" strokeWidth="2" strokeLinecap="round"/><defs><linearGradient id="g2" x1="4" y1="2" x2="20" y2="22"><stop stopColor="#818cf8"/><stop offset="1" stopColor="#c084fc"/></linearGradient></defs></svg> },
    { label: 'اكتشاف كل الصفحات', detail: 'سحب جميع صفحات الموقع وتجميع المعرفة',
      svg: <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6"><circle cx="11" cy="11" r="7" stroke="url(#g3)" strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke="url(#g3)" strokeWidth="2" strokeLinecap="round"/><path d="M11 8v6M8 11h6" stroke="url(#g3)" strokeWidth="1.5" strokeLinecap="round"/><defs><linearGradient id="g3" x1="4" y1="4" x2="21" y2="21"><stop stopColor="#06b6d4"/><stop offset="1" stopColor="#6366f1"/></linearGradient></defs></svg> },
    { label: 'بناء قاعدة المعرفة', detail: 'ساري يبني خريطة ذهنية لنشاطك بالذكاء الاصطناعي',
      svg: <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6"><rect x="3" y="3" width="18" height="18" rx="4" stroke="url(#g4)" strokeWidth="2"/><circle cx="9" cy="10" r="1.5" fill="url(#g4)"/><circle cx="15" cy="10" r="1.5" fill="url(#g4)"/><path d="M9 15c.83.83 2.17 1.5 3 1.5s2.17-.67 3-1.5" stroke="url(#g4)" strokeWidth="2" strokeLinecap="round"/><defs><linearGradient id="g4" x1="3" y1="3" x2="21" y2="21"><stop stopColor="#f472b6"/><stop offset="1" stopColor="#fb923c"/></linearGradient></defs></svg> },
    { label: 'ذكاء المبيعات', detail: 'استخراج نقاط القوة وتجهيز عبارات بيعية ذكية',
      svg: <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6"><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="url(#g5)" strokeWidth="2" strokeLinejoin="round"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="url(#g5)" strokeWidth="2" strokeLinejoin="round"/><defs><linearGradient id="g5" x1="2" y1="2" x2="22" y2="22"><stop stopColor="#14b8a6"/><stop offset="1" stopColor="#6366f1"/></linearGradient></defs></svg> },
    { label: 'فرص التطوير', detail: 'اكتشاف تحسينات تزيد مبيعاتك وتحويلاتك',
      svg: <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6"><path d="M12 3l2.5 5.5L20 9.5l-4 4 1 5.5L12 16.5 7 19l1-5.5-4-4 5.5-1L12 3z" stroke="url(#g6)" strokeWidth="2" strokeLinejoin="round"/><defs><linearGradient id="g6" x1="3" y1="3" x2="20" y2="19"><stop stopColor="#fb923c"/><stop offset="1" stopColor="#f472b6"/></linearGradient></defs></svg> },
    { label: 'حفظ وتجهيز ساري', detail: 'تحديث قاعدة المعرفة وتجهيز ردود ذكية للعملاء',
      svg: <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z" fill="url(#g7)" opacity="0.2"/><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z" stroke="url(#g7)" strokeWidth="2" strokeLinejoin="round"/><defs><linearGradient id="g7" x1="2" y1="2" x2="22" y2="22"><stop stopColor="#fbbf24"/><stop offset="1" stopColor="#f472b6"/></linearGradient></defs></svg> },
  ];


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
    onSuccess: () => {
      // Mutation returns immediately — start polling for results
      setPolling(true);
    },
    onError: (error) => {
      setAnalysisError(error.message);
    },
  });

  // Polling for async analysis status
  const [polling, setPolling] = useState(false);
  const statusQuery = trpc.sariBrain.getAnalysisStatus.useQuery(undefined, {
    enabled: polling,
    refetchInterval: polling ? 3000 : false, // Poll every 3s
  });

  // React to status changes
  useEffect(() => {
    if (!polling || !statusQuery.data) return;
    const data = statusQuery.data as any;

    if (data.status === 'completed') {
      setPolling(false);
      setAnalysisStep(ANALYSIS_STEPS.length);
      setFakeProgress(100);
      setAnalysisResults(data);
      utils.sariBrain.getSources.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
      utils.sariBrain.getWebsiteKnowledge.invalidate();
      utils.sariBrain.getKnowledgeSections.invalidate();
      utils.sariBrain.getHealthScore.invalidate();
    } else if (data.status === 'error') {
      setPolling(false);
      setAnalysisError(data.error || 'فشل التحليل');
    }
  }, [statusQuery.data, polling]);

  // Step progression animation (while polling)
  useEffect(() => {
    if (!polling) {
      if (!analysisResults && !analysisError) { setAnalysisStep(0); setFakeProgress(0); }
      return;
    }
    const stepTimer = setInterval(() => {
      setAnalysisStep(prev => prev < ANALYSIS_STEPS.length - 1 ? prev + 1 : prev);
    }, 5000);
    const progressTimer = setInterval(() => {
      setFakeProgress(prev => {
        const target = STEP_PROGRESS[Math.min(analysisStep, STEP_PROGRESS.length - 1)];
        if (prev >= target) return prev;
        return Math.min(prev + Math.random() * 3 + 1, target);
      });
    }, 400);
    const reassTimer = setInterval(() => {
      setReassuranceIdx(prev => (prev + 1) % REASSURANCE.length);
    }, 4000);
    return () => { clearInterval(stepTimer); clearInterval(progressTimer); clearInterval(reassTimer); };
  }, [polling, analysisStep]);

  const startAnalysis = () => {
    setAnalysisResults(null);
    setAnalysisError(null);
    setAnalysisStep(0);
    setFakeProgress(8); // Start at 8%, never 0%
    setReassuranceIdx(0);
    setAnalysisDialogOpen(true);
    reanalyzeMutation.mutate();
  };


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
  const deletePageMutation = trpc.sariBrain.deleteDiscoveredPage.useMutation({
    onSuccess: (data) => {
      toast.success(`تم حذف "${data.deletedTitle}" من ذاكرة ساري`);
      utils.sariBrain.getWebsiteKnowledge.invalidate();
      utils.sariBrain.getSources.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
      utils.sariBrain.getKnowledgeSections.invalidate();
      utils.sariBrain.getHealthScore.invalidate();
    },
    onError: (e) => toast.error('فشل الحذف: ' + e.message),
  });

  // ── Content preview state ──
  const [viewingPageId, setViewingPageId] = useState<number | null>(null);
  const { data: pageContentData, isLoading: pageContentLoading } = trpc.sariBrain.getPageContent.useQuery(
    { pageId: viewingPageId! },
    { enabled: viewingPageId !== null }
  );
  const [urlPreview, setUrlPreview] = useState<{ url: string; title: string; content: string; wordCount: number } | null>(null);
  const previewUrlMutation = trpc.sariBrain.previewUrl.useMutation({
    onSuccess: (data) => setUrlPreview(data),
    onError: (e) => toast.error('فشل سحب الصفحة: ' + e.message),
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
        {websiteKnowledge && websiteKnowledge.totalPages > 0 ? (
          /* ── Re-analysis: show warning dialog ── */
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={polling || reanalyzeMutation.isPending}>
                <RotateCcw className="h-4 w-4 ml-2" />
                🔄 إعادة تحليل الموقع
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-right">🔄 إعادة تحليل الموقع</AlertDialogTitle>
                <AlertDialogDescription className="text-right space-y-3" asChild>
                  <div>
                    <p>سيتم استبدال جميع البيانات المسحوبة الحالية ({websiteKnowledge.totalPages} صفحة) ببيانات جديدة من الموقع.</p>
                    <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-700 space-y-2 text-right">
                      <p className="font-semibold text-yellow-800 dark:text-yellow-200 flex items-center gap-2 justify-end">
                        <AlertTriangle className="h-4 w-4" />
                        تنبيهات مهمة
                      </p>
                      <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1.5 list-none">
                        <li>⚠️ البيانات الحالية ستُستبدل بالكامل</li>
                        <li>⏳ قد تتأثر ردود ساري على العملاء لمدة قصيرة أثناء التحديث</li>
                        <li>❓ هل يوجد بيانات جديدة بالموقع تستدعي إعادة التحليل؟</li>
                      </ul>
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={startAnalysis} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  نعم، أعد التحليل
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          /* ── First-time analysis: direct button ── */
          <Button variant="default" size="sm" onClick={startAnalysis} disabled={polling || reanalyzeMutation.isPending}>
            <Globe className="h-4 w-4 ml-2" />
            🌐 تحليل موقعك
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setLocation('/merchant/products')}>
          <Package className="h-4 w-4 ml-2" />
          إدارة {term('products')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setLocation('/merchant/settings')}>
          <Settings className="h-4 w-4 ml-2" />
          الإعدادات
        </Button>
      </div>

      {/* ═══ Analysis Progress Modal ═══ */}
      <Dialog open={analysisDialogOpen} onOpenChange={(open) => { if (analysisResults || analysisError) setAnalysisDialogOpen(open); }}>
        <DialogContent className="max-w-lg [&>button]:hidden max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => { if (!analysisResults && !analysisError) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (!analysisResults && !analysisError) e.preventDefault(); }}>
          <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
              @keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
              .insight-enter { animation: fadeInUp 0.5s ease-out; }`}</style>
          {/* Top animated bar */}
          {!analysisResults && !analysisError && (
            <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-lg bg-gradient-to-r from-primary via-emerald-500 to-primary bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite]" />
          )}
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-3 justify-end">
              {analysisResults ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6"><path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  ساري جاهز لخدمة عملائك!
                </>
              ) : analysisError ? (
                <>❌ حدث خطأ أثناء التحليل</>
              ) : (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  🧠 ساري يبني عقله...
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-right">
              {analysisResults ? `${analysisResults.title || ''} — تقييم ${analysisResults.score}/100` : analysisError ? analysisError : (
                <span key={reassuranceIdx} className="insight-enter inline-block">{REASSURANCE[reassuranceIdx]}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-2">
            {/* Expected results preview — shown only at start */}
            {!analysisResults && !analysisError && analysisStep < 2 && (
              <div className="p-3 rounded-lg bg-gradient-to-br from-primary/5 to-emerald-500/5 border border-primary/10 mb-3 insight-enter">
                <p className="text-xs font-medium text-muted-foreground mb-2">بعد التحليل سيقوم ساري بـ:</p>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-foreground/80">
                  <span>✓ بناء قاعدة معرفة ذكية</span>
                  <span>✓ فهم خدماتك ومنتجاتك</span>
                  <span>✓ تجهيز ردود ذكية للعملاء</span>
                  <span>✓ اكتشاف فرص زيادة المبيعات</span>
                </div>
              </div>
            )}

            {/* Step-by-step indicators */}
            {ANALYSIS_STEPS.map((step, i) => {
              const done = i < analysisStep || !!analysisResults;
              const active = i === analysisStep && !analysisResults && !analysisError;
              return (
                <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all duration-500 ${
                  done ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' :
                  active ? 'bg-primary/5 border-primary/30 shadow-sm' :
                  'bg-muted/20 border-transparent opacity-60'
                }`}>
                  <div className="relative w-9 h-9 shrink-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500 ${done ? 'bg-green-50 dark:bg-green-950/30' : active ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-muted/30'}`}>
                      {active ? (
                        <Loader2 className="h-5 w-5 text-primary animate-spin" />
                      ) : (
                        <>{step.svg}</>
                      )}
                    </div>
                    {done && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
                        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5"><path d="M10 3L4.5 8.5 2 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${
                      done ? 'text-green-700 dark:text-green-300' : active ? 'text-foreground' : 'text-muted-foreground'
                    }`}>{step.label}</p>
                    <p className="text-[10px] text-muted-foreground">{active ? STEP_INSIGHTS[i]?.[0] || step.detail : step.detail}</p>
                  </div>
                  {/* Show real stats next to completed steps */}
                  {done && analysisResults?.crawlStats && (
                    <span className="text-[10px] text-green-600 dark:text-green-400 font-mono whitespace-nowrap">
                      {i === 0 && '✅'}
                      {i === 1 && `${(analysisResults.crawlStats.mainPageWords || 0).toLocaleString()} كلمة`}
                      {i === 2 && `${analysisResults.crawlStats.pagesSuccess || 0}/${analysisResults.crawlStats.pagesDiscovered || 0} صفحة`}
                      {i === 3 && `${analysisResults.crawlStats.totalWords?.toLocaleString() || 0} كلمة`}
                      {i === 4 && (analysisResults.salesIntelSummary?.hasIntel ? '✅' : '—')}
                      {i === 5 && (analysisResults.salesIntelSummary?.hasOpportunities ? '✅' : '—')}
                      {i === 6 && `${analysisResults.salesIntelSummary?.totalSections || 0} قسم`}
                    </span>
                  )}
                  {done && !analysisResults?.crawlStats && <span className="text-xs text-green-600 font-medium">✅</span>}
                </div>
              );
            })}

            {/* Smooth progressive progress */}
            {!analysisResults && !analysisError && (
              <div className="mt-3">
                <div className="flex justify-end mb-1.5">
                  <span className="font-mono font-semibold text-primary text-xs">{Math.round(fakeProgress)}%</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary via-emerald-400 to-primary rounded-full transition-all duration-500 ease-out" style={{ width: `${fakeProgress}%` }} />
                </div>
              </div>
            )}

            {/* Results summary */}
            {analysisResults && (
              <div className="mt-3 p-4 rounded-lg bg-gradient-to-br from-primary/5 to-emerald-500/5 border border-primary/20 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-2 rounded-lg bg-background border">
                    <p className="text-2xl font-bold text-primary">{analysisResults.score}</p>
                    <p className="text-[10px] text-muted-foreground">التقييم التقني (SEO)</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-background border">
                    <p className="text-2xl font-bold text-emerald-600">{analysisResults.salesIntelSummary?.totalSections || 0}</p>
                    <p className="text-[10px] text-muted-foreground">قسم معرفة</p>
                  </div>
                </div>
                {analysisResults.knowledgeEvolution && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {analysisResults.knowledgeEvolution.added > 0 && <Badge className="bg-green-100 text-green-800 border-green-200">➕ {analysisResults.knowledgeEvolution.added} جديد</Badge>}
                    {analysisResults.knowledgeEvolution.evolved > 0 && <Badge className="bg-blue-100 text-blue-800 border-blue-200">↗️ {analysisResults.knowledgeEvolution.evolved} تطوير</Badge>}
                    {analysisResults.knowledgeEvolution.conflicts > 0 && <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">⚠️ {analysisResults.knowledgeEvolution.conflicts} تعارض</Badge>}
                  </div>
                )}
                {analysisResults.salesIntelSummary?.hasIntel && (
                  <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                    <Sparkles className="h-4 w-4" /> تم استخراج ذكاء المبيعات
                  </div>
                )}
                {analysisResults.salesIntelSummary?.hasOpportunities && (
                  <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                    <Target className="h-4 w-4" /> تم اكتشاف فرص تطوير
                  </div>
                )}
                {/* Knowledge Engine error — show if pipeline failed */}
                {analysisResults.knowledgeError && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-300 dark:border-yellow-700">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-200">⚠️ تصنيف المعرفة لم يكتمل</p>
                      <p className="text-[10px] text-yellow-700 dark:text-yellow-300 mt-0.5">{analysisResults.knowledgeError}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {analysisError && (
              <div className="mt-3 p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 text-center">
                <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                <p className="text-sm text-red-700 dark:text-red-300">{analysisError}</p>
              </div>
            )}
          </div>

          {/* Footer — only show close button when done */}
          {(analysisResults || analysisError) && (
            <DialogFooter className="flex-row-reverse">
              <Button onClick={() => { setAnalysisDialogOpen(false); setAnalysisResults(null); setAnalysisError(null); setFakeProgress(0); }}>
                {analysisResults ? '👍 ممتاز، إغلاق' : 'إغلاق'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

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

      {/* ═══ 💎 Sales Intelligence Card ═══ */}
      {(() => {
        const intelSection = (knowledgeSections as any[] || []).find((s: any) => (s.section_type || s.sectionType) === 'sales_intel');
        if (!intelSection) return null;
        const content = intelSection.content || '';
        const uspsMatch = content.match(/نقاط القوة[:\s]*\n([\s\S]*?)(?=\n(?:إرشادات|$))/i);
        const tipsMatch = content.match(/إرشادات البيع[:\s]*\n([\s\S]*?)$/i);
        const usps = (uspsMatch?.[1] || '').split('\n').filter((l: string) => l.trim().startsWith('•')).map((l: string) => l.replace('•', '').trim());
        const tips = (tipsMatch?.[1] || '').split('\n').filter((l: string) => l.trim().startsWith('•')).map((l: string) => l.replace('•', '').trim());
        return (
          <Card className="border-emerald-300 dark:border-emerald-700 overflow-hidden">
            <CardHeader className="bg-gradient-to-l from-emerald-500/10 via-emerald-500/5 to-transparent pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-emerald-500" />
                💎 ذكاء المبيعات
              </CardTitle>
              <CardDescription>يستخدمها ساري تلقائياً في المحادثات لإقناع العملاء</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {usps.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">⭐ نقاط القوة الفريدة (USPs)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {usps.map((usp: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                        <p className="text-sm">{usp}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {tips.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">🎯 إرشادات البيع للبوت</h4>
                  <div className="space-y-1.5">
                    {tips.map((tip: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                        <Zap className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                        <p className="text-sm">{tip}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {usps.length === 0 && tips.length === 0 && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content}</p>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* ═══ 🎯 Opportunities Card ═══ */}
      {(() => {
        const oppsSection = (knowledgeSections as any[] || []).find((s: any) => (s.section_type || s.sectionType) === 'opportunities');
        if (!oppsSection) return null;
        const opps = (oppsSection.content || '').split('\n').filter((l: string) => l.trim().startsWith('•')).map((l: string) => l.replace('•', '').trim());
        return (
          <Card className="border-amber-300 dark:border-amber-700 overflow-hidden">
            <CardHeader className="bg-gradient-to-l from-amber-500/10 via-amber-500/5 to-transparent pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-amber-500" />
                🎯 فرص التطوير
              </CardTitle>
              <CardDescription>اقتراحات لتحسين أداء المبيعات — لا تظهر للعميل</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-2">
                {opps.length > 0 ? opps.map((opp: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-sm">{opp}</p>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{oppsSection.content}</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

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
                  team: '👥', achievements: '🏆', custom: '📝',
                };
                const SECTION_LABELS: Record<string, string> = {
                  identity: 'هوية', services: 'خدمات', policies: 'سياسات', faq: 'أسئلة', contact: 'تواصل',
                  team: 'فريق', achievements: 'إنجازات', custom: 'مخصص',
                };
                // Filter out sales_intel/opportunities (shown in dedicated cards above)
                const HIDDEN_TYPES = ['sales_intel', 'opportunities'];
                const filtered = (knowledgeSections as any[]).filter((s: any) => !HIDDEN_TYPES.includes(s.section_type || s.sectionType || ''));
                // Group by parent
                const roots = filtered.filter((s: any) => !s.parent_id && !s.parentId);
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
          ) : sectionsError ? (
            <div className="text-center py-10 space-y-2">
              <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
              <p className="mt-3 font-medium text-red-600">خطأ في تحميل أقسام المعرفة</p>
              <p className="text-xs text-muted-foreground" dir="ltr">{sectionsError.message}</p>
              <Button variant="outline" size="sm" onClick={() => utils.sariBrain.getKnowledgeSections.invalidate()}>إعادة المحاولة</Button>
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
              <p className="text-sm text-muted-foreground mt-1">ارفع ملف تعريفي أو أضف منتجات ليتعلم ساري عن نشاطك التجاري</p>
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
                    services: '⚙️', products: '🛍️', courses: '🎓', portfolio: '💼',
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
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={() => setViewingPageId(page.id)}
                          title="عرض المحتوى المسحوب"
                        >
                          <Search className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={() => togglePageMutation.mutate({ pageId: page.id, useInBot: !page.useInBot })}
                          title={page.useInBot ? 'إيقاف استخدام هذه الصفحة في الردود' : 'تفعيل استخدام هذه الصفحة في الردود'}
                        >
                          {page.useInBot ? <Eye className="h-3.5 w-3.5 text-green-600" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50" title="حذف الصفحة من ذاكرة ساري">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-right">🗑️ حذف "{page.title}"</AlertDialogTitle>
                              <AlertDialogDescription className="text-right">
                                سيتم حذف هذه الصفحة من ذاكرة ساري بالكامل، بما في ذلك المحتوى والأسئلة الشائعة المرتبطة بها.
                                <br />
                                <strong className="text-destructive">لا يمكن التراجع عن هذا الإجراء.</strong>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-row-reverse gap-2">
                              <AlertDialogCancel>إلغاء</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deletePageMutation.mutate({ pageId: page.id })}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {deletePageMutation.isPending ? 'جاري الحذف...' : 'حذف نهائي'}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
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

            {/* Add Custom URL — Preview first, then confirm */}
            <div className="p-4 rounded-lg border border-dashed border-primary/30 space-y-3">
              <p className="text-sm font-medium flex items-center gap-1">
                <Link className="h-4 w-4" /> إضافة صفحة مخصصة
              </p>
              <p className="text-xs text-muted-foreground">أضف رابط صفحة محددة من موقعك — سيتم عرض المحتوى للمراجعة قبل الإضافة</p>
              <div className="flex gap-2">
                <Input
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://example.com/services"
                  dir="ltr"
                  className="font-mono text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter' && customUrl.trim()) previewUrlMutation.mutate({ url: customUrl }); }}
                />
                <Button
                  size="sm" className="shrink-0"
                  onClick={() => previewUrlMutation.mutate({ url: customUrl })}
                  disabled={!customUrl.trim() || previewUrlMutation.isPending}
                >
                  <Search className="h-4 w-4 ml-1" />
                  {previewUrlMutation.isPending ? 'جاري السحب...' : 'معاينة'}
                </Button>
              </div>
            </div>

            {/* ── URL Preview Dialog ── */}
            <Dialog open={!!urlPreview} onOpenChange={(open) => { if (!open) setUrlPreview(null); }}>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-right">📄 معاينة المحتوى المسحوب</DialogTitle>
                  <DialogDescription className="text-right">
                    راجع المحتوى قبل إضافته لذاكرة ساري
                  </DialogDescription>
                </DialogHeader>
                {urlPreview && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="font-semibold">{urlPreview.title}</p>
                        <a href={urlPreview.url} target="_blank" rel="noopener" className="text-xs text-primary hover:underline flex items-center gap-1" dir="ltr">
                          {urlPreview.url} <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <Badge variant="secondary">{urlPreview.wordCount.toLocaleString()} كلمة</Badge>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50 border max-h-[50vh] overflow-y-auto">
                      <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed" dir="auto">{urlPreview.content.substring(0, 5000)}{urlPreview.content.length > 5000 ? '\n\n... (تم اختصار المحتوى للمعاينة)' : ''}</pre>
                    </div>
                  </div>
                )}
                <DialogFooter className="flex-row-reverse gap-2">
                  <Button variant="outline" onClick={() => setUrlPreview(null)}>إلغاء</Button>
                  <Button
                    onClick={() => {
                      if (urlPreview) {
                        addUrlMutation.mutate({ url: urlPreview.url, title: urlPreview.title });
                        setUrlPreview(null);
                      }
                    }}
                    disabled={addUrlMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 ml-1" />
                    {addUrlMutation.isPending ? 'جاري الإضافة...' : 'موافق — أضف للمعرفة'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* ── Page Content Viewer Dialog ── */}
            <Dialog open={viewingPageId !== null} onOpenChange={(open) => { if (!open) setViewingPageId(null); }}>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-right">📖 محتوى الصفحة</DialogTitle>
                </DialogHeader>
                {pageContentLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="mr-2 text-sm text-muted-foreground">جاري تحميل المحتوى...</span>
                  </div>
                ) : pageContentData ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="font-semibold">{pageContentData.title}</p>
                        <a href={pageContentData.url} target="_blank" rel="noopener" className="text-xs text-primary hover:underline flex items-center gap-1" dir="ltr">
                          {pageContentData.url} <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{pageContentData.wordCount.toLocaleString()} كلمة</Badge>
                        <Badge variant={pageContentData.useInBot ? 'default' : 'outline'}>
                          {pageContentData.useInBot ? '✅ مفعّل' : '⏸️ متوقف'}
                        </Badge>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50 border max-h-[50vh] overflow-y-auto">
                      <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed" dir="auto">{pageContentData.content.substring(0, 8000)}{pageContentData.content.length > 8000 ? '\n\n... (تم اختصار المحتوى)' : ''}</pre>
                    </div>
                  </div>
                ) : null}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setViewingPageId(null)}>إغلاق</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

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
                <p className="text-[10px] text-muted-foreground">التقييم التقني (SEO)</p>
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
