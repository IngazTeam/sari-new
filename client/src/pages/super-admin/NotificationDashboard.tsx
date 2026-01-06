import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Bell, RefreshCw, Trash2, Search, Filter, CheckCircle, XCircle, Clock, Ban, Mail, MessageSquare, Calendar, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

export default function NotificationDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedNotification, setSelectedNotification] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  // Fetch notifications
  const { data: notifications, isLoading, refetch } = trpc.notificationManagement.list.useQuery({
    type: typeFilter !== "all" ? typeFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    limit: 100,
    offset: 0,
  });
  
  // Fetch stats
  const { data: stats } = trpc.notificationManagement.getStats.useQuery({});
  const { data: statsByType } = trpc.notificationManagement.getStatsByType.useQuery({});
  
  // Mutations
  const resendMutation = trpc.notificationManagement.resend.useMutation({
    onSuccess: () => {
      toast.success("تم إعادة إرسال الإشعار بنجاح");
      refetch();
    },
    onError: (error) => {
      toast.error(`فشل في إعادة الإرسال: ${error.message}`);
    },
  });
  
  const deleteMutation = trpc.notificationManagement.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الإشعار بنجاح");
      refetch();
      setIsDetailsOpen(false);
    },
    onError: (error) => {
      toast.error(`فشل في الحذف: ${error.message}`);
    },
  });
  
  // Get icon for notification type
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "new_order":
        return <Package className="h-4 w-4" />;
      case "new_message":
        return <MessageSquare className="h-4 w-4" />;
      case "appointment":
        return <Calendar className="h-4 w-4" />;
      case "order_status":
        return <Package className="h-4 w-4" />;
      case "missed_message":
        return <AlertTriangle className="h-4 w-4" />;
      case "whatsapp_disconnect":
        return <AlertTriangle className="h-4 w-4" />;
      case "weekly_report":
        return <Mail className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };
  
  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />مرسل</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />فشل</Badge>;
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />معلق</Badge>;
      case "cancelled":
        return <Badge variant="outline"><Ban className="h-3 w-3 mr-1" />ملغي</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  // Get type label in Arabic
  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      new_order: "طلب جديد",
      new_message: "رسالة جديدة",
      appointment: "موعد",
      order_status: "حالة الطلب",
      missed_message: "رسالة فائتة",
      whatsapp_disconnect: "انقطاع واتساب",
      weekly_report: "تقرير أسبوعي",
      custom: "مخصص",
    };
    return labels[type] || type;
  };
  
  // Filter notifications
  const filteredNotifications = notifications?.filter((notif) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        notif.title.toLowerCase().includes(query) ||
        notif.body.toLowerCase().includes(query)
      );
    }
    return true;
  });
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">لوحة تحكم الإشعارات</h1>
          <p className="text-muted-foreground mt-1">
            إدارة ومراقبة جميع الإشعارات المرسلة في النظام
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          تحديث
        </Button>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              إجمالي الإشعارات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-green-600">
              مرسل بنجاح
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.sent || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-red-600">
              فشل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.failed || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-yellow-600">
              معلق
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats?.pending || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              ملغي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{stats?.cancelled || 0}</div>
          </CardContent>
        </Card>
      </div>
      
      {/* Stats by Type */}
      {statsByType && statsByType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>الإحصائيات حسب النوع</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {statsByType.map((stat) => (
                <div key={stat.type} className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {getTypeIcon(stat.type)}
                    <span className="font-medium">{getTypeLabel(stat.type)}</span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div>الإجمالي: <span className="font-bold">{stat.total}</span></div>
                    <div className="text-green-600">نجح: {stat.sent}</div>
                    <div className="text-red-600">فشل: {stat.failed}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>البحث والفلترة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث في العنوان أو المحتوى..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9"
              />
            </div>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="نوع الإشعار" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأنواع</SelectItem>
                <SelectItem value="new_order">طلب جديد</SelectItem>
                <SelectItem value="new_message">رسالة جديدة</SelectItem>
                <SelectItem value="appointment">موعد</SelectItem>
                <SelectItem value="order_status">حالة الطلب</SelectItem>
                <SelectItem value="missed_message">رسالة فائتة</SelectItem>
                <SelectItem value="whatsapp_disconnect">انقطاع واتساب</SelectItem>
                <SelectItem value="weekly_report">تقرير أسبوعي</SelectItem>
                <SelectItem value="custom">مخصص</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="sent">مرسل</SelectItem>
                <SelectItem value="failed">فشل</SelectItem>
                <SelectItem value="pending">معلق</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      {/* Notifications Table */}
      <Card>
        <CardHeader>
          <CardTitle>سجل الإشعارات</CardTitle>
          <CardDescription>
            {filteredNotifications?.length || 0} إشعار
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">جاري التحميل...</div>
          ) : !filteredNotifications || filteredNotifications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد إشعارات
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>النوع</TableHead>
                    <TableHead>العنوان</TableHead>
                    <TableHead>الطريقة</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredNotifications.map((notif) => (
                    <TableRow key={notif.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getTypeIcon(notif.type)}
                          <span className="text-sm">{getTypeLabel(notif.type)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{notif.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{notif.method}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(notif.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(notif.createdAt), "dd MMM yyyy, HH:mm", { locale: ar })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedNotification(notif);
                              setIsDetailsOpen(true);
                            }}
                          >
                            عرض
                          </Button>
                          {notif.status === "failed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resendMutation.mutate({ id: notif.id })}
                              disabled={resendMutation.isPending}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              إعادة إرسال
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Notification Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تفاصيل الإشعار</DialogTitle>
            <DialogDescription>
              معلومات كاملة عن الإشعار المحدد
            </DialogDescription>
          </DialogHeader>
          
          {selectedNotification && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">النوع</label>
                  <div className="flex items-center gap-2 mt-1">
                    {getTypeIcon(selectedNotification.type)}
                    <span>{getTypeLabel(selectedNotification.type)}</span>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">الحالة</label>
                  <div className="mt-1">{getStatusBadge(selectedNotification.status)}</div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">الطريقة</label>
                  <div className="mt-1">
                    <Badge variant="outline">{selectedNotification.method}</Badge>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">التاريخ</label>
                  <div className="mt-1 text-sm">
                    {format(new Date(selectedNotification.createdAt), "dd MMMM yyyy, HH:mm", { locale: ar })}
                  </div>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">العنوان</label>
                <div className="mt-1 p-3 bg-muted rounded-lg">{selectedNotification.title}</div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">المحتوى</label>
                <div className="mt-1 p-3 bg-muted rounded-lg whitespace-pre-wrap">
                  {selectedNotification.body}
                </div>
              </div>
              
              {selectedNotification.url && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">الرابط</label>
                  <div className="mt-1 p-3 bg-muted rounded-lg break-all">
                    <a href={selectedNotification.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {selectedNotification.url}
                    </a>
                  </div>
                </div>
              )}
              
              {selectedNotification.error && (
                <div>
                  <label className="text-sm font-medium text-red-600">رسالة الخطأ</label>
                  <div className="mt-1 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
                    {selectedNotification.error}
                  </div>
                </div>
              )}
              
              {selectedNotification.metadata && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">بيانات إضافية</label>
                  <div className="mt-1 p-3 bg-muted rounded-lg">
                    <pre className="text-xs overflow-auto">
                      {JSON.stringify(JSON.parse(selectedNotification.metadata), null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              
              <div className="flex gap-2 pt-4">
                {selectedNotification.status === "failed" && (
                  <Button
                    onClick={() => {
                      resendMutation.mutate({ id: selectedNotification.id });
                      setIsDetailsOpen(false);
                    }}
                    disabled={resendMutation.isPending}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    إعادة إرسال
                  </Button>
                )}
                
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate({ id: selectedNotification.id })}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  حذف
                </Button>
                
                <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
                  إغلاق
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
