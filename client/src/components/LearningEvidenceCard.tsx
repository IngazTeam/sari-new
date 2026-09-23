import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function LearningEvidenceCard({ showManageLink = true }: { showManageLink?: boolean } = {}) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = trpc.sariBrain.getLearningDashboard.useQuery(undefined, {
    staleTime: 60_000, retry: false,
  });
  const evidence = data?.learningEvidence;
  return <Card className="min-w-0">
    <CardHeader className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="text-lg">{t('merchantUx.learningEvidence.title')}</CardTitle>
        <Badge variant="secondary" className="whitespace-normal text-start">{t('merchantUx.learningEvidence.proposalsOnly')}</Badge>
      </div>
      <CardDescription>{t('merchantUx.learningEvidence.description')}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {isLoading && <p role="status" className="text-sm text-muted-foreground">{t('merchantUx.learningEvidence.loading')}</p>}
      {isError && <div role="alert" className="space-y-2">
        <p className="text-sm">{t('merchantUx.learningEvidence.loadFailed')}</p>
        <Button className="min-h-11" variant="outline" onClick={() => void refetch()}>{t('merchantUx.learningEvidence.retry')}</Button>
      </div>}
      {data && evidence && <>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {([
            [t('merchantUx.learningEvidence.conversations'), data.totalConversations], [t('merchantUx.learningEvidence.signals'), data.totalSignals],
            [t('merchantUx.learningEvidence.proposals'), evidence.proposalCount], [t('merchantUx.learningEvidence.verifiedPurchases'), evidence.verifiedPurchases],
            [t('merchantUx.learningEvidence.verifiedRefunds'), evidence.verifiedRefunds],
          ] as const).map(([label, value]) => <div key={label} className="rounded-lg border p-3 min-w-0">
            <dt className="text-xs leading-relaxed text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
          </div>)}
        </dl>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('merchantUx.learningEvidence.scope')}</p>
        <section aria-label={t('merchantUx.learningEvidence.pendingReview')} className="space-y-2">
          <h4 className="font-medium text-sm">{t('merchantUx.learningEvidence.pendingReview')}</h4>
          {!evidence.proposals.length && <p className="text-sm text-muted-foreground">{t('merchantUx.learningEvidence.empty')}</p>}
          {evidence.proposals.map(proposal => <details key={proposal.id} className="rounded-lg border p-3">
            <summary className="cursor-pointer min-h-11 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
              {t('merchantUx.learningEvidence.more')} #{proposal.id}
            </summary>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{proposal.insight}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t('merchantUx.learningEvidence.evidenceCount', { count: proposal.evidenceCount })}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('merchantUx.learningEvidence.modelHypothesis')}</p>
            <div className="mt-3 space-y-2" aria-label={t('merchantUx.learningEvidence.sources')}>
              {!proposal.evidence.length && <p className="text-xs text-muted-foreground">{t('merchantUx.learningEvidence.evidenceEmpty')}</p>}
              {proposal.evidence.map(item => <blockquote key={`${item.signalId}-${item.relation}`} className="border-s-2 ps-3 text-sm">
                <p className="text-xs text-muted-foreground">#{item.signalId} · {item.relation === 'supporting' ? t('merchantUx.learningEvidence.supporting')
                  : item.relation === 'contrary' ? t('merchantUx.learningEvidence.contrary') : t('merchantUx.learningEvidence.observed')}</p>
                <p className="whitespace-pre-wrap break-words leading-relaxed">{item.excerpt}</p>
              </blockquote>)}
            </div>
          </details>)}
        </section>
        {!!data.dnaInsights.length && <details className="rounded-lg border p-3">
          <summary className="cursor-pointer min-h-11 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">{t('merchantUx.learningEvidence.legacyActive')} ({data.dnaInsights.length})</summary>
          <p className="my-2 text-xs text-muted-foreground">{t('merchantUx.learningEvidence.legacyReview')}</p>
          <ul className="list-disc space-y-2 ps-5 text-sm leading-relaxed">
            {data.dnaInsights.map((insight, index) => <li key={`${insight.dimension}-${index}`} className="break-words whitespace-pre-wrap">{insight.insight}</li>)}
          </ul>
        </details>}
      </>}
      {showManageLink && <Link href="/merchant/sari-brain" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
        {t('merchantUx.learningEvidence.manageKnowledge')}
      </Link>}
    </CardContent>
  </Card>;
}
