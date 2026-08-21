import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { AlertCircle, CheckCircle2, Loader2, UserPlus } from 'lucide-react';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';

type InviteState = 'loading' | 'ready' | 'accepted' | 'error';

export default function AcceptInvite() {
  const started = useRef(false);
  const [token, setToken] = useState('');
  const [state, setState] = useState<InviteState>('loading');
  const [message, setMessage] = useState('');
  const [invitation, setInvitation] = useState<{ merchantName: string; roleInfo?: { label?: string } } | null>(null);
  const { data: user, isLoading: userLoading } = trpc.auth.me.useQuery(undefined, { retry: false });
  const inspectMutation = trpc.team.acceptInvite.useMutation({
    onSuccess: data => {
      setInvitation(data);
      setState('ready');
    },
    onError: () => {
      setMessage('الدعوة غير صالحة أو منتهية. اطلب من مدير المتجر إرسال دعوة جديدة.');
      setState('error');
    },
  });
  const confirmMutation = trpc.team.confirmInvite.useMutation({
    onSuccess: () => setState('accepted'),
    onError: error => {
      setMessage(error.message || 'تعذر قبول الدعوة.');
      setState('error');
    },
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const candidate = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    if (!/^[a-f0-9]{64}$/i.test(candidate)) {
      setMessage('رابط الدعوة غير مكتمل أو غير صالح.');
      setState('error');
      return;
    }
    setToken(candidate);
    inspectMutation.mutate({ token: candidate });
  }, [inspectMutation]);

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Navbar />
      <main className="flex-1 flex items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              {(state === 'loading' || userLoading) && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
              {state === 'ready' && <UserPlus className="h-8 w-8 text-primary" />}
              {state === 'accepted' && <CheckCircle2 className="h-8 w-8 text-green-600" />}
              {state === 'error' && <AlertCircle className="h-8 w-8 text-red-600" />}
            </div>
            <CardTitle>
              {state === 'loading' && 'جارٍ فحص الدعوة'}
              {state === 'ready' && 'دعوة للانضمام إلى فريق'}
              {state === 'accepted' && 'تم قبول الدعوة'}
              {state === 'error' && 'تعذر قبول الدعوة'}
            </CardTitle>
            <CardDescription>
              {state === 'ready' && invitation
                ? `${invitation.merchantName} — الصلاحية: ${invitation.roleInfo?.label || 'عضو فريق'}`
                : state === 'accepted'
                  ? 'أضيف حسابك إلى المتجر بنجاح.'
                  : 'تُقبل الدعوة فقط بالحساب الموثق الذي استلمها.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {state === 'error' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
            {state === 'ready' && !user && !userLoading && (
              <Alert>
                <AlertDescription>
                  سجل الدخول بالبريد الذي استلم الدعوة في نافذة أخرى، ثم عد إلى هذه الصفحة واضغط قبول.
                </AlertDescription>
              </Alert>
            )}
            {state === 'ready' && (
              <Button
                className="w-full"
                disabled={!user || confirmMutation.isPending}
                onClick={() => confirmMutation.mutate({ token })}
              >
                {confirmMutation.isPending ? 'جارٍ القبول...' : 'قبول الدعوة'}
              </Button>
            )}
            {state === 'ready' && !user && (
              <a href="/login" target="_blank" rel="noreferrer">
                <Button variant="outline" className="w-full">فتح تسجيل الدخول في نافذة جديدة</Button>
              </a>
            )}
            {state === 'accepted' && (
              <Link href="/merchant/dashboard"><Button className="w-full">فتح لوحة المتجر</Button></Link>
            )}
            {state === 'error' && (
              <Link href="/merchant/settings"><Button variant="outline" className="w-full">فتح إعدادات الحساب</Button></Link>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
