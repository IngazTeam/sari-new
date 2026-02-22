import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { formatCurrency } from '@/../../shared/currency';
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
  const currency = merchant?.currency || 'SAR';

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
      toast.error(error.message || t('ordersPage.failedUpdateStatus'));
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
      toast.error(error.message || t('ordersPage.failedCancelOrder'));
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
      reason: t('ordersPage.cancelledFromDashboard'),
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: any; icon: any }> = {
      pending: { label: t('ordersPage.statusPending'), variant: 'secondary', icon: Clock },
      paid: { label: t('ordersPage.statusPaid'), variant: 'default', icon: CheckCircle },
      processing: { label: t('ordersPage.statusProcessing'), variant: 'default', icon: Package },
      shipped: { label: t('ordersPage.statusShipped'), variant: 'default', icon: Truck },
      delivered: { label: t('ordersPage.statusDelivered'), variant: 'default', icon: CheckCircle },
      cancelled: { label: t('ordersPage.statusCancelled'), variant: 'destructive', icon: XCircle },
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
    return formatCurrency(price, currency);
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
        <h1 className="text-3xl font-bold">{t('ordersPage.title')}</h1>
        <p className="text-muted-foreground">
          {t('ordersPage.description')}
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('ordersPage.totalOrders')}</CardTitle>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('ordersPage.pending')}</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('ordersPage.processing')}</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.processing}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('ordersPage.completed')}</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('ordersPage.totalRevenue')}</CardTitle>
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
          <CardTitle>{t('ordersPage.ordersTitle')}</CardTitle>
          <CardDescription>{t('ordersPage.ordersDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('ordersPage.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <Filter className="w-4 h-4 ml-2" />
                <SelectValue placeholder={t('ordersPage.statusFilter')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ordersPage.allStatuses')}</SelectItem>
                <SelectItem value="pending">{t('ordersPage.statusPending')}</SelectItem>
                <SelectItem value="paid">{t('ordersPage.statusPaid')}</SelectItem>
                <SelectItem value="processing">{t('ordersPage.statusProcessing')}</SelectItem>
                <SelectItem value="shipped">{t('ordersPage.statusShipped')}</SelectItem>
                <SelectItem value="delivered">{t('ordersPage.statusDelivered')}</SelectItem>
                <SelectItem value="cancelled">{t('ordersPage.statusCancelled')}</SelectItem>
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
                  <th className="text-right p-4 font-medium">{t('ordersPage.orderNumber')}</th>
                  <th className="text-right p-4 font-medium">{t('ordersPage.customer')}</th>
                  <th className="text-right p-4 font-medium">{t('ordersPage.phoneNumber')}</th>
                  <th className="text-right p-4 font-medium">{t('ordersPage.amount')}</th>
                  <th className="text-right p-4 font-medium">{t('ordersPage.status')}</th>
                  <th className="text-right p-4 font-medium">{t('ordersPage.date')}</th>
                  <th className="text-right p-4 font-medium">{t('ordersPage.actions')}</th>
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
                          {t('ordersPage.view')}
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>{t('ordersPage.noOrders')}</p>
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
            <DialogTitle>{t('ordersPage.orderDetails')} {selectedOrder?.orderNumber || `ORD-${selectedOrder?.id}`}</DialogTitle>
            <DialogDescription>
              {t('ordersPage.orderDate')}: {selectedOrder && new Date(selectedOrder.createdAt).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              {/* Customer Info */}
              <div>
                <h3 className="font-semibold mb-3">{t('ordersPage.customerInfo')}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('ordersPage.name')}:</span>
                    <p className="font-medium">{selectedOrder.customerName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('ordersPage.phone')}:</span>
                    <p className="font-medium">{selectedOrder.customerPhone}</p>
                  </div>
                  {selectedOrder.customerEmail && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">{t('ordersPage.email')}:</span>
                      <p className="font-medium">{selectedOrder.customerEmail}</p>
                    </div>
                  )}
                  {selectedOrder.address && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">{t('ordersPage.address')}:</span>
                      <p className="font-medium">{selectedOrder.address}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Items */}
              <div>
                <h3 className="font-semibold mb-3">{t('ordersPage.products')}</h3>
                <div className="space-y-2">
                  {JSON.parse(selectedOrder.items).map((item: any, index: number) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">{t('ordersPage.quantity')}: {item.quantity}</p>
                      </div>
                      <p className="font-medium">{formatPrice(item.price * item.quantity)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Summary */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>{t('ordersPage.total')}:</span>
                  <span>{formatPrice(selectedOrder.totalAmount)}</span>
                </div>
              </div>

              {/* Status & Tracking */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-muted-foreground">{t('ordersPage.statusLabel')}:</span>
                  <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
                </div>
                {selectedOrder.trackingNumber && (
                  <div>
                    <span className="text-sm text-muted-foreground">{t('ordersPage.trackingNumber')}:</span>
                    <p className="font-medium mt-1">{selectedOrder.trackingNumber}</p>
                  </div>
                )}
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div>
                  <span className="text-sm text-muted-foreground">{t('ordersPage.notes')}:</span>
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
                  {t('ordersPage.updateStatus')}
                </Button>
                {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'delivered' && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (confirm(t('ordersPage.confirmCancel'))) {
                        handleCancelOrder();
                      }
                    }}
                  >
                    {t('ordersPage.cancelOrder')}
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
            <DialogTitle>{t('ordersPage.updateOrderStatus')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t('ordersPage.newStatus')}</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue placeholder={t('ordersPage.selectStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t('ordersPage.statusPending')}</SelectItem>
                  <SelectItem value="paid">{t('ordersPage.statusPaid')}</SelectItem>
                  <SelectItem value="processing">{t('ordersPage.statusProcessing')}</SelectItem>
                  <SelectItem value="shipped">{t('ordersPage.statusShipped')}</SelectItem>
                  <SelectItem value="delivered">{t('ordersPage.statusDelivered')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(newStatus === 'shipped' || newStatus === 'delivered') && (
              <div>
                <Label>{t('ordersPage.trackingNumberOptional')}</Label>
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder={t('ordersPage.enterTrackingNumber')}
                />
              </div>
            )}

            <Button
              onClick={handleUpdateStatus}
              disabled={!newStatus || updateStatusMutation.isPending}
              className="w-full"
            >
              {updateStatusMutation.isPending ? t('ordersPage.updating') : t('ordersPage.update')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
