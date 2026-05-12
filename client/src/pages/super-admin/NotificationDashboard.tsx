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
  const { t } = useTranslation();
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
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />{t('notificationDashboard.auto_0')}</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{t('notificationDashboard.auto_1')}</Badge>;
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />{t('notificationDashboard.auto_2')}</Badge>;
      case "cancelled":
        return <Badge variant="outline"><Ban className="h-3 w-3 mr-1" />{t('notificationDashboard.auto_3')}</Badge>;
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
          <h1 className="text-3xl font-bold">{t('notificationDashboard.auto_4')}</h1>
          <p className="text-muted-foreground mt-1">{t('notificationDashboard.auto_5')}</p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />{t('notificationDashboard.auto_6')}</Button>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('notificationDashboard.auto_7')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-green-600">{t('notificationDashboard.auto_8')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.sent || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-red-600">{t('notificationDashboard.auto_9')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.failed || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-yellow-600">{t('notificationDashboard.auto_10')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats?.pending || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">{t('notificationDashboard.auto_11')}</CardTitle>
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
            <CardTitle>{t('notificationDashboard.auto_12')}</CardTitle>
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
                    <div>{t('notificationDashboard.auto_13')}<span className="font-bold">{stat.total}</span></div>
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
          <CardTitle>{t('notificationDashboard.auto_14')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('notificationDashboard.auto_52')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9"
              />
            </div>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('notificationDashboard.auto_53')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('notificationDashboard.auto_15')}</SelectItem>
                <SelectItem value="new_order">{t('notificationDashboard.auto_16')}</SelectItem>
                <SelectItem value="new_message">{t('notificationDashboard.auto_17')}</SelectItem>
                <SelectItem value="appointment">{t('notificationDashboard.auto_18')}</SelectItem>
                <SelectItem value="order_status">{t('notificationDashboard.auto_19')}</SelectItem>
                <SelectItem value="missed_message">{t('notificationDashboard.auto_20')}</SelectItem>
                <SelectItem value="whatsapp_disconnect">{t('notificationDashboard.auto_21')}</SelectItem>
                <SelectItem value="weekly_report">{t('notificationDashboard.auto_22')}</SelectItem>
                <SelectItem value="custom">{t('notificationDashboard.auto_23')}</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('notificationDashboard.auto_54')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('notificationDashboard.auto_24')}</SelectItem>
                <SelectItem value="sent">{t('notificationDashboard.auto_25')}</SelectItem>
                <SelectItem value="failed">{t('notificationDashboard.auto_26')}</SelectItem>
                <SelectItem value="pending">{t('notificationDashboard.auto_27')}</SelectItem>
                <SelectItem value="cancelled">{t('notificationDashboard.auto_28')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      {/* Notifications Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('notificationDashboard.auto_29')}</CardTitle>
          <CardDescription>
            {filteredNotifications?.length || 0} إشعار
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">{t('notificationDashboard.auto_30')}</div>
          ) : !filteredNotifications || filteredNotifications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t('notificationDashboard.auto_31')}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('notificationDashboard.auto_32')}</TableHead>
                    <TableHead>{t('notificationDashboard.auto_33')}</TableHead>
                    <TableHead>{t('notificationDashboard.auto_34')}</TableHead>
                    <TableHead>{t('notificationDashboard.auto_35')}</TableHead>
                    <TableHead>{t('notificationDashboard.auto_36')}</TableHead>
                    <TableHead>{t('notificationDashboard.auto_37')}</TableHead>
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
                              <RefreshCw className="h-3 w-3 mr-1" />{t('notificationDashboard.auto_38')}</Button>
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
            <DialogTitle>{t('notificationDashboard.auto_39')}</DialogTitle>
            <DialogDescription>{t('notificationDashboard.auto_40')}</DialogDescription>
          </DialogHeader>
          
          {selectedNotification && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('notificationDashboard.auto_41')}</label>
                  <div className="flex items-center gap-2 mt-1">
                    {getTypeIcon(selectedNotification.type)}
                    <span>{getTypeLabel(selectedNotification.type)}</span>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('notificationDashboard.auto_42')}</label>
                  <div className="mt-1">{getStatusBadge(selectedNotification.status)}</div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('notificationDashboard.auto_43')}</label>
                  <div className="mt-1">
                    <Badge variant="outline">{selectedNotification.method}</Badge>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('notificationDashboard.auto_44')}</label>
                  <div className="mt-1 text-sm">
                    {format(new Date(selectedNotification.createdAt), "dd MMMM yyyy, HH:mm", { locale: ar })}
                  </div>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('notificationDashboard.auto_45')}</label>
                <div className="mt-1 p-3 bg-muted rounded-lg">{selectedNotification.title}</div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">{t('notificationDashboard.auto_46')}</label>
                <div className="mt-1 p-3 bg-muted rounded-lg whitespace-pre-wrap">
                  {selectedNotification.body}
                </div>
              </div>
              
              {selectedNotification.url && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('notificationDashboard.auto_47')}</label>
                  <div className="mt-1 p-3 bg-muted rounded-lg break-all">
                    <a href={selectedNotification.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {selectedNotification.url}
                    </a>
                  </div>
                </div>
              )}
              
              {selectedNotification.error && (
                <div>
                  <label className="text-sm font-medium text-red-600">{t('notificationDashboard.auto_48')}</label>
                  <div className="mt-1 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
                    {selectedNotification.error}
                  </div>
                </div>
              )}
              
              {selectedNotification.metadata && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">{t('notificationDashboard.auto_49')}</label>
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
                    <RefreshCw className="h-4 w-4 mr-2" />{t('notificationDashboard.auto_50')}</Button>
                )}
                
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate({ id: selectedNotification.id })}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />{t('notificationDashboard.auto_51')}</Button>
                
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
