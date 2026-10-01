import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {
  subscriptionEndsAt,
  subscriptionTimestamp,
} from '@shared/subscription-usage';
export function TrialBanner() {
  const { t, i18n } = useTranslation(),
    label = (key: string) => t(`trialNoticeUx.${key}`);
  const query = trpc.merchantSubscription.getCurrentSubscription.useQuery(
    undefined,
    { retry: false, staleTime: 0, refetchOnMount: 'always' }
  );
  const [now, setNow] = useState(() => Date.now());
  const subscription = !query.isError && !query.isFetching ? query.data : null;
  const end = subscription
    ? subscriptionTimestamp(subscriptionEndsAt(subscription))
    : null;
  useEffect(() => {
    setNow(Date.now());
    if (subscription?.status !== 'trial' || end === null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [subscription?.id, subscription?.status, end]);
  if (query.isLoading || query.isFetching)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {label('loading')}
      </p>
    );
  if (query.isError || query.data === undefined)
    return (
      <section className="mw-panel space-y-3" role="alert">
        <p>{label('failed')}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {label('retry')}
        </Button>
        <Link className="mw-link" href="/merchant/my-subscription">
          {label('manage')}
        </Link>
      </section>
    );
  if (subscription?.status === 'active') return null;
  const trial = subscription?.status === 'trial',
    remaining = end === null ? null : end - now;
  const expired =
    subscription?.status === 'expired' ||
    (trial && remaining !== null && remaining <= 0);
  const locale = i18n.language.startsWith('ar') ? 'ar-SA' : 'en-GB';
  const unit = (value: number, kind: 'day' | 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: kind,
      unitDisplay: 'long',
    }).format(value);
  let duration: string | null = null;
  if (trial && remaining !== null && remaining > 0) {
    const minutes = Math.floor(remaining / 60000),
      days = Math.floor(minutes / 1440),
      hours = Math.floor((minutes % 1440) / 60);
    duration = days
      ? unit(days, 'day') + ' · ' + unit(hours, 'hour')
      : hours
        ? unit(hours, 'hour') + ' · ' + unit(minutes % 60, 'minute')
        : minutes
          ? unit(minutes, 'minute')
          : label('underMinute');
  }
  const title = !subscription
    ? label('noSubscription')
    : expired
      ? label(trial ? 'trialEnded' : 'subscriptionEnded')
      : trial
        ? label('trial')
        : label('review');
  return (
    <section
      className="mw-panel space-y-3"
      aria-label={label('title')}
      dir={i18n.dir()}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <Link className="mw-link" href="/merchant/my-subscription">
          {label('manage')}
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        {label(trial && !expired ? 'trialHelp' : 'reviewHelp')}
      </p>
      {trial &&
        !expired &&
        (end === null ? (
          <p>{label('unknownEnd')}</p>
        ) : (
          <>
            <p className="text-sm">
              {label('ends')}{' '}
              <time dateTime={new Date(end).toISOString()}>
                {new Date(end).toLocaleString(locale, {
                  calendar: 'gregory',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </time>
            </p>
            <p className="text-sm">
              {label('remaining')} <strong>{duration}</strong>
            </p>
          </>
        ))}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/merchant/subscription/plans">{label('plans')}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/merchant/subscription/compare">{label('compare')}</Link>
        </Button>
      </div>
    </section>
  );
}
