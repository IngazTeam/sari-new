import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent } from '@/components/ui/card';
import { TAP_CHARGE_ID_PATTERN } from '@shared/subscription-payment-status';

const MAX_RETURN_STATUS_POLLS = 30;

export default function PaymentReturn() {
  const [pollCount, setPollCount] = useState(0);
  const chargeId = useMemo(() => new URLSearchParams(window.location.search).get('tap_id') || '', []);
  const validChargeId = TAP_CHARGE_ID_PATTERN.test(chargeId);
  const query = trpc.payments.getPublicChargeStatus.useQuery(
    { chargeId },
    {
      enabled: validChargeId,
      retry: false,
      refetchInterval: current => {
        const status = current.state.data?.status;
        return pollCount >= MAX_RETURN_STATUS_POLLS || status === 'captured' || status === 'failed'
          ? false
          : 2000;
      },
      refetchIntervalInBackground: false,
    },
  );

  useEffect(() => {
    if (!query.dataUpdatedAt && !query.errorUpdatedAt) return;
    setPollCount(current => Math.min(current + 1, MAX_RETURN_STATUS_POLLS));
  }, [query.dataUpdatedAt, query.errorUpdatedAt]);

  const status = query.data?.status;
  const succeeded = status === 'captured';
  const failed = status === 'failed' || !validChargeId;
  const timedOut = pollCount >= MAX_RETURN_STATUS_POLLS && !succeeded && !failed;

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="space-y-4 pt-10 pb-10">
          <div className="flex justify-center">
            {succeeded ? <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              : failed ? <XCircle className="h-12 w-12 text-destructive" />
                : timedOut || status === 'processing' ? <Clock3 className="h-12 w-12 text-amber-500" />
                  : <Loader2 className="h-12 w-12 animate-spin text-primary" />}
          </div>
          <h1 className="text-2xl font-bold">
            {succeeded ? 'تم الدفع بنجاح'
              : failed ? 'لم تكتمل عملية الدفع'
                : timedOut ? 'الدفع قيد التأكيد'
                  : 'جاري تأكيد عملية الدفع'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {succeeded
              ? 'تم تسجيل العملية ويمكنك العودة إلى محادثة المتجر.'
              : failed
                ? 'يمكنك المحاولة مجدداً من رابط الدفع أو التواصل مع المتجر.'
                : query.isError
                  ? 'تعذر تحديث الحالة مؤقتًا؛ سنحاول تلقائيًا، فلا تُعد الدفع الآن.'
                  : timedOut
                    ? 'ما زلنا ننتظر إشعار Tap الموقّع. احتفظ بالإيصال وتواصل مع المتجر قبل إعادة الدفع.'
                    : 'ننتظر تأكيد القبض من Tap؛ الحجز المبدئي وحده لا يُعد دفعًا ناجحًا.'}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
