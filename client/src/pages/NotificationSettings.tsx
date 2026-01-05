import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bell, Mail, Clock, Save } from "lucide-react";
import { toast } from "sonner";

export default function NotificationSettings() {
  const { data: settings, isLoading, refetch } = trpc.advancedNotifications.getPushSettings.useQuery();
  const updateMutation = trpc.advancedNotifications.updatePushSettings.useMutation({
    onSuccess: () => { toast.success("تم حفظ الإعدادات بنجاح"); refetch(); }
  });

  const [formData, setFormData] = useState({
    newMessageEnabled: true,
    newOrderEnabled: true,
    newAppointmentEnabled: true,
    lowStockEnabled: true,
    paymentReceivedEnabled: true,
    batchNotifications: false,
    batchIntervalMinutes: 5,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    notificationEmail: "",
    emailNotificationsEnabled: true
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        newMessageEnabled: settings.new_message_enabled ?? true,
        newOrderEnabled: settings.new_order_enabled ?? true,
        newAppointmentEnabled: settings.new_appointment_enabled ?? true,
        lowStockEnabled: settings.low_stock_enabled ?? true,
        paymentReceivedEnabled: settings.payment_received_enabled ?? true,
        batchNotifications: settings.batch_notifications ?? false,
        batchIntervalMinutes: settings.batch_interval_minutes ?? 5,
        quietHoursEnabled: settings.quiet_hours_enabled ?? false,
        quietHoursStart: settings.quiet_hours_start ?? "22:00",
        quietHoursEnd: settings.quiet_hours_end ?? "08:00",
        notificationEmail: settings.notification_email ?? "",
        emailNotificationsEnabled: settings.email_notifications_enabled ?? true
      });
    }
  }, [settings]);

  const handleSave = () => updateMutation.mutate(formData);

  if (isLoading) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div></div>;

  return (
    <div className="container mx-auto py-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">إعدادات الإشعارات</h1><p className="text-muted-foreground">تخصيص إشعارات Push والبريد الإلكتروني</p></div>
        <Button onClick={handleSave} disabled={updateMutation.isPending}><Save className="h-4 w-4 ml-2" />حفظ الإعدادات</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><div className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /><CardTitle>أنواع الإشعارات</CardTitle></div><CardDescription>اختر الإشعارات التي تريد استلامها</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between"><Label htmlFor="newMessage">رسائل جديدة من العملاء</Label><Switch id="newMessage" checked={formData.newMessageEnabled} onCheckedChange={(v) => setFormData(p => ({...p, newMessageEnabled: v}))} /></div>
            <div className="flex items-center justify-between"><Label htmlFor="newOrder">طلبات جديدة</Label><Switch id="newOrder" checked={formData.newOrderEnabled} onCheckedChange={(v) => setFormData(p => ({...p, newOrderEnabled: v}))} /></div>
            <div className="flex items-center justify-between"><Label htmlFor="newAppointment">مواعيد جديدة</Label><Switch id="newAppointment" checked={formData.newAppointmentEnabled} onCheckedChange={(v) => setFormData(p => ({...p, newAppointmentEnabled: v}))} /></div>
            <div className="flex items-center justify-between"><Label htmlFor="lowStock">تنبيه نفاد المخزون</Label><Switch id="lowStock" checked={formData.lowStockEnabled} onCheckedChange={(v) => setFormData(p => ({...p, lowStockEnabled: v}))} /></div>
            <div className="flex items-center justify-between"><Label htmlFor="paymentReceived">استلام مدفوعات</Label><Switch id="paymentReceived" checked={formData.paymentReceivedEnabled} onCheckedChange={(v) => setFormData(p => ({...p, paymentReceivedEnabled: v}))} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /><CardTitle>إشعارات البريد الإلكتروني</CardTitle></div><CardDescription>إعدادات الإشعارات عبر البريد</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between"><Label htmlFor="emailEnabled">تفعيل إشعارات البريد</Label><Switch id="emailEnabled" checked={formData.emailNotificationsEnabled} onCheckedChange={(v) => setFormData(p => ({...p, emailNotificationsEnabled: v}))} /></div>
            <div className="space-y-2"><Label htmlFor="email">البريد الإلكتروني</Label><Input id="email" type="email" placeholder="your@email.com" value={formData.notificationEmail} onChange={(e) => setFormData(p => ({...p, notificationEmail: e.target.value}))} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /><CardTitle>ساعات الهدوء</CardTitle></div><CardDescription>إيقاف الإشعارات خلال فترة معينة</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between"><Label htmlFor="quietHours">تفعيل ساعات الهدوء</Label><Switch id="quietHours" checked={formData.quietHoursEnabled} onCheckedChange={(v) => setFormData(p => ({...p, quietHoursEnabled: v}))} /></div>
            {formData.quietHoursEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="quietStart">من</Label><Input id="quietStart" type="time" value={formData.quietHoursStart} onChange={(e) => setFormData(p => ({...p, quietHoursStart: e.target.value}))} /></div>
                <div className="space-y-2"><Label htmlFor="quietEnd">إلى</Label><Input id="quietEnd" type="time" value={formData.quietHoursEnd} onChange={(e) => setFormData(p => ({...p, quietHoursEnd: e.target.value}))} /></div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>تجميع الإشعارات</CardTitle><CardDescription>تجميع الإشعارات المتعددة في إشعار واحد</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between"><Label htmlFor="batch">تفعيل التجميع</Label><Switch id="batch" checked={formData.batchNotifications} onCheckedChange={(v) => setFormData(p => ({...p, batchNotifications: v}))} /></div>
            {formData.batchNotifications && (
              <div className="space-y-2"><Label htmlFor="interval">فترة التجميع (دقائق)</Label><Input id="interval" type="number" min="1" max="60" value={formData.batchIntervalMinutes} onChange={(e) => setFormData(p => ({...p, batchIntervalMinutes: parseInt(e.target.value) || 5}))} /></div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
