import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Calendar,
  Clock,
  Search,
  Filter,
  Plus,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Users,
  DollarSign,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from 'react-i18next';

export default function BookingsManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedBooking, setSelectedBooking] = useState<any>(null);

  const { data: bookingsData, isLoading, refetch } = trpc.bookings.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
  });

  const { data: statsData } = trpc.bookings.getStats.useQuery({});

  const updateMutation = trpc.bookings.update.useMutation({
    onSuccess: () => {
      toast({
        title: "تم التحديث",
        description: "تم تحديث الحجز بنجاح",
      });
      refetch();
      setSelectedBooking(null);
    },
    onError: (error) => {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = trpc.bookings.delete.useMutation({
    onSuccess: () => {
      toast({
        title: "تم الحذف",
        description: "تم حذف الحجز بنجاح",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bookings = bookingsData?.bookings || [];
  const stats = statsData?.stats;

  const filteredBookings = bookings.filter((booking: any) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      booking.customerName?.toLowerCase().includes(searchLower) ||
      booking.customerPhone?.includes(searchLower)
    );
  });

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "قيد الانتظار", variant: "secondary" },
      confirmed: { label: "مؤكد", variant: "default" },
      in_progress: { label: "جاري التنفيذ", variant: "outline" },
      completed: { label: "مكتمل", variant: "default" },
      cancelled: { label: "ملغي", variant: "destructive" },
      no_show: { label: "لم يحضر", variant: "destructive" },
    };
    const config = statusConfig[status] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatPrice = (price: number) => {
    return `${(price / 100).toFixed(2)} ريال`;
  };

  const handleStatusChange = (bookingId: number, newStatus: string) => {
    updateMutation.mutate({
      bookingId,
      status: newStatus as any,
    });
  };

  const handleDelete = (bookingId: number) => {
    if (confirm("هل أنت متأكد من حذف هذا الحجز؟")) {
      deleteMutation.mutate({ bookingId });
    }
  };

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{t('bookingsManagementPage.text0')}</h1>
          <p className="text-muted-foreground mt-1">
            إدارة وتتبع جميع حجوزات الخدمات
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          حجز جديد
        </Button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('bookingsManagementPage.text1')}</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/10 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('bookingsManagementPage.text2')}</p>
                <p className="text-2xl font-bold">{stats.completed}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-yellow-500/10 rounded-lg">
                <Clock className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('bookingsManagementPage.text3')}</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <DollarSign className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('bookingsManagementPage.text4')}</p>
                <p className="text-2xl font-bold">{formatPrice(stats.totalRevenue)}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder={t('bookingsManagementPage.text5')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-[200px]">
              <Filter className="w-4 h-4 ml-2" />
              <SelectValue placeholder={t('bookingsManagementPage.text6')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('bookingsManagementPage.text7')}</SelectItem>
              <SelectItem value="pending">{t('bookingsManagementPage.text8')}</SelectItem>
              <SelectItem value="confirmed">{t('bookingsManagementPage.text9')}</SelectItem>
              <SelectItem value="in_progress">{t('bookingsManagementPage.text10')}</SelectItem>
              <SelectItem value="completed">{t('bookingsManagementPage.text11')}</SelectItem>
              <SelectItem value="cancelled">{t('bookingsManagementPage.text12')}</SelectItem>
              <SelectItem value="no_show">{t('bookingsManagementPage.text13')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Bookings Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b">
              <tr className="text-right">
                <th className="p-4 font-semibold">{t('bookingsManagementPage.text14')}</th>
                <th className="p-4 font-semibold">{t('bookingsManagementPage.text15')}</th>
                <th className="p-4 font-semibold">{t('bookingsManagementPage.text16')}</th>
                <th className="p-4 font-semibold">{t('bookingsManagementPage.text17')}</th>
                <th className="p-4 font-semibold">{t('bookingsManagementPage.text18')}</th>
                <th className="p-4 font-semibold">{t('bookingsManagementPage.text19')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    جاري التحميل...
                  </td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>{t('bookingsManagementPage.text20')}</p>
                  </td>
                </tr>
              ) : (
                filteredBookings.map((booking: any) => (
                  <tr key={booking.id} className="border-b hover:bg-muted/50">
                    <td className="p-4">
                      <div>
                        <p className="font-medium">{booking.customerName || "غير محدد"}</p>
                        <p className="text-sm text-muted-foreground">{booking.customerPhone}</p>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>
                          {format(new Date(booking.bookingDate), "dd/MM/yyyy", { locale: ar })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <Clock className="w-4 h-4" />
                        <span>{booking.startTime} - {booking.endTime}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm">{booking.durationMinutes} دقيقة</td>
                    <td className="p-4 font-semibold">{formatPrice(booking.finalPrice)}</td>
                    <td className="p-4">{getStatusBadge(booking.status)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedBooking(booking)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>{t('bookingsManagementPage.text21')}</DialogTitle>
                              <DialogDescription>
                                معلومات كاملة عن الحجز
                              </DialogDescription>
                            </DialogHeader>
                            {selectedBooking && (
                              <div className="space-y-4">
                                <div>
                                  <p className="text-sm font-medium mb-1">{t('bookingsManagementPage.text22')}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {selectedBooking.customerName || "غير محدد"}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {selectedBooking.customerPhone}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium mb-1">{t('bookingsManagementPage.text23')}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {format(new Date(selectedBooking.bookingDate), "dd MMMM yyyy", { locale: ar })}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium mb-1">{t('bookingsManagementPage.text24')}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {selectedBooking.startTime} - {selectedBooking.endTime}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium mb-1">{t('bookingsManagementPage.text25')}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {formatPrice(selectedBooking.finalPrice)}
                                  </p>
                                </div>
                                {selectedBooking.notes && (
                                  <div>
                                    <p className="text-sm font-medium mb-1">{t('bookingsManagementPage.text26')}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {selectedBooking.notes}
                                    </p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-medium mb-2">{t('bookingsManagementPage.text27')}</p>
                                  <Select
                                    value={selectedBooking.status}
                                    onValueChange={(value) => handleStatusChange(selectedBooking.id, value)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="pending">{t('bookingsManagementPage.text28')}</SelectItem>
                                      <SelectItem value="confirmed">{t('bookingsManagementPage.text29')}</SelectItem>
                                      <SelectItem value="in_progress">{t('bookingsManagementPage.text30')}</SelectItem>
                                      <SelectItem value="completed">{t('bookingsManagementPage.text31')}</SelectItem>
                                      <SelectItem value="cancelled">{t('bookingsManagementPage.text32')}</SelectItem>
                                      <SelectItem value="no_show">{t('bookingsManagementPage.text33')}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(booking.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
