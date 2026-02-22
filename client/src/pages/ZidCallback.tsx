import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ZidCallback() {
  const [, navigate] = useLocation();
  const [, params] = useRoute('/merchant/zid/callback');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('جاري معالجة الاتصال...');

  const handleCallbackMutation = trpc.zid.handleCallback.useMutation({
    onSuccess: () => {
      setStatus('success');
      setMessage('تم ربط Zid بنجاح!');
      setTimeout(() => {
        navigate('/merchant/zid/settings');
      }, 2000);
    },
    onError: (error: any) => {
      setStatus('error');
      setMessage(error.message || 'فشل في ربط Zid');
    },
  });

  useEffect(() => {
    const processCallback = async () => {
      // Get code from URL
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');

      if (!code) {
        setStatus('error');
        setMessage('رمز التفويض غير موجود');
        return;
      }

      // Get stored credentials
      const clientId = sessionStorage.getItem('zid_client_id');
      const clientSecret = sessionStorage.getItem('zid_client_secret');
      const redirectUri = sessionStorage.getItem('zid_redirect_uri');

      if (!clientId || !clientSecret || !redirectUri) {
        setStatus('error');
        setMessage('بيانات الاتصال غير موجودة أو انتهت صلاحية الجلسة. يرجى البدء من صفحة الإعدادات.');
        return;
      }

      // Clear session storage
      sessionStorage.removeItem('zid_client_id');
      sessionStorage.removeItem('zid_client_secret');
      sessionStorage.removeItem('zid_redirect_uri');

      // Handle callback
      handleCallbackMutation.mutate({
        code,
        clientId,
        clientSecret,
        redirectUri,
      });
    };

    processCallback();
  }, []);

  return (
    <div className="container mx-auto py-16">
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {status === 'loading' && (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  جاري المعالجة
                </>
              )}
              {status === 'success' && (
                <>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  نجح الاتصال
                </>
              )}
              {status === 'error' && (
                <>
                  <XCircle className="w-5 h-5 text-red-500" />
                  فشل الاتصال
                </>
              )}
            </CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent>
            {status === 'loading' && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
              </div>
            )}
            {status === 'success' && (
              <div className="space-y-4">
                <p className="text-center text-muted-foreground">
                  سيتم توجيهك إلى صفحة الإعدادات...
                </p>
              </div>
            )}
            {status === 'error' && (
              <div className="space-y-4">
                <p className="text-center text-muted-foreground">
                  حدث خطأ أثناء ربط Zid. يرجى المحاولة مرة أخرى.
                </p>
                <Button
                  onClick={() => navigate('/merchant/zid/settings')}
                  className="w-full"
                >
                  العودة إلى الإعدادات
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
