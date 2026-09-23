import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

export function SalesSectorSettings() {
  const { t } = useTranslation();
  const query = trpc.sariBrain.getSalesSector.useQuery();
  const [selected, setSelected] = useState('general');
  const mutation = trpc.sariBrain.updateSalesSector.useMutation({ onSuccess: () => { void query.refetch(); } });
  useEffect(() => { if (query.data) setSelected(query.data.playbook.id); }, [query.data?.revision]);
  const names: Record<string, string> = { general: t('merchantUx.salesSector.general'), training: t('merchantUx.salesSector.training'),
    recruitment: t('merchantUx.salesSector.recruitment'), store: t('merchantUx.salesSector.store') };
  return <section className="min-w-0 space-y-4 rounded-xl border p-4" aria-labelledby="sales-sector-title">
    <h3 id="sales-sector-title" className="font-semibold">{t('merchantUx.salesSector.title')}</h3>
    <p className="text-sm leading-relaxed text-muted-foreground">{t('merchantUx.salesSector.description')}</p>
    {query.isLoading ? <p role="status">{t('merchantUx.salesSector.loading')}</p> : query.isError ? <div role="alert">
      <p>{t('merchantUx.salesSector.loadFailed')}</p><Button className="mt-2 min-h-11" onClick={() => query.refetch()}>{t('merchantUx.salesSector.refresh')}</Button>
    </div> : query.data && <>
      <label htmlFor="sales-sector-select" className="block space-y-2 text-sm"><span>{t('merchantUx.salesSector.select')}</span>
        <select id="sales-sector-select" className="min-h-11 w-full rounded-md border bg-background px-3"
          value={selected} disabled={!query.data.canManage || mutation.isPending} onChange={event => { setSelected(event.target.value); mutation.reset(); }}>
          {query.data.available.map(p => <option value={p.id} key={p.id}>{names[p.id] || p.id}</option>)}
        </select>
      </label>
      <p className="text-sm">{t('merchantUx.salesSector.scope')}</p>
      <details className="rounded-md border p-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm">{t('merchantUx.salesSector.currentGuide')}</summary>
        <p className="mt-2 font-medium">{names[query.data.playbook.id] || query.data.playbook.id}</p>
        <ul className="list-inside list-disc space-y-2 py-3 text-sm leading-relaxed">
          {query.data.playbook.qualification.map(q => <li key={q.field}>{q.question}</li>)}
          {query.data.playbook.recommendation.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </details>
      {query.data.canManage ? <Button className="h-auto min-h-11 whitespace-normal" disabled={selected === query.data.playbook.id || mutation.isPending}
        onClick={() => mutation.mutate({ playbookId: selected, expectedRevision: query.data.revision })}>
        {mutation.isPending ? t('merchantUx.salesSector.saving') : t('merchantUx.salesSector.save')}
      </Button> : <p className="text-sm">{t('merchantUx.salesSector.readOnly')}</p>}
      {mutation.isError && <div role="alert"><p className="text-sm text-destructive">{t('merchantUx.salesSector.failed')}</p>
        <Button variant="outline" className="mt-2 min-h-11" onClick={() => query.refetch()}>{t('merchantUx.salesSector.refresh')}</Button></div>}
      {mutation.isSuccess && <p role="status" className="text-sm">{t('merchantUx.salesSector.saved')}</p>}
    </>}
  </section>;
}
