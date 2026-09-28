import { useTranslation } from 'react-i18next';
import type { KnowledgeAnalysis } from '@shared/knowledge-intake';

/** Shared read-only report, used before consent and again from the saved receipt. */
export function KnowledgeAnalysisReport({ analysis }: { analysis: KnowledgeAnalysis }) {
  const { t } = useTranslation();
  const risk = { low: t('merchantUx.knowledgeIntake.low'), medium: t('merchantUx.knowledgeIntake.medium'), high: t('merchantUx.knowledgeIntake.high') };
  const recommendation = { approve: t('merchantUx.knowledgeIntake.approve'), review: t('merchantUx.knowledgeIntake.review'), reject: t('merchantUx.knowledgeIntake.reject') };
  const kind = { products: t('merchantUx.knowledgeIntake.products'), services: t('merchantUx.knowledgeIntake.reviewServices'), policies: t('merchantUx.knowledgeIntake.reviewPolicies'), general: t('merchantUx.knowledgeIntake.reviewGeneral') };
  return <div className="min-w-0 space-y-4 [overflow-wrap:anywhere]" data-knowledge-analysis>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{t('merchantUx.knowledgeIntake.report')}</h3><span className="rounded-full bg-muted px-3 py-1 text-sm">{risk[analysis.riskLevel]}</span></div>
    <p>{analysis.summary}</p>
    <p className="text-sm text-muted-foreground">{kind[analysis.contentType]} · {t('merchantUx.knowledgeIntake.reviewCount', { count: analysis.itemCount })}</p>
    <div><h4 className="font-medium">{t('merchantUx.knowledgeIntake.impact')}</h4><p className="text-sm leading-7">{analysis.impact}</p></div>
    {!!analysis.conflicts.length && <div role="note"><h4 className="font-medium">{t('merchantUx.knowledgeIntake.conflicts')}</h4><ul className="list-inside list-disc space-y-2 text-sm">{analysis.conflicts.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
    {!!analysis.sampleQA.length && <details><summary className="cursor-pointer py-2">{t('merchantUx.knowledgeIntake.samples')}</summary><div className="space-y-3">{analysis.sampleQA.map((qa, index) => <div key={index} className="rounded-lg bg-muted p-3"><p className="font-medium">{qa.question}</p><p className="mt-2 text-sm leading-7">{qa.answer}</p></div>)}</div></details>}
    <p className="font-medium">{recommendation[analysis.recommendation]}</p><p className="text-sm leading-7">{analysis.recommendationReason}</p>
  </div>;
}
