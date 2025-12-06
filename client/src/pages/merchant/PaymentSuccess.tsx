import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";

export default function PaymentSuccess() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split('?')[1]);
  const subscriptionId = parseInt(params.get('subscriptionId') || '0');
  const transactionId = params.get('tap_id') || params.get('token') || '';
  
  const [verified, setVerified] = useState(false);
  const verifyMutation = trpc.payments.verifyPayment.useMutation({
    onSuccess: () => {
      setVerified(true);
    },
  });

  useEffect(() => {
    if (subscriptionId && transactionId && !verified) {
      verifyMutation.mutate({
        subscriptionId,
        transactionId,
      });
    }
  }, [subscriptionId, transactionId]);

  if (verifyMutation.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <Loader2 className="h-16 w-16 animate-spin mx-auto text-primary" />
            <h2 className="text-2xl font-bold">جاري التحقق من الدفع...</h2>
            <p className="text-muted-foreground">
              الرجاء الانتظار بينما نتحقق من عملية الدفع
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-6">
          <div className="bg-green-100 dark:bg-green-950 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-2">تم الدفع بنجاح!</h2>
            <p className="text-muted-foreground">
              تم تفعيل اشتراكك بنجاح. يمكنك الآن الاستمتاع بجميع ميزات الباقة.
            </p>
          </div>

          <div className="bg-muted p-4 rounded-lg text-right">
            <p className="text-sm text-muted-foreground mb-2">رقم الاشتراك</p>
            <p className="font-mono font-bold">#{subscriptionId}</p>
          </div>

          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => setLocation('/merchant/subscriptions')}
            >
              عرض الاشتراكات
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation('/merchant/dashboard')}
            >
              العودة إلى لوحة التحكم
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            سيتم إرسال فاتورة إلكترونية إلى بريدك الإلكتروني
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
