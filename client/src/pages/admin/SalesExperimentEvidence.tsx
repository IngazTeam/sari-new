import { useMemo,useState } from 'react';
import { Link,useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { FlaskConical,RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card,CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseSalesEvidenceId,formatSalesEvidenceMoney } from '@/lib/sales-order-report-view';
import { parseSalesReadoutForm,readSalesReadoutView,type SalesReadoutRequest,type SalesReadoutView } from '@/lib/sales-experiment-readout-view';

export default function SalesExperimentEvidence(){
  const search=useSearch(),params=new URLSearchParams(search);
  return <ReadoutForm key={search} merchant={params.get('merchantId')??''} protocol={params.get('protocolId')??''}/>;
}
function ReadoutForm({merchant:initialMerchant,protocol:initialProtocol}:{merchant:string;protocol:string}){
  const {t,i18n}=useTranslation(),[merchant,setMerchant]=useState(String(parseSalesEvidenceId(initialMerchant)??'')),[protocol,setProtocol]=useState(String(parseSalesEvidenceId(initialProtocol)??''));
  const [request,setRequest]=useState<SalesReadoutRequest|null>(null),[invalid,setInvalid]=useState(false),[attempt,setAttempt]=useState(0);
  const change=(setter:(v:string)=>void,value:string)=>{setRequest(null);setInvalid(false);setter(value);};
  return <div data-readout-page dir={i18n.dir()} className="mx-auto w-full min-w-0 max-w-6xl space-y-6">
    <header className="space-y-2"><h1 className="flex items-center gap-2 text-2xl font-bold"><FlaskConical aria-hidden className="size-6 shrink-0"/>{t('salesReadout.title')}</h1>
      <p className="max-w-3xl text-muted-foreground leading-7">{t('salesReadout.description')}</p></header>
    <Card><CardContent className="pt-6"><form noValidate className="space-y-4" onSubmit={event=>{event.preventDefault();const next=parseSalesReadoutForm(merchant,protocol);setRequest(next);setInvalid(!next);setAttempt(n=>n+1);}}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="readout-merchant">{t('salesEvidence.merchant')}</Label><Input id="readout-merchant" data-readout-field="merchant" inputMode="numeric" autoComplete="off" maxLength={32}
          className="min-h-11 text-base md:text-base" aria-describedby="readout-help" aria-invalid={invalid||undefined} value={merchant} onChange={e=>change(setMerchant,e.target.value)}/></div>
        <div className="space-y-2"><Label htmlFor="readout-protocol">{t('salesReadout.protocol')}</Label><Input id="readout-protocol" data-readout-field="protocol" inputMode="numeric" autoComplete="off" maxLength={32}
          className="min-h-11 text-base md:text-base" aria-describedby="readout-help" aria-invalid={invalid||undefined} value={protocol} onChange={e=>change(setProtocol,e.target.value)}/></div>
      </div><p id="readout-help" className="text-sm leading-6 text-muted-foreground">{t('salesReadout.formHelp')}</p>
      {invalid&&<p data-readout-invalid role="alert" className="text-destructive">{t('salesReadout.invalid')}</p>}
      <Button data-readout-read type="submit" className="min-h-11 h-auto whitespace-normal">{t('salesReadout.read')}</Button>
    </form></CardContent></Card>
    {request?<ReadoutQuery key={attempt} request={request}/>:<p data-readout-idle role="status" className="text-muted-foreground">{t('salesReadout.idle')}</p>}
  </div>;
}
function ReadoutQuery({request}:{request:SalesReadoutRequest}){
  const {t}=useTranslation();
  const query=trpc.inboundOperations.salesExperimentReadout.useQuery(request,{retry:false,staleTime:0,gcTime:0,refetchOnMount:'always',refetchOnWindowFocus:true,trpc:{abortOnUnmount:true}});
  const report=useMemo(()=>readSalesReadoutView(query.data,request),[query.data,request]);
  const paused=query.fetchStatus==='paused',busy=query.isPending||query.isFetching||paused;
  const denied=query.error?.data?.code==='FORBIDDEN'||query.error?.data?.code==='UNAUTHORIZED';
  return <section className="space-y-4" aria-label={t('salesEvidence.result')} aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{t('salesEvidence.result')}</h2>
      <Button data-readout-refresh type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={busy} onClick={()=>void query.refetch()}>
        <RefreshCw aria-hidden className={`size-4 ${busy?'motion-safe:animate-spin':''}`}/>{t('salesEvidence.refresh')}</Button></div>
    {paused?<p data-readout-paused role="status">{t('salesEvidence.paused')}</p>
      :busy?<p data-readout-loading role="status">{t('salesEvidence.loading')}</p>
      :query.error?<p data-readout-error role="alert" className="rounded-lg border p-4 text-destructive">{denied?t('salesEvidence.denied'):query.error.data?.code==='PRECONDITION_FAILED'?t('salesReadout.notReady'):t('salesEvidence.failed')}</p>
      :!report?<p data-readout-error role="alert" className="text-destructive">{t('salesReadout.incompatible')}</p>:<ReadoutResult key={`${report.evidenceSetDigest}:${report.readAt}`} report={report}/>}
  </section>;
}
function ReadoutResult({report:r}:{report:SalesReadoutView}){
  const {t,i18n}=useTranslation(),locale=i18n.language.startsWith('ar')?'ar-SA':'en-US';
  const [financialPage,setFinancialPage]=useState(0),pageSize=6,groupCount=r.paymentEvidence.groups.length;
  const number=(n:number)=>new Intl.NumberFormat(locale).format(n);
  const date=(v:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'medium',timeZone:'UTC'}).format(new Date(v));
  const armNames={baseline:t('salesReadout.baseline'),candidate:t('salesReadout.candidate')};
  const sectors:Record<string,string>={general:t('merchantUx.salesSector.general'),training:t('merchantUx.salesSector.training'),recruitment:t('merchantUx.salesSector.recruitment'),store:t('merchantUx.salesSector.store')};
  const sample={accruing:t('salesReadout.accruing'),insufficient_no_extension:t('salesReadout.insufficient'),recorded_minimum_reached:t('salesReadout.minimumReached')};
  const metric=(label:string,value:string,marker:string)=><div key={marker} className="min-w-0 space-y-1 rounded-lg bg-muted/30 p-3"><dt className="text-sm text-muted-foreground leading-6">{label}</dt><dd data-readout-metric={marker} className="text-lg font-semibold [overflow-wrap:anywhere]">{value}</dd></div>;
  return <div data-readout-result className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm leading-7">
      <p data-readout-scope className="font-semibold">{t('salesReadout.scope',{merchant:number(r.merchantId),protocol:number(r.protocolId),sector:sectors[r.sector]??r.sector})}</p>
      <p>{t('salesEvidence.readAt',{time:date(r.readAt)})}</p>
      <p data-readout-state>{r.protocolState==='withdrawn'?t('salesReadout.withdrawn'):t('salesReadout.registered')}</p>
      <p>{t('salesReadout.snapshotHelp')}</p>
    </div>
    <div className="space-y-3"><h3 className="text-lg font-semibold">{t('salesReadout.customers')}</h3><p className="text-sm leading-7 text-muted-foreground">{t('salesReadout.denominator')}</p>
      {r.arms.every(a=>a.assignedCustomers===0)&&<p data-readout-empty role="status" className="rounded-lg border p-4">{t('salesReadout.empty')}</p>}
      <div className="grid gap-4 lg:grid-cols-2">{r.arms.map(a=><article key={a.arm} data-readout-arm={a.arm} className="min-w-0 rounded-xl border p-4 space-y-3">
        <h4 className="font-semibold">{armNames[a.arm]}</h4><dl className="grid grid-cols-2 gap-3">
          {metric(t('salesReadout.assigned'),number(a.assignedCustomers),'assigned')}
          {metric(t('salesReadout.minimum'),number(a.minimumCustomers),'minimum')}
          {metric(t('salesReadout.complete'),number(a.observationComplete),'complete')}
          {metric(t('salesReadout.pending'),number(a.observationPending),'pending')}
        </dl><p className="text-sm" data-readout-shortfall>{t('salesReadout.shortfall',{remaining:number(a.sampleShortfall)})}</p>
      </article>)}</div><p data-readout-sample className="rounded-lg bg-muted/40 p-3 text-sm leading-7">{sample[r.sampleStatus]} {t('salesReadout.noWinner')}</p>
    </div>
    <details data-readout-window className="rounded-lg border p-4"><summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2">{t('salesReadout.window')}</summary>
      <dl className="grid gap-3 pt-3 sm:grid-cols-2">
        {metric(t('salesReadout.enrollmentStarts'),date(r.window.enrollmentStartsAt)+' UTC','starts')}
        {metric(t('salesReadout.enrollmentEnds'),date(r.window.enrollmentEndsAt)+' UTC','ends')}
        {metric(t('salesReadout.observationDays'),t('salesReadout.days',{days:number(r.window.observationDays)}),'days')}
        {metric(t('salesReadout.decisionTime'),date(r.window.decisionNotBefore)+' UTC','decision')}
      </dl><p className="mt-3 text-sm leading-7">{r.enrollmentClosed?t('salesReadout.enrollmentClosed'):t('salesReadout.enrollmentNotClosed')} · {r.decisionTimeReached?t('salesReadout.decisionReached'):t('salesReadout.decisionPending')}</p>
    </details>
    <ReadoutOutcomes report={r} locale={locale}/>
    <ReadoutStaff report={r} locale={locale}/>
    <section data-readout-exposures className="space-y-3" aria-label={t('salesReadout.exposureTitle')}>
      <h3 className="text-lg font-semibold">{t('salesReadout.exposureTitle')}</h3>
      <p className="text-sm leading-7 text-muted-foreground">{t('salesReadout.exposureHelp')}</p>
      <div className="grid gap-4 lg:grid-cols-2">{r.exposureEvidence.arms.map(e=><article key={e.arm} data-readout-exposure-arm={e.arm} className="min-w-0 rounded-xl border p-4 space-y-3">
        <h4 className="font-semibold">{armNames[e.arm]}</h4><dl className="grid gap-3 sm:grid-cols-2">
          {metric(t('salesReadout.acceptedCustomers'),number(e.customersWithOrderedRealAcceptance),'acceptedCustomers')}
          {metric(t('salesReadout.noAcceptance'),number(e.customersWithoutOrderedRealAcceptance),'noAcceptance')}
          {e.arm==='candidate'&&metric(t('salesReadout.candidateStyle'),number(e.customersWithCandidateStyleAcceptance),'candidateStyle')}
        </dl><details data-readout-receipts><summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2">{t('salesReadout.receipts')}</summary>
          <dl className="grid gap-3 pt-2 sm:grid-cols-2">
            {metric(t('salesReadout.recordedReceipts'),number(e.receipts.recorded),'recordedReceipts')}
            {metric(t('salesReadout.orderedReceipts'),number(e.receipts.orderedReal),'orderedReceipts')}
            {metric(t('salesReadout.regressedReceipts'),number(e.receipts.clockRegressionReal),'regressedReceipts')}
            {metric(t('salesReadout.syntheticReceipts'),number(e.receipts.synthetic),'syntheticReceipts')}
          </dl><p className="mt-3 text-sm leading-7">{t('salesReadout.receiptsHelp')}</p>
        </details>
        <details data-readout-chronology><summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2">{t('salesReadout.chronologyTitle')}</summary>
          <p className="pt-2 text-sm leading-7">{t('salesReadout.chronologyHelp')}</p>
          {e.firstCapture===null?<p data-readout-chronology-blocked className="pt-3 text-sm leading-7">{t('salesReadout.chronologyBlocked')}</p>
            :e.firstCapture.customers===0?<p data-readout-chronology-empty className="pt-3 text-sm leading-7">{t('salesReadout.chronologyEmpty')}</p>
            :<><dl className="grid gap-3 pt-3 sm:grid-cols-2">
              {metric(t('salesReadout.firstCaptureCustomers'),number(e.firstCapture.customers),'firstCaptureCustomers')}
              {metric(t('salesReadout.acceptanceBefore'),number(e.firstCapture.acceptanceBefore),'acceptanceBefore')}
              {metric(t('salesReadout.acceptanceAt'),number(e.firstCapture.acceptanceAt),'acceptanceAt')}
              {metric(t('salesReadout.inFlight'),number(e.firstCapture.inFlight),'inFlight')}
              {metric(t('salesReadout.dispatchAfter'),number(e.firstCapture.dispatchAtOrAfter),'dispatchAfter')}
              {metric(t('salesReadout.noOrderedReceipt'),number(e.firstCapture.noOrderedRealAcceptance),'noOrderedReceipt')}
            </dl>{e.arm==='candidate'&&<p className="pt-3 text-sm leading-7" data-readout-style-before>{t('salesReadout.styleBefore',{value:number(e.firstCapture.candidateStyleBefore)})}</p>}</>}
        </details>
      </article>)}</div>
    </section>
    <section className="space-y-3" aria-label={t('salesReadout.payments')}><h3 className="text-lg font-semibold">{t('salesReadout.payments')}</h3>
      <p className="text-sm leading-7 text-muted-foreground">{t('salesReadout.moneyHelp')}</p>
      {r.paymentEvidence.status==='unresolved_attribution'?<div data-readout-unresolved role="status" className="rounded-xl border p-4 space-y-3">
        <p className="font-medium">{t('salesReadout.unresolved')}</p><p className="text-sm leading-7">{t('salesReadout.unresolvedHelp')}</p>
        <dl className="grid gap-3 sm:grid-cols-3">{metric(t('salesReadout.awaiting'),number(r.paymentEvidence.unresolved.pending),'awaiting')}
          {metric(t('salesReadout.review'),number(r.paymentEvidence.unresolved.review),'review')}{metric(t('salesReadout.unassigned'),number(r.paymentEvidence.unresolved.unassigned),'unassigned')}</dl>
      </div>:r.paymentEvidence.status==='unmeasured'?<p data-readout-unmeasured role="status" className="rounded-lg border p-4 leading-7">{t('salesReadout.unmeasured')}</p>
      :<><p data-readout-page-count className="text-sm text-muted-foreground">{t('salesReadout.pageCount',{from:number(financialPage*pageSize+1),through:number(Math.min((financialPage+1)*pageSize,groupCount)),total:number(groupCount)})}</p>
      <div className="grid gap-4 xl:grid-cols-2">{r.paymentEvidence.groups.slice(financialPage*pageSize,(financialPage+1)*pageSize).map(g=>{
        const money=(value:number|null)=>value===null?t('salesEvidence.noEvidence'):g.currency==='SAR'?formatSalesEvidenceMoney(value,locale):number(value);
        return <article data-readout-finance={`${g.arm}-${g.currency}-${g.targetKind}`} key={`${g.arm}:${g.currency}:${g.targetKind}`} className="min-w-0 rounded-xl border p-4 space-y-3">
          <h4 className="font-semibold">{armNames[g.arm]} · {g.targetKind==='order'?t('salesReadout.orders'):t('salesReadout.bookings')} · <bdi>{g.currency}</bdi></h4>
          <p className="text-sm text-muted-foreground" data-readout-units>{g.currency==='SAR'?t('salesReadout.riyalUnits'):t('salesReadout.recordedMinorUnits',{currency:g.currency})}</p>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {metric(t('salesReadout.captured'),money(g.capturedMinor),'captured')}
            {metric(t('salesReadout.refundedBefore'),money(g.refundedBeforeCutoffMinor),'refundBefore')}
            {metric(t('salesReadout.netAtCutoff'),money(g.netAtCutoffObservedMinor),'netCutoff')}
            {metric(t('salesReadout.refundedLater'),money(g.refundedAtOrAfterCutoffMinor),'refundLater')}
            {metric(t('salesReadout.netCurrent'),money(g.netCurrentlyObservedMinor),'netCurrent')}
          </dl><details data-readout-counts><summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2">{t('salesReadout.counts')}</summary>
            <dl className="grid gap-3 pt-2 sm:grid-cols-3">{metric(t('salesReadout.captureCount'),number(g.capturedPayments),'payments')}
              {metric(t('salesReadout.customersCaptured'),number(g.customersWithCapture),'customers')}{metric(t('salesReadout.customersRetained'),number(g.customersWithRetainedCaptureAtCutoff),'retained')}</dl>
            <p className="pt-3 text-sm leading-7">{t('salesReadout.countHelp')}</p></details>
        </article>;
      })}</div>{groupCount>pageSize&&<nav aria-label={t('salesReadout.financialPages')} className="flex flex-wrap gap-3">
        <Button data-readout-prev type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={financialPage===0} onClick={()=>setFinancialPage(n=>n-1)}>{t('salesReadout.previous')}</Button>
        <Button data-readout-next type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={(financialPage+1)*pageSize>=groupCount} onClick={()=>setFinancialPage(n=>n+1)}>{t('salesReadout.next')}</Button>
      </nav>}</>}
    </section>
    <aside className="rounded-lg border bg-muted/30 p-4 text-sm leading-7" data-readout-limits>{t('salesReadout.limitations')}</aside>
    <details data-readout-identity className="rounded-lg border p-4 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2">{t('salesEvidence.reportIdentity')}</summary>
      <p className="pt-2 leading-7">{t('salesReadout.digestHelp')}</p><dl className="space-y-3 pt-3">
        <div><dt>{t('salesReadout.protocolDigest')}</dt><dd className="break-all font-mono text-xs" dir="ltr">{r.protocolDigest}</dd></div>
        <div><dt>{t('salesReadout.sectorDigest')}</dt><dd className="break-all font-mono text-xs" dir="ltr">{r.sectorDigest}</dd></div>
        <div><dt>{t('salesEvidence.digest')}</dt><dd className="break-all font-mono text-xs" dir="ltr">{r.evidenceSetDigest}</dd></div></dl>
    </details>
    <Button asChild variant="outline" className="min-h-11 h-auto whitespace-normal"><Link data-readout-orders-link href={`/admin/sales-evidence?merchantId=${r.merchantId}`}>{t('salesEvidence.openMerchant')}</Link></Button>
  </div>;
}
function ReadoutStaff({report:r,locale}:{report:SalesReadoutView;locale:string}){
  const {t}=useTranslation(),number=(n:number)=>new Intl.NumberFormat(locale).format(n);
  const metric=(label:string,n:number,marker:string)=><div key={marker} className="min-w-0 space-y-1 rounded-lg bg-muted/30 p-3">
    <dt className="text-sm text-muted-foreground leading-6">{label}</dt><dd data-staff-metric={marker} className="text-lg font-semibold">{number(n)}</dd></div>;
  return <section data-readout-staff className="space-y-3" aria-label={t('salesStaff.title')}>
    <h3 className="text-lg font-semibold">{t('salesStaff.title')}</h3><p className="text-sm leading-7 text-muted-foreground">{t('salesStaff.help')}</p>
    <div className="grid items-start gap-4 lg:grid-cols-2">{r.staffEvidence.arms.map(a=><article key={a.arm} data-staff-arm={a.arm} className="min-w-0 rounded-xl border p-4 space-y-3">
      <h4 className="font-semibold">{a.arm==='baseline'?t('salesReadout.baseline'):t('salesReadout.candidate')}</h4>
      <dl className="grid gap-3 sm:grid-cols-2">
        {metric(t('salesStaff.withStaff'),a.customersWithRecordedStaffMessages,'withStaff')}
        {metric(t('salesStaff.withoutStaff'),a.customersWithoutRecordedStaffMessages,'withoutStaff')}
      </dl><p className="text-sm leading-7">{t('salesStaff.noProof')}</p>
      <details data-staff-details><summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2">{t('salesStaff.details')}</summary>
        <dl className="grid gap-3 pt-2 sm:grid-cols-2">
          {metric(t('salesStaff.unknownCustomers'),a.customersWithUnknownOutgoingMessages,'unknownCustomers')}
          {metric(t('salesStaff.boundaryCustomers'),a.customersWithBoundaryMessages,'boundaryCustomers')}
          {metric(t('salesStaff.unavailableCustomers'),a.customersWithUnavailableConversationIdentity,'unavailableCustomers')}
          {metric(t('salesStaff.staffMessages'),a.messages.staffWithinWindow,'staffMessages')}
          {metric(t('salesStaff.unknownMessages'),a.messages.unknownWithinWindow,'unknownMessages')}
          {metric(t('salesStaff.staffBoundary'),a.messages.staffAtBoundary,'staffBoundary')}
          {metric(t('salesStaff.unknownBoundary'),a.messages.unknownAtBoundary,'unknownBoundary')}
        </dl><p className="mt-3 text-sm leading-7">{t('salesStaff.boundaryHelp')}</p><p className="mt-2 text-sm leading-7">{t('salesStaff.identityHelp')}</p>
      </details>
    </article>)}</div><p data-staff-limit className="rounded-lg border bg-muted/30 p-4 text-sm leading-7">{t('salesStaff.salesLimit')}</p>
  </section>;
}
function ReadoutOutcomes({report:r,locale}:{report:SalesReadoutView;locale:string}){
  const {t}=useTranslation(),m=r.outcomeEvidence,n=(value:number)=>new Intl.NumberFormat(locale).format(value);
  const percent=(numerator:number,denominator:number)=>new Intl.NumberFormat(locale,{style:'percent',maximumFractionDigits:2}).format(numerator/denominator);
  const item=(label:string,value:string,key:string)=><div key={key} className="min-w-0 space-y-1 rounded-lg bg-muted/30 p-3"><dt className="text-sm leading-6 text-muted-foreground">{label}</dt><dd data-outcome-metric={key} className="text-lg font-semibold">{value}</dd></div>;
  const blockers={withdrawn:t('salesOutcome.blockWithdrawn'),enrollment_open:t('salesOutcome.blockEnrollment'),observation_pending:t('salesOutcome.blockObservation'),
    decision_time_pending:t('salesOutcome.blockDecision'),empty_arm:t('salesOutcome.blockEmpty'),sample_below_registered_minimum:t('salesOutcome.blockMinimum'),
    sample_plan_below_calculated_floor:t('salesOutcome.blockPlan'),sample_below_calculated_floor:t('salesOutcome.blockCalculated'),attribution_unresolved:t('salesOutcome.blockAttribution'),
    source_completeness_unverified:t('salesOutcome.blockSources'),partial_refunds_unsupported:t('salesOutcome.blockPartialRefunds'),human_assistance_unmeasured:t('salesOutcome.blockHuman'),
    guardrails_unmeasured:t('salesOutcome.blockGuardrails'),statistical_inference_missing:t('salesOutcome.blockInference'),independent_result_review_required:t('salesOutcome.blockReview')};
  return <section data-readout-outcomes className="space-y-3" aria-label={t('salesOutcome.title')}>
    <h3 className="text-lg font-semibold">{t('salesOutcome.title')}</h3><p className="text-sm leading-7 text-muted-foreground">{t('salesOutcome.definition')}</p>
    <p data-outcome-scope className="rounded-lg bg-muted/30 p-3 text-sm leading-7">{t('salesOutcome.scope')}</p>
    <div className="grid items-start gap-4 lg:grid-cols-2">{m.arms.map(a=><article data-outcome-arm={a.arm} key={a.arm} className="min-w-0 rounded-xl border p-4 space-y-3">
      <h4 className="font-semibold">{a.arm==='baseline'?t('salesReadout.baseline'):t('salesReadout.candidate')}</h4>
      {!a.outcomes?<p data-outcome-blocked className="text-sm leading-7">{t('salesOutcome.blocked')}</p>:<>
        <dl className="grid gap-3 sm:grid-cols-2">{item(t('salesOutcome.retained'),n(a.outcomes.customersWithRetainedOrderAtCutoff),'retained')}
          {item(t('salesOutcome.denominator'),n(a.assignedCustomers),'assigned')}</dl>
        {a.recordedRatio?<p data-outcome-ratio className="rounded-lg bg-muted/40 p-3 leading-7">{t('salesOutcome.ratio',{ratio:percent(a.recordedRatio.numerator,a.recordedRatio.denominator),numerator:n(a.recordedRatio.numerator),denominator:n(a.recordedRatio.denominator)})}</p>
          :<p data-outcome-withheld className="text-sm leading-7">{a.assignedCustomers===0?t('salesOutcome.noDenominator'):t('salesOutcome.ratioWithheld')}</p>}
        <details data-outcome-counts><summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2">{t('salesOutcome.counts')}</summary>
          <dl className="grid gap-3 pt-3 sm:grid-cols-2">{item(t('salesOutcome.captured'),n(a.outcomes.customersWithOrderCapture),'captured')}
            {item(t('salesOutcome.refundedOnly'),n(a.outcomes.customersWithOnlyFullyRefundedOrdersAtCutoff),'refundedOnly')}
            {item(t('salesOutcome.noOrder'),n(a.outcomes.customersWithoutRecordedOrderCapture),'noOrder')}
            {item(t('salesOutcome.bookingOnly'),n(a.outcomes.customersWithBookingCaptureOnly),'bookingOnly')}</dl>
          <p className="mt-3 text-sm leading-7">{t('salesOutcome.countHelp')}</p>
        </details></>}
    </article>)}</div>
    <details data-outcome-planning className="rounded-lg border p-4"><summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2">{t('salesOutcome.planning')}</summary>
      <dl className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-3">
        {item(t('salesOutcome.baseline'),percent(m.planning.baselineConversionBps,10000),'baseline')}
        {item(t('salesOutcome.lift'),t('salesOutcome.points',{value:n(m.planning.minimumAbsoluteLiftBps/100)}),'lift')}
        {item(t('salesOutcome.alpha'),percent(m.planning.alphaBps,10000),'alpha')}
        {item(t('salesOutcome.power'),percent(m.planning.powerBps,10000),'power')}
        {item(t('salesOutcome.registeredMinimum'),n(m.planning.minimumCustomersPerArm),'registeredMinimum')}
        {item(t('salesOutcome.calculatedMinimum'),n(m.planning.calculation.requiredPerArm),'calculatedMinimum')}
      </dl><p className="mt-3 text-sm leading-7">{t('salesOutcome.planningHelp')}</p>
    </details>
    <details data-outcome-decision className="rounded-lg border p-4"><summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline focus-visible:outline-2">{t('salesOutcome.decision')}</summary>
      <p className="pt-2 text-sm leading-7">{t('salesOutcome.decisionHelp')}</p>
      <ul className="list-disc space-y-2 ps-5 pt-3 text-sm leading-7">{m.decision.blockers.map(reason=><li data-outcome-blocker={reason} key={reason}>{blockers[reason]}</li>)}</ul>
    </details>
  </section>;
}
