import { useState, useEffect } from "react";
import type { TriggerType } from '../../../server/notifications/whatsapp-auto-notifications';
import { WorkspaceState } from "@/components/merchant/WorkspaceState";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit,
  ShoppingBag,
  Calendar,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function WhatsAppAutoNotifications() {
  const { t, i18n } = useTranslation();
const triggerLabels: Record<
  string,
  { label: string; icon: React.ReactNode; category: string }
> = {
  order_created: {
    label: t("notificationWorkspace.events.order_created"),
    icon: <ShoppingBag className="h-4 w-4" />,
    category: t("scheduledReports.auto_13"),
  },
  order_confirmed: {
    label: t("notificationWorkspace.events.order_confirmed"),
    icon: <ShoppingBag className="h-4 w-4" />,
    category: t("scheduledReports.auto_13"),
  },
  order_shipped: {
    label: t("notificationWorkspace.events.order_shipped"),
    icon: <ShoppingBag className="h-4 w-4" />,
    category: t("scheduledReports.auto_13"),
  },
  order_delivered: {
    label: t("notificationWorkspace.events.order_delivered"),
    icon: <ShoppingBag className="h-4 w-4" />,
    category: t("scheduledReports.auto_13"),
  },
  order_cancelled: {
    label: t("notificationWorkspace.events.order_cancelled"),
    icon: <ShoppingBag className="h-4 w-4" />,
    category: t("scheduledReports.auto_13"),
  },
  appointment_created: {
    label: t("notificationWorkspace.events.appointment_created"),
    icon: <Calendar className="h-4 w-4" />,
    category: t("scheduledReports.auto_17"),
  },
  appointment_reminder: {
    label: t("notificationWorkspace.events.appointment_reminder"),
    icon: <Calendar className="h-4 w-4" />,
    category: t("scheduledReports.auto_17"),
  },
  appointment_cancelled: {
    label: t("notificationWorkspace.events.appointment_cancelled"),
    icon: <Calendar className="h-4 w-4" />,
    category: t("scheduledReports.auto_17"),
  },
  appointment_rescheduled: {
    label: t("notificationWorkspace.events.appointment_rescheduled"),
    icon: <Calendar className="h-4 w-4" />,
    category: t("scheduledReports.auto_17"),
  },
};


  const capabilities = trpc.advancedNotifications.workspaceCapabilities.useQuery();
  const canManage = capabilities.data?.notificationsManage === true;
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNotification, setEditingNotification] = useState<any>(null);
  const [formData, setFormData] = useState({
    triggerType: "order_created" as TriggerType,
    messageTemplate: "",
    isActive: true,
    delayMinutes: 0,
  });

  const {
    data: notifications,
    isLoading,
    isError,
    refetch,
  } = trpc.advancedNotifications.getWhatsappAutoNotifications.useQuery();
  const { data: defaultTemplates } =
    trpc.advancedNotifications.getDefaultTemplates.useQuery();
  const createMutation =
    trpc.advancedNotifications.createWhatsappAutoNotification.useMutation({
      onSuccess: () => {
        toast.success(t("tenantFormsUx.WhatsAppAutoNotifications.created"));
        setIsDialogOpen(false);
        resetForm();
        refetch();
      },
      onError: () => toast.error(t("tenantFormsUx.failed")),
    });
  const updateMutation =
    trpc.advancedNotifications.updateWhatsappAutoNotification.useMutation({
      onSuccess: () => {
        toast.success(t("tenantFormsUx.WhatsAppAutoNotifications.updated"));
        setIsDialogOpen(false);
        resetForm();
        refetch();
      },
      onError: () => toast.error(t("tenantFormsUx.failed")),
    });
  const deleteMutation =
    trpc.advancedNotifications.deleteWhatsappAutoNotification.useMutation({
      onSuccess: () => {
        setDeleteId(null);
        toast.success(t("tenantFormsUx.WhatsAppAutoNotifications.deleted"));
        refetch();
      },
      onError: () => toast.error(t("tenantFormsUx.failed")),
    });

  const resetForm = () => {
    setFormData({
      triggerType: "order_created",
      messageTemplate: "",
      isActive: true,
      delayMinutes: 0,
    });
    setEditingNotification(null);
  };
  const handleSubmit = () => {
    if (!formData.messageTemplate.trim()) {
      toast.error(t("tenantFormsUx.WhatsAppAutoNotifications.required"));
      return;
    }
    if (editingNotification) {
      updateMutation.mutate({ id: editingNotification.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };
  const handleEdit = (notification: any) => {
    setEditingNotification(notification);
    setFormData({
      triggerType: notification.trigger_type,
      messageTemplate: notification.message_template,
      isActive: Boolean(notification.is_active ?? true),
      delayMinutes: notification.delay_minutes ?? 0,
    });
    setIsDialogOpen(true);
  };
  const loadDefaultTemplate = () => {
    if (defaultTemplates && formData.triggerType) {
      setFormData(p => ({
        ...p,
        messageTemplate:
          defaultTemplates[
            formData.triggerType as keyof typeof defaultTemplates
          ] || "",
      }));
    }
  };

  useEffect(() => {
    if (defaultTemplates && !formData.messageTemplate && !editingNotification) {
      loadDefaultTemplate();
    }
  }, [formData.triggerType, defaultTemplates]);

  if (isError)
    return <WorkspaceState kind="error" onRetry={() => void refetch()} />;
  if (isLoading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );

  const orderNotifications =
    notifications?.filter((n: any) => n.trigger_type.startsWith("order_")) ||
    [];
  const appointmentNotifications =
    notifications?.filter((n: any) =>
      n.trigger_type.startsWith("appointment_")
    ) || [];

  return (
    <div className="container mx-auto py-6 space-y-6" dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}>
      <p className="rounded-xl border bg-muted/40 p-4 text-sm leading-relaxed">{t("notificationWorkspace.configurationOnly")}</p>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {t("workspacePages.autoNotifications")}
          </h1>
          <p className="text-muted-foreground">
            {t("whatsAppAutoNotifications.auto_0")}
          </p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={open => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button disabled={!canManage}>
              <Plus className="h-4 w-4 ml-2" />
              {t("tenantFormsUx.WhatsAppAutoNotifications.new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="mw-form-dialog max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingNotification ? t("notificationWorkspace.editNotification") : t("notificationWorkspace.newNotification")}
              </DialogTitle>
              <DialogDescription>
                {t("tenantFormsUx.WhatsAppAutoNotifications.description")}
              </DialogDescription>
            </DialogHeader>
            <form
              id="auto-notification-form"
              onSubmit={e => {
                e.preventDefault();
                handleSubmit();
              }}
              className="grid min-h-0 overflow-y-auto gap-4 py-4"
            >
              <div className="space-y-2">
                <Label htmlFor="auto-notification-form-triggerType">
                  {t("tenantFormsUx.WhatsAppAutoNotifications.event")}
                </Label>
                <Select
                  value={formData.triggerType}
                  onValueChange={v =>
                    setFormData(p => ({
                      ...p,
                      triggerType: v as TriggerType,
                      messageTemplate:
                        defaultTemplates?.[
                          v as keyof typeof defaultTemplates
                        ] || "",
                    }))
                  }
                >
                  <SelectTrigger id="auto-notification-form-triggerType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(triggerLabels).map(
                      ([key, { label, category }]) => (
                        <SelectItem key={key} value={key}>
                          {category} - {label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="auto-notification-form-messageTemplate">
                    {t("tenantFormsUx.WhatsAppAutoNotifications.message")}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={loadDefaultTemplate}
                  >
                    <RotateCcw className="h-4 w-4 ml-1" />
                    {t("whatsAppAutoNotifications.auto_1")}
                  </Button>
                </div>
                <Textarea
                  required
                  maxLength={4000}
                  id="auto-notification-form-messageTemplate"
                  value={formData.messageTemplate}
                  onChange={e =>
                    setFormData(p => ({
                      ...p,
                      messageTemplate: e.target.value,
                    }))
                  }
                  placeholder={t("whatsAppAutoNotifications.auto_4")}
                  className="min-h-[200px]"
                  dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
                />
                <p className="text-xs text-muted-foreground">
                  {t("notificationWorkspace.variables")}{" "}
                  {t("whatsAppAutoNotifications.auto_5", {
                    skipInterpolation: true,
                  })}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-notification-form-isActive">
                  {t("tenantFormsUx.WhatsAppAutoNotifications.active")}
                </Label>
                <Switch
                  id="auto-notification-form-isActive"
                  checked={formData.isActive}
                  onCheckedChange={v =>
                    setFormData(p => ({ ...p, isActive: v }))
                  }
                />
              </div>
            </form>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                {t("tenantFormsUx.WhatsAppAutoNotifications.cancel")}
              </Button>
              <Button
                type="submit"
                form="auto-notification-form"
                disabled={!canManage || createMutation.isPending || updateMutation.isPending}
              >
                {editingNotification ? t("notificationWorkspace.update") : t("notificationWorkspace.create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              <CardTitle>
                {t("tenantFormsUx.WhatsAppAutoNotifications.orders")}
              </CardTitle>
            </div>
            <CardDescription>
              {t("whatsAppAutoNotifications.auto_2")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {orderNotifications.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                {t("tenantFormsUx.WhatsAppAutoNotifications.emptyOrders")}
              </p>
            ) : (
              orderNotifications.map((notification: any) => (
                <div
                  key={notification.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {triggerLabels[notification.trigger_type]?.icon}
                    <div className="min-w-0 break-words">
                      <p className="font-medium">
                        {triggerLabels[notification.trigger_type]?.label ||
                          notification.trigger_type}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {notification.message_template.substring(0, 50)}...
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={notification.is_active ? "default" : "secondary"}
                    >
                      {notification.is_active ? t("notificationWorkspace.savedEnabled") : t("notificationWorkspace.savedDisabled")}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(notification)}
                      disabled={!canManage}
                    >
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">{t("tenantFormsUx.edit")}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => setDeleteId(notification.id)}
                      disabled={!canManage}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">
                        {t("tenantFormsUx.delete")}
                      </span>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <CardTitle>
                {t("tenantFormsUx.WhatsAppAutoNotifications.appointments")}
              </CardTitle>
            </div>
            <CardDescription>
              {t("whatsAppAutoNotifications.auto_3")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {appointmentNotifications.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                {t("tenantFormsUx.WhatsAppAutoNotifications.emptyAppointments")}
              </p>
            ) : (
              appointmentNotifications.map((notification: any) => (
                <div
                  key={notification.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {triggerLabels[notification.trigger_type]?.icon}
                    <div className="min-w-0 break-words">
                      <p className="font-medium">
                        {triggerLabels[notification.trigger_type]?.label ||
                          notification.trigger_type}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {notification.message_template.substring(0, 50)}...
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={notification.is_active ? "default" : "secondary"}
                    >
                      {notification.is_active ? t("notificationWorkspace.savedEnabled") : t("notificationWorkspace.savedDisabled")}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(notification)}
                      disabled={!canManage}
                    >
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">{t("tenantFormsUx.edit")}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600"
                      onClick={() => setDeleteId(notification.id)}
                      disabled={!canManage}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">
                        {t("tenantFormsUx.delete")}
                      </span>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog
        open={deleteId !== null}
        onOpenChange={open => {
          if (!open) setDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tenantFormsUx.confirmDelete")}</DialogTitle>
            <DialogDescription>
              {t("tenantFormsUx.deleteHelp")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              {t("tenantFormsUx.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!canManage || deleteMutation.isPending}
              onClick={() => {
                if (deleteId !== null) deleteMutation.mutate({ id: deleteId });
              }}
            >
              {t("tenantFormsUx.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
