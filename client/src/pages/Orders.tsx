import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingBag,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Eye,
  Package,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, type Currency } from "@shared/currency";
import { useTranslation } from 'react-i18next';

export default function Orders() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: merchant } = trpc.merchant.get.useQuery();
  const merchantCurrency = (merchant?.currency as Currency) || 'SAR';
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Fetch orders
  const { data: orders = [], isLoading } = trpc.orders.list.useQuery({
    search: searchQuery,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  // Fetch stats
  const { data: stats } = trpc.orders.getStats.useQuery();

  // Update status mutation
  const updateStatusMutation = trpc.orders.updateStatus.useMutation({
    onSuccess: () => {
      toast({
        title: "تم تحديث الحالة",
        description: "تم تحديث حالة الطلب بنجاح",
      });
      setShowDetails(false);
    },
  });

  const handleViewDetails = (order: any) => {
    setSelectedOrder(order);
    setShowDetails(true);
  };

  const handleUpdateStatus = (newStatus: string) => {
    if (!selectedOrder) return;
    updateStatusMutation.mutate({
      orderId: selectedOrder.id,
      status: newStatus,
    });
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: any }> = {
      pending: { label: "قيد الانتظار", variant: "secondary" },
      confirmed: { label: "مؤكد", variant: "default" },
      processing: { label: "قيد المعالجة", variant: "default" },
      shipped: { label: "تم الشحن", variant: "default" },
      delivered: { label: "تم التوصيل", variant: "default" },
      cancelled: { label: "ملغي", variant: "destructive" },
    };

    const statusInfo = statusMap[status] || {
      label: status,
      variant: "secondary",
    };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const formatPrice = (price: number) => {
    return formatCurrency(price, merchantCurrency, 'ar-SA');
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('ordersPage.text0')}</h1>
          <p className="text-muted-foreground mt-1">
            عرض وإدارة جميع الطلبات
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('ordersPage.text1')}</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">{t('ordersPage.text2')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('ordersPage.text3')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pending || 0}</div>
            <p className="text-xs text-muted-foreground">{t('ordersPage.text4')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('ordersPage.text5')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.completed || 0}</div>
            <p className="text-xs text-muted-foreground">{t('ordersPage.text6')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('ordersPage.text7')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPrice(stats?.totalRevenue || 0)}
            </div>
            <p className="text-xs text-muted-foreground">{t('ordersPage.text8')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t('ordersPage.text9')}</CardTitle>
          <CardDescription>{t('ordersPage.text10')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('ordersPage.text11')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t('ordersPage.text12')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ordersPage.text13')}</SelectItem>
                <SelectItem value="pending">{t('ordersPage.text14')}</SelectItem>
                <SelectItem value="confirmed">{t('ordersPage.text15')}</SelectItem>
                <SelectItem value="processing">{t('ordersPage.text16')}</SelectItem>
                <SelectItem value="shipped">{t('ordersPage.text17')}</SelectItem>
                <SelectItem value="delivered">{t('ordersPage.text18')}</SelectItem>
                <SelectItem value="cancelled">{t('ordersPage.text19')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Orders Table */}
          {isLoading ? (
            <div className="text-center py-8">{t('ordersPage.text20')}</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد طلبات
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('ordersPage.text21')}</TableHead>
                    <TableHead>{t('ordersPage.text22')}</TableHead>
                    <TableHead>{t('ordersPage.text23')}</TableHead>
                    <TableHead>{t('ordersPage.text24')}</TableHead>
                    <TableHead>{t('ordersPage.text25')}</TableHead>
                    <TableHead>{t('ordersPage.text26')}</TableHead>
                    <TableHead>{t('ordersPage.text27')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order: any) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">
                        #{order.orderNumber || order.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>{order.customer?.name || "غير محدد"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          {order.items?.length || 0} منتج
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatPrice(order.totalAmount)}
                      </TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell>
                        {new Date(order.createdAt).toLocaleDateString("ar-SA")}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetails(order)}
                        >
                          <Eye className="ml-2 h-4 w-4" />
                          عرض
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('ordersPage.text28')}</DialogTitle>
            <DialogDescription>
              معلومات كاملة عن الطلب #{selectedOrder?.orderNumber || selectedOrder?.id.slice(0, 8)}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              {/* Customer Info */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('ordersPage.text29')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('ordersPage.text30')}</p>
                      <p className="font-medium">
                        {selectedOrder.customer?.name || "غير محدد"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t('ordersPage.text31')}</p>
                      <p className="font-medium">
                        {selectedOrder.customer?.phone || "غير محدد"}
                      </p>
                    </div>
                    {selectedOrder.deliveryAddress && (
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">{t('ordersPage.text32')}</p>
                        <p className="font-medium">{selectedOrder.deliveryAddress}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Order Items */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('ordersPage.text33')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {selectedOrder.items?.map((item: any, index: number) => (
                      <div
                        key={index}
                        className="flex justify-between items-center p-3 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{item.productName}</p>
                          <p className="text-sm text-muted-foreground">
                            الكمية: {item.quantity}
                          </p>
                        </div>
                        <p className="font-medium">{formatPrice(item.price)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex justify-between items-center text-lg font-bold">
                      <span>{t('ordersPage.text34')}</span>
                      <span>{formatPrice(selectedOrder.totalAmount)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Order Status */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('ordersPage.text35')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      الحالة الحالية
                    </p>
                    {getStatusBadge(selectedOrder.status)}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      تحديث الحالة
                    </p>
                    <Select
                      value={selectedOrder.status}
                      onValueChange={handleUpdateStatus}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">{t('ordersPage.text36')}</SelectItem>
                        <SelectItem value="confirmed">{t('ordersPage.text37')}</SelectItem>
                        <SelectItem value="processing">{t('ordersPage.text38')}</SelectItem>
                        <SelectItem value="shipped">{t('ordersPage.text39')}</SelectItem>
                        <SelectItem value="delivered">{t('ordersPage.text40')}</SelectItem>
                        <SelectItem value="cancelled">{t('ordersPage.text41')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              {selectedOrder.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('ordersPage.text42')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{selectedOrder.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
