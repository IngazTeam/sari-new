import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { blankDiscount, discountTemplate, parseDiscountDraft, type DiscountDraft } from '@/lib/discount-workspace';
import { discountWorkspaceLabels } from '@/lib/discount-workspace-labels';
import type { DiscountWorkspaceRow } from '@shared/discount-workspace';
import { DiscountSummary } from './DiscountSummary';

export function DiscountEditor({ row, busy, blocked, save, cancel }: {
  row?: DiscountWorkspaceRow; busy: boolean; blocked: boolean;
  save: (input: any) => Promise<'duplicate' | void>; cancel: () => void;
}) {
  const { t } = useTranslation(), c = discountWorkspaceLabels(t);
  const initial = (): DiscountDraft => row ? { code: row.code, type: row.type ?? 'percentage', value: String(row.value ?? ''), minOrderAmount: String(row.minOrderAmount ?? ''), maxUses: String(row.maxUses ?? ''), expiresAt: row.expiresAt?.slice(0, 10) ?? '' } : blankDiscount();
  const [draft, setDraft] = useState(initial), [errors, setErrors] = useState<Record<string, string>>({}), [review, setReview] = useState<any>(null), [discard, setDiscard] = useState(false);
  const form = useRef<HTMLFormElement>(null), heading = useRef<HTMLHeadingElement>(null), live = useRef(true), submitted = useRef(false), invalidFocus = useRef<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial());
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  useEffect(() => { if (review) heading.current?.focus(); }, [review]);
  useEffect(() => { if (!review && invalidFocus.current) { form.current?.querySelector<HTMLElement>(`[name="${invalidFocus.current}"]`)?.focus(); invalidFocus.current = null; } }, [errors, review]);
  const change = (name: keyof DiscountDraft, value: string) => { setDraft(prev => ({ ...prev, [name]: value })); setErrors(prev => ({ ...prev, [name]: '' })); };
  const validate = () => {
    const result = parseDiscountDraft(draft, row && { id: row.id, revision: row.revision }); setErrors(result.errors);
    if (!result.parsed.success) { invalidFocus.current = Object.keys(result.errors)[0]; return; }
    setReview(result.parsed.data);
  };
  async function commit() { if (busy || blocked || submitted.current || !review) return; submitted.current = true; try { const result = await save(review); if (result === 'duplicate' && live.current) { invalidFocus.current = 'code'; setErrors({ code: 'duplicate' }); setReview(null); } } finally { submitted.current = false; } }
  const field = (name: keyof DiscountDraft, label: string, type = 'text', hint?: string) => <div className="dc-field"><label htmlFor={`dc-field-${name}`}>{label}</label><input id={`dc-field-${name}`} name={name} value={draft[name]} type={type} inputMode={['value', 'minOrderAmount', 'maxUses'].includes(name) ? 'numeric' : undefined} maxLength={name === 'code' ? 50 : 20} aria-invalid={!!errors[name]} aria-describedby={[errors[name] && `dc-${name}-error`, hint && `dc-${name}-hint`].filter(Boolean).join(' ') || undefined} onChange={event => change(name, event.target.value)} onInput={event => { if (type === 'date') change(name, event.currentTarget.value); }}/>{hint && <small id={`dc-${name}-hint`}>{hint}</small>}{errors[name] && <small id={`dc-${name}-error`} role="alert" className="dc-error">{c[errors[name] as keyof typeof c]}</small>}</div>;
  if (discard) return <div><p>{c.cancelDraft}</p><div className="sc-actions"><Button variant="outline" onClick={() => setDiscard(false)}>{c.keepEditing}</Button><Button variant="destructive" onClick={cancel}>{c.discard}</Button></div></div>;
  if (review) return <div className="dc-editor"><h3 ref={heading} tabIndex={-1}>{c.review}</h3><DiscountSummary draft={draft}/><div className="sc-actions"><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>{c.back}</Button><Button disabled={busy || blocked} onClick={() => void commit()}>{busy ? c.saving : row ? c.confirm : c.confirmCreate}</Button></div></div>;
  return <form ref={form} className="dc-editor" onSubmit={event => { event.preventDefault(); validate(); }}>
    {!row && <><label className="dc-field"><span>{c.template}</span><select defaultValue="" onChange={event => { setDraft(discountTemplate(event.target.value)); setErrors({}); }}><option value="">{c.custom}</option>{(['template10', 'template25', 'template50', 'templateWelcome', 'templateSeasonal', 'templateFlash'] as const).map(key => <option key={key} value={key}>{c[key]}</option>)}</select></label>{field('code', c.code)}<div className="dc-form-grid"><label className="dc-field"><span>{c.type}</span><select value={draft.type} onChange={event => change('type', event.target.value)}><option value="percentage">{c.percentage}</option><option value="fixed">{c.fixed}</option></select></label>{field('value', c.value + (draft.type === 'percentage' ? ' (%)' : ''), 'text', c.wholeHint)}</div></>}
    {row ? <>{field('maxUses', c.maxUses)}{field('expiresAt', c.expiry, 'date', c.expiryHint)}</> : <details className="dc-options" open={!!(errors.minOrderAmount || errors.maxUses || errors.expiresAt) || undefined}><summary>{c.additional}</summary>{field('minOrderAmount', c.minimum)}{field('maxUses', c.maxUses)}{field('expiresAt', c.expiry, 'date', c.expiryHint)}</details>}
    <div className="sc-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => dirty ? setDiscard(true) : cancel()}>{c.cancel}</Button><Button type="submit" disabled={busy || blocked}>{c.review}</Button></div>
  </form>;
}
