import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { 
  Package, 
  Search, 
  Filter, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Truck,
  ShoppingBag,
  TrendingUp
} from 'lucide-react';

export default function Orders() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isUpdateStatusOpen, setIsUpdateStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [trackingNumber, setTrackingNumber] = useState('');

  // Get merchant
  const { data: merchant } = trpc.merchants.getCurrent.useQuery(
    undefined,
    { enabled: !!user }
  );

  // Get orders with filters
  const { data: orders, isLoading, refetch } = trpc.orders.getWithFilters.useQuery(
    {
      merchantId: merchant?.id || 0,
      status: statusFilter !== 'all' ? statusFilter as any : undefined,
      searchQuery: searchQuery || undefined,
    },
    { enabled: !!merchant }
  );

  // Get order stats
  const { data: stats } = trpc.orders.getStats.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Update status mutation
  const updateStatusMutation = trpc.orders.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(t('toast.orders.msg2'));
      setIsUpdateStatusOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل تحديث الحالة');
    },
  });

  // Cancel order mutation
  const cancelOrderMutation = trpc.orders.cancel.useMutation({
    onSuccess: () => {
      toast.success(t('toast.orders.msg5'));
      setIsDetailsOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل إلغاء الطلب');
    },
  });

  const handleUpdateStatus = () => {
    if (!selectedOrder || !newStatus) return;

    updateStatusMutation.mutate({
      orderId: selectedOrder.id,
      status: newStatus as any,
      trackingNumber: trackingNumber || undefined,
    });
  };

  const handleCancelOrder = () => {
    if (!selectedOrder) return;

    cancelOrderMutation.mutate({
      orderId: selectedOrder.id,
      reason: 'تم الإلغاء من لوحة التحكم',
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: any; icon: any }> = {
      pending: { label: 'معلق', variant: 'secondary', icon: Clock },
      paid: { label: 'مدفوع', variant: 'default', icon: CheckCircle },
      processing: { label: 'قيد التنفيذ', variant: 'default', icon: Package },
      shipped: { label: 'تم الشحن', variant: 'default', icon: Truck },
      delivered: { label: 'تم التسليم', variant: 'default', icon: CheckCircle },
      cancelled: { label: 'ملغي', variant: 'destructive', icon: XCircle },
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ar-SA', {
      style: 'currency',
      currency: 'SAR',
    }).format(price);
  };

  if (isLoading) {
    return (
      <div className="container py-8 space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">إدارة الطلبات</h1>
        <p className="text-muted-foreground">
          تتبع وإدارة جميع طلبات عملائك
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الطلبات</CardTitle>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">معلقة</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">قيد التنفيذ</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.processing}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">مكتملة</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الإيرادات</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(stats.totalRevenue)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>الطلبات</CardTitle>
          <CardDescription>ابحث وفلتر الطلبات</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث برقم الطلب، اسم العميل، أو رقم الجوال..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <Filter className="w-4 h-4 ml-2" />
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="pending">معلق</SelectItem>
                <SelectItem value="paid">مدفوع</SelectItem>
                <SelectItem value="processing">قيد التنفيذ</SelectItem>
                <SelectItem value="shipped">تم الشحن</SelectItem>
                <SelectItem value="delivered">تم التسليم</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-right p-4 font-medium">رقم الطلب</th>
                  <th className="text-right p-4 font-medium">العميل</th>
                  <th className="text-right p-4 font-medium">رقم الجوال</th>
                  <th className="text-right p-4 font-medium">المبلغ</th>
                  <th className="text-right p-4 font-medium">الحالة</th>
                  <th className="text-right p-4 font-medium">التاريخ</th>
                  <th className="text-right p-4 font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {orders && orders.length > 0 ? (
                  orders.map((order) => (
                    <tr key={order.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-medium">{order.orderNumber || `ORD-${order.id}`}</td>
                      <td className="p-4">{order.customerName}</td>
                      <td className="p-4 text-muted-foreground">{order.customerPhone}</td>
                      <td className="p-4 font-medium">{formatPrice(order.totalAmount)}</td>
                      <td className="p-4">{getStatusBadge(order.status)}</td>
                      <td className="p-4 text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="p-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedOrder(order);
                            setIsDetailsOpen(true);
                          }}
                        >
                          <Eye className="w-4 h-4 ml-2" />
                          عرض
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>لا توجد طلبات</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Order Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل الطلب {selectedOrder?.orderNumber || `ORD-${selectedOrder?.id}`}</DialogTitle>
            <DialogDescription>
              تاريخ الطلب: {selectedOrder && new Date(selectedOrder.createdAt).toLocaleString('ar-SA')}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              {/* Customer Info */}
              <div>
                <h3 className="font-semibold mb-3">معلومات العميل</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">الاسم:</span>
                    <p className="font-medium">{selectedOrder.customerName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">رقم الجوال:</span>
                    <p className="font-medium">{selectedOrder.customerPhone}</p>
                  </div>
                  {selectedOrder.customerEmail && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">البريد الإلكتروني:</span>
                      <p className="font-medium">{selectedOrder.customerEmail}</p>
                    </div>
                  )}
                  {selectedOrder.address && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">العنوان:</span>
                      <p className="font-medium">{selectedOrder.address}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Items */}
              <div>
                <h3 className="font-semibold mb-3">المنتجات</h3>
                <div className="space-y-2">
                  {JSON.parse(selectedOrder.items).map((item: any, index: number) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">الكمية: {item.quantity}</p>
                      </div>
                      <p className="font-medium">{formatPrice(item.price * item.quantity)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Summary */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>الإجمالي:</span>
                  <span>{formatPrice(selectedOrder.totalAmount)}</span>
                </div>
              </div>

              {/* Status & Tracking */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">الحالة:</span>
                  <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
                </div>
                {selectedOrder.trackingNumber && (
                  <div>
                    <span className="text-sm text-muted-foreground">رقم التتبع:</span>
                    <p className="font-medium mt-1">{selectedOrder.trackingNumber}</p>
                  </div>
                )}
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div>
                  <span className="text-sm text-muted-foreground">ملاحظات:</span>
                  <p className="mt-1">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={() => {
                    setNewStatus(selectedOrder.status);
                    setTrackingNumber(selectedOrder.trackingNumber || '');
                    setIsUpdateStatusOpen(true);
                  }}
                  disabled={selectedOrder.status === 'cancelled' || selectedOrder.status === 'delivered'}
                  className="flex-1"
                >
                  تحديث الحالة
                </Button>
                {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'delivered' && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (confirm('هل أنت متأكد من إلغاء هذا الطلب؟')) {
                        handleCancelOrder();
                      }
                    }}
                  >
                    إلغاء الطلب
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={isUpdateStatusOpen} onOpenChange={setIsUpdateStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تحديث حالة الطلب</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>الحالة الجديدة</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">معلق</SelectItem>
                  <SelectItem value="paid">مدفوع</SelectItem>
                  <SelectItem value="processing">قيد التنفيذ</SelectItem>
                  <SelectItem value="shipped">تم الشحن</SelectItem>
                  <SelectItem value="delivered">تم التسليم</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(newStatus === 'shipped' || newStatus === 'delivered') && (
              <div>
                <Label>رقم التتبع (اختياري)</Label>
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="أدخل رقم التتبع"
                />
              </div>
            )}

            <Button
              onClick={handleUpdateStatus}
              disabled={!newStatus || updateStatusMutation.isPending}
              className="w-full"
            >
              {updateStatusMutation.isPending ? 'جاري التحديث...' : 'تحديث'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
