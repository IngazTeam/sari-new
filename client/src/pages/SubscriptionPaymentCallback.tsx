import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TAP_CHARGE_ID_PATTERN } from '@shared/subscription-payment-status';

type CallbackStatus = 'processing' | 'success' | 'failed' | 'pending';

const MAX_STATUS_POLLS = 30;

export default function SubscriptionPaymentCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<CallbackStatus>('processing');
  const [message, setMessage] = useState('جاري التحقق من عملية الدفع…');
  const [pollCount, setPollCount] = useState(0);
  const tapId = useMemo(() => new URLSearchParams(window.location.search).get('tap_id'), []);
  const validTapId = Boolean(tapId && TAP_CHARGE_ID_PATTERN.test(tapId));
  const callback = trpc.payment.getPaymentCallbackStatus.useQuery(
    { tap_id: tapId || '' },
    {
      enabled: validTapId,
      retry: false,
      refetchInterval: query => {
        const result = query.state.data?.status;
        return pollCount >= MAX_STATUS_POLLS || result === 'completed' || result === 'failed'
          ? false
          : 2000;
      },
      refetchIntervalInBackground: false,
    },
  );

  useEffect(() => {
    if (!validTapId) {
      setStatus('failed');
      setMessage(tapId ? 'معرّف عملية الدفع غير صالح.' : 'معرّف عملية الدفع مفقود.');
    }
  }, [tapId, validTapId]);

  useEffect(() => {
    if (!callback.dataUpdatedAt && !callback.errorUpdatedAt) return;
    setPollCount(current => Math.min(current + 1, MAX_STATUS_POLLS));
  }, [callback.dataUpdatedAt, callback.errorUpdatedAt]);

  useEffect(() => {
    if (!validTapId) return;
    if (callback.data?.status === 'completed') {
      setStatus('success');
      setMessage('تم الدفع وتفعيل الاشتراك بنجاح.');
      const redirect = window.setTimeout(() => setLocation('/merchant/dashboard'), 3000);
      return () => window.clearTimeout(redirect);
    }
    if (callback.data?.status === 'failed') {
      setStatus('failed');
      setMessage('لم تكتمل عملية الدفع. يمكنك المحاولة مرة أخرى.');
      return;
    }
    if (pollCount >= MAX_STATUS_POLLS) {
      setStatus('pending');
      setMessage('ما زلنا ننتظر إشعار Tap الموقّع. راجع لوحة التحكم بعد قليل، ولا تُعد الدفع الآن.');
      return;
    }
    setStatus('processing');
    setMessage(callback.isError ? 'تعذر تحديث الحالة مؤقتًا؛ سنحاول تلقائيًا.' : 'جاري التحقق من عملية الدفع…');
  }, [callback.data?.status, callback.isError, pollCount, setLocation, validTapId]);

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="space-y-5 pt-10 pb-10">
          <div className="flex justify-center">
            {status === 'processing' && <Loader2 className="h-12 w-12 animate-spin text-primary" />}
            {status === 'success' && <CheckCircle2 className="h-12 w-12 text-emerald-600" />}
            {status === 'failed' && <XCircle className="h-12 w-12 text-destructive" />}
            {status === 'pending' && <Clock3 className="h-12 w-12 text-amber-600" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {status === 'processing'
                ? 'تأكيد الدفع'
                : status === 'success'
                  ? 'اكتملت العملية'
                  : status === 'pending'
                    ? 'الدفع قيد التأكيد'
                    : 'تعذر إكمال العملية'}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          </div>
          {(status === 'failed' || status === 'pending') && (
            <Button
              variant="outline"
              onClick={() => setLocation(status === 'pending' ? '/merchant/dashboard' : '/pricing')}
            >
              <ArrowRight className="ml-2 h-4 w-4" />
              {status === 'pending' ? 'العودة إلى لوحة التحكم' : 'العودة إلى الباقات'}
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
