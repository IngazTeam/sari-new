import { KnowledgeSourceGroupsWorkspace, type KnowledgeGroupDestination } from '@/components/KnowledgeSourceGroupsWorkspace';
import {KnowledgeActivityWorkspace} from '@/components/KnowledgeActivityWorkspace';
import { KnowledgeRemovalWorkspace } from '@/components/KnowledgeRemovalWorkspace';
import type { KnowledgeRemovalTarget } from '@shared/knowledge-source-removal';
import { SalesKnowledgeReadout } from "@/components/SalesKnowledgeReadout";
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
  const focusSourceElement = (id: string) => {
    changeBrainView('sources');
    requestAnimationFrame(() => { const element = document.getElementById(id); element?.scrollIntoView({block:'start'}); element?.querySelector<HTMLElement>('button,input')?.focus({preventScroll:true}); });
  };
  const focusUpload = () => focusSourceElement('brain-document-upload');
  const manageGroup = (destination: KnowledgeGroupDestination) => {
    if (destination === 'documents') focusSourceElement('brain-document-library');
    else if (destination === 'products') setLocation('/merchant/products');
    else if (destination === 'settings') setLocation('/merchant/settings');
    else { setKnowledgePane(destination === 'faqs' ? 'faq' : destination); changeBrainView('knowledge'); }
  };
  const utils = trpc.useUtils();
  const [knowledgePane, setKnowledgePane] = useState('sections');
  const [removalTarget,setRemovalTarget] = useState<KnowledgeRemovalTarget|null>(null);
  // Reanalyze progress modal
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [analysisStep, setAnalysisStep] = useState('');
  const [analysisResults, setAnalysisResults] = useState<unknown | null>(null);
  const [analysisError, setAnalysisError] = useState<WebsiteAnalysisIssue>(null);
  const [reportedProgress, setReportedProgress] = useState(0);
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
          <Button variant="outline" onClick={()=>setRemovalTarget({kind:'all'})}><RotateCcw className="h-4 w-4 me-2"/>{t('knowledgeRemovalUx.launchReset')}</Button>
        </div>
      </div>

      <KnowledgeRemovalWorkspace target={removalTarget} onClose={()=>setRemovalTarget(null)}/>

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
<SalesKnowledgeReadout active={brainView === 'sales'} onManage={() => { setKnowledgePane('sections'); changeBrainView('knowledge'); }} />

      </section>

      <section hidden={brainView !== 'knowledge' || knowledgePane !== 'sections'} className="space-y-6" data-brain-section="knowledge">
<KnowledgeSectionWorkspace />

      </section>

      <section hidden={brainView !== 'testing'} className="space-y-6" data-brain-section="testing">
<BrainQuickPreview />

      </section>

      <section hidden={brainView !== 'sources'} className="space-y-6" data-brain-section="sources">
<KnowledgeSourceGroupsWorkspace active={brainView==='sources'} onRemove={setRemovalTarget} onUpload={focusUpload} onManage={manageGroup} />

      <div id="brain-document-upload" className="scroll-mt-6"><KnowledgeDocumentUpload /></div>
      <div id="brain-document-library" className="scroll-mt-6"><KnowledgeLibrary /></div>

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
      <KnowledgeActivityWorkspace active={brainView==='history'}/>
      </section>
    </div>
  );
}
