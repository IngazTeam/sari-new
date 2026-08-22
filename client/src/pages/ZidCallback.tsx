import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type CallbackStatus = 'loading' | 'success' | 'error';

export default function ZidCallback() {
  const [, navigate] = useLocation();
  const startedRef = useRef(false);
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [message, setMessage] = useState('جارٍ إكمال الربط الآمن مع زد...');

  const handleCallbackMutation = trpc.zid.handleOAuthCallback.useMutation({
    onSuccess: () => {
      setStatus('success');
      setMessage('تم ربط متجر زد بنجاح.');
      window.setTimeout(() => navigate('/merchant/zid/settings'), 2000);
    },
    onError: () => {
      setStatus('error');
      setMessage('تعذر إكمال الربط. أعد المحاولة من صفحة إعدادات زد.');
    },
  });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const providerError = urlParams.get('error');

    // OAuth authorization codes and state values must not remain in browser history.
    window.history.replaceState({}, document.title, window.location.pathname);

    if (providerError || !code || !state) {
      setStatus('error');
      setMessage('لم يكتمل تفويض زد. أعد المحاولة من صفحة الإعدادات.');
      return;
    }

    handleCallbackMutation.mutate({ code, state });
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
                  جارٍ ربط المتجر
                </>
              )}
              {status === 'success' && (
                <>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  اكتمل الربط
                </>
              )}
              {status === 'error' && (
                <>
                  <XCircle className="w-5 h-5 text-red-500" />
                  تعذر الربط
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
              <p className="text-center text-muted-foreground">سيتم تحويلك إلى إعدادات زد...</p>
            )}
            {status === 'error' && (
              <Button onClick={() => navigate('/merchant/zid/settings')} className="w-full">
                العودة إلى الإعدادات
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
