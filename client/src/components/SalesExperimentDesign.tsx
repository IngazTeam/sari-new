import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { protocolStepFields, validateProtocolDraft, type ProtocolDraft } from '@/lib/sales-experiment-form';
import type { SalesExperimentDesign } from '../../../shared/sales-experiment-protocol';

export function useProtocolLabels() {
  const { t } = useTranslation();
  return {
    title: t('merchantUx.salesProtocol.titleField'), hypothesis: t('merchantUx.salesProtocol.hypothesis'), population: t('merchantUx.salesProtocol.population'),
    qualificationRule: t('merchantUx.salesProtocol.qualificationRule'), exclusions: t('merchantUx.salesProtocol.exclusions'),
    minimumCustomersPerArm: t('merchantUx.salesProtocol.minimumCustomersPerArm'), baselinePercent: t('merchantUx.salesProtocol.baselinePercent'),
    liftPercentagePoints: t('merchantUx.salesProtocol.liftPercentagePoints'), calculationReference: t('merchantUx.salesProtocol.calculationReference'),
    enrollmentStartsAt: t('merchantUx.salesProtocol.enrollmentStartsAt'), enrollmentEndsAt: t('merchantUx.salesProtocol.enrollmentEndsAt'),
    observationDays: t('merchantUx.salesProtocol.observationDays'), decisionNotBefore: t('merchantUx.salesProtocol.decisionNotBefore'), safetyTriggers: t('merchantUx.salesProtocol.safetyTriggers'),
  } satisfies Record<keyof ProtocolDraft, string>;
}
export function ProtocolRules() {
  const { t } = useTranslation();
  return <div className="space-y-2 rounded-lg border bg-muted/30 p-3" data-protocol-rules><h4 className="font-semibold">{t('merchantUx.salesProtocol.fixedRules')}</h4>
    <p>{t('merchantUx.salesProtocol.allocation')}</p><p>{t('merchantUx.salesProtocol.measurement')}</p><p>{t('merchantUx.salesProtocol.revenue')}</p><p>{t('merchantUx.salesProtocol.stopping')}</p></div>;
}
export function ProtocolDesignSummary({ design }: { design: SalesExperimentDesign }) {
  const { t, i18n } = useTranslation(), labels = useProtocolLabels();
  const date = (value: string) => new Intl.DateTimeFormat(i18n.language.startsWith('ar') ? 'ar-SA-u-ca-gregory' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC';
  const populations = { all: t('merchantUx.salesProtocol.all'), new: t('merchantUx.salesProtocol.new'), returning: t('merchantUx.salesProtocol.returning') };
  const values: Record<keyof ProtocolDraft, string | number> = {
    title: design.title, hypothesis: design.hypothesis, population: populations[design.cohort.population], qualificationRule: design.cohort.qualificationRule, exclusions: design.cohort.exclusions,
    minimumCustomersPerArm: design.sample.minimumCustomersPerArm, baselinePercent: `${design.sample.baselineConversionBps / 100}%`, liftPercentagePoints: `${design.sample.minimumAbsoluteLiftBps / 100}`,
    calculationReference: design.sample.calculationReference, enrollmentStartsAt: date(design.window.enrollmentStartsAt), enrollmentEndsAt: date(design.window.enrollmentEndsAt),
    observationDays: design.window.observationDays, decisionNotBefore: date(design.window.decisionNotBefore), safetyTriggers: design.stopping.safetyTriggers,
  };
  return <div className="space-y-4" data-protocol-summary><dl className="grid min-w-0 gap-3 sm:grid-cols-2">{(Object.keys(values) as Array<keyof ProtocolDraft>).map(key =>
    <div key={key} className={`min-w-0 rounded-lg border p-3 ${['hypothesis','qualificationRule','exclusions','calculationReference','safetyTriggers'].includes(key) ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs font-medium text-muted-foreground">{labels[key]}</dt><dd dir="auto" className="mt-1 whitespace-pre-wrap" data-protocol-summary-field={key}>{values[key]}</dd>
    </div>)}</dl><p className="text-muted-foreground">{t('merchantUx.salesProtocol.sampleScope')}</p><ProtocolRules /></div>;
}
export function ProtocolDraftFields({ draft, step, disabled, onChange }: {
  draft: ProtocolDraft; step: number; disabled: boolean; onChange: (key: keyof ProtocolDraft, value: string) => void;
}) {
  const { t } = useTranslation(), labels = useProtocolLabels(), id = useId(), validation = validateProtocolDraft(draft);
  const multiline = ['hypothesis','qualificationRule','exclusions','calculationReference','safetyTriggers'];
  const dates = ['enrollmentStartsAt','enrollmentEndsAt','decisionNotBefore'];
  return <fieldset disabled={disabled} className="min-w-0 space-y-4" data-protocol-fields>
    {step === 1 && <><p>{t('merchantUx.salesProtocol.sampleHint')}</p><p>{t('merchantUx.salesProtocol.liftHint')}</p><p className="text-muted-foreground">{t('merchantUx.salesProtocol.sampleScope')}</p></>}
    {step === 2 && <p>{t('merchantUx.salesProtocol.timeHint')}</p>}
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">{protocolStepFields[step]?.map(key => {
      const fieldId = `${id}-${key}`, isMultiline = multiline.includes(key), error = !!draft[key].trim() && validation.invalid.has(key);
      const hint = isMultiline ? t('merchantUx.salesProtocol.textHint') : key === 'title' ? t('merchantUx.salesProtocol.nameHint') : null;
      return <div key={key} className={`min-w-0 space-y-2 ${isMultiline || key === 'title' ? 'sm:col-span-2' : ''}`}>
        <label htmlFor={fieldId} className="block font-medium">{labels[key]}</label>
        {key === 'population' ? <select id={fieldId} data-protocol-field={key} value={draft[key]} onChange={e => onChange(key, e.target.value)} className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-base">
          <option value="all">{t('merchantUx.salesProtocol.all')}</option><option value="new">{t('merchantUx.salesProtocol.new')}</option><option value="returning">{t('merchantUx.salesProtocol.returning')}</option></select>
          : isMultiline ? <textarea id={fieldId} data-protocol-field={key} value={draft[key]} onChange={e => onChange(key, e.target.value)} maxLength={3000} rows={4} aria-invalid={error} aria-describedby={`${fieldId}-hint`} className="w-full min-w-0 resize-y rounded-md border bg-background p-3 text-base" />
          : <input id={fieldId} data-protocol-field={key} type={dates.includes(key) ? 'datetime-local' : 'text'} dir={dates.includes(key) ? 'ltr' : 'auto'} value={draft[key]}
            inputMode={['baselinePercent','liftPercentagePoints'].includes(key) ? 'decimal' : ['minimumCustomersPerArm','observationDays'].includes(key) ? 'numeric' : undefined}
            maxLength={key === 'title' ? 160 : dates.includes(key) ? undefined : 12} onChange={e => onChange(key, e.target.value)} aria-invalid={error} aria-describedby={`${fieldId}-hint`} className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3 text-base" />}
        <p id={`${fieldId}-hint`} className={`text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`}>{error ? t('merchantUx.salesProtocol.invalid') : hint}</p>
      </div>;
    })}</div>
  </fieldset>;
}
export function ProtocolDiscard({ confirmed, onConfirm, onDiscard, disabled }: { confirmed: boolean; onConfirm: (value: boolean) => void; onDiscard: () => void; disabled: boolean }) {
  const { t } = useTranslation();
  return <div className="space-y-2 border-t pt-3"><label className="flex min-h-11 items-start gap-2 py-2"><input type="checkbox" data-protocol-discard-consent className="mt-1 size-5 shrink-0" checked={confirmed} disabled={disabled} onChange={e => onConfirm(e.target.checked)} /><span>{t('merchantUx.salesProtocol.discardConfirm')}</span></label>
    <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-protocol-discard disabled={disabled || !confirmed} onClick={onDiscard}>{t('merchantUx.salesProtocol.discard')}</Button></div>;
}
