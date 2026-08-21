import { useMemo } from 'react';
import { useParams } from 'wouter';
import { CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const successStatuses = new Set(['captured', 'authorized']);
const failureStatuses = new Set(['failed', 'cancelled', 'refunded']);

export default function PaymentLinkStatus() {
  const { linkId = '' } = useParams<{ linkId: string }>();
  const chargeId = useMemo(() => new URLSearchParams(window.location.search).get('tap_id') || '', []);
  const statusQuery = trpc.payments.getPublicLinkPaymentStatus.useQuery(
    { linkId, chargeId },
    {
      enabled: Boolean(linkId && chargeId),
      retry: false,
      refetchInterval: query => {
        const status = query.state.data?.status;
        return status && (successStatuses.has(status) || failureStatuses.has(status)) ? false : 2000;
      },
    },
  );

  let icon = <Loader2 className="h-12 w-12 animate-spin text-primary" />;
  let title = 'جاري تأكيد عملية الدفع';
  let description = 'لا تغلق الصفحة حتى تظهر النتيجة النهائية.';

  if (!chargeId || statusQuery.error) {
    icon = <XCircle className="h-12 w-12 text-destructive" />;
    title = 'تعذر التحقق من العملية';
    description = 'احتفظ بإيصال Tap وتواصل مع المتجر للتأكد.';
  } else if (statusQuery.data && successStatuses.has(statusQuery.data.status)) {
    icon = <CheckCircle2 className="h-12 w-12 text-emerald-600" />;
    title = 'تم استلام الدفع بنجاح';
    description = 'يمكنك الآن إغلاق هذه الصفحة والعودة إلى المحادثة.';
  } else if (statusQuery.data && failureStatuses.has(statusQuery.data.status)) {
    icon = <XCircle className="h-12 w-12 text-destructive" />;
    title = 'لم تكتمل عملية الدفع';
    description = 'يمكنك العودة إلى الرابط والمحاولة مرة أخرى أو التواصل مع المتجر.';
  } else if (statusQuery.data?.status === 'pending') {
    icon = <Clock3 className="h-12 w-12 text-amber-500" />;
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
          {failureStatuses.has(statusQuery.data?.status || '') && (
            <Button onClick={() => window.location.assign(`/pay/${encodeURIComponent(linkId)}`)}>المحاولة مرة أخرى</Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

