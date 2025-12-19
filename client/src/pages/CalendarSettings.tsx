import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, CheckCircle2, AlertCircle, ExternalLink, Unlink } from "lucide-react";
import { toast } from "sonner";

export default function CalendarSettings() {
  const [isConnecting, setIsConnecting] = useState(false);
  
  const { data: status, isLoading, refetch } = trpc.calendar.getStatus.useQuery();
  const disconnectMutation = trpc.calendar.disconnect.useMutation({
    onSuccess: () => {
      toast.success("تم فصل Google Calendar بنجاح");
      refetch();
    },
    onError: (error) => {
      toast.error(`فشل فصل الاتصال: ${error.message}`);
    }
  });

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      const result = await trpc.calendar.getAuthUrl.query();
      
      // فتح نافذة OAuth في نافذة جديدة
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const authWindow = window.open(
        result.authUrl,
        'GoogleCalendarAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // مراقبة إغلاق النافذة
      const checkWindow = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(checkWindow);
          setIsConnecting(false);
          // تحديث الحالة بعد إغلاق النافذة
          setTimeout(() => refetch(), 1000);
        }
      }, 500);
    } catch (error: any) {
      toast.error(`فشل الاتصال: ${error.message}`);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    if (confirm("هل أنت متأكد من فصل Google Calendar؟ سيتم إلغاء جميع المواعيد المستقبلية.")) {
      disconnectMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">إعدادات Google Calendar</h1>
        <p className="text-muted-foreground">
          قم بربط حسابك في Google Calendar لإدارة المواعيد تلقائياً
        </p>
      </div>

      {/* حالة الاتصال */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                حالة الاتصال
              </CardTitle>
              <CardDescription>
                {status?.connected 
                  ? "متصل بـ Google Calendar" 
                  : "غير متصل - قم بربط حسابك للبدء"}
              </CardDescription>
            </div>
            {status?.connected ? (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle2 className="h-4 w-4 mr-1" />
                متصل
              </Badge>
            ) : (
              <Badge variant="secondary">
                <AlertCircle className="h-4 w-4 mr-1" />
                غير متصل
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {status?.connected ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">البريد الإلكتروني</p>
                  <p className="font-medium">{status.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">تاريخ الربط</p>
                  <p className="font-medium">
                    {new Date(status.connectedAt!).toLocaleDateString('ar-SA')}
                  </p>
                </div>
              </div>
              
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  سيتم مزامنة جميع المواعيد تلقائياً مع Google Calendar الخاص بك
                </AlertDescription>
              </Alert>

              <Button 
                variant="destructive" 
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    جاري الفصل...
                  </>
                ) : (
                  <>
                    <Unlink className="h-4 w-4 mr-2" />
                    فصل الاتصال
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  قم بربط حسابك في Google Calendar لتمكين:
                  <ul className="list-disc list-inside mt-2 mr-4">
                    <li>المزامنة التلقائية للمواعيد</li>
                    <li>منع الحجز المزدوج</li>
                    <li>التذكيرات التلقائية</li>
                    <li>إدارة المواعيد من تطبيق Google Calendar</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <Button 
                onClick={handleConnect} 
                disabled={isConnecting}
                size="lg"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    جاري الاتصال...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    ربط Google Calendar
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* إعدادات التذكيرات */}
      {status?.connected && (
        <Card>
          <CardHeader>
            <CardTitle>إعدادات التذكيرات</CardTitle>
            <CardDescription>
              سيتم إرسال تذكيرات تلقائية عبر WhatsApp للعملاء
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">تذكير قبل 24 ساعة</p>
                  <p className="text-sm text-muted-foreground">
                    يتم الإرسال قبل يوم من الموعد
                  </p>
                </div>
                <Badge variant="outline" className="bg-green-50">مفعّل</Badge>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">تذكير قبل 1 ساعة</p>
                  <p className="text-sm text-muted-foreground">
                    يتم الإرسال قبل ساعة من الموعد
                  </p>
                </div>
                <Badge variant="outline" className="bg-green-50">مفعّل</Badge>
              </div>

              <Alert>
                <AlertDescription className="text-sm">
                  💡 نصيحة: التذكيرات تساعد على تقليل نسبة عدم الحضور بنسبة تصل إلى 40%
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
