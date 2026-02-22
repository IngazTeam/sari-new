import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Package, Search, Send, RefreshCw, ShoppingCart, DollarSign, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { formatCurrency, type Currency } from "@shared/currency";
import { useTranslation } from 'react-i18next';

interface Order {
  id: number;
  wooOrderId: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  status: string;
  currency: string;
  total: string;
  subtotal: string;
  shippingTotal: string;
  taxTotal: string;
  discountTotal: string;
  paymentMethod: string | null;
  paymentMethodTitle: string | null;
  lineItems: string;
  orderNotes: string | null;
  notificationSent: number;
  notificationSentAt: string | null;
  wooCreatedAt: string;
  wooUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function WooCommerceOrders() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: merchant } = trpc.merchant.get.useQuery();
  const merchantCurrency = (merchant?.currency as Currency) || 'SAR';
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isUpdateStatusOpen, setIsUpdateStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [statusNote, setStatusNote] = useState("");
  const [isSendingNotification, setIsSendingNotification] = useState(false);

  // Fetch orders
  const { data: ordersData, isLoading, refetch } = trpc.woocommerce.getOrders.useQuery({
    limit: 100,
    offset: 0,
  });

  // Sync orders mutation
  const syncOrdersMutation = trpc.woocommerce.syncOrders.useMutation({
    onSuccess: () => {
      toast({
        title: "تمت المزامنة بنجاح",
        description: "تم جلب الطلبات من WooCommerce",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "فشلت المزامنة",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update order status mutation
  const updateStatusMutation = trpc.woocommerce.updateOrderStatus.useMutation({
    onSuccess: () => {
      toast({
        title: "تم تحديث الحالة",
        description: "تم تحديث حالة الطلب بنجاح",
      });
      setIsUpdateStatusOpen(false);
      setNewStatus("");
      setStatusNote("");
      refetch();
    },
    onError: (error) => {
      toast({
        title: "فشل التحديث",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Send notification mutation
  const sendNotificationMutation = trpc.woocommerce.sendOrderNotification.useMutation({
    onSuccess: () => {
      toast({
        title: "تم إرسال الإشعار",
        description: "تم إرسال إشعار واتساب للعميل",
      });
      setIsSendingNotification(false);
      refetch();
    },
    onError: (error) => {
      toast({
        title: "فشل الإرسال",
        description: error.message,
        variant: "destructive",
      });
      setIsSendingNotification(false);
    },
  });

  // Filter orders
  const filteredOrders = ordersData?.orders?.filter((order: Order) => {
    const matchesSearch = 
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.customerPhone && order.customerPhone.includes(searchTerm));
    
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }) || [];

  // Calculate stats
  const stats = {
    total: ordersData?.orders?.length || 0,
    pending: ordersData?.orders?.filter((o: Order) => o.status === 'pending').length || 0,
    processing: ordersData?.orders?.filter((o: Order) => o.status === 'processing').length || 0,
    completed: ordersData?.orders?.filter((o: Order) => o.status === 'completed').length || 0,
    cancelled: ordersData?.orders?.filter((o: Order) => o.status === 'cancelled').length || 0,
    totalRevenue: ordersData?.orders?.reduce((sum: number, o: Order) => sum + parseFloat(o.total), 0) || 0,
  };

  const handleViewDetails = (order: Order) => {
    setSelectedOrder(order);
    setIsDetailsOpen(true);
  };

  const handleUpdateStatus = (order: Order) => {
    setSelectedOrder(order);
    setNewStatus(order.status);
    setIsUpdateStatusOpen(true);
  };

  const handleSendNotification = async (order: Order) => {
    setIsSendingNotification(true);
    await sendNotificationMutation.mutateAsync({ orderId: order.id });
  };

  const handleConfirmUpdateStatus = async () => {
    if (!selectedOrder) return;
    
    await updateStatusMutation.mutateAsync({
      orderId: selectedOrder.id,
      status: newStatus as any,
      note: statusNote || undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      'pending': { label: 'قيد الانتظار', variant: 'secondary' },
      'processing': { label: 'قيد المعالجة', variant: 'default' },
      'on-hold': { label: 'معلق', variant: 'outline' },
      'completed': { label: 'مكتمل', variant: 'default' },
      'cancelled': { label: 'ملغي', variant: 'destructive' },
      'refunded': { label: 'مسترجع', variant: 'destructive' },
      'failed': { label: 'فاشل', variant: 'destructive' },
    };

    const config = statusConfig[status] || { label: status, variant: 'outline' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'cancelled':
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'processing':
        return <Clock className="h-5 w-5 text-blue-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
  };

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('wooCommerceOrdersPage.text0')}</h1>
          <p className="text-muted-foreground">{t('wooCommerceOrdersPage.text1')}</p>
        </div>
        <Button 
          onClick={() => syncOrdersMutation.mutate()}
          disabled={syncOrdersMutation.isPending}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${syncOrdersMutation.isPending ? 'animate-spin' : ''}`} />
          مزامنة الطلبات
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('wooCommerceOrdersPage.text2')}</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('wooCommerceOrdersPage.text3')}</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.processing}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('wooCommerceOrdersPage.text4')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('wooCommerceOrdersPage.text5')}</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRevenue.toFixed(2)} ر.س</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t('wooCommerceOrdersPage.text6')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('wooCommerceOrdersPage.text7')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t('wooCommerceOrdersPage.text8')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('wooCommerceOrdersPage.text9')}</SelectItem>
                <SelectItem value="pending">{t('wooCommerceOrdersPage.text10')}</SelectItem>
                <SelectItem value="processing">{t('wooCommerceOrdersPage.text11')}</SelectItem>
                <SelectItem value="on-hold">{t('wooCommerceOrdersPage.text12')}</SelectItem>
                <SelectItem value="completed">{t('wooCommerceOrdersPage.text13')}</SelectItem>
                <SelectItem value="cancelled">{t('wooCommerceOrdersPage.text14')}</SelectItem>
                <SelectItem value="refunded">{t('wooCommerceOrdersPage.text15')}</SelectItem>
                <SelectItem value="failed">{t('wooCommerceOrdersPage.text16')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة الطلبات ({filteredOrders.length})</CardTitle>
          <CardDescription>{t('wooCommerceOrdersPage.text17')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">{t('wooCommerceOrdersPage.text18')}</div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>{t('wooCommerceOrdersPage.text19')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order: Order) => {
                const lineItems = JSON.parse(order.lineItems || '[]');
                
                return (
                  <div key={order.id} className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(order.status)}
                          <div>
                            <div className="font-semibold text-lg">طلب #{order.orderNumber}</div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(order.wooCreatedAt).toLocaleDateString('ar-SA', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">{t('wooCommerceOrdersPage.text20')}</span>
                            <span className="font-medium">{order.customerName}</span>
                          </div>
                          {order.customerPhone && (
                            <div>
                              <span className="text-muted-foreground">{t('wooCommerceOrdersPage.text21')}</span>
                              <span className="font-medium">{order.customerPhone}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-muted-foreground">{t('wooCommerceOrdersPage.text22')}</span>
                            {getStatusBadge(order.status)}
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('wooCommerceOrdersPage.text23')}</span>
                            <span className="font-bold text-lg">{formatCurrency(parseFloat(order.total), order.currency as Currency, 'ar-SA')}</span>
                          </div>
                        </div>

                        <div className="text-sm">
                          <span className="text-muted-foreground">{t('wooCommerceOrdersPage.text24')}</span>
                          <span>{lineItems.map((item: any) => item.name).join(', ')}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleViewDetails(order)}
                        >
                          التفاصيل
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleUpdateStatus(order)}
                        >
                          تحديث الحالة
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleSendNotification(order)}
                          disabled={isSendingNotification || !order.customerPhone}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          إرسال إشعار
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل الطلب #{selectedOrder?.orderNumber}</DialogTitle>
            <DialogDescription>
              معلومات كاملة عن الطلب
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('wooCommerceOrdersPage.text25')}</Label>
                  <p className="font-medium">{selectedOrder.customerName}</p>
                </div>
                <div>
                  <Label>{t('wooCommerceOrdersPage.text26')}</Label>
                  <p className="font-medium">{selectedOrder.customerEmail || '-'}</p>
                </div>
                <div>
                  <Label>{t('wooCommerceOrdersPage.text27')}</Label>
                  <p className="font-medium">{selectedOrder.customerPhone || '-'}</p>
                </div>
                <div>
                  <Label>{t('wooCommerceOrdersPage.text28')}</Label>
                  <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
                </div>
              </div>

              <div>
                <Label>{t('wooCommerceOrdersPage.text29')}</Label>
                <div className="mt-2 space-y-2">
                  {JSON.parse(selectedOrder.lineItems || '[]').map((item: any, index: number) => (
                    <div key={index} className="flex justify-between border-b pb-2">
                      <span>{item.name} × {item.quantity}</span>
                      <span className="font-medium">{formatCurrency(parseFloat(item.total), selectedOrder.currency as Currency, 'ar-SA')}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('wooCommerceOrdersPage.text30')}</Label>
                  <p className="font-medium">{selectedOrder.subtotal} {selectedOrder.currency}</p>
                </div>
                <div>
                  <Label>{t('wooCommerceOrdersPage.text31')}</Label>
                  <p className="font-medium">{selectedOrder.shippingTotal} {selectedOrder.currency}</p>
                </div>
                <div>
                  <Label>{t('wooCommerceOrdersPage.text32')}</Label>
                  <p className="font-medium">{selectedOrder.taxTotal} {selectedOrder.currency}</p>
                </div>
                <div>
                  <Label>{t('wooCommerceOrdersPage.text33')}</Label>
                  <p className="font-medium">{selectedOrder.discountTotal} {selectedOrder.currency}</p>
                </div>
              </div>

              <div>
                <Label>{t('wooCommerceOrdersPage.text34')}</Label>
                <p className="text-2xl font-bold">{formatCurrency(parseFloat(selectedOrder.total), selectedOrder.currency as Currency, 'ar-SA')}</p>
              </div>

              {selectedOrder.paymentMethodTitle && (
                <div>
                  <Label>{t('wooCommerceOrdersPage.text35')}</Label>
                  <p className="font-medium">{selectedOrder.paymentMethodTitle}</p>
                </div>
              )}

              {selectedOrder.orderNotes && (
                <div>
                  <Label>{t('wooCommerceOrdersPage.text36')}</Label>
                  <p className="text-sm">{selectedOrder.orderNotes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={isUpdateStatusOpen} onOpenChange={setIsUpdateStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('wooCommerceOrdersPage.text37')}</DialogTitle>
            <DialogDescription>
              تحديث حالة الطلب #{selectedOrder?.orderNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('wooCommerceOrdersPage.text38')}</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue placeholder={t('wooCommerceOrdersPage.text39')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t('wooCommerceOrdersPage.text40')}</SelectItem>
                  <SelectItem value="processing">{t('wooCommerceOrdersPage.text41')}</SelectItem>
                  <SelectItem value="on-hold">{t('wooCommerceOrdersPage.text42')}</SelectItem>
                  <SelectItem value="completed">{t('wooCommerceOrdersPage.text43')}</SelectItem>
                  <SelectItem value="cancelled">{t('wooCommerceOrdersPage.text44')}</SelectItem>
                  <SelectItem value="refunded">{t('wooCommerceOrdersPage.text45')}</SelectItem>
                  <SelectItem value="failed">{t('wooCommerceOrdersPage.text46')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('wooCommerceOrdersPage.text47')}</Label>
              <Textarea
                placeholder={t('wooCommerceOrdersPage.text48')}
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUpdateStatusOpen(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleConfirmUpdateStatus}
              disabled={updateStatusMutation.isPending || !newStatus}
            >
              {updateStatusMutation.isPending ? 'جاري التحديث...' : 'تحديث'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
