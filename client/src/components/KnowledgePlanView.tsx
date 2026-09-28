import { useTranslation } from 'react-i18next';
import type { KnowledgePlan } from '@shared/knowledge-plan';

export function KnowledgePlanView({ plan, archived = false }: { plan: KnowledgePlan; archived?: boolean }) {
  const { t } = useTranslation();
  const title = archived ? t('merchantUx.knowledgeIntake.planSavedTitle') : t('merchantUx.knowledgeIntake.planTitle');
  const actions = { add: t('merchantUx.knowledgeIntake.planAdd'), update: t('merchantUx.knowledgeIntake.planUpdate'), conflict: t('merchantUx.knowledgeIntake.planConflict'), unchanged: t('merchantUx.knowledgeIntake.planUnchanged') };
  return <section className="min-w-0 space-y-3 [overflow-wrap:anywhere]" aria-label={title} data-knowledge-plan>
    <h3 className="font-semibold">{title}</h3>
    <p className="text-sm leading-7 text-muted-foreground">{archived ? t('merchantUx.knowledgeIntake.planSavedHint') : t('merchantUx.knowledgeIntake.planHint')}</p>
    {!plan.items.length && <p className="rounded-lg bg-muted p-3 text-sm">{t('merchantUx.knowledgeIntake.planEmpty')}</p>}
    {plan.items.map((item, index) => <details key={index} className={archived ? 'min-w-0 border-t py-2' : 'min-w-0 rounded-lg border p-3'} open={index === 0}>
      <summary className="cursor-pointer py-2 text-sm font-medium">{actions[item.action]} · {item.title}</summary>
      <div className="min-w-0 space-y-3 pt-3">
        <p className="text-sm leading-7">{item.reason}</p>
        {item.parentIndex !== null && <p className="text-sm">{t('merchantUx.knowledgeIntake.planParent')}: {plan.items[item.parentIndex]?.title}</p>}
        <p className="rounded-md bg-muted p-2 text-sm leading-7">{item.action === 'unchanged' ? t('merchantUx.knowledgeIntake.planPreserved') : item.useInBot && item.status !== 'pending_review' && item.injectAs !== 'none' ? t('merchantUx.knowledgeIntake.planEligible') : t('merchantUx.knowledgeIntake.planInactive')}</p>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          {item.before && <div className="min-w-0 space-y-2"><h4 className="text-sm font-semibold">{archived ? t('merchantUx.knowledgeIntake.planBeforeSaved') : t('merchantUx.knowledgeIntake.planBefore')}</h4><p className="whitespace-pre-wrap text-sm leading-7" dir="auto">{item.before.content}</p></div>}
          <div className="min-w-0 space-y-2"><h4 className="text-sm font-semibold">{t('merchantUx.knowledgeIntake.planAfter')}</h4><p className="whitespace-pre-wrap text-sm leading-7" dir="auto">{item.content}</p><p className="text-sm text-muted-foreground" dir="auto">{item.summary}</p></div>
        </div>
      </div>
    </details>)}
  </section>;
}
