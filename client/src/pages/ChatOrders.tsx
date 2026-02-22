import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  ShoppingCart, 
  Package, 
  Truck, 
  CheckCircle2, 
  XCircle,
  Clock,
  Gift,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, type Currency } from '@shared/currency';
import { useTranslation } from 'react-i18next';
export default function ChatOrders() {
  const { t } = useTranslation();

  const [selectedMerchantId] = useState(1); // TODO: Get from context
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const { data: merchant } = trpc.merchant.get.useQuery();
  const merchantCurrency = (merchant?.currency as Currency) || 'SAR';

  const { data: orders, isLoading, refetch } = trpc.orders.listByMerchant.useQuery({
    merchantId: selectedMerchantId
  });

  const updateStatusMutation = trpc.orders.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(t('toast.orders.msg1'));
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل تحديث حالة الطلب');
    }
  });

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: 'قيد الانتظار', variant: 'secondary' as const, icon: Clock },
      paid: { label: 'مدفوع', variant: 'default' as const, icon: CheckCircle2 },
      processing: { label: 'قيد المعالجة', variant: 'default' as const, icon: Package },
      shipped: { label: 'تم الشحن', variant: 'default' as const, icon: Truck },
      delivered: { label: 'تم التوصيل', variant: 'default' as const, icon: CheckCircle2 },
      cancelled: { label: 'ملغي', variant: 'destructive' as const, icon: XCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const handleStatusChange = (orderId: number, newStatus: string) => {
    updateStatusMutation.mutate({
      orderId,
      status: newStatus as any
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">{t('chatOrdersPage.text0')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('chatOrdersPage.text1')}</h1>
        <p className="text-muted-foreground">
          جميع الطلبات التي تم إنشاؤها من محادثات الواتساب
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('chatOrdersPage.text2')}</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('chatOrdersPage.text3')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {orders?.filter(o => o.status === 'pending').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('chatOrdersPage.text4')}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {orders?.filter(o => o.status === 'delivered').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('chatOrdersPage.text5')}</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {orders?.filter(o => o.isGift).length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('chatOrdersPage.text6')}</CardTitle>
          <CardDescription>
            جميع الطلبات مرتبة حسب الأحدث
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!orders || orders.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('chatOrdersPage.text7')}</h3>
              <p className="text-muted-foreground">
                عندما يقوم العملاء بالطلب عبر الواتساب، ستظهر الطلبات هنا
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('chatOrdersPage.text8')}</TableHead>
                  <TableHead>{t('chatOrdersPage.text9')}</TableHead>
                  <TableHead>{t('chatOrdersPage.text10')}</TableHead>
                  <TableHead>{t('chatOrdersPage.text11')}</TableHead>
                  <TableHead>{t('chatOrdersPage.text12')}</TableHead>
                  <TableHead>{t('chatOrdersPage.text13')}</TableHead>
                  <TableHead>{t('chatOrdersPage.text14')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      {order.orderNumber || `#${order.id}`}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{order.customerName}</div>
                        <div className="text-sm text-muted-foreground">{order.customerPhone}</div>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(order.totalAmount, merchantCurrency, 'ar-SA')}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(order.status)}
                    </TableCell>
                    <TableCell>
                      {order.isGift ? (
                        <Badge variant="secondary" className="gap-1">
                          <Gift className="w-3 h-3" />
                          هدية
                        </Badge>
                      ) : (
                        <Badge variant="outline">{t('chatOrdersPage.text15')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString('ar-SA', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={order.status}
                          onValueChange={(value) => handleStatusChange(order.id, value)}
                        >
                          <SelectTrigger className="w-[140px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">{t('chatOrdersPage.text16')}</SelectItem>
                            <SelectItem value="paid">{t('chatOrdersPage.text17')}</SelectItem>
                            <SelectItem value="processing">{t('chatOrdersPage.text18')}</SelectItem>
                            <SelectItem value="shipped">{t('chatOrdersPage.text19')}</SelectItem>
                            <SelectItem value="delivered">{t('chatOrdersPage.text20')}</SelectItem>
                            <SelectItem value="cancelled">{t('chatOrdersPage.text21')}</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        {order.paymentUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(order.paymentUrl || '', '_blank')}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Order Details Modal */}
      {selectedOrderId && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t('chatOrdersPage.text22')}</CardTitle>
          </CardHeader>
          <CardContent>
            {/* TODO: Add order details */}
            <p>تفاصيل الطلب #{selectedOrderId}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
