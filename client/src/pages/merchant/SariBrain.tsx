import { useBrainNavigation, type KnowledgePane } from '@/lib/brain-navigation';
import { KnowledgeSourceGroupsWorkspace, type KnowledgeGroupDestination } from '@/components/KnowledgeSourceGroupsWorkspace';
import {KnowledgeActivityWorkspace} from '@/components/KnowledgeActivityWorkspace';
import { KnowledgeRemovalWorkspace } from '@/components/KnowledgeRemovalWorkspace';
import type { KnowledgeRemovalTarget } from '@shared/knowledge-source-removal';
import { SalesKnowledgeReadout } from "@/components/SalesKnowledgeReadout";
import { BrainQuickPreview } from "@/components/BrainQuickPreview";
import { ReplyQualityReadout } from '@/components/ReplyQualityReadout';
import { WebsiteAnalysisDialog } from '@/components/WebsiteAnalysisDialog';
import { KnowledgeWorkspaceScope } from '@/components/KnowledgeWorkspaceScope';
import { useWebsiteAnalysis } from '@/lib/use-website-analysis';
import { KnowledgeWebsiteIntake } from '@/components/KnowledgeWebsiteIntake';
import { KnowledgeWebsiteWorkspace } from '@/components/KnowledgeWebsiteWorkspace';
import { KnowledgeSourceInventory } from '@/components/KnowledgeSourceInventory';
import {KnowledgeSectionWorkspace,KnowledgeSectionReadiness} from '@/components/KnowledgeSectionWorkspace';
import {KnowledgeConflictWorkspace} from '@/components/KnowledgeConflictWorkspace';
import { KnowledgeFaqWorkspace } from '@/components/KnowledgeFaqWorkspace';
import { KnowledgeIntake } from '@/components/KnowledgeIntake';
import { KnowledgeLibrary } from '@/components/KnowledgeLibrary';
import { KnowledgeDocumentUpload } from '@/components/KnowledgeDocumentUpload';
import { CheckoutMarginPolicySettings } from '@/components/CheckoutMarginPolicySettings';
import { DiscountPolicySettings } from '@/components/DiscountPolicySettings';
import { LearningAnalysisStatusCard } from '@/components/LearningAnalysisStatusCard';
import { LearningEvidenceCard } from '@/components/LearningEvidenceCard';
import { SalesSectorSettings } from '@/components/SalesSectorSettings';
import { SalesExperimentProtocol } from '@/components/SalesExperimentProtocol';
import { SalesReplyReview } from '@/components/SalesReplyReview';
import { FollowupPolicySettings } from '@/components/FollowupPolicySettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Brain, RotateCcw, Package, Globe, Settings, Upload } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { IntegrationLockBanner } from '@/hooks/useIntegration';
import { useTranslation } from 'react-i18next';


export default function SariBrain() {
  return <KnowledgeWorkspaceScope slot="brain-page">{scopeKey => <SariBrainWorkspace key={scopeKey} scopeKey={scopeKey} />}</KnowledgeWorkspaceScope>;
}

