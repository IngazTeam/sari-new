import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
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
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from 'react-i18next';

// Default form state for new booking
const defaultNewBooking = {
  serviceId: 0,
  customerPhone: "",
  customerName: "",
  customerEmail: "",
  bookingDate: "",
  startTime: "",
  endTime: "",
  durationMinutes: 60,
  basePrice: 0,
  finalPrice: 0,
  notes: "",
  bookingSource: "walk_in" as const,
};

export default function BookingsManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newBooking, setNewBooking] = useState(defaultNewBooking);

  const { data: bookingsData, isLoading, refetch } = trpc.bookings.list.useQuery({
    // @ts-ignore
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
  });

  const { data: statsData } = trpc.bookings.getStats.useQuery({});

  // Fetch services for the service selector
  const { data: servicesData } = trpc.services.list.useQuery(undefined as any);

  const createMutation = trpc.bookings.create.useMutation({
    onSuccess: () => {
      toast({
        title: t('bookingsManagementPage.text0'),
        description: "تم إنشاء الحجز بنجاح",
      });
      refetch();
      setIsCreateOpen(false);
      setNewBooking(defaultNewBooking);
    },
    onError: (error: any) => {
      toast({
        title: t('bookingsManagementPage.text2'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = trpc.bookings.update.useMutation({
    onSuccess: () => {
      toast({
        title: t('bookingsManagementPage.text0'),
        description: t('bookingsManagementPage.text1'),
      });
      refetch();
      setSelectedBooking(null);
    },
    onError: (error: any) => {
      toast({
        title: t('bookingsManagementPage.text2'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = trpc.bookings.delete.useMutation({
    onSuccess: () => {
      toast({
        title: t('bookingsManagementPage.text3'),
        description: t('bookingsManagementPage.text4'),
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: t('bookingsManagementPage.text5'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bookings = bookingsData?.bookings || [];
  const stats = statsData?.stats;
  const services = servicesData?.services || [];

  const filteredBookings = bookings.filter((booking: any) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      booking.customerName?.toLowerCase().includes(searchLower) ||
      booking.customerPhone?.includes(searchLower)
    );
  });

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: t('bookingsManagementPage.text6'), variant: "secondary" },
      confirmed: { label: t('bookingsManagementPage.text7'), variant: "default" },
      in_progress: { label: t('bookingsManagementPage.text8'), variant: "outline" },
      completed: { label: t('bookingsManagementPage.text9'), variant: "default" },
      cancelled: { label: t('bookingsManagementPage.text10'), variant: "destructive" },
      no_show: { label: t('bookingsManagementPage.text11'), variant: "destructive" },
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
    if (confirm(t('bookingsManagementPage.text12'))) {
      deleteMutation.mutate({ bookingId });
    }
  };

  // Auto-calculate endTime and price when service/startTime changes
  const handleServiceChange = (serviceIdStr: string) => {
    const serviceId = Number(serviceIdStr);
    const service = services.find((s: any) => s.id === serviceId);
    if (service) {
      const duration = service.durationMinutes || 60;
      const price = service.basePrice || 0;
      setNewBooking(prev => {
        const updated = {
          ...prev,
          serviceId,
          durationMinutes: duration,
          basePrice: price,
          finalPrice: price,
        };
        // Auto-calculate endTime if startTime is set
        if (prev.startTime) {
          const [h, m] = prev.startTime.split(":").map(Number);
          const totalMins = h * 60 + m + duration;
          const endH = Math.floor(totalMins / 60) % 24;
          const endM = totalMins % 60;
          updated.endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
        }
        return updated;
      });
    }
  };

  const handleStartTimeChange = (startTime: string) => {
    setNewBooking(prev => {
      const updated = { ...prev, startTime };
      if (startTime && prev.durationMinutes) {
        const [h, m] = startTime.split(":").map(Number);
        const totalMins = h * 60 + m + prev.durationMinutes;
        const endH = Math.floor(totalMins / 60) % 24;
        const endM = totalMins % 60;
        updated.endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
      }
      return updated;
    });
  };

  const handleCreateBooking = () => {
    if (!newBooking.serviceId || !newBooking.customerPhone || !newBooking.bookingDate || !newBooking.startTime || !newBooking.endTime) {
      toast({
        title: t('bookingsManagementPage.text2'),
        description: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({
      serviceId: newBooking.serviceId,
      customerPhone: newBooking.customerPhone,
      customerName: newBooking.customerName || undefined,
      customerEmail: newBooking.customerEmail || undefined,
      bookingDate: newBooking.bookingDate,
      startTime: newBooking.startTime,
      endTime: newBooking.endTime,
      durationMinutes: newBooking.durationMinutes,
      basePrice: newBooking.basePrice,
      finalPrice: newBooking.finalPrice,
      notes: newBooking.notes || undefined,
      bookingSource: newBooking.bookingSource,
    });
  };

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{t('bookingsManagementPage.text13')}</h1>
          <p className="text-muted-foreground mt-1">{t('bookingsManagement.auto_0')}</p>
        </div>

        {/* Create Booking Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setNewBooking(defaultNewBooking);
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />{t('bookingsManagement.auto_1')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('bookingsManagement.auto_1')}</DialogTitle>
              <DialogDescription>أدخل بيانات الحجز الجديد</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {/* Service Selector */}
              <div className="grid gap-2">
                <Label>الخدمة *</Label>
                <Select
                  value={newBooking.serviceId ? String(newBooking.serviceId) : ""}
                  onValueChange={handleServiceChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الخدمة" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service: any) => (
                      <SelectItem key={service.id} value={String(service.id)}>
                        {service.name} {service.basePrice ? `(${(service.basePrice / 100).toFixed(0)} ريال)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>اسم العميل</Label>
                  <Input
                    placeholder="أحمد محمد"
                    value={newBooking.customerName}
                    onChange={(e) => setNewBooking(prev => ({ ...prev, customerName: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>رقم الهاتف *</Label>
                  <Input
                    placeholder="05xxxxxxxx"
                    value={newBooking.customerPhone}
                    onChange={(e) => setNewBooking(prev => ({ ...prev, customerPhone: e.target.value }))}
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="grid gap-2">
                <Label>البريد الإلكتروني</Label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={newBooking.customerEmail}
                  onChange={(e) => setNewBooking(prev => ({ ...prev, customerEmail: e.target.value }))}
                  dir="ltr"
                />
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label>التاريخ *</Label>
                  <Input
                    type="date"
                    value={newBooking.bookingDate}
                    onChange={(e) => setNewBooking(prev => ({ ...prev, bookingDate: e.target.value }))}
                    min={new Date().toISOString().split("T")[0]}
                    dir="ltr"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>وقت البدء *</Label>
                  <Input
                    type="time"
                    value={newBooking.startTime}
                    onChange={(e) => handleStartTimeChange(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>وقت الانتهاء *</Label>
                  <Input
                    type="time"
                    value={newBooking.endTime}
                    onChange={(e) => setNewBooking(prev => ({ ...prev, endTime: e.target.value }))}
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Duration & Price */}
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label>المدة (دقيقة)</Label>
                  <Input
                    type="number"
                    value={newBooking.durationMinutes}
                    onChange={(e) => setNewBooking(prev => ({ ...prev, durationMinutes: Number(e.target.value) }))}
                    dir="ltr"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>السعر (هللة)</Label>
                  <Input
                    type="number"
                    value={newBooking.basePrice}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setNewBooking(prev => ({ ...prev, basePrice: val, finalPrice: val }));
                    }}
                    dir="ltr"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>المبلغ النهائي</Label>
                  <Input
                    type="number"
                    value={newBooking.finalPrice}
                    onChange={(e) => setNewBooking(prev => ({ ...prev, finalPrice: Number(e.target.value) }))}
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Booking Source */}
              <div className="grid gap-2">
                <Label>مصدر الحجز</Label>
                <Select
                  value={newBooking.bookingSource}
                  onValueChange={(value: any) => setNewBooking(prev => ({ ...prev, bookingSource: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walk_in">حضوري</SelectItem>
                    <SelectItem value="phone">هاتف</SelectItem>
                    <SelectItem value="whatsapp">واتساب</SelectItem>
                    <SelectItem value="website">الموقع</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="grid gap-2">
                <Label>ملاحظات</Label>
                <Textarea
                  placeholder="ملاحظات إضافية..."
                  value={newBooking.notes}
                  onChange={(e) => setNewBooking(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleCreateBooking} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                إنشاء الحجز
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                <p className="text-sm text-muted-foreground">{t('bookingsManagementPage.text14')}</p>
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
                <p className="text-sm text-muted-foreground">{t('bookingsManagementPage.text15')}</p>
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
                <p className="text-sm text-muted-foreground">{t('bookingsManagementPage.text16')}</p>
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
                <p className="text-sm text-muted-foreground">{t('bookingsManagementPage.text17')}</p>
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
              placeholder={t('bookingsManagementPage.text18')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-[200px]">
              <Filter className="w-4 h-4 ml-2" />
              <SelectValue placeholder={t('bookingsManagementPage.text19')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('bookingsManagementPage.text20')}</SelectItem>
              <SelectItem value="pending">{t('bookingsManagementPage.text21')}</SelectItem>
              <SelectItem value="confirmed">{t('bookingsManagementPage.text22')}</SelectItem>
              <SelectItem value="in_progress">{t('bookingsManagementPage.text23')}</SelectItem>
              <SelectItem value="completed">{t('bookingsManagementPage.text24')}</SelectItem>
              <SelectItem value="cancelled">{t('bookingsManagementPage.text25')}</SelectItem>
              <SelectItem value="no_show">{t('bookingsManagementPage.text26')}</SelectItem>
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
                <th className="p-4 font-semibold">{t('bookingsManagementPage.text27')}</th>
                <th className="p-4 font-semibold">{t('bookingsManagementPage.text28')}</th>
                <th className="p-4 font-semibold">{t('bookingsManagementPage.text29')}</th>
                <th className="p-4 font-semibold">{t('bookingsManagementPage.text30')}</th>
                <th className="p-4 font-semibold">{t('bookingsManagementPage.text31')}</th>
                <th className="p-4 font-semibold">{t('bookingsManagementPage.text32')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">{t('bookingsManagement.auto_2')}</td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>{t('bookingsManagementPage.text33')}</p>
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
                              <DialogTitle>{t('bookingsManagementPage.text34')}</DialogTitle>
                              <DialogDescription>{t('bookingsManagement.auto_3')}</DialogDescription>
                            </DialogHeader>
                            {selectedBooking && (
                              <div className="space-y-4">
                                <div>
                                  <p className="text-sm font-medium mb-1">{t('bookingsManagementPage.text35')}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {selectedBooking.customerName || "غير محدد"}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {selectedBooking.customerPhone}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium mb-1">{t('bookingsManagementPage.text36')}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {format(new Date(selectedBooking.bookingDate), "dd MMMM yyyy", { locale: ar })}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium mb-1">{t('bookingsManagementPage.text37')}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {selectedBooking.startTime} - {selectedBooking.endTime}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium mb-1">{t('bookingsManagementPage.text38')}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {formatPrice(selectedBooking.finalPrice)}
                                  </p>
                                </div>
                                {selectedBooking.notes && (
                                  <div>
                                    <p className="text-sm font-medium mb-1">{t('bookingsManagementPage.text39')}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {selectedBooking.notes}
                                    </p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-medium mb-2">{t('bookingsManagementPage.text40')}</p>
                                  <Select
                                    value={selectedBooking.status}
                                    onValueChange={(value) => handleStatusChange(selectedBooking.id, value)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="pending">{t('bookingsManagementPage.text41')}</SelectItem>
                                      <SelectItem value="confirmed">{t('bookingsManagementPage.text42')}</SelectItem>
                                      <SelectItem value="in_progress">{t('bookingsManagementPage.text43')}</SelectItem>
                                      <SelectItem value="completed">{t('bookingsManagementPage.text44')}</SelectItem>
                                      <SelectItem value="cancelled">{t('bookingsManagementPage.text45')}</SelectItem>
                                      <SelectItem value="no_show">{t('bookingsManagementPage.text46')}</SelectItem>
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