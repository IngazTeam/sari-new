import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { LearningAnalysisStatus } from '../../../shared/learning-analysis-status';

export function LearningAnalysisStatusCard() {
  const {t,i18n}=useTranslation();
  const {data,isLoading,isError,isFetching,refetch}=trpc.sariBrain.getLearningAnalysisStatus.useQuery(undefined,{
    staleTime:15_000,refetchInterval:30_000,retry:false,
  });
  const states:Record<LearningAnalysisStatus['state'],[string,string]>={
    idle:[t('merchantUx.learningStatus.idle'),t('merchantUx.learningStatus.idleHint')],
    preparing:[t('merchantUx.learningStatus.preparing'),t('merchantUx.learningStatus.preparingHint')],
    budget_wait:[t('merchantUx.learningStatus.budgetWait'),t('merchantUx.learningStatus.budgetWaitHint')],
    awaiting_result:[t('merchantUx.learningStatus.awaitingResult'),t('merchantUx.learningStatus.awaitingResultHint')],
    uncertain:[t('merchantUx.learningStatus.uncertain'),t('merchantUx.learningStatus.uncertainHint')],
    saved:[t('merchantUx.learningStatus.saved'),t('merchantUx.learningStatus.savedHint')],
    recovering:[t('merchantUx.learningStatus.recovering'),t('merchantUx.learningStatus.recoveringHint')],
    retry_scheduled:[t('merchantUx.learningStatus.retryScheduled'),t('merchantUx.learningStatus.retryScheduledHint')],
    applied:[t('merchantUx.learningStatus.applied'),t('merchantUx.learningStatus.appliedHint')],
    stale:[t('merchantUx.learningStatus.stale'),t('merchantUx.learningStatus.staleHint')],
    invalid:[t('merchantUx.learningStatus.invalid'),t('merchantUx.learningStatus.invalidHint')],
  };
  const copy=data?states[data.state]:undefined;
  const date=(value:string|null)=>{
    if(!value||!Number.isFinite(Date.parse(value)))return null;
    return new Intl.DateTimeFormat(i18n.language.startsWith('ar')?'ar-SA':'en-GB',{
      year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short',
    }).format(new Date(value));
  };
  const next=date(data?.nextAttemptAt??null),updated=date(data?.updatedAt??null);
  return <Card data-learning-status-card className="min-w-0">
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
      <CardTitle className="text-lg">{t('merchantUx.learningStatus.title')}</CardTitle>
      <Button type="button" variant="outline" className="min-h-11" disabled={isFetching} onClick={()=>void refetch()} data-learning-status-refresh>
        {isFetching?t('merchantUx.learningStatus.refreshing'):t('merchantUx.learningStatus.refresh')}
      </Button>
    </CardHeader>
    <CardContent className="space-y-3 text-sm leading-relaxed" aria-busy={isFetching}>
      {isLoading&&<p role="status">{t('merchantUx.learningStatus.loading')}</p>}
      {isError&&<p role="alert">{t('merchantUx.learningStatus.loadFailed')}</p>}
      {!isLoading&&!isError&&copy&&<>
        <div role="status" aria-live="polite" data-learning-state={data!.state}>
          <p className="font-semibold">{copy[0]}</p><p className="mt-1 text-muted-foreground">{copy[1]}</p>
        </div>
        <dl className="grid gap-2 sm:grid-cols-2">
          {updated&&<div><dt className="text-muted-foreground">{t('merchantUx.learningStatus.updated')}</dt><dd><time dateTime={data!.updatedAt!}>{updated}</time></dd></div>}
          {next&&<div><dt className="text-muted-foreground">{t('merchantUx.learningStatus.nextAttempt')}</dt><dd><time dateTime={data!.nextAttemptAt!}>{next}</time></dd></div>}
          {data!.state==='applied'&&<div><dt className="text-muted-foreground">{t('merchantUx.learningStatus.proposals')}</dt><dd data-learning-proposal-count>{data!.proposalCount??0}</dd></div>}
        </dl>
      </>}
      <p className="text-xs text-muted-foreground">{t('merchantUx.learningStatus.scope')}</p>
    </CardContent>
  </Card>;
}
