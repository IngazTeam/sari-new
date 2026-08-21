import { useMemo } from 'react';
import { CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent } from '@/components/ui/card';

const successStatuses = new Set(['captured', 'authorized']);
const failureStatuses = new Set(['failed', 'cancelled', 'refunded']);

export default function PaymentReturn() {
  const chargeId = useMemo(() => new URLSearchParams(window.location.search).get('tap_id') || '', []);
  const query = trpc.payments.getPublicChargeStatus.useQuery(
    { chargeId },
    {
      enabled: Boolean(chargeId),
      retry: false,
      refetchInterval: current => {
        const status = current.state.data?.status;
        return status && (successStatuses.has(status) || failureStatuses.has(status)) ? false : 2000;
      },
    },
  );
  const status = query.data?.status;
  const succeeded = Boolean(status && successStatuses.has(status));
  const failed = Boolean(status && failureStatuses.has(status));

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="space-y-4 pt-10 pb-10">
          <div className="flex justify-center">
            {succeeded ? <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              : failed || query.error || !chargeId ? <XCircle className="h-12 w-12 text-destructive" />
                : status === 'pending' ? <Clock3 className="h-12 w-12 text-amber-500" />
                  : <Loader2 className="h-12 w-12 animate-spin text-primary" />}
          </div>
          <h1 className="text-2xl font-bold">
            {succeeded ? 'تم الدفع بنجاح'
              : failed ? 'لم تكتمل عملية الدفع'
                : query.error || !chargeId ? 'تعذر التحقق من العملية'
                  : 'جاري تأكيد عملية الدفع'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {succeeded
              ? 'تم تسجيل العملية ويمكنك العودة إلى محادثة المتجر.'
              : failed
                ? 'يمكنك المحاولة مجدداً من رابط الدفع أو التواصل مع المتجر.'
                : 'لا تغلق الصفحة حتى تظهر النتيجة النهائية.'}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

