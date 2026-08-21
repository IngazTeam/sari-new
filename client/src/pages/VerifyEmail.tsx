import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';

type VerificationState = 'loading' | 'success' | 'error';

export default function VerifyEmail() {
  const started = useRef(false);
  const [state, setState] = useState<VerificationState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const verifyMutation = trpc.auth.emailVerification.verifyEmail.useMutation({
    onSuccess: () => setState('success'),
    onError: () => {
      setErrorMessage('رابط التحقق غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً من الإعدادات.');
      setState('error');
    },
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      setErrorMessage('رابط التحقق غير مكتمل أو غير صالح.');
      setState('error');
      return;
    }
    verifyMutation.mutate({ token });
  }, [verifyMutation]);

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Navbar />
      <main className="flex-1 flex items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              {state === 'loading' && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
              {state === 'success' && <CheckCircle2 className="h-8 w-8 text-green-600" />}
              {state === 'error' && <AlertCircle className="h-8 w-8 text-red-600" />}
            </div>
            <div>
              <CardTitle className="text-2xl">
                {state === 'loading' && 'جارٍ تأكيد البريد'}
                {state === 'success' && 'تم تأكيد البريد'}
                {state === 'error' && 'تعذر تأكيد البريد'}
              </CardTitle>
              <CardDescription className="mt-2">
                {state === 'loading' && 'لحظات ونكمل التحقق من ملكية بريدك الإلكتروني.'}
                {state === 'success' && 'أصبح بريد حسابك في ساري مؤكداً بنجاح.'}
                {state === 'error' && 'لم نتمكن من استخدام رابط التحقق.'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {state === 'error' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
            {state === 'success' && (
              <Alert className="border-green-200 bg-green-50">
                <MailCheck className="h-4 w-4 text-green-700" />
                <AlertDescription>يمكنك إغلاق هذه الصفحة أو العودة إلى لوحة التحكم.</AlertDescription>
              </Alert>
            )}
            {state !== 'loading' && (
              <Link href={state === 'success' ? '/merchant/dashboard' : '/merchant/settings'}>
                <Button className="w-full">
                  {state === 'success' ? 'العودة إلى لوحة التحكم' : 'فتح إعدادات الحساب'}
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
