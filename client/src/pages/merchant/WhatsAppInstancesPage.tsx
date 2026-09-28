import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { launchMetaEmbeddedSignup } from '@/lib/meta-embedded-signup';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QueryStateCard } from '@/components/QueryStateCard';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type QRTarget = { type: 'request'; id: number; source: 'current' | 'legacy' } | { type: 'instance'; id: number };
type Action = { type: 'pause' | 'activate' | 'primary' | 'change'; id: number; phone: string };
export function normalizeRequestPhone(value: string) {
  return value.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[\s()-]/g, '');
}

function ConnectionDialog({ target, close, done, trigger }: { target: QRTarget; close: () => void; done: () => void; trigger: HTMLButtonElement | null }) {
  const { t } = useTranslation();
  const completed = useRef(false);
  const ref = { requestId: target.id, source: target.type === 'request' ? target.source : 'current' as const };
  const requestQR = trpc.whatsappWorkspace.qr.useQuery(ref, { enabled: target.type === 'request', retry: false, refetchOnWindowFocus: false });
  const requestCheck = trpc.whatsappWorkspace.confirm.useQuery(ref, { enabled: target.type === 'request', retry: false, refetchOnWindowFocus: false, refetchInterval: query => query.state.error ? false : 3000 });
  const instanceQR = trpc.whatsappInstances.getReconnectQR.useQuery({ instanceId: target.id }, { enabled: target.type === 'instance', retry: false, refetchOnWindowFocus: false });
  const instanceCheck = trpc.whatsappInstances.confirmReconnect.useQuery({ instanceId: target.id }, { enabled: target.type === 'instance', retry: false, refetchOnWindowFocus: false, refetchInterval: query => query.state.error ? false : 3000 });
  const qr = target.type === 'request' ? requestQR : instanceQR;
  const check = target.type === 'request' ? requestCheck : instanceCheck;
  const code = target.type === 'request' ? requestQR.data?.qrCodeUrl : instanceQR.data?.qrCode;
  const already = target.type === 'request' ? requestQR.data?.alreadyConnected : instanceQR.data?.status === 'already_connected';
  const checkError = check.isError;
  // A prior successful scan may still be cached when reopening after logout.
  const freshlyConnected = check.isFetchedAfterMount && !check.isFetching && !check.isError && check.data?.connected;
  useEffect(() => { if (freshlyConnected && !completed.current) { completed.current = true; done(); } }, [freshlyConnected, done]);
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="max-w-md" closeLabel={t('merchantUx.whatsappWorkspace.close')} onCloseAutoFocus={event => { if (trigger?.isConnected) { event.preventDefault(); trigger.focus(); } }}><DialogHeader>
    <DialogTitle>{t('merchantUx.whatsappWorkspace.qrTitle')}</DialogTitle><DialogDescription className="leading-7">{t('merchantUx.whatsappWorkspace.qrHint')}</DialogDescription>
  </DialogHeader><div className="min-w-0 space-y-4">
    {qr.isFetching ? <p role="status">{t('merchantUx.whatsappWorkspace.qrLoading')}</p> : qr.isError || (!code && !already) ? <p role="alert">{t('merchantUx.whatsappWorkspace.qrFailed')}</p> : code ? <div className="mx-auto w-full max-w-64 rounded-xl border bg-white p-3"><img className="aspect-square h-auto w-full" src={`data:image/png;base64,${code}`} alt={t('merchantUx.whatsappWorkspace.qrAlt')} /></div> : <p role="status">{t('merchantUx.whatsappWorkspace.qrAlready')}</p>}
    {checkError ? <div role="alert"><p>{t('merchantUx.whatsappWorkspace.qrCheckError')}</p><Button className="mt-2" variant="outline" disabled={check.isFetching} onClick={() => { void check.refetch(); }}>{t('merchantUx.whatsappWorkspace.checkAgain')}</Button></div> : <p role="status" className="text-sm text-muted-foreground">{t('merchantUx.whatsappWorkspace.qrWaiting')}</p>}
  </div><DialogFooter><Button variant="outline" onClick={close}>{t('merchantUx.whatsappWorkspace.close')}</Button><Button disabled={qr.isFetching} onClick={() => { void qr.refetch(); }}>{t('merchantUx.whatsappWorkspace.qrRefresh')}</Button></DialogFooter></DialogContent></Dialog>;
}

