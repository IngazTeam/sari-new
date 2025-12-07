import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShoppingCart, TrendingUp, Send, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';
export default function AbandonedCartsPage() {
  const { t } = useTranslation();

  const { user } = useAuth();
  const [selectedCart, setSelectedCart] = useState<number | null>(null);

  // Get merchant
  const { data: merchant } = trpc.merchants.getCurrent.useQuery();

  // Get abandoned carts
  const { data: carts = [], refetch: refetchCarts } = trpc.abandonedCarts.list.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Get statistics
  const { data: stats } = trpc.abandonedCarts.getStats.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Send reminder mutation
  const sendReminderMutation = trpc.abandonedCarts.sendReminder.useMutation({
    onSuccess: () => {
      toast.success(t('toast.carts.msg1'));
      refetchCarts();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Mark as recovered mutation
  const markRecoveredMutation = trpc.abandonedCarts.markRecovered.useMutation({
    onSuccess: () => {
      toast.success(t('toast.common.msg1'));
      refetchCarts();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSendReminder = (cartId: number) => {
    setSelectedCart(cartId);
    sendReminderMutation.mutate({ cartId });
  };

  const handleMarkRecovered = (cartId: number) => {
    markRecoveredMutation.mutate({ cartId });
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">السلال المهجورة</h1>
        <p className="text-muted-foreground">
          تتبع السلال المهجورة وأرسل تذكيرات للعملاء لإكمال طلباتهم
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي السلال المهجورة</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalAbandoned || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">التذكيرات المرسلة</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.remindersSent || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">السلال المستعادة</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.recovered || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              معدل الاستعادة: {stats?.recoveryRate || 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">القيمة المستعادة</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalRecoveredValue || 0} ريال</div>
          </CardContent>
        </Card>
      </div>

      {/* Abandoned Carts Table */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة السلال المهجورة</CardTitle>
          <CardDescription>
            عرض جميع السلال المهجورة مع إمكانية إرسال تذكيرات
          </CardDescription>
        </CardHeader>
        <CardContent>
          {carts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>لا توجد سلال مهجورة حالياً</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الهاتف</TableHead>
                  <TableHead>اسم العميل</TableHead>
                  <TableHead>المنتجات</TableHead>
                  <TableHead>الإجمالي</TableHead>
                  <TableHead>تاريخ الإنشاء</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carts.map((cart) => {
                  const items = JSON.parse(cart.items);
                  return (
                    <TableRow key={cart.id}>
                      <TableCell className="font-medium">{cart.customerPhone}</TableCell>
                      <TableCell>{cart.customerName || '-'}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {items.map((item: any, idx: number) => (
                            <div key={idx}>
                              {item.productName} (x{item.quantity})
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{cart.totalAmount} ريال</TableCell>
                      <TableCell className="text-sm">{formatDate(cart.createdAt)}</TableCell>
                      <TableCell>
                        {cart.recovered ? (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle2 className="h-3 w-3 ml-1" />
                            مستعادة
                          </Badge>
                        ) : cart.reminderSent ? (
                          <Badge variant="secondary">
                            <Send className="h-3 w-3 ml-1" />
                            تم إرسال التذكير
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Clock className="h-3 w-3 ml-1" />
                            قيد الانتظار
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {!cart.recovered && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSendReminder(cart.id)}
                                disabled={sendReminderMutation.isPending && selectedCart === cart.id}
                              >
                                <Send className="h-4 w-4 ml-1" />
                                {cart.reminderSent ? 'إعادة إرسال' : 'إرسال تذكير'}
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleMarkRecovered(cart.id)}
                                disabled={markRecoveredMutation.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4 ml-1" />
                                تم الاستعادة
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tips Section */}
      <Card>
        <CardHeader>
          <CardTitle>نصائح لتحسين معدل الاستعادة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="bg-primary/20 text-primary rounded-full p-1 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <p className="text-sm">
              <strong>أرسل التذكير في الوقت المناسب:</strong> أفضل وقت هو بعد 24 ساعة من آخر نشاط
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className="bg-primary/20 text-primary rounded-full p-1 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <p className="text-sm">
              <strong>استخدم كودات الخصم:</strong> النظام يرسل تلقائياً كود خصم 10% مع كل تذكير
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className="bg-primary/20 text-primary rounded-full p-1 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <p className="text-sm">
              <strong>تابع الأداء:</strong> راقب معدل الاستعادة وحسّن استراتيجيتك
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className="bg-primary/20 text-primary rounded-full p-1 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <p className="text-sm">
              <strong>لا تُكثر من التذكيرات:</strong> تذكير واحد لكل سلة يكفي لتجنب إزعاج العملاء
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
