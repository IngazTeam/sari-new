import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function PaymentCancel() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split('?')[1]);
  const subscriptionId = params.get('subscriptionId');

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-6">
          <div className="bg-red-100 dark:bg-red-950 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
            <XCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-2">تم إلغاء الدفع</h2>
            <p className="text-muted-foreground">
              لم تكتمل عملية الدفع. لم يتم خصم أي مبلغ من حسابك.
            </p>
          </div>

          {subscriptionId && (
            <div className="bg-muted p-4 rounded-lg text-right">
              <p className="text-sm text-muted-foreground mb-2">رقم الطلب</p>
              <p className="font-mono font-bold">#{subscriptionId}</p>
            </div>
          )}

          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => setLocation('/merchant/subscriptions')}
            >
              المحاولة مرة أخرى
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation('/merchant/dashboard')}
            >
              العودة إلى لوحة التحكم
            </Button>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg text-right">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
              هل تحتاج مساعدة؟
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-300">
              يمكنك التواصل مع فريق الدعم الفني للمساعدة في إتمام عملية الاشتراك
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