function SariBrainWorkspace({scopeKey}: {scopeKey: string}) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const brainViews = [
    {id:'overview',label:t('brainWorkspaceUx.overview'),help:t('brainWorkspaceUx.overviewHelp')},
    {id:'sources',label:t('brainWorkspaceUx.sources'),help:t('brainWorkspaceUx.sourcesHelp')},
    {id:'knowledge',label:t('brainWorkspaceUx.knowledge'),help:t('brainWorkspaceUx.knowledgeHelp')},
    {id:'sales',label:t('brainWorkspaceUx.sales'),help:t('brainWorkspaceUx.salesHelp')},
    {id:'testing',label:t('brainWorkspaceUx.testing'),help:t('brainWorkspaceUx.testingHelp')},
    {id:'history',label:t('brainWorkspaceUx.history'),help:t('brainWorkspaceUx.historyHelp')},
  ] as const;
  const { brainView, knowledgePane, changeBrainView, setKnowledgePane } = useBrainNavigation();
  const openKnowledgePane = (pane: KnowledgePane) => {
    changeBrainView('knowledge', pane);
    requestAnimationFrame(() => {
      const panel = document.querySelector<HTMLElement>('[data-brain-section="knowledge"]:not([hidden])');
      panel?.scrollIntoView({block:'start'});
      panel?.querySelector<HTMLElement>('input,button')?.focus({preventScroll:true});
    });
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
    else openKnowledgePane(destination === 'faqs' ? 'faq' : destination);
  };
  const [removalTarget,setRemovalTarget] = useState<KnowledgeRemovalTarget|null>(null);
  const analysis = useWebsiteAnalysis(scopeKey, brainView === 'overview');
  const websiteKnowledge = analysis.websiteData;

  return (
    <div className="space-y-6">
      {/* Integration Lock Banner */}
      <IntegrationLockBanner />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            {t('brainWorkspaceUx.title')}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t('brainWorkspaceUx.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={focusUpload}>
            <Upload className="h-4 w-4 me-2" />
            {t('websiteAnalysisUx.upload')}
          </Button>
          <Button variant="outline" onClick={()=>setRemovalTarget({kind:'all'})}><RotateCcw className="h-4 w-4 me-2"/>{t('knowledgeRemovalUx.launchReset')}</Button>
        </div>
      </div>

      <KnowledgeRemovalWorkspace target={removalTarget} onClose={()=>setRemovalTarget(null)}/>

      {/* Stats Cards */}
      {analysis.hasAttempt && !analysis.dialogOpen && <Button variant="outline" onClick={()=>analysis.setDialogOpen(true)}>{t('brainWorkspaceUx.showProgress')}</Button>}
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
        ].map(pane=><Button key={pane.id} type="button" variant={knowledgePane===pane.id?'secondary':'ghost'} aria-pressed={knowledgePane===pane.id} onClick={()=>setKnowledgePane(pane.id as KnowledgePane)}>{pane.label}</Button>)}
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
        else if (kind === 'faqs') openKnowledgePane('faq');
        else if (kind === 'pages') openKnowledgePane('pages');
        else changeBrainView('sources');
      }} />}
      </section>

      <section hidden={brainView !== 'overview'} className="space-y-6" data-brain-section="overview">
{/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        {analysis.websiteError ? <div role="alert" className="space-y-2"><p>{t('merchantUx.knowledgePages.loadFailed')}</p><Button variant="outline" onClick={analysis.refreshWebsite}>{t('merchantUx.knowledgePages.retry')}</Button></div> : analysis.websiteLoading ? <p role="status">{t('merchantUx.knowledgePages.loading')}</p> : websiteKnowledge && websiteKnowledge.totalPages > 0 ? (
          /* ── Re-analysis: show warning dialog ── */
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={analysis.busy || !websiteKnowledge.canManage}>
                <RotateCcw className="h-4 w-4 me-2" />
                {t('websiteAnalysisUx.title')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-start">{t('websiteAnalysisUx.title')}</AlertDialogTitle>
                <AlertDialogDescription className="text-start space-y-3" asChild>
                  <div>
                    <p>{t('websiteAnalysisUx.confirmHelp', { count: websiteKnowledge.totalPages })}</p>
                    <p className="rounded-lg border bg-muted/40 p-3">{t('websiteAnalysisUx.confirmReview')}</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogCancel>{t('brainWorkspaceUx.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => void analysis.start()} disabled={analysis.busy || !websiteKnowledge.canManage} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {t('websiteAnalysisUx.start')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          /* ── First-time analysis: direct button ── */
          <Button variant="default" size="sm" onClick={() => void analysis.start()} disabled={analysis.busy || !websiteKnowledge?.canManage}>
            <Globe className="h-4 w-4 me-2" />
            {t('websiteAnalysisUx.start')}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setLocation('/merchant/products')}>
          <Package className="h-4 w-4 me-2" />
          {t('knowledgeGroupsUx.openProducts')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setLocation('/merchant/settings')}>
          <Settings className="h-4 w-4 me-2" />
          {t('knowledgeGroupsUx.openSettings')}
        </Button>
      </div>

      </section>

      <WebsiteAnalysisDialog
        open={analysis.dialogOpen} onOpenChange={analysis.setDialogOpen}
        result={analysis.result} issue={analysis.issue} pending={analysis.pending}
        currentStep={analysis.step} progress={analysis.progress}
        statusError={!analysis.pending && analysis.statusError} statusFetching={analysis.statusFetching}
        onReadStatus={analysis.readStatus}
        onOpenDestination={destination => {
          if (destination === 'settings') setLocation('/merchant/settings');
          else if (destination === 'testing') changeBrainView('testing');
          else openKnowledgePane(destination);
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
<SalesKnowledgeReadout active={brainView === 'sales'} onManage={() => openKnowledgePane('sections')} />

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
