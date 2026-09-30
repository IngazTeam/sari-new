import { BrainQuickPreview } from "@/components/BrainQuickPreview";
import { ReplyQualityReadout } from '@/components/ReplyQualityReadout';
import { WebsiteAnalysisDialog, type WebsiteAnalysisIssue } from '@/components/WebsiteAnalysisDialog';
import { KnowledgeWebsiteIntake } from '@/components/KnowledgeWebsiteIntake';
import { KnowledgeWebsiteWorkspace } from '@/components/KnowledgeWebsiteWorkspace';
import { KnowledgeSourceInventory } from '@/components/KnowledgeSourceInventory';
import {KnowledgeSectionWorkspace,KnowledgeSectionReadiness} from '@/components/KnowledgeSectionWorkspace';
import {KnowledgeConflictWorkspace} from '@/components/KnowledgeConflictWorkspace';
import { KnowledgeFaqWorkspace } from '@/components/KnowledgeFaqWorkspace';
import { KnowledgeIntake } from '@/components/KnowledgeIntake';
import { KnowledgeLibrary } from '@/components/KnowledgeLibrary';
import { KnowledgeDocumentUpload } from '@/components/KnowledgeDocumentUpload';
import { parseMerchantDate } from '@/lib/merchant-date';
import { QueryStateCard } from '@/components/QueryStateCard';
import { CheckoutMarginPolicySettings } from '@/components/CheckoutMarginPolicySettings';
import { DiscountPolicySettings } from '@/components/DiscountPolicySettings';
import { LearningAnalysisStatusCard } from '@/components/LearningAnalysisStatusCard';
import { LearningEvidenceCard } from '@/components/LearningEvidenceCard';
import { SalesSectorSettings } from '@/components/SalesSectorSettings';
import { SalesExperimentProtocol } from '@/components/SalesExperimentProtocol';
import { SalesReplyReview } from '@/components/SalesReplyReview';
import { FollowupPolicySettings } from '@/components/FollowupPolicySettings';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Brain, Trash2, RotateCcw, FileText, Package, Globe, Settings, Clock, Upload, Search, CheckCircle2, XCircle, AlertTriangle, AlertCircle, MessageSquare, Sparkles, Shield, HelpCircle, Plus, Eye, EyeOff, BarChart3, ExternalLink, TrendingUp, Target, Zap, BookOpen, Link, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useIntegration, IntegrationLockBanner } from '@/hooks/useIntegration';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';

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

