import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Plus, Trash2, Edit, ShoppingBag, Calendar, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

const triggerLabels: Record<string, { label: string; icon: React.ReactNode; category: string }> = {
  order_created: { label: "طلب جديد", icon: <ShoppingBag className="h-4 w-4" />, category: "الطلبات" },
  order_confirmed: { label: "تأكيد الطلب", icon: <ShoppingBag className="h-4 w-4" />, category: "الطلبات" },
  order_shipped: { label: "شحن الطلب", icon: <ShoppingBag className="h-4 w-4" />, category: "الطلبات" },
  order_delivered: { label: "تسليم الطلب", icon: <ShoppingBag className="h-4 w-4" />, category: "الطلبات" },
  order_cancelled: { label: "إلغاء الطلب", icon: <ShoppingBag className="h-4 w-4" />, category: "الطلبات" },
  appointment_created: { label: "حجز موعد", icon: <Calendar className="h-4 w-4" />, category: "المواعيد" },
  appointment_reminder: { label: "تذكير بالموعد", icon: <Calendar className="h-4 w-4" />, category: "المواعيد" },
  appointment_cancelled: { label: "إلغاء الموعد", icon: <Calendar className="h-4 w-4" />, category: "المواعيد" },
  appointment_rescheduled: { label: "تغيير الموعد", icon: <Calendar className="h-4 w-4" />, category: "المواعيد" }
};

