import { FormEvent, useState } from 'react';
import { useParams } from 'wouter';
import { CreditCard, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function PaymentLinkCheckout() {
  const { linkId = '' } = useParams<{ linkId: string }>();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const linkQuery = trpc.payments.getPublicLink.useQuery({ linkId }, { retry: false });
  const checkout = trpc.payments.checkoutLink.useMutation({
    onSuccess: ({ paymentUrl }) => window.location.assign(paymentUrl),
    onError: error => toast.error(error.message),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    checkout.mutate({
      linkId,
      customerName,
      customerPhone,
      customerEmail: customerEmail || undefined,
    });
  };

  if (linkQuery.isLoading) {
    return <CenteredState icon={<Loader2 className="h-8 w-8 animate-spin" />} title="جاري تحميل رابط الدفع…" />;
  }

  if (linkQuery.error || !linkQuery.data) {
    return <CenteredState title="رابط الدفع غير موجود" description="تحقق من الرابط أو اطلب رابطاً جديداً من المتجر." />;
  }

  const link = linkQuery.data;
  if (!link.available) {
    return <CenteredState title="رابط الدفع غير متاح" description="انتهت صلاحية الرابط أو تم تعطيله. اطلب رابطاً جديداً من المتجر." />;
  }

  return (
    <main dir="rtl" className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-lg space-y-5">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <CreditCard className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">دفع آمن عبر ساري</h1>
          <p className="mt-1 text-sm text-muted-foreground">سيتم تحويلك إلى بوابة Tap لإتمام الدفع.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{link.title}</CardTitle>
            {link.description && <CardDescription>{link.description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl bg-muted p-4 text-center">
              <p className="text-sm text-muted-foreground">المبلغ المطلوب</p>
              <p className="mt-1 text-3xl font-bold">{(link.amount / 100).toFixed(2)} {link.currency}</p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer-name">الاسم</Label>
                <Input id="customer-name" autoComplete="name" required minLength={2} maxLength={120} value={customerName} onChange={e => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-phone">رقم الجوال السعودي</Label>
                <Input id="customer-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="05xxxxxxxx" required minLength={9} maxLength={20} value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-email">البريد الإلكتروني (اختياري)</Label>
                <Input id="customer-email" type="email" autoComplete="email" maxLength={255} value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={checkout.isPending}>
                {checkout.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="ml-2 h-4 w-4" />}
                المتابعة إلى الدفع
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          لا يحفظ ساري بيانات بطاقتك البنكية
        </div>
      </div>
    </main>
  );
}

function CenteredState({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: string }) {
  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="space-y-3 pt-8 pb-8">
          {icon && <div className="flex justify-center text-primary">{icon}</div>}
          <h1 className="text-xl font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </CardContent>
      </Card>
    </main>
  );
}