export default function SariBrain() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const brainViews = [
    {id:'overview',label:t('brainWorkspaceUx.overview'),help:t('brainWorkspaceUx.overviewHelp')},
    {id:'sources',label:t('brainWorkspaceUx.sources'),help:t('brainWorkspaceUx.sourcesHelp')},
    {id:'knowledge',label:t('brainWorkspaceUx.knowledge'),help:t('brainWorkspaceUx.knowledgeHelp')},
    {id:'sales',label:t('brainWorkspaceUx.sales'),help:t('brainWorkspaceUx.salesHelp')},
    {id:'testing',label:t('brainWorkspaceUx.testing'),help:t('brainWorkspaceUx.testingHelp')},
    {id:'history',label:t('brainWorkspaceUx.history'),help:t('brainWorkspaceUx.historyHelp')},
  ];
  const [brainView,setBrainView] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('view');
    return brainViews.some(v=>v.id===requested) ? requested! : 'overview';
  });
  const changeBrainView = (next:string) => {
    setBrainView(next);
    const url = new URL(window.location.href); url.searchParams.set('view',next);
    window.history.replaceState(window.history.state,'',url);
  };
  const utils = trpc.useUtils();
  const [knowledgePane, setKnowledgePane] = useState('sections');
  const sourcesQuery = trpc.sariBrain.getSources.useQuery();
  const { data: sources, isLoading } = sourcesQuery;
  const [logPage, setLogPage] = useState(1);
  const [logFilter, setLogFilter] = useState<string>('all');
  const activityQuery = trpc.sariBrain.getActivityLog.useQuery({ page: logPage, pageSize: 10, actionType: logFilter === 'all' ? undefined : logFilter });
  const { data: activityLogData } = activityQuery;


  // Knowledge Engine v4 hooks
  const { data: knowledgeSections } = trpc.sariBrain.getKnowledgeSections.useQuery();

  // Reanalyze progress modal
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [analysisStep, setAnalysisStep] = useState('');
  const [analysisResults, setAnalysisResults] = useState<unknown | null>(null);
  const [analysisError, setAnalysisError] = useState<WebsiteAnalysisIssue>(null);
  const [reportedProgress, setReportedProgress] = useState(0);
  const deleteSourceMutation = trpc.sariBrain.deleteSource.useMutation({
    onSuccess: () => {
      toast.success('تم حذف المصدر بنجاح');
      void utils.knowledgeDocs.invalidate();
      utils.sariBrain.getSources.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
    },
    onError: (error: any) => toast.error('فشل الحذف: ' + error.message),
  });

  const resetBrainMutation = trpc.sariBrain.resetBrain.useMutation({
    onSuccess: (data: any) => {
      toast.success(`تم إعادة ضبط عقل ساري — حذف ${data.deletedSources.length} مصادر`);
      void utils.knowledgeDocs.invalidate();
      utils.sariBrain.getSources.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
    },
    onError: (error: any) => toast.error('فشل إعادة الضبط: ' + error.message),
  });

  const reanalyzeMutation = trpc.sariBrain.reanalyzeWebsite.useMutation({
    onSuccess: () => {
      // Mutation returns immediately — start polling for results
      setPolling(true);
    },
    onError: () => {
      setAnalysisError('startUnconfirmed');
    },
  });

  // Polling for async analysis status
  const [polling, setPolling] = useState(false);
  const requestedStatusAfter = useRef(0);
  const statusQuery = trpc.sariBrain.getAnalysisStatus.useQuery(undefined, {
    enabled: polling,
    retry: false,
    refetchInterval: query => polling && !query.state.error ? 3000 : false,
  });

  useEffect(() => {
    if (!polling || statusQuery.dataUpdatedAt < requestedStatusAfter.current || !statusQuery.isFetchedAfterMount || statusQuery.isFetching || statusQuery.isError || !statusQuery.data) return;
    const data = statusQuery.data as any;

    if (data.status === 'completed') {
      setPolling(false);
      setAnalysisStep('completed');
      setReportedProgress(100);
      setAnalysisResults(data);
      utils.sariBrain.getSources.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
      utils.sariBrain.getWebsiteKnowledge.invalidate();
      utils.sariBrain.pageWorkspace.invalidate();
      utils.sariBrain.getKnowledgeSections.invalidate();
      utils.sariBrain.getHealthScore.invalidate();
    } else if (data.status === 'error') {
      setPolling(false);
      setAnalysisError('failed');
    } else if (data.status === 'idle') {
      setPolling(false); setAnalysisError('missing');
    } else if (data.status === 'running') {
      // Real progress from server
      if (typeof data.currentStep === 'string') setAnalysisStep(data.currentStep);
      setReportedProgress(typeof data.progress === 'number' && Number.isFinite(data.progress) && data.progress >= 0 && data.progress <= 100 ? data.progress : 0);
    }
  }, [statusQuery.data, statusQuery.dataUpdatedAt, statusQuery.isFetchedAfterMount, statusQuery.isFetching, statusQuery.isError, polling]);

  const startAnalysis = () => {
    requestedStatusAfter.current = Date.now();
    setAnalysisResults(null);
    setAnalysisError(null);
    setAnalysisStep('');
    setReportedProgress(0);
    setAnalysisDialogOpen(true);
    reanalyzeMutation.mutate();
  };


  const totalSources = sourcesQuery.isError || isLoading ? '—' : sources?.filter((s: any) => s.hasContent && s.type !== 'settings').length || 0;

  // Integration awareness
  const { term } = useIntegration();

  // Website Knowledge Dashboard
  const websiteKnowledgeQuery = trpc.sariBrain.getWebsiteKnowledge.useQuery(undefined, {retry:false});
  const websiteKnowledge = websiteKnowledgeQuery.data;

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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { changeBrainView('sources'); requestAnimationFrame(() => { const upload = document.getElementById('brain-document-upload'); upload?.scrollIntoView({block:'start'}); upload?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true}); }); }}>
            <Upload className="h-4 w-4 ml-2" />
            {t('websiteAnalysisUx.upload')}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={sourcesQuery.isError || isLoading || totalSources === 0}>
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
                <AlertDialogAction disabled={sourcesQuery.isError || isLoading || resetBrainMutation.isPending} onClick={() => resetBrainMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {resetBrainMutation.isPending ? 'جاري الحذف...' : 'نعم، أعد الضبط'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats Cards */}
      {(polling || reanalyzeMutation.isPending || analysisResults !== null || analysisError) && !analysisDialogOpen && <Button variant="outline" onClick={()=>setAnalysisDialogOpen(true)}>{t('brainWorkspaceUx.showProgress')}</Button>}
      <nav className="mw-feature-nav" aria-label={t('brainWorkspaceUx.navigation')}>
        {brainViews.map(view=><Button key={view.id} type="button" variant={brainView===view.id?'secondary':'ghost'} aria-pressed={brainView===view.id} onClick={()=>changeBrainView(view.id)}>{view.label}</Button>)}
      </nav>
      <p className="text-sm text-muted-foreground" role="status">{brainViews.find(v=>v.id===brainView)?.help}</p>
      {brainView === 'knowledge' && <nav className="flex flex-wrap gap-2" aria-label={t('merchantUx.knowledgeSections.title')}>
        {[
          {id:'sections',label:t('merchantUx.knowledgeSections.title')},
          {id:'conflicts',label:t('merchantUx.knowledgeSections.conflictsTab')},
          {id:'faq',label:t('merchantUx.knowledgeSections.faq')},
          {id:'pages',label:t('merchantUx.knowledgePages.title')},
        ].map(pane=><Button key={pane.id} type="button" variant={knowledgePane===pane.id?'secondary':'ghost'} aria-pressed={knowledgePane===pane.id} onClick={()=>setKnowledgePane(pane.id)}>{pane.label}</Button>)}
      </nav>}
      <section hidden={brainView!=='overview'} className="space-y-6" data-brain-section="overview">
        <LearningAnalysisStatusCard />
        <LearningEvidenceCard showManageLink={false} />
      </section>
      <section hidden={brainView!=='sales'} className="space-y-5" data-brain-section="sales">
        <Card><CardContent className="space-y-3 p-5">
          <h2 className="font-semibold">{t('brainWorkspaceUx.proficiencyTitle')}</h2>
          <p className="text-3xl font-semibold">— <span className="text-sm font-normal text-muted-foreground">{t('brainWorkspaceUx.proficiencyUnavailable')}</span></p>
          <p className="text-sm text-muted-foreground">{t('brainWorkspaceUx.proficiencyHelp')}</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>changeBrainView('testing')}>{t('brainWorkspaceUx.openTesting')}</Button><Button variant="outline" onClick={()=>changeBrainView('knowledge')}>{t('brainWorkspaceUx.openKnowledge')}</Button></div>
        </CardContent></Card>
        <SalesSectorSettings />
        <details className="mw-feature-details"><summary>{t('brainWorkspaceUx.experiments')}</summary><SalesExperimentProtocol /></details>
        <details className="mw-feature-details"><summary>{t('brainWorkspaceUx.replyReview')}</summary><SalesReplyReview /></details>
        <details className="mw-feature-details"><summary>{t('brainWorkspaceUx.followup')}</summary><FollowupPolicySettings /></details>
        <details className="mw-feature-details"><summary>{t('brainWorkspaceUx.permissions')}</summary><div className="space-y-4"><DiscountPolicySettings /><CheckoutMarginPolicySettings /></div></details>
      </section>
      <section hidden={brainView !== 'overview'} className="space-y-6" data-brain-section="overview">
{brainView === 'overview' && <KnowledgeSourceInventory onOpen={kind => {
        if (kind === 'products') setLocation('/merchant/products');
        else if (kind === 'faqs') { setKnowledgePane('faq'); changeBrainView('knowledge'); }
        else if (kind === 'pages') { setKnowledgePane('pages'); changeBrainView('knowledge'); }
        else changeBrainView('sources');
      }} />}
      </section>

      <section hidden={brainView !== 'overview'} className="space-y-6" data-brain-section="overview">
{/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        {websiteKnowledgeQuery.isLoading ? <p role="status">{t('merchantUx.knowledgePages.loading')}</p> : websiteKnowledgeQuery.error ? <div role="alert" className="space-y-2"><p>{t('merchantUx.knowledgePages.loadFailed')}</p><Button variant="outline" onClick={()=>void websiteKnowledgeQuery.refetch()}>{t('merchantUx.knowledgePages.retry')}</Button></div> : websiteKnowledge && websiteKnowledge.totalPages > 0 ? (
          /* ── Re-analysis: show warning dialog ── */
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={polling || reanalyzeMutation.isPending}>
                <RotateCcw className="h-4 w-4 ml-2" />
                {t('websiteAnalysisUx.title')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-right">{t('websiteAnalysisUx.title')}</AlertDialogTitle>
                <AlertDialogDescription className="text-right space-y-3" asChild>
                  <div>
                    <p>{t('websiteAnalysisUx.confirmHelp', { count: websiteKnowledge.totalPages })}</p>
                    <p className="rounded-lg border bg-muted/40 p-3">{t('websiteAnalysisUx.confirmReview')}</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={startAnalysis} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {t('websiteAnalysisUx.start')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          /* ── First-time analysis: direct button ── */
          <Button variant="default" size="sm" onClick={startAnalysis} disabled={polling || reanalyzeMutation.isPending}>
            <Globe className="h-4 w-4 ml-2" />
            {t('websiteAnalysisUx.start')}
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

      </section>

      <WebsiteAnalysisDialog
        open={analysisDialogOpen} onOpenChange={setAnalysisDialogOpen}
        result={analysisResults} issue={analysisError} pending={reanalyzeMutation.isPending}
        currentStep={analysisStep} progress={reportedProgress}
        statusError={!reanalyzeMutation.isPending && statusQuery.isError} statusFetching={statusQuery.isFetching}
        onReadStatus={() => { requestedStatusAfter.current = Date.now(); setAnalysisError(null); setPolling(true); void statusQuery.refetch(); }}
        onOpenDestination={destination => {
          if (destination === 'settings') setLocation('/merchant/settings');
          else if (destination === 'testing') changeBrainView('testing');
          else { setKnowledgePane(destination); changeBrainView('knowledge'); }
        }}
      />

      <section hidden={brainView !== 'knowledge' || knowledgePane !== 'conflicts'} className="space-y-6" data-brain-section="knowledge">
{/* ═══ Knowledge Engine v4: Health Score + Sections + Conflicts ═══ */}

      <KnowledgeConflictWorkspace />

      </section>

      <section hidden={brainView !== 'overview'} className="space-y-6" data-brain-section="overview">
<KnowledgeSectionReadiness />

      </section>

      <section hidden={brainView !== 'sales'} className="space-y-6" data-brain-section="sales">
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
            <CardHeader className="bg-accent pb-3">
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
            <CardHeader className="bg-accent pb-3">
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

      </section>

      <section hidden={brainView !== 'knowledge' || knowledgePane !== 'sections'} className="space-y-6" data-brain-section="knowledge">
<KnowledgeSectionWorkspace />

      </section>

      <section hidden={brainView !== 'testing'} className="space-y-6" data-brain-section="testing">
<BrainQuickPreview />

      </section>

      <section hidden={brainView !== 'sources'} className="space-y-6" data-brain-section="sources">
{/* Knowledge Sources */}
      <Card>
        <CardHeader>
          <CardTitle>📦 مصادر المعرفة</CardTitle>
          <CardDescription>{t('merchantUx.knowledgeLibrary.sourcesDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {sourcesQuery.isError ? <QueryStateCard kind="error" title={t('merchantUx.knowledgeIntake.sourcesError')} retryLabel={t('merchantUx.knowledgeIntake.retry')} onRetry={() => { void sourcesQuery.refetch(); }} /> : isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : sources && sources.length > 0 ? (
            <div className="space-y-3">
              {sources.map((source: any) => (
                <div key={source.id} className="flex min-w-0 items-center justify-between gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex shrink-0 items-center justify-center w-10 h-10 rounded-lg bg-muted">
                      {SOURCE_ICONS[source.type] || <FileText className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium flex flex-wrap items-center gap-2 break-words [overflow-wrap:anywhere]">
                        {source.type === 'document' ? t('merchantUx.knowledgeLibrary.group') : source.name}
                        <Badge variant={source.status === 'active' || source.status === 'completed' ? 'default' : source.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px]">
                          {source.type === 'settings' ? t('merchantUx.knowledgeSources.configured') : t('merchantUx.knowledgeSources.stored')}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {source.type === 'products' ? `${source.contentLength} ${term('item')}` : source.type === 'document' ? t('merchantUx.knowledgeLibrary.groupCount', { count: source.documentCount }) : ''}
                        {source.date && ` • ${parseMerchantDate(source.date).toLocaleDateString('ar-SA')}`}
                      </p>
                    </div>
                  </div>
                  {source.deletable ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          disabled={deleteSourceMutation.isPending}
                          aria-label={source.type === 'document' ? t('merchantUx.knowledgeLibrary.deleteGroup') : t('merchantUx.actions.deleteNamed', { name: source.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-right">{source.type === 'document' ? t('merchantUx.knowledgeLibrary.deleteGroup') : `حذف "${source.name}"`}</AlertDialogTitle>
                          <AlertDialogDescription className="text-right">
                            {source.type === 'document' ? t('merchantUx.knowledgeLibrary.deleteGroupHint') : t('merchantUx.knowledgeLibrary.deleteSourceHint')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="flex-row-reverse gap-2">
                          <AlertDialogCancel>إلغاء</AlertDialogCancel>
                          <AlertDialogAction disabled={deleteSourceMutation.isPending} onClick={() => deleteSourceMutation.mutate({ sourceId: source.id, sourceType: source.type })} className="bg-destructive text-destructive-foreground">
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

      <div id="brain-document-upload" className="scroll-mt-6"><KnowledgeDocumentUpload /></div>
      <KnowledgeLibrary />

      </section>
      <section hidden={brainView !== 'knowledge' || knowledgePane !== 'pages'} className="space-y-6" data-brain-section="knowledge">
      <KnowledgeWebsiteWorkspace />
      <KnowledgeWebsiteIntake />

      </section>

      <section hidden={brainView !== 'knowledge' || knowledgePane !== 'faq'} className="space-y-6" data-brain-section="knowledge">
<KnowledgeFaqWorkspace />

      </section>

      <section hidden={brainView !== 'sources'} className="space-y-6" data-brain-section="sources">
<KnowledgeIntake />
      </section>

      <section hidden={brainView !== 'testing'} className="space-y-6" data-brain-section="testing">
        <ReplyQualityReadout />

      </section>

      <section hidden={brainView !== 'history'} className="space-y-6" data-brain-section="history">
      {/* Activity Log — with filter + pagination */}
      {(() => {
        if (activityQuery.isError) return <QueryStateCard kind="error" title={t('merchantUx.knowledgeIntake.activityError')} retryLabel={t('merchantUx.knowledgeIntake.retry')} onRetry={() => { void activityQuery.refetch(); }} />;
        if (activityQuery.isLoading) return <p role="status">{t('common.loading')}</p>;
        const logItems = activityLogData?.items || [];
        const logTotal = activityLogData?.total || 0;
        const logTotalPages = activityLogData?.totalPages || 0;
        const FILTER_OPTIONS = [
          { value: 'all', label: 'الكل', icon: '📋' },
          { value: 'knowledge_ingested', label: 'اعتماد', icon: '✅' },
          { value: 'content_analyzed', label: 'فحص', icon: '🔬' },
          { value: 'file_uploaded', label: 'رفع', icon: '📁' },
          { value: 'website_analyzed', label: 'موقع', icon: '🌐' },
          { value: 'document_deleted', label: 'حذف', icon: '🗑️' },
        ];

        return (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  📋 مسار ساري
                </CardTitle>
                <CardDescription className="mt-1">
                  {logTotal > 0 ? `${logTotal} سجل` : 'سجل بكل التغييرات التي أثرت على ذاكرة ساري'}
                </CardDescription>
              </div>
              {logTotal > 0 && (
                <Badge variant="secondary" className="text-xs">
                  صفحة {logPage} من {logTotalPages}
                </Badge>
              )}
            </div>
            {/* Filter Tabs */}
            {logTotal > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t">
                {FILTER_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setLogFilter(opt.value); setLogPage(1); }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      logFilter === opt.value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span>{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {logItems.length > 0 ? (
              <div className="space-y-0">
                {logItems.map((entry: any) => {
                  const isIngested = entry.actionType === 'knowledge_ingested';
                  const isAnalyzed = entry.actionType === 'content_analyzed';
                  const isDeleted = entry.actionType?.includes('delete') || entry.description?.includes('حذف');
                  const isWebsite = entry.actionType?.includes('website') || entry.actionType?.includes('scrape');

                  return (
                  <div key={entry.id} className={`flex items-start gap-3 p-3 rounded-lg transition-colors hover:bg-muted/50 border-b border-border/50 last:border-0 ${isIngested ? 'bg-green-50/50 dark:bg-green-950/10' : ''}`}>
                    <div className={`flex items-center justify-center w-9 h-9 rounded-full border-2 border-background text-base shrink-0 ${
                      isIngested ? 'bg-green-100 dark:bg-green-900/30' :
                      isDeleted ? 'bg-red-100 dark:bg-red-900/30' :
                      isWebsite ? 'bg-blue-100 dark:bg-blue-900/30' :
                      'bg-muted'
                    }`}>
                      {ACTION_ICONS[entry.actionType] || '📝'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{entry.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          isIngested ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' :
                          isDeleted ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                          isAnalyzed ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                          isWebsite ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                          'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          {isIngested ? 'اعتماد' : isDeleted ? 'حذف' : isAnalyzed ? 'فحص' : isWebsite ? 'موقع' : 'تحديث'}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {parseMerchantDate(entry.createdAt).toLocaleDateString('ar-SA', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })} — {parseMerchantDate(entry.createdAt).toLocaleTimeString('ar-SA', {
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  );
                })}

                {/* Pagination Controls */}
                {logTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-1 pt-4 mt-2 border-t">
                    <button
                      onClick={() => setLogPage(p => Math.max(1, p - 1))}
                      disabled={logPage <= 1}
                      className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted"
                    >
                      ← السابق
                    </button>
                    {Array.from({ length: Math.min(logTotalPages, 7) }, (_, i) => {
                      let pageNum: number;
                      if (logTotalPages <= 7) {
                        pageNum = i + 1;
                      } else if (logPage <= 4) {
                        pageNum = i + 1;
                      } else if (logPage >= logTotalPages - 3) {
                        pageNum = logTotalPages - 6 + i;
                      } else {
                        pageNum = logPage - 3 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setLogPage(pageNum)}
                          className={`w-8 h-8 rounded-md text-xs font-medium transition-all ${
                            logPage === pageNum
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'hover:bg-muted text-muted-foreground'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setLogPage(p => Math.min(logTotalPages, p + 1))}
                      disabled={logPage >= logTotalPages}
                      className="px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-muted"
                    >
                      التالي →
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="mx-auto h-8 w-8 mb-2 opacity-50" />
                {logFilter !== 'all' ? (
                  <>
                    <p>لا توجد أنشطة من نوع "{FILTER_OPTIONS.find(o => o.value === logFilter)?.label}"</p>
                    <button onClick={() => { setLogFilter('all'); setLogPage(1); }} className="text-xs text-primary hover:underline mt-2">
                      عرض كل الأنشطة
                    </button>
                  </>
                ) : (
                  <>
                    <p>لا توجد أنشطة مسجلة بعد</p>
                    <p className="text-xs mt-1">ستظهر هنا كل التغييرات على مصادر معرفة ساري</p>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        );
      })()}
      </section>
    </div>
  );
}