export default function WhatsAppInstancesPage() {
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const merchant = trpc.merchants.getCurrent.useQuery();
  const merchantId = merchant.data?.id ?? 0;
  const instances = trpc.whatsappInstances.listSafe.useQuery({ merchantId }, { enabled: merchantId > 0 });
  const usage = trpc.whatsappInstances.getUsage.useQuery({ merchantId }, { enabled: merchantId > 0 });
  const requests = trpc.whatsappWorkspace.requests.useQuery(undefined, { enabled: merchantId > 0 });
  const [requestOpen, setRequestOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [business, setBusiness] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ phone: false, business: false });
  const [requestError, setRequestError] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [actionError, setActionError] = useState(false);
  const [qr, setQR] = useState<QRTarget | null>(null);
  const [metaPending, setMetaPending] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const refresh = () => { void instances.refetch(); void usage.refetch(); void requests.refetch(); };
  const success = () => { toast.success(t('merchantUx.whatsappWorkspace.saved')); setAction(null); refresh(); };
  const failure = () => setActionError(true);
  const toggle = trpc.whatsappInstances.toggleStatus.useMutation({ onSuccess: success, onError: failure });
  const primary = trpc.whatsappInstances.setPrimary.useMutation({ onSuccess: success, onError: failure });
  const reconnect = trpc.whatsappInstances.reconnect.useMutation({ onSuccess: (_, variables) => { setAction(null); setQR({ type: 'instance', id: variables.instanceId }); refresh(); }, onError: failure });
  const verify = trpc.whatsappInstances.refreshInstance.useMutation({ onSuccess: () => { toast.success(t('merchantUx.whatsappWorkspace.saved')); refresh(); }, onError: () => toast.error(t('merchantUx.whatsappWorkspace.actionFailed')) });
  const meta = trpc.whatsappInstances.completeMetaEmbeddedSignup.useMutation();
  const create = trpc.whatsappRequests.create.useMutation({ onSuccess: () => { setRequestOpen(false); setPhone(''); setBusiness(''); refresh(); toast.success(t('merchantUx.whatsappWorkspace.requestSent')); }, onError: () => setRequestError(true) });
  const pending = toggle.isPending || primary.isPending || reconnect.isPending;
  const date = (value: string | null) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString(i18n.language.startsWith('ar') ? 'ar-SA-u-ca-gregory' : 'en-GB') : t('merchantUx.whatsappWorkspace.unavailable');
  const canAdd = !usage.isError && !usage.isLoading && usage.data?.known && (usage.data.remaining ?? 0) > 0;
  const openRequest = requests.data?.some(r => r.status === 'pending' || r.status === 'approved');
  const canRequest = canAdd && !requests.isError && !requests.isLoading && !openRequest;
  const status = { active: t('merchantUx.whatsappWorkspace.active'), inactive: t('merchantUx.whatsappWorkspace.inactive'), pending: t('merchantUx.whatsappWorkspace.pending'), expired: t('merchantUx.whatsappWorkspace.expired') };
  const requestStatus = { pending: t('merchantUx.whatsappWorkspace.review'), approved: t('merchantUx.whatsappWorkspace.approved'), rejected: t('merchantUx.whatsappWorkspace.rejected'), completed: t('merchantUx.whatsappWorkspace.completed') };
  const actionTitles = { pause: t('merchantUx.whatsappWorkspace.pauseTitle'), activate: t('merchantUx.whatsappWorkspace.activateTitle'), primary: t('merchantUx.whatsappWorkspace.primaryTitle'), change: t('merchantUx.whatsappWorkspace.changeTitle') };
  const actionHints = { pause: t('merchantUx.whatsappWorkspace.pauseHint'), activate: t('merchantUx.whatsappWorkspace.activateHint'), primary: t('merchantUx.whatsappWorkspace.primaryHint'), change: t('merchantUx.whatsappWorkspace.changeHint') };
  const ask = (next: Action, trigger: HTMLButtonElement) => { opener.current = trigger; setActionError(false); setAction(next); };
  if (merchant.isError || !merchant.isLoading && !merchant.data) return <QueryStateCard kind="error" title={t('merchantUx.whatsappWorkspace.merchantError')} retryLabel={t('merchantUx.whatsappWorkspace.retry')} onRetry={() => { void merchant.refetch(); }} />;
  if (merchant.isLoading) return <p role="status">{t('merchantUx.whatsappWorkspace.loading')}</p>;

  return <div className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">{t('merchantUx.whatsappWorkspace.title')}</h1><p className="mt-2 text-muted-foreground">{t('merchantUx.whatsappWorkspace.description')}</p></div><Button variant="outline" disabled={instances.isFetching || requests.isFetching || usage.isFetching} onClick={refresh}>{t('merchantUx.whatsappWorkspace.refresh')}</Button></header>
    <Card><CardContent className="space-y-4 pt-6"><p className="max-w-3xl text-sm leading-7 text-muted-foreground">{t('merchantUx.whatsappWorkspace.providerHint')}</p><div className="flex flex-wrap gap-3">
      <Button disabled={!canAdd || metaPending} onClick={async () => { if (metaPending) return; setMetaPending(true); try { const result = await launchMetaEmbeddedSignup(); await meta.mutateAsync({ merchantId, ...result }); toast.success(t('merchantUx.whatsappWorkspace.metaSuccess')); refresh(); } catch { toast.error(t('merchantUx.whatsappWorkspace.metaFailed')); } finally { setMetaPending(false); } }}>{metaPending ? t('merchantUx.whatsappWorkspace.saving') : t('merchantUx.whatsappWorkspace.meta')}</Button>
      <Button variant="outline" disabled={!canRequest} onClick={event => { opener.current = event.currentTarget; setRequestError(false); setRequestOpen(true); }}>{t('merchantUx.whatsappWorkspace.qrRequest')}</Button>
    </div>{openRequest && <p className="text-sm" role="status">{t('merchantUx.whatsappWorkspace.pendingHint')}</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle>{t('merchantUx.whatsappWorkspace.usage')}</CardTitle><CardDescription className="leading-7">{t('merchantUx.whatsappWorkspace.usageHint')}</CardDescription></CardHeader><CardContent>
      {usage.isError || usage.data && !usage.data.known ? <QueryStateCard kind="error" title={t('merchantUx.whatsappWorkspace.usageError')} retryLabel={t('merchantUx.whatsappWorkspace.retry')} onRetry={() => { void usage.refetch(); }} /> : usage.isLoading ? <p role="status">{t('merchantUx.whatsappWorkspace.loading')}</p> : <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-2xl font-semibold"><bdi>{usage.data?.total} / {usage.data?.max === 999999 ? '∞' : usage.data?.max}</bdi></p><p className="text-sm text-muted-foreground">{t('merchantUx.whatsappWorkspace.remaining')}: {usage.data?.max === 999999 ? '∞' : usage.data?.remaining}</p></div><Button variant="outline" onClick={() => navigate('/merchant/subscription')}>{t('merchantUx.whatsappWorkspace.plans')}</Button></div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t('merchantUx.whatsappWorkspace.instances')}</CardTitle><CardDescription className="leading-7">{t('merchantUx.whatsappWorkspace.instancesHint')}</CardDescription></CardHeader><CardContent>
      {instances.isError ? <QueryStateCard kind="error" title={t('merchantUx.whatsappWorkspace.instancesError')} retryLabel={t('merchantUx.whatsappWorkspace.retry')} onRetry={() => { void instances.refetch(); }} /> : instances.isLoading ? <p role="status">{t('merchantUx.whatsappWorkspace.loading')}</p> : !instances.data?.length ? <p role="status">{t('merchantUx.whatsappWorkspace.empty')}</p> : <div className="grid gap-4 lg:grid-cols-2">{instances.data.map(instance => <article key={instance.id} className="min-w-0 space-y-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold"><bdi>{instance.phoneNumber || t('merchantUx.whatsappWorkspace.noPhone')}</bdi></h3><Badge variant="secondary">{status[instance.status as keyof typeof status]}</Badge>{Boolean(instance.isPrimary) && <Badge variant="outline">{t('merchantUx.whatsappWorkspace.primary')}</Badge>}</div>
        <p className="text-sm text-muted-foreground">{instance.provider === 'meta_cloud' ? 'Meta Cloud' : instance.provider === 'mock' ? t('merchantUx.whatsappWorkspace.mock') : t('merchantUx.whatsappWorkspace.green')}</p><p className="text-sm text-muted-foreground">{t('merchantUx.whatsappWorkspace.registered')}: {date(instance.createdAt)}{instance.expiresAt && <> · {t('merchantUx.whatsappWorkspace.expires')}: {date(instance.expiresAt)}</>}</p>
        <div className="flex flex-wrap gap-2">{instance.provider === 'green_api' && <>
          <Button size="sm" variant="outline" disabled={pending} onClick={event => { opener.current = event.currentTarget; setQR({ type: 'instance', id: instance.id }); }}>{t('merchantUx.whatsappWorkspace.reconnect')}</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={event => ask({ type: 'change', id: instance.id, phone: instance.phoneNumber || '' }, event.currentTarget)}>{t('merchantUx.whatsappWorkspace.changeNumber')}</Button>
          <Button size="sm" variant="ghost" disabled={verify.isPending || pending} onClick={() => verify.mutate({ instanceId: instance.id })}>{t('merchantUx.whatsappWorkspace.verify')}</Button>
        </>}{instance.status === 'active' ? <>
          {!instance.isPrimary && <Button size="sm" variant="outline" disabled={pending} onClick={event => ask({ type: 'primary', id: instance.id, phone: instance.phoneNumber || '' }, event.currentTarget)}>{t('merchantUx.whatsappWorkspace.makePrimary')}</Button>}
          <Button size="sm" variant="outline" disabled={pending} onClick={event => ask({ type: 'pause', id: instance.id, phone: instance.phoneNumber || '' }, event.currentTarget)}>{t('merchantUx.whatsappWorkspace.pause')}</Button>
        </> : <Button size="sm" variant="outline" disabled={pending || usage.isError || !usage.data?.known} onClick={event => ask({ type: 'activate', id: instance.id, phone: instance.phoneNumber || '' }, event.currentTarget)}>{t('merchantUx.whatsappWorkspace.activate')}</Button>}</div>
      </article>)}</div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t('merchantUx.whatsappWorkspace.requests')}</CardTitle><CardDescription className="leading-7">{t('merchantUx.whatsappWorkspace.requestsHint')}</CardDescription></CardHeader><CardContent>
      {requests.isError ? <QueryStateCard kind="error" title={t('merchantUx.whatsappWorkspace.requestsError')} retryLabel={t('merchantUx.whatsappWorkspace.retry')} onRetry={() => { void requests.refetch(); }} /> : requests.isLoading ? <p role="status">{t('merchantUx.whatsappWorkspace.loading')}</p> : !requests.data?.length ? <p role="status">{t('merchantUx.whatsappWorkspace.noRequests')}</p> : <div className="space-y-3">{requests.data.map(request => <article key={`${request.source}:${request.id}`} className="min-w-0 space-y-3 rounded-xl border p-4"><div className="flex flex-wrap items-center gap-2"><bdi>{request.phoneNumber || `#${request.id}`}</bdi><Badge variant="secondary">{requestStatus[request.status]}</Badge>{request.source === 'legacy' && <Badge variant="outline">{t('merchantUx.whatsappWorkspace.legacy')}</Badge>}</div><p className="text-sm text-muted-foreground">{date(request.createdAt)}</p>{request.rejectionReason && <p className="break-words text-sm">{t('merchantUx.whatsappWorkspace.rejection')}: {request.rejectionReason}</p>}{request.status === 'approved' && <Button variant="outline" onClick={event => { opener.current = event.currentTarget; setQR({ type: 'request', id: request.id, source: request.source }); }}>{t('merchantUx.whatsappWorkspace.reconnect')}</Button>}</article>)}</div>}
    </CardContent></Card>

    <Dialog open={requestOpen} onOpenChange={open => { if (!create.isPending) setRequestOpen(open); }}><DialogContent className="max-w-md" closeLabel={t('merchantUx.whatsappWorkspace.close')} showCloseButton={!create.isPending} onCloseAutoFocus={event => { if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }}><DialogHeader><DialogTitle>{t('merchantUx.whatsappWorkspace.requestTitle')}</DialogTitle><DialogDescription className="leading-7">{t('merchantUx.whatsappWorkspace.requestHint')}</DialogDescription></DialogHeader>
      <form className="space-y-4" noValidate onSubmit={event => { event.preventDefault(); if (create.isPending || !canRequest) return; const cleaned = normalizeRequestPhone(phone); const errors = { phone: !!cleaned && !/^\+?[1-9]\d{6,14}$/.test(cleaned), business: business.trim().length > 255 }; setFieldErrors(errors); if (errors.phone || errors.business) return; setRequestError(false); create.mutate({ merchantId, phoneNumber: cleaned || undefined, businessName: business.trim() || undefined }); }}>
        <div className="space-y-2"><Label htmlFor="wa-phone">{t('merchantUx.whatsappWorkspace.phone')}</Label><Input id="wa-phone" dir="ltr" type="tel" autoComplete="tel" value={phone} disabled={create.isPending} onChange={event => setPhone(event.target.value)} aria-invalid={fieldErrors.phone} aria-describedby={fieldErrors.phone ? 'wa-phone-error' : 'wa-phone-hint'} /><p id="wa-phone-hint" className="text-xs text-muted-foreground">{t('merchantUx.whatsappWorkspace.phoneHint')}</p>{fieldErrors.phone && <p id="wa-phone-error" role="alert" className="text-sm text-destructive">{t('merchantUx.whatsappWorkspace.phoneError')}</p>}</div>
        <div className="space-y-2"><Label htmlFor="wa-business">{t('merchantUx.whatsappWorkspace.business')}</Label><Input id="wa-business" value={business} disabled={create.isPending} onChange={event => setBusiness(event.target.value)} aria-invalid={fieldErrors.business} aria-describedby={fieldErrors.business ? 'wa-business-error' : undefined} />{fieldErrors.business && <p id="wa-business-error" role="alert" className="text-sm text-destructive">{t('merchantUx.whatsappWorkspace.businessError')}</p>}</div>
        {requestError && <p role="alert" className="text-sm text-destructive">{t('merchantUx.whatsappWorkspace.requestFailed')}</p>}<DialogFooter><Button type="button" variant="outline" disabled={create.isPending} onClick={() => setRequestOpen(false)}>{t('merchantUx.whatsappWorkspace.cancel')}</Button><Button type="submit" disabled={create.isPending || !canRequest}>{create.isPending ? t('merchantUx.whatsappWorkspace.saving') : t('merchantUx.whatsappWorkspace.sendRequest')}</Button></DialogFooter>
      </form></DialogContent></Dialog>
    <AlertDialog open={!!action} onOpenChange={open => { if (!open && !pending) setAction(null); }}><AlertDialogContent onCloseAutoFocus={event => { if (qr) { event.preventDefault(); return; } if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); } }}><AlertDialogHeader><AlertDialogTitle>{action && actionTitles[action.type]}</AlertDialogTitle><AlertDialogDescription className="leading-7">{action && actionHints[action.type]} <bdi>{action?.phone}</bdi></AlertDialogDescription></AlertDialogHeader>{actionError && <p role="alert" className="text-sm text-destructive">{t('merchantUx.whatsappWorkspace.actionFailed')}</p>}<AlertDialogFooter><AlertDialogCancel disabled={pending}>{t('merchantUx.whatsappWorkspace.keep')}</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={event => { event.preventDefault(); if (!action || pending) return; setActionError(false); if (action.type === 'change') reconnect.mutate({ instanceId: action.id }); else if (action.type === 'primary') primary.mutate({ merchantId, id: action.id }); else toggle.mutate({ merchantId, id: action.id, newStatus: action.type === 'activate' ? 'active' : 'inactive' }); }}>{pending ? t('merchantUx.whatsappWorkspace.saving') : t('merchantUx.whatsappWorkspace.confirm')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {qr && <ConnectionDialog key={`${qr.type}:${qr.type === 'request' ? qr.source : ''}:${qr.id}`} target={qr} trigger={opener.current} close={() => setQR(null)} done={() => { setQR(null); toast.success(t('merchantUx.whatsappWorkspace.connected')); refresh(); }} />}
  </div>;
}