export default function WhatsAppAutoNotifications() {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNotification, setEditingNotification] = useState<any>(null);
  const [formData, setFormData] = useState({ triggerType: "order_created", messageTemplate: "", isActive: true, delayMinutes: 0 });

  const { data: notifications, isLoading, refetch } = trpc.advancedNotifications.getWhatsappAutoNotifications.useQuery();
  const { data: defaultTemplates } = trpc.advancedNotifications.getDefaultTemplates.useQuery();
  const createMutation = trpc.advancedNotifications.createWhatsappAutoNotification.useMutation({ onSuccess: () => { toast.success(t('whatsAppAutoNotificationsPage.text0')); setIsDialogOpen(false); resetForm(); refetch(); } });
  const updateMutation = trpc.advancedNotifications.updateWhatsappAutoNotification.useMutation({ onSuccess: () => { toast.success(t('whatsAppAutoNotificationsPage.text1')); setIsDialogOpen(false); resetForm(); refetch(); } });
  const deleteMutation = trpc.advancedNotifications.deleteWhatsappAutoNotification.useMutation({ onSuccess: () => { toast.success(t('whatsAppAutoNotificationsPage.text2')); refetch(); } });

  const resetForm = () => { setFormData({ triggerType: "order_created", messageTemplate: "", isActive: true, delayMinutes: 0 }); setEditingNotification(null); };
  const handleSubmit = () => { if (!formData.messageTemplate) { toast.error(t('whatsAppAutoNotificationsPage.text3')); return; } if (editingNotification) { updateMutation.mutate({ id: editingNotification.id, ...formData }); } else { createMutation.mutate(formData); } };
  const handleEdit = (notification: any) => { setEditingNotification(notification); setFormData({ triggerType: notification.trigger_type, messageTemplate: notification.message_template, isActive: notification.is_active ?? true, delayMinutes: notification.delay_minutes ?? 0 }); setIsDialogOpen(true); };
  const loadDefaultTemplate = () => { if (defaultTemplates && formData.triggerType) { setFormData(p => ({ ...p, messageTemplate: defaultTemplates[formData.triggerType as keyof typeof defaultTemplates] || "" })); } };

  useEffect(() => { if (defaultTemplates && !formData.messageTemplate && !editingNotification) { loadDefaultTemplate(); } }, [formData.triggerType, defaultTemplates]);

  if (isLoading) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div></div>;

  const orderNotifications = notifications?.filter((n: any) => n.trigger_type.startsWith('order_')) || [];
  const appointmentNotifications = notifications?.filter((n: any) => n.trigger_type.startsWith('appointment_')) || [];

  return (
    <div className="container mx-auto py-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">{t('whatsAppAutoNotificationsPage.text4')}</h1><p className="text-muted-foreground">إرسال رسائل تلقائية للعملاء عند تغيير حالة الطلبات أو المواعيد</p></div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 ml-2" />{t('whatsAppAutoNotificationsPage.text5')}</Button></DialogTrigger>
          <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{editingNotification ? "تعديل الإشعار" : "إنشاء إشعار جديد"}</DialogTitle><DialogDescription>{t('whatsAppAutoNotificationsPage.text6')}</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><Label>{t('whatsAppAutoNotificationsPage.text7')}</Label><Select value={formData.triggerType} onValueChange={(v) => setFormData(p => ({...p, triggerType: v, messageTemplate: defaultTemplates?.[v as keyof typeof defaultTemplates] || ""}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(triggerLabels).map(([key, { label, category }]) => <SelectItem key={key} value={key}>{category} - {label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><div className="flex items-center justify-between"><Label>{t('whatsAppAutoNotificationsPage.text8')}</Label><Button variant="ghost" size="sm" onClick={loadDefaultTemplate}><RotateCcw className="h-4 w-4 ml-1" />استعادة القالب الافتراضي</Button></div><Textarea value={formData.messageTemplate} onChange={(e) => setFormData(p => ({...p, messageTemplate: e.target.value}))} placeholder="أدخل نص الرسالة..." className="min-h-[200px]" dir="rtl" /><p className="text-xs text-muted-foreground">المتغيرات المتاحة: {"{{customerName}}, {{orderNumber}}, {{total}}, {{currency}}, {{trackingNumber}}, {{deliveryDate}}, {{serviceName}}, {{appointmentDate}}, {{appointmentTime}}, {{location}}"}</p></div>
              <div className="flex items-center justify-between"><Label>{t('whatsAppAutoNotificationsPage.text9')}</Label><Switch checked={formData.isActive} onCheckedChange={(v) => setFormData(p => ({...p, isActive: v}))} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t('whatsAppAutoNotificationsPage.text10')}</Button><Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>{editingNotification ? "تحديث" : "إنشاء"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardHeader><div className="flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-primary" /><CardTitle>{t('whatsAppAutoNotificationsPage.text11')}</CardTitle></div><CardDescription>رسائل تلقائية عند تغيير حالة الطلبات</CardDescription></CardHeader><CardContent className="space-y-3">
          {orderNotifications.length === 0 ? <p className="text-center text-muted-foreground py-4">{t('whatsAppAutoNotificationsPage.text12')}</p> : orderNotifications.map((notification: any) => (
            <div key={notification.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">{triggerLabels[notification.trigger_type]?.icon}<div><p className="font-medium">{triggerLabels[notification.trigger_type]?.label || notification.trigger_type}</p><p className="text-xs text-muted-foreground line-clamp-1">{notification.message_template.substring(0, 50)}...</p></div></div>
              <div className="flex items-center gap-2"><Badge variant={notification.is_active ? "default" : "secondary"}>{notification.is_active ? "نشط" : "متوقف"}</Badge><Button variant="ghost" size="sm" onClick={() => handleEdit(notification)}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="sm" className="text-red-600" onClick={() => deleteMutation.mutate({ id: notification.id })}><Trash2 className="h-4 w-4" /></Button></div>
            </div>
          ))}
        </CardContent></Card>

        <Card><CardHeader><div className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" /><CardTitle>{t('whatsAppAutoNotificationsPage.text13')}</CardTitle></div><CardDescription>رسائل تلقائية عند حجز أو تغيير المواعيد</CardDescription></CardHeader><CardContent className="space-y-3">
          {appointmentNotifications.length === 0 ? <p className="text-center text-muted-foreground py-4">{t('whatsAppAutoNotificationsPage.text14')}</p> : appointmentNotifications.map((notification: any) => (
            <div key={notification.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">{triggerLabels[notification.trigger_type]?.icon}<div><p className="font-medium">{triggerLabels[notification.trigger_type]?.label || notification.trigger_type}</p><p className="text-xs text-muted-foreground line-clamp-1">{notification.message_template.substring(0, 50)}...</p></div></div>
              <div className="flex items-center gap-2"><Badge variant={notification.is_active ? "default" : "secondary"}>{notification.is_active ? "نشط" : "متوقف"}</Badge><Button variant="ghost" size="sm" onClick={() => handleEdit(notification)}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="sm" className="text-red-600" onClick={() => deleteMutation.mutate({ id: notification.id })}><Trash2 className="h-4 w-4" /></Button></div>
            </div>
          ))}
        </CardContent></Card>
      </div>
    </div>
  );
}
