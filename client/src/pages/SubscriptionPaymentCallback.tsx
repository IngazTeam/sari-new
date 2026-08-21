import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type CallbackStatus = 'processing' | 'success' | 'failed';

export default function SubscriptionPaymentCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<CallbackStatus>('processing');
  const [message, setMessage] = useState('جاري التحقق من عملية الدفع…');
  const tapId = useMemo(() => new URLSearchParams(window.location.search).get('tap_id'), []);
  const callback = trpc.payment.handlePaymentCallback.useMutation({
    onSuccess: data => {
      if (data.success && data.status === 'completed') {
        setStatus('success');
        setMessage('تم الدفع وتفعيل الاشتراك بنجاح.');
        window.setTimeout(() => setLocation('/merchant/dashboard'), 3000);
      } else {
        setStatus('failed');
        setMessage('لم تكتمل عملية الدفع. يمكنك المحاولة مرة أخرى.');
      }
    },
    onError: error => {
      setStatus('failed');
      setMessage(error.message || 'تعذر التحقق من عملية الدفع.');
    },
  });

  useEffect(() => {
    if (!tapId) {
      setStatus('failed');
      setMessage('معرّف عملية الدفع مفقود.');
      return;
    }
    callback.mutate({ tap_id: tapId });
    // Run once for the immutable provider reference in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tapId]);

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="space-y-5 pt-10 pb-10">
          <div className="flex justify-center">
            {status === 'processing' && <Loader2 className="h-12 w-12 animate-spin text-primary" />}
            {status === 'success' && <CheckCircle2 className="h-12 w-12 text-emerald-600" />}
            {status === 'failed' && <XCircle className="h-12 w-12 text-destructive" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {status === 'processing' ? 'تأكيد الدفع' : status === 'success' ? 'اكتملت العملية' : 'تعذر إكمال العملية'}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          </div>
          {status === 'failed' && (
            <Button variant="outline" onClick={() => setLocation('/pricing')}>
              <ArrowRight className="ml-2 h-4 w-4" />
              العودة إلى الباقات
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

