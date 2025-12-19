import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, User, Phone, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  const { data: status } = trpc.calendar.getStatus.useQuery();
  const { data: appointments, isLoading, refetch } = trpc.calendar.listAppointments.useQuery({
    startDate: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
    endDate: new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0)
  });
  const { data: stats } = trpc.calendar.getStats.useQuery({
    startDate: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
    endDate: new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0)
  });

  const cancelMutation = trpc.calendar.cancelAppointment.useMutation({
    onSuccess: () => {
      toast.success("تم إلغاء الموعد بنجاح");
      refetch();
    },
    onError: (error) => {
      toast.error(`فشل إلغاء الموعد: ${error.message}`);
    }
  });

  // تحويل المواعيد إلى أحداث FullCalendar
  const events = useMemo(() => {
    if (!appointments) return [];
    
    return appointments.map(apt => ({
      id: apt.id.toString(),
      title: `${apt.customerName} - ${apt.serviceName}`,
      start: new Date(apt.startTime),
      end: new Date(apt.endTime),
      backgroundColor: apt.status === 'confirmed' ? '#10b981' : 
                      apt.status === 'cancelled' ? '#ef4444' : '#f59e0b',
      borderColor: apt.status === 'confirmed' ? '#059669' : 
                   apt.status === 'cancelled' ? '#dc2626' : '#d97706',
      extendedProps: {
        customerPhone: apt.customerPhone,
        staffName: apt.staffName,
        status: apt.status
      }
    }));
  }, [appointments]);

  const handleCancelAppointment = (appointmentId: number) => {
    if (confirm("هل أنت متأكد من إلغاء هذا الموعد؟")) {
      cancelMutation.mutate({ appointmentId });
    }
  };

  if (!status?.connected) {
    return (
      <div className="container max-w-6xl py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              Google Calendar غير متصل
            </CardTitle>
            <CardDescription>
              يجب ربط حسابك في Google Calendar أولاً لعرض المواعيد
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.href = '/merchant/calendar/settings'}>
              انتقل إلى الإعدادات
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">التقويم والمواعيد</h1>
        <p className="text-muted-foreground">
          إدارة جميع المواعيد المحجوزة مع العملاء
        </p>
      </div>

      {/* الإحصائيات */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              إجمالي المواعيد
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              مؤكدة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.confirmed || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              قيد الانتظار
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats?.pending || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              ملغاة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.cancelled || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* التقويم */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>التقويم الشهري</CardTitle>
        </CardHeader>
        <CardContent>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            events={events}
            locale="ar"
            direction="rtl"
            height="auto"
            eventClick={(info) => {
              const apt = appointments?.find(a => a.id.toString() === info.event.id);
              if (apt) {
                const message = `
العميل: ${apt.customerName}
الجوال: ${apt.customerPhone}
الخدمة: ${apt.serviceName}
الموظف: ${apt.staffName}
الوقت: ${new Date(apt.startTime).toLocaleString('ar-SA')}
الحالة: ${apt.status === 'confirmed' ? 'مؤكد' : apt.status === 'pending' ? 'قيد الانتظار' : 'ملغي'}
                `.trim();
                
                if (apt.status !== 'cancelled' && confirm(`${message}\n\nهل تريد إلغاء هذا الموعد؟`)) {
                  handleCancelAppointment(apt.id);
                } else {
                  alert(message);
                }
              }
            }}
            datesSet={(dateInfo) => {
              setSelectedDate(dateInfo.start);
            }}
          />
        </CardContent>
      </Card>

      {/* قائمة المواعيد القادمة */}
      <Card>
        <CardHeader>
          <CardTitle>المواعيد القادمة</CardTitle>
          <CardDescription>
            المواعيد المحجوزة خلال الشهر الحالي
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : !appointments || appointments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد مواعيد محجوزة
            </div>
          ) : (
            <div className="space-y-4">
              {appointments
                .filter(apt => new Date(apt.startTime) >= new Date() && apt.status !== 'cancelled')
                .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                .slice(0, 10)
                .map(apt => (
                  <div 
                    key={apt.id} 
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{apt.customerName}</span>
                        <Badge variant={apt.status === 'confirmed' ? 'default' : 'secondary'}>
                          {apt.status === 'confirmed' ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              مؤكد
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3 mr-1" />
                              قيد الانتظار
                            </>
                          )}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {apt.customerPhone}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(apt.startTime).toLocaleDateString('ar-SA')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(apt.startTime).toLocaleTimeString('ar-SA', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">الخدمة:</span> {apt.serviceName} | 
                        <span className="text-muted-foreground"> الموظف:</span> {apt.staffName}
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleCancelAppointment(apt.id)}
                      disabled={cancelMutation.isPending}
                    >
                      <XCircle className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
