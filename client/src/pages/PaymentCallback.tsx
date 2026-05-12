import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export default function PaymentCallback() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'processing' | 'success' | 'failed'>('processing');
  const [message, setMessage] = useState('جاري معالجة الدفع...');

  // Get tap_id from URL
  const searchParams = new URLSearchParams(window.location.search);
  const tapId = searchParams.get('tap_id');

  // Handle payment callback
  const handleCallbackMutation = trpc.payment.handlePaymentCallback.useMutation({
    onSuccess: (data) => {
      if (data.success && data.status === 'completed') {
        setStatus('success');
        setMessage('تم الدفع بنجاح! جاري تفعيل اشتراكك...');
        
        // Redirect to dashboard after 3 seconds
        setTimeout(() => {
          setLocation('/merchant/dashboard');
        }, 3000);
      } else {
        setStatus('failed');
        setMessage('فشلت عملية الدفع. الرجاء المحاولة مرة أخرى.');
      }
    },
    onError: (error) => {
      setStatus('failed');
      setMessage(error.message || 'حدث خطأ أثناء معالجة الدفع');
    },
  });

  useEffect(() => {
    if (tapId) {
      // Process payment callback
      handleCallbackMutation.mutate({ tap_id: tapId });
    } else {
      setStatus('failed');
      setMessage('معرف الدفع غير موجود');
    }
  }, [tapId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-background">
      <div className="container max-w-2xl">
        <Card className="border-2">
          <CardContent className="p-12 text-center space-y-6">
            {/* Icon */}
            <div className="flex justify-center">
              {status === 'processing' && (
                <Loader2 className="w-20 h-20 text-primary animate-spin" />
              )}
              {status === 'success' && (
                <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                  <CheckCircle2 className="w-12 h-12 text-green-600" />
                </div>
              )}
              {status === 'failed' && (
                <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                  <XCircle className="w-12 h-12 text-red-600" />
                </div>
              )}
            </div>

            {/* Title */}
            <div className="space-y-2">
              <h1 className="text-3xl font-bold">
                {status === 'processing' && 'جاري المعالجة'}
                {status === 'success' && 'تم بنجاح!'}
                {status === 'failed' && 'فشلت العملية'}
              </h1>
              <p className="text-lg text-muted-foreground">{message}</p>
            </div>

            {/* Additional Info */}
            {status === 'success' && (
              <div className="p-4 bg-green-50 dark:bg-green-900/10 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200">{t('paymentCallback.auto_0')}</p>
              </div>
            )}

            {status === 'failed' && (
              <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">{t('paymentCallback.auto_1')}</p>
              </div>
            )}

            {/* Actions */}
            {status === 'failed' && (
              <div className="flex gap-4 justify-center">
                <Button
                  variant="outline"
                  onClick={() => setLocation('/pricing')}
                >
                  العودة للباقات
                </Button>
                <Button onClick={() => setLocation('/subscribe')}>
                  إعادة المحاولة
                  <ArrowRight className="mr-2 w-4 h-4" />
                </Button>
              </div>
            )}

            {status === 'success' && (
              <Button onClick={() => setLocation('/merchant/dashboard')}>
                الانتقال إلى لوحة التحكم
                <ArrowRight className="mr-2 w-4 h-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
