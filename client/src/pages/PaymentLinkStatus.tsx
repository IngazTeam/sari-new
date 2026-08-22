import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'wouter';
import { CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PAYMENT_LINK_ID_PATTERN, TAP_CHARGE_ID_PATTERN } from '@shared/subscription-payment-status';

const MAX_LINK_STATUS_POLLS = 30;

export default function PaymentLinkStatus() {
  const { linkId = '' } = useParams<{ linkId: string }>();
  const [pollCount, setPollCount] = useState(0);
  const chargeId = useMemo(() => new URLSearchParams(window.location.search).get('tap_id') || '', []);
  const validReference = PAYMENT_LINK_ID_PATTERN.test(linkId) && TAP_CHARGE_ID_PATTERN.test(chargeId);
  const statusQuery = trpc.payments.getPublicLinkPaymentStatus.useQuery(
    { linkId, chargeId },
    {
      enabled: validReference,
      retry: false,
      refetchInterval: query => {
        const status = query.state.data?.status;
        return pollCount >= MAX_LINK_STATUS_POLLS || status === 'captured' || status === 'failed'
          ? false
          : 2000;
      },
      refetchIntervalInBackground: false,
    },
  );

  useEffect(() => {
    if (!statusQuery.dataUpdatedAt && !statusQuery.errorUpdatedAt) return;
    setPollCount(current => Math.min(current + 1, MAX_LINK_STATUS_POLLS));
  }, [statusQuery.dataUpdatedAt, statusQuery.errorUpdatedAt]);

  const succeeded = statusQuery.data?.status === 'captured';
  const failed = statusQuery.data?.status === 'failed' || !validReference;
  const timedOut = pollCount >= MAX_LINK_STATUS_POLLS && !succeeded && !failed;

  let icon = <Loader2 className="h-12 w-12 animate-spin text-primary" />;
  let title = 'جاري تأكيد عملية الدفع';
  let description = 'لا تغلق الصفحة حتى تظهر النتيجة النهائية.';

  if (failed) {
    icon = <XCircle className="h-12 w-12 text-destructive" />;
    title = 'لم تكتمل عملية الدفع';
    description = validReference
      ? 'يمكنك العودة إلى الرابط والمحاولة مرة أخرى أو التواصل مع المتجر.'
      : 'رابط تأكيد الدفع غير صالح.';
  } else if (succeeded) {
    icon = <CheckCircle2 className="h-12 w-12 text-emerald-600" />;
    title = 'تم استلام الدفع بنجاح';
    description = 'يمكنك الآن إغلاق هذه الصفحة والعودة إلى المحادثة.';
  } else if (timedOut || statusQuery.data?.status === 'processing') {
    icon = <Clock3 className="h-12 w-12 text-amber-500" />;
    title = timedOut ? 'الدفع قيد التأكيد' : title;
    description = statusQuery.isError
      ? 'تعذر تحديث الحالة مؤقتًا؛ سنحاول تلقائيًا، فلا تُعد الدفع الآن.'
      : timedOut
        ? 'احتفظ بإيصال Tap وتواصل مع المتجر قبل إعادة الدفع.'
        : 'ننتظر تأكيد القبض من Tap؛ الحجز المبدئي وحده لا يُعد دفعًا ناجحًا.';
  }

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="space-y-5 pt-10 pb-10">
          <div className="flex justify-center">{icon}</div>
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>
          {statusQuery.data?.status === 'failed' && (
            <Button onClick={() => window.location.assign(`/pay/${encodeURIComponent(linkId)}`)}>المحاولة مرة أخرى</Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
