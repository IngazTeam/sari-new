import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { QueryStateCard } from '@/components/QueryStateCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { subscriptionEndsAt, subscriptionQuota, TRIAL_USAGE_LIMITS } from '@shared/subscription-usage';

export default function MySubscription() {
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const current = trpc.merchantSubscription.getCurrentSubscription.useQuery();
  const transactions = trpc.payment.listTransactions.useQuery();
  const utils = trpc.useUtils();
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState('');
  const cancelTrigger = useRef<HTMLButtonElement>(null);
  const cancel = trpc.merchantSubscription.cancelSubscription.useMutation({
    onSuccess: () => {
      setCancelId(null); setCancelError('');
      toast.success(t('merchantUx.subscriptionWorkspace.cancelledSuccess'));
      void utils.merchantSubscription.invalidate();
    },
    onError: error => setCancelError(error.data?.code === 'CONFLICT'
      ? t('merchantUx.subscriptionWorkspace.stale') : t('merchantUx.subscriptionWorkspace.cancelFailed')),
  });
  const locale = i18n.language.startsWith('ar') ? 'ar-SA' : 'en-US';
  const number = (value: number) => value.toLocaleString(locale);
  const date = (value?: string | null) => value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toLocaleDateString(locale, { calendar: 'gregory', year: 'numeric', month: 'short', day: 'numeric' })
    : t('merchantUx.subscriptionWorkspace.unknown');
  const subscription = current.data;
  const plan = subscription?.plan;
  const trialWithoutPlan = subscription?.status === 'trial' && !subscription.planId;
  const quotas = [
    { label: t('merchantUx.subscriptionWorkspace.conversations'), used: subscription?.conversationsUsed, limit: trialWithoutPlan ? TRIAL_USAGE_LIMITS.maxConversations : plan?.conversationLimit },
    { label: t('merchantUx.subscriptionWorkspace.messages'), used: subscription?.messagesUsed, limit: trialWithoutPlan ? TRIAL_USAGE_LIMITS.maxMessages : plan?.messageLimit },
    { label: t('merchantUx.subscriptionWorkspace.voice'), used: subscription?.voiceMessagesUsed, limit: trialWithoutPlan ? TRIAL_USAGE_LIMITS.maxVoiceMessages : plan?.voiceMessageLimit },
  ];
  const statusLabels = { trial: t('merchantUx.subscriptionWorkspace.trial'), active: t('merchantUx.subscriptionWorkspace.active'), expired: t('merchantUx.subscriptionWorkspace.expired'), cancelled: t('merchantUx.subscriptionWorkspace.cancelled'), pending: t('merchantUx.subscriptionWorkspace.pending') };
  const paymentLabels = { completed: t('merchantUx.subscriptionWorkspace.paymentCompleted'), pending: t('merchantUx.subscriptionWorkspace.paymentPending'), failed: t('merchantUx.subscriptionWorkspace.paymentFailed'), refunded: t('merchantUx.subscriptionWorkspace.paymentRefunded') };
  const typeLabels = { subscription: t('merchantUx.subscriptionWorkspace.typeSubscription'), addon: t('merchantUx.subscriptionWorkspace.typeAddon'), renewal: t('merchantUx.subscriptionWorkspace.typeRenewal'), upgrade: t('merchantUx.subscriptionWorkspace.typeUpgrade'), downgrade: t('merchantUx.subscriptionWorkspace.typeDowngrade') };

  return <div className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-bold">{t('merchantUx.subscriptionWorkspace.title')}</h1><p className="mt-2 text-muted-foreground">{t('merchantUx.subscriptionWorkspace.description')}</p></div>
      <Button type="button" variant="outline" disabled={current.isFetching || transactions.isFetching} onClick={() => { void current.refetch(); void transactions.refetch(); }}>{t('merchantUx.subscriptionWorkspace.refresh')}</Button>
    </header>
    {current.isError ? <QueryStateCard kind="error" title={t('merchantUx.subscriptionWorkspace.loadFailed')} description={t('merchantUx.subscriptionWorkspace.loadHint')} retryLabel={t('merchantUx.subscriptionWorkspace.retry')} onRetry={() => { void current.refetch(); }} />
      : current.isLoading ? <p role="status" className="py-8">{t('merchantUx.subscriptionWorkspace.loading')}</p>
      : !subscription ? <QueryStateCard kind="empty" title={t('merchantUx.subscriptionWorkspace.noActive')} description={t('merchantUx.subscriptionWorkspace.noActiveHint')}
        action={<Button onClick={() => navigate('/merchant/subscription/plans')}>{t('merchantUx.subscriptionWorkspace.plans')}</Button>} />
      : <>
        <Card>
          <CardHeader>
            <CardDescription>{t('merchantUx.subscriptionWorkspace.current')}</CardDescription>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{trialWithoutPlan ? t('merchantUx.subscriptionWorkspace.trial') : (i18n.language.startsWith('ar') ? plan?.name : plan?.nameEn) || t('merchantUx.subscriptionWorkspace.unknownPlan')}</CardTitle>
              <Badge variant="secondary">{statusLabels[subscription.status]}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <div><dt className="text-sm text-muted-foreground">{t('merchantUx.subscriptionWorkspace.days')}</dt><dd className="mt-2 text-2xl font-semibold">{number(subscription.daysRemaining)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{t('merchantUx.subscriptionWorkspace.cycle')}</dt><dd className="mt-2 font-semibold">{subscription.billingCycle === 'monthly' ? t('merchantUx.subscriptionWorkspace.monthly') : t('merchantUx.subscriptionWorkspace.yearly')}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{t('merchantUx.subscriptionWorkspace.start')}</dt><dd className="mt-2">{date(subscription.startDate)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{subscription.status === 'trial' ? t('merchantUx.subscriptionWorkspace.trialEnd') : t('merchantUx.subscriptionWorkspace.end')}</dt><dd className="mt-2">{date(subscriptionEndsAt(subscription))}</dd></div>
            </dl>
            {plan && <dl className="grid grid-cols-2 gap-5 rounded-xl bg-muted/40 p-4">
              <div><dt className="text-sm text-muted-foreground">{t('merchantUx.subscriptionWorkspace.customers')}</dt><dd className="mt-1 font-semibold">{plan.maxCustomers === 999999 ? t('merchantUx.subscriptionWorkspace.unlimited') : number(plan.maxCustomers)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{t('merchantUx.subscriptionWorkspace.whatsappNumbers')}</dt><dd className="mt-1 font-semibold">{plan.maxWhatsAppNumbers === 999999 ? t('merchantUx.subscriptionWorkspace.unlimited') : number(plan.maxWhatsAppNumbers)}</dd></div>
            </dl>}
            {subscription.daysRemaining <= 7 && <p className="rounded-xl border p-3 text-sm leading-7">{t('merchantUx.subscriptionWorkspace.endingSoon')}</p>}
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => navigate('/merchant/subscription/plans')}>{t('merchantUx.subscriptionWorkspace.plans')}</Button>
              <Button variant="outline" onClick={() => navigate('/merchant/subscription/compare')}>{t('merchantUx.subscriptionWorkspace.compare')}</Button>
              <Button variant="ghost" onClick={() => navigate('/merchant/usage-dashboard')}>{t('merchantUx.subscriptionWorkspace.limits')}</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t('merchantUx.subscriptionWorkspace.usage')}</CardTitle><CardDescription className="leading-7">{t('merchantUx.subscriptionWorkspace.usageHint')}</CardDescription></CardHeader>
          <CardContent>
            <div className="grid gap-5 md:grid-cols-3">
              {quotas.map(item => {
                const quota = subscriptionQuota(item.used, item.limit);
                return <section key={item.label} aria-label={item.label} className="min-w-0 rounded-xl border p-4">
                  <h3 className="font-semibold">{item.label}</h3>
                  {!quota.known ? <p className="mt-3 text-muted-foreground">{t('merchantUx.subscriptionWorkspace.unknown')}</p> : <>
                    <dl className="mt-4 flex flex-wrap justify-between gap-3"><div><dt className="text-sm text-muted-foreground">{t('merchantUx.subscriptionWorkspace.used')}</dt><dd className="text-2xl font-semibold">{number(quota.used)}</dd></div><div><dt className="text-sm text-muted-foreground">{t('merchantUx.subscriptionWorkspace.limit')}</dt><dd>{quota.unlimited ? t('merchantUx.subscriptionWorkspace.unlimited') : number(quota.limit)}</dd></div></dl>
                    {quota.percentage !== null && quota.limit > 0 && <progress className="mt-4 h-2 w-full accent-primary" max={100} value={quota.percentage} aria-label={item.label} />}
                    <p className="mt-3 text-sm text-muted-foreground">{quota.unlimited ? t('merchantUx.subscriptionWorkspace.unlimited') : quota.limit === 0 ? t('merchantUx.subscriptionWorkspace.noAllowance') : quota.remaining === 0 ? t('merchantUx.subscriptionWorkspace.reached') : t('merchantUx.subscriptionWorkspace.remaining', { count: quota.remaining })}</p>
                  </>}
                </section>;
              })}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{t('merchantUx.subscriptionWorkspace.reset')}: {date(subscription.lastResetAt)}</p>
          </CardContent>
        </Card>
        {subscription.status === 'active' && <details className="rounded-xl border p-4">
          <summary className="cursor-pointer py-2 font-medium">{t('merchantUx.subscriptionWorkspace.manage')}</summary>
          <p className="my-4 max-w-3xl text-sm leading-7 text-muted-foreground">{t('merchantUx.subscriptionWorkspace.cancelImpact')}</p>
          <Button ref={cancelTrigger} type="button" variant="outline" onClick={() => { setCancelError(''); setCancelId(subscription.id); }}>{t('merchantUx.subscriptionWorkspace.cancel')}</Button>
        </details>}
      </>}

    <Card>
      <CardHeader><CardTitle>{t('merchantUx.subscriptionWorkspace.transactions')}</CardTitle><CardDescription className="leading-7">{t('merchantUx.subscriptionWorkspace.transactionsHint')}</CardDescription></CardHeader>
      <CardContent>
        {transactions.isError ? <QueryStateCard kind="error" title={t('merchantUx.subscriptionWorkspace.transactionsFailed')} retryLabel={t('merchantUx.subscriptionWorkspace.retry')} onRetry={() => { void transactions.refetch(); }} />
          : transactions.isLoading ? <p role="status">{t('merchantUx.subscriptionWorkspace.transactionsLoading')}</p>
          : !transactions.data?.length ? <p role="status" className="py-6 text-muted-foreground">{t('merchantUx.subscriptionWorkspace.transactionsEmpty')}</p>
          : <Table className="mw-mobile-records"><TableHeader><TableRow>
            <TableHead>{t('merchantUx.subscriptionWorkspace.reference')}</TableHead><TableHead>{t('merchantUx.subscriptionWorkspace.date')}</TableHead><TableHead>{t('merchantUx.subscriptionWorkspace.type')}</TableHead><TableHead>{t('merchantUx.subscriptionWorkspace.amount')}</TableHead><TableHead>{t('merchantUx.subscriptionWorkspace.status')}</TableHead>
          </TableRow></TableHeader><TableBody>{transactions.data.map(transaction => <TableRow key={transaction.id}>
            <TableCell data-label={t('merchantUx.subscriptionWorkspace.reference')}>#{transaction.id}</TableCell>
            <TableCell data-label={t('merchantUx.subscriptionWorkspace.date')}>{date(transaction.createdAt)}</TableCell>
            <TableCell data-label={t('merchantUx.subscriptionWorkspace.type')}>{typeLabels[transaction.type]}</TableCell>
            <TableCell data-label={t('merchantUx.subscriptionWorkspace.amount')}><bdi>{number(Number(transaction.amount))} {transaction.currency}</bdi></TableCell>
            <TableCell data-label={t('merchantUx.subscriptionWorkspace.status')}><Badge variant={transaction.status === 'failed' ? 'destructive' : 'secondary'}>{paymentLabels[transaction.status]}</Badge></TableCell>
          </TableRow>)}</TableBody></Table>}
      </CardContent>
    </Card>

    <AlertDialog open={cancelId !== null} onOpenChange={open => { if (!open && !cancel.isPending) setCancelId(null); }}>
      <AlertDialogContent onCloseAutoFocus={event => { if (cancelTrigger.current) { event.preventDefault(); cancelTrigger.current.focus(); } }}><AlertDialogHeader><AlertDialogTitle>{t('merchantUx.subscriptionWorkspace.cancelTitle')}</AlertDialogTitle><AlertDialogDescription>{t('merchantUx.subscriptionWorkspace.cancelImpact')}</AlertDialogDescription></AlertDialogHeader>
        {cancelError && <p role="alert" className="text-sm text-destructive">{cancelError}</p>}
        {!cancelError && cancelId !== null && subscription?.id !== cancelId && <p role="alert" className="text-sm text-destructive">{t('merchantUx.subscriptionWorkspace.stale')}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancel.isPending}>{t('merchantUx.subscriptionWorkspace.keep')}</AlertDialogCancel>
          <AlertDialogAction disabled={cancel.isPending || current.isError || subscription?.id !== cancelId} onClick={event => {
            event.preventDefault();
            if (cancelId !== null) { setCancelError(''); cancel.mutate({ expectedSubscriptionId: cancelId }); }
          }}>{cancel.isPending ? t('merchantUx.subscriptionWorkspace.cancelling') : t('merchantUx.subscriptionWorkspace.cancelConfirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
