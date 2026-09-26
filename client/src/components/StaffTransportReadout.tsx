import { useTranslation } from 'react-i18next';
import type { SalesReadoutView } from '@/lib/sales-experiment-readout-view';

export function StaffTransportReadout({report,locale}:{report:SalesReadoutView;locale:string}) {
  const {t}=useTranslation(),r=report.staffTransportEvidence;
  const number=(n:number)=>new Intl.NumberFormat(locale).format(n);
  const metric=(label:string,n:number,key:string)=><div key={key} className="min-w-0 space-y-1">
    <dt className="text-sm leading-6 text-muted-foreground">{label}</dt>
    <dd data-transport-metric={key} className="text-lg font-semibold">{number(n)}</dd>
  </div>;
  return <section data-staff-transport className="space-y-3" aria-label={t('salesStaffTransport.title')}>
    <h3 className="text-lg font-semibold">{t('salesStaffTransport.title')}</h3>
    <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{t('salesStaffTransport.help')}</p>
    <div className="grid items-start gap-4 lg:grid-cols-2">{r.arms.map(a=><article key={a.arm} data-transport-arm={a.arm} className="min-w-0 rounded-xl border p-4 space-y-3">
      <h4 className="font-semibold">{t(a.arm==='baseline'?'salesReadout.baseline':'salesReadout.candidate')}</h4>
      <dl className="grid gap-4 sm:grid-cols-2">
        {metric(t('salesStaffTransport.withAcceptance'),a.customersWithEligibleAcceptance,'withAcceptance')}
        {metric(t('salesStaffTransport.withoutAcceptance'),a.customersWithoutEligibleAcceptance,'withoutAcceptance')}
      </dl>
      <p className="text-sm leading-7">{t('salesStaffTransport.noProof')}</p>
      <details data-transport-sources>
        <summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2">{t('salesStaffTransport.sources')}</summary>
        <dl className="grid gap-4 pt-2 sm:grid-cols-2">
          {metric(t('salesStaffTransport.eligible'),a.receipts.eligible,'eligible')}
          {metric(t('salesStaffTransport.escalation'),a.eligibleSources.escalation_relay,'escalation')}
          {metric(t('salesStaffTransport.text'),a.eligibleSources.dashboard_text,'text')}
          {metric(t('salesStaffTransport.voice'),a.eligibleSources.dashboard_voice,'voice')}
          {metric(t('salesStaffTransport.synthetic'),a.receipts.synthetic,'synthetic')}
          {metric(t('salesStaffTransport.unbound'),a.receipts.unbound,'unbound')}
          {metric(t('salesStaffTransport.outsideWindow'),a.receipts.outsideWindow,'outsideWindow')}
          {metric(t('salesStaffTransport.uncertainTiming'),a.receipts.uncertainTiming,'uncertainTiming')}
        </dl><p className="mt-3 text-sm leading-7">{t('salesStaffTransport.timingHelp')}</p>
      </details>
      <details data-transport-chronology>
        <summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2">{t('salesStaffTransport.chronology')}</summary>
        {r.chronologyStatus==='observed'&&a.firstCapture?<dl className="grid gap-4 pt-2 sm:grid-cols-2">
          {metric(t('salesStaffTransport.captures'),a.firstCapture.customers,'captures')}
          {metric(t('salesStaffTransport.acceptanceBefore'),a.firstCapture.acceptanceBefore,'acceptanceBefore')}
          {metric(t('salesStaffTransport.acceptanceAt'),a.firstCapture.acceptanceAt,'acceptanceAt')}
          {metric(t('salesStaffTransport.reservationBefore'),a.firstCapture.reservationBefore,'reservationBefore')}
          {metric(t('salesStaffTransport.reservationAtOrAfter'),a.firstCapture.reservationAtOrAfter,'reservationAtOrAfter')}
          {metric(t('salesStaffTransport.noEligibleAcceptance'),a.firstCapture.noEligibleAcceptance,'noEligibleAcceptance')}
        </dl>:<p data-transport-unmeasured className="text-sm leading-7">{t(r.chronologyStatus==='unresolved_attribution'?'salesStaffTransport.pending':'salesStaffTransport.unmeasured')}</p>}
        <p className="mt-3 text-sm leading-7">{t('salesStaffTransport.chronologyHelp')}</p>
      </details>
    </article>)}</div>
    <details data-transport-ledger className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2">{t('salesStaffTransport.ledger')}</summary>
      <dl className="grid gap-4 sm:grid-cols-2">{metric(t('salesStaffTransport.allFacts'),r.merchantLedgerFacts,'allFacts')}{metric(t('salesStaffTransport.otherCustomers'),r.otherCustomerFacts,'otherCustomers')}</dl>
    </details>
    <p data-transport-limit className="rounded-lg border bg-muted/30 p-4 text-sm leading-7">{t('salesStaffTransport.limit')}</p>
  </section>;
}
