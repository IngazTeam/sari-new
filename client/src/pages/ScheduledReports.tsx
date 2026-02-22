import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Trash2, Edit, Clock, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

const reportTypeLabels: Record<string, string> = { daily: "يومي", weekly: "أسبوعي", monthly: "شهري", custom: "مخصص" };
const deliveryMethodLabels: Record<string, string> = { email: "بريد إلكتروني", whatsapp: "واتساب", both: "كلاهما" };
const dayLabels = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export default function ScheduledReports() {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "", reportType: "weekly" as const, scheduleDay: 0, scheduleTime: "09:00", deliveryMethod: "email" as const,
    recipientEmail: "", recipientPhone: "", includeConversations: true, includeOrders: true, includeRevenue: true,
    includeProducts: true, includeCustomers: true, includeAppointments: true
  });

  const { data: reports, isLoading, refetch } = trpc.advancedNotifications.getScheduledReports.useQuery();
  const createMutation = trpc.advancedNotifications.createScheduledReport.useMutation({ onSuccess: () => { toast.success(t('scheduledReportsPage.text0')); setIsDialogOpen(false); resetForm(); refetch(); } });
  const updateMutation = trpc.advancedNotifications.updateScheduledReport.useMutation({ onSuccess: () => { toast.success(t('scheduledReportsPage.text1')); setIsDialogOpen(false); resetForm(); refetch(); } });
  const deleteMutation = trpc.advancedNotifications.deleteScheduledReport.useMutation({ onSuccess: () => { toast.success(t('scheduledReportsPage.text2')); refetch(); } });

  const resetForm = () => { setFormData({ name: "", reportType: "weekly", scheduleDay: 0, scheduleTime: "09:00", deliveryMethod: "email", recipientEmail: "", recipientPhone: "", includeConversations: true, includeOrders: true, includeRevenue: true, includeProducts: true, includeCustomers: true, includeAppointments: true }); setEditingReport(null); };
  const handleSubmit = () => { if (!formData.name) { toast.error(t('scheduledReportsPage.text3')); return; } if (editingReport) { updateMutation.mutate({ id: editingReport.id, ...formData }); } else { createMutation.mutate(formData); } };
  const handleEdit = (report: any) => { setEditingReport(report); setFormData({ name: report.name, reportType: report.report_type, scheduleDay: report.schedule_day || 0, scheduleTime: report.schedule_time || "09:00", deliveryMethod: report.delivery_method || "email", recipientEmail: report.recipient_email || "", recipientPhone: report.recipient_phone || "", includeConversations: report.include_conversations ?? true, includeOrders: report.include_orders ?? true, includeRevenue: report.include_revenue ?? true, includeProducts: report.include_products ?? true, includeCustomers: report.include_customers ?? true, includeAppointments: report.include_appointments ?? true }); setIsDialogOpen(true); };

  if (isLoading) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div></div>;

  return (
    <div className="container mx-auto py-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">{t('scheduledReportsPage.text4')}</h1><p className="text-muted-foreground">إنشاء وإدارة التقارير التلقائية</p></div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 ml-2" />{t('scheduledReportsPage.text5')}</Button></DialogTrigger>
          <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{editingReport ? "تعديل التقرير" : "إنشاء تقرير جديد"}</DialogTitle><DialogDescription>{t('scheduledReportsPage.text6')}</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>{t('scheduledReportsPage.text7')}</Label><Input value={formData.name} onChange={(e) => setFormData(p => ({...p, name: e.target.value}))} placeholder="تقرير المبيعات الأسبوعي" /></div><div className="space-y-2"><Label>نوع التقرير</Label><Select value={formData.reportType} onValueChange={(v: any) => setFormData(p => ({...p, reportType: v}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">يومي</SelectItem><SelectItem value="weekly">أسبوعي</SelectItem><SelectItem value="monthly">شهري</SelectItem></SelectContent></Select></div></div>
              <div className="grid grid-cols-2 gap-4">{formData.reportType === "weekly" && <div className="space-y-2"><Label>{t('scheduledReportsPage.text8')}</Label><Select value={String(formData.scheduleDay)} onValueChange={(v) => setFormData(p => ({...p, scheduleDay: parseInt(v)}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{dayLabels.map((day, i) => <SelectItem key={i} value={String(i)}>{day}</SelectItem>)}</SelectContent></Select></div>}{formData.reportType === "monthly" && <div className="space-y-2"><Label>يوم الشهر</Label><Input type="number" min="1" max="28" value={formData.scheduleDay || 1} onChange={(e) => setFormData(p => ({...p, scheduleDay: parseInt(e.target.value) || 1}))} /></div>}<div className="space-y-2"><Label>وقت الإرسال</Label><Input type="time" value={formData.scheduleTime} onChange={(e) => setFormData(p => ({...p, scheduleTime: e.target.value}))} /></div></div>
              <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>{t('scheduledReportsPage.text9')}</Label><Select value={formData.deliveryMethod} onValueChange={(v: any) => setFormData(p => ({...p, deliveryMethod: v}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="email">بريد إلكتروني</SelectItem><SelectItem value="whatsapp">واتساب</SelectItem><SelectItem value="both">كلاهما</SelectItem></SelectContent></Select></div>{(formData.deliveryMethod === "email" || formData.deliveryMethod === "both") && <div className="space-y-2"><Label>البريد الإلكتروني</Label><Input type="email" value={formData.recipientEmail} onChange={(e) => setFormData(p => ({...p, recipientEmail: e.target.value}))} placeholder="email@example.com" /></div>}{(formData.deliveryMethod === "whatsapp" || formData.deliveryMethod === "both") && <div className="space-y-2"><Label>رقم الواتساب</Label><Input value={formData.recipientPhone} onChange={(e) => setFormData(p => ({...p, recipientPhone: e.target.value}))} placeholder="+966500000000" /></div>}</div>
              <div className="space-y-3"><Label>{t('scheduledReportsPage.text10')}</Label><div className="grid grid-cols-2 gap-3"><div className="flex items-center justify-between"><Label className="font-normal">المحادثات</Label><Switch checked={formData.includeConversations} onCheckedChange={(v) => setFormData(p => ({...p, includeConversations: v}))} /></div><div className="flex items-center justify-between"><Label className="font-normal">الطلبات</Label><Switch checked={formData.includeOrders} onCheckedChange={(v) => setFormData(p => ({...p, includeOrders: v}))} /></div><div className="flex items-center justify-between"><Label className="font-normal">الإيرادات</Label><Switch checked={formData.includeRevenue} onCheckedChange={(v) => setFormData(p => ({...p, includeRevenue: v}))} /></div><div className="flex items-center justify-between"><Label className="font-normal">المنتجات</Label><Switch checked={formData.includeProducts} onCheckedChange={(v) => setFormData(p => ({...p, includeProducts: v}))} /></div><div className="flex items-center justify-between"><Label className="font-normal">العملاء</Label><Switch checked={formData.includeCustomers} onCheckedChange={(v) => setFormData(p => ({...p, includeCustomers: v}))} /></div><div className="flex items-center justify-between"><Label className="font-normal">المواعيد</Label><Switch checked={formData.includeAppointments} onCheckedChange={(v) => setFormData(p => ({...p, includeAppointments: v}))} /></div></div></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t('scheduledReportsPage.text11')}</Button><Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>{editingReport ? "تحديث" : "إنشاء"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {!reports || reports.length === 0 ? <Card className="col-span-full"><CardContent className="py-12 text-center"><FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" /><p className="text-muted-foreground">{t('scheduledReportsPage.text12')}</p><Button variant="outline" className="mt-4" onClick={() => setIsDialogOpen(true)}><Plus className="h-4 w-4 ml-2" />إنشاء تقرير</Button></CardContent></Card> : reports.map((report: any) => (
          <Card key={report.id}><CardHeader className="pb-3"><div className="flex items-start justify-between"><div><CardTitle className="text-lg">{report.name}</CardTitle><CardDescription>{reportTypeLabels[report.report_type] || report.report_type}</CardDescription></div><Badge variant={report.is_active ? "default" : "secondary"}>{report.is_active ? "نشط" : "متوقف"}</Badge></div></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" /><span>{report.schedule_time || "09:00"}</span>{report.report_type === "weekly" && <span>- {dayLabels[report.schedule_day || 0]}</span>}</div><div className="flex items-center gap-2 text-sm text-muted-foreground">{report.delivery_method === "email" || report.delivery_method === "both" ? <Mail className="h-4 w-4" /> : null}{report.delivery_method === "whatsapp" || report.delivery_method === "both" ? <MessageSquare className="h-4 w-4" /> : null}<span>{deliveryMethodLabels[report.delivery_method] || report.delivery_method}</span></div>{report.last_sent_at && <p className="text-xs text-muted-foreground">آخر إرسال: {new Date(report.last_sent_at).toLocaleString('ar-SA')}</p>}<div className="flex gap-2 pt-2"><Button variant="outline" size="sm" onClick={() => handleEdit(report)}><Edit className="h-4 w-4 ml-1" />{t('scheduledReportsPage.text13')}</Button><Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => deleteMutation.mutate({ id: report.id })}><Trash2 className="h-4 w-4" /></Button></div></CardContent></Card>
        ))}
      </div>
    </div>
  );
}
