// @ts-nocheck
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
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
  FileText,
  Plus,
  Trash2,
  Edit,
  Clock,
  Mail,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function ScheduledReports() {
  const { t, i18n } = useTranslation();
  const reportTypeLabels: Record<string, string> = {daily:t("scheduledReports.auto_2"),weekly:t("scheduledReports.auto_3"),monthly:t("scheduledReports.auto_4"),custom:t("notificationWorkspace.custom")};
  const deliveryMethodLabels: Record<string, string> = {email:t("scheduledReports.auto_7"),whatsapp:t("scheduledReports.auto_8"),both:t("scheduledReports.auto_9")};
  const dayLabels = [t("notificationWorkspace.days.0"),t("notificationWorkspace.days.1"),t("notificationWorkspace.days.2"),t("notificationWorkspace.days.3"),t("notificationWorkspace.days.4"),t("notificationWorkspace.days.5"),t("notificationWorkspace.days.6")];
  const capabilities = trpc.advancedNotifications.workspaceCapabilities.useQuery();
  const canManage = capabilities.data?.reportsManage === true;
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    reportType: "weekly" as const,
    scheduleDay: 0,
    scheduleTime: "09:00",
    deliveryMethod: "email" as const,
    recipientEmail: "",
    recipientPhone: "",
    includeConversations: true,
    includeOrders: true,
    includeRevenue: true,
    includeProducts: true,
    includeCustomers: true,
    includeAppointments: true,
  });

  const {
    data: reports,
    isLoading,
    isError,
    refetch,
  } = trpc.advancedNotifications.getScheduledReports.useQuery(undefined as any);
  const createMutation =
    trpc.advancedNotifications.createScheduledReport.useMutation({
      onSuccess: () => {
        toast.success(t("tenantFormsUx.ScheduledReports.created"));
        setIsDialogOpen(false);
        resetForm();
        refetch();
      },
      onError: () => toast.error(t("tenantFormsUx.failed")),
    });
  const updateMutation =
    trpc.advancedNotifications.updateScheduledReport.useMutation({
      onSuccess: () => {
        toast.success(t("tenantFormsUx.ScheduledReports.updated"));
        setIsDialogOpen(false);
        resetForm();
        refetch();
      },
      onError: () => toast.error(t("tenantFormsUx.failed")),
    });
  const deleteMutation =
    trpc.advancedNotifications.deleteScheduledReport.useMutation({
      onSuccess: () => {
        setDeleteId(null);
        toast.success(t("tenantFormsUx.ScheduledReports.deleted"));
        refetch();
      },
      onError: () => toast.error(t("tenantFormsUx.failed")),
    });

  const resetForm = () => {
    setFormData({
      name: "",
      reportType: "weekly",
      scheduleDay: 0,
      scheduleTime: "09:00",
      deliveryMethod: "email",
      recipientEmail: "",
      recipientPhone: "",
      includeConversations: true,
      includeOrders: true,
      includeRevenue: true,
      includeProducts: true,
      includeCustomers: true,
      includeAppointments: true,
    });
    setEditingReport(null);
  };
  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error(t("tenantFormsUx.ScheduledReports.required"));
      return;
    }
    if (editingReport) {
      updateMutation.mutate({ id: editingReport.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };
  const handleEdit = (report: any) => {
    setEditingReport(report);
    setFormData({
      name: report.name,
      reportType: report.report_type,
      scheduleDay: report.schedule_day || 0,
      scheduleTime: report.schedule_time || "09:00",
      deliveryMethod: report.delivery_method || "email",
      recipientEmail: report.recipient_email || "",
      recipientPhone: report.recipient_phone || "",
      includeConversations: Boolean(report.include_conversations ?? true),
      includeOrders: Boolean(report.include_orders ?? true),
      includeRevenue: Boolean(report.include_revenue ?? true),
      includeProducts: Boolean(report.include_products ?? true),
      includeCustomers: Boolean(report.include_customers ?? true),
      includeAppointments: Boolean(report.include_appointments ?? true),
    });
    setIsDialogOpen(true);
  };

  if (isError)
    return <WorkspaceState kind="error" onRetry={() => void refetch()} />;
  if (isLoading)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );

  return (
    <div className="container mx-auto py-6 space-y-6" dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}>
      <p className="rounded-xl border bg-muted/40 p-4 text-sm leading-relaxed">{t("notificationWorkspace.configurationOnly")}</p>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {t("workspacePages.scheduledReports")}
          </h1>
          <p className="text-muted-foreground">
            {t("scheduledReports.auto_0")}
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
              {t("tenantFormsUx.ScheduledReports.new")}
            </Button>
          </DialogTrigger>
          <DialogContent className="mw-form-dialog max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingReport ? t("notificationWorkspace.editReport") : t("notificationWorkspace.newReport")}
              </DialogTitle>
              <DialogDescription>
                {t("tenantFormsUx.ScheduledReports.description")}
              </DialogDescription>
            </DialogHeader>
            <form
              id="scheduled-report-form"
              onSubmit={e => {
                e.preventDefault();
                handleSubmit();
              }}
              className="grid min-h-0 overflow-y-auto gap-4 py-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="scheduled-report-form-name">
                    {t("tenantFormsUx.ScheduledReports.name")}
                  </Label>
                  <Input
                    required
                    maxLength={200}
                    id="scheduled-report-form-name"
                    value={formData.name}
                    onChange={e =>
                      setFormData(p => ({ ...p, name: e.target.value }))
                    }
                    placeholder={t("scheduledReports.auto_19")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scheduled-report-form-reportType">
                    {t("scheduledReports.auto_1")}
                  </Label>
                  <Select
                    value={formData.reportType}
                    onValueChange={(v: any) =>
                      setFormData(p => ({
                        ...p,
                        reportType: v,
                        scheduleDay: v === "monthly" ? 1 : 0,
                      }))
                    }
                  >
                    <SelectTrigger id="scheduled-report-form-reportType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">
                        {t("scheduledReports.auto_2")}
                      </SelectItem>
                      <SelectItem value="weekly">
                        {t("scheduledReports.auto_3")}
                      </SelectItem>
                      <SelectItem value="monthly">
                        {t("scheduledReports.auto_4")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {formData.reportType === "weekly" && (
                  <div className="space-y-2">
                    <Label htmlFor="scheduled-report-form-scheduleDay">
                      {t("tenantFormsUx.ScheduledReports.day")}
                    </Label>
                    <Select
                      value={String(formData.scheduleDay)}
                      onValueChange={v =>
                        setFormData(p => ({ ...p, scheduleDay: parseInt(v) }))
                      }
                    >
                      <SelectTrigger id="scheduled-report-form-scheduleDay">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {dayLabels.map((day, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {formData.reportType === "monthly" && (
                  <div className="space-y-2">
                    <Label htmlFor="scheduled-report-form-monthDay">
                      {t("scheduledReports.auto_5")}
                    </Label>
                    <Input
                      id="scheduled-report-form-monthDay"
                      required
                      type="number"
                      min="1"
                      max="28"
                      value={formData.scheduleDay || 1}
                      onChange={e =>
                        setFormData(p => ({
                          ...p,
                          scheduleDay: parseInt(e.target.value) || 1,
                        }))
                      }
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="scheduled-report-form-scheduleTime">
                    {t("scheduledReports.auto_6")}
                  </Label>
                  <Input
                    required
                    id="scheduled-report-form-scheduleTime"
                    type="time"
                    value={formData.scheduleTime}
                    onChange={e =>
                      setFormData(p => ({ ...p, scheduleTime: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="scheduled-report-form-deliveryMethod">
                    {t("tenantFormsUx.ScheduledReports.delivery")}
                  </Label>
                  <Select
                    value={formData.deliveryMethod}
                    onValueChange={(v: any) =>
                      setFormData(p => ({ ...p, deliveryMethod: v }))
                    }
                  >
                    <SelectTrigger id="scheduled-report-form-deliveryMethod">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">
                        {t("scheduledReports.auto_7")}
                      </SelectItem>
                      <SelectItem value="whatsapp">
                        {t("scheduledReports.auto_8")}
                      </SelectItem>
                      <SelectItem value="both">
                        {t("scheduledReports.auto_9")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(formData.deliveryMethod === "email" ||
                  formData.deliveryMethod === "both") && (
                  <div className="space-y-2">
                    <Label htmlFor="scheduled-report-form-recipientEmail">
                      {t("scheduledReports.auto_10")}
                    </Label>
                    <Input
                      required
                      id="scheduled-report-form-recipientEmail"
                      type="email"
                      value={formData.recipientEmail}
                      onChange={e =>
                        setFormData(p => ({
                          ...p,
                          recipientEmail: e.target.value,
                        }))
                      }
                      placeholder="email@example.com"
                    />
                  </div>
                )}
                {(formData.deliveryMethod === "whatsapp" ||
                  formData.deliveryMethod === "both") && (
                  <div className="space-y-2">
                    <Label htmlFor="scheduled-report-form-recipientPhone">
                      {t("scheduledReports.auto_11")}
                    </Label>
                    <Input
                      required
                      type="tel"
                      pattern="[+]?[0-9]{7,15}"
                      id="scheduled-report-form-recipientPhone"
                      value={formData.recipientPhone}
                      onChange={e =>
                        setFormData(p => ({
                          ...p,
                          recipientPhone: e.target.value,
                        }))
                      }
                      placeholder="+966500000000"
                    />
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <Label>{t("tenantFormsUx.ScheduledReports.contents")}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between">
                    <Label className="font-normal">
                      {t("scheduledReports.auto_12")}
                    </Label>
                    <Switch
                      aria-label={t("scheduledReports.auto_12")}
                      checked={formData.includeConversations}
                      onCheckedChange={v =>
                        setFormData(p => ({ ...p, includeConversations: v }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="font-normal">
                      {t("scheduledReports.auto_13")}
                    </Label>
                    <Switch
                      aria-label={t("scheduledReports.auto_13")}
                      checked={formData.includeOrders}
                      onCheckedChange={v =>
                        setFormData(p => ({ ...p, includeOrders: v }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="font-normal">
                      {t("scheduledReports.auto_14")}
                    </Label>
                    <Switch
                      aria-label={t("scheduledReports.auto_14")}
                      checked={formData.includeRevenue}
                      onCheckedChange={v =>
                        setFormData(p => ({ ...p, includeRevenue: v }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="font-normal">
                      {t("scheduledReports.auto_15")}
                    </Label>
                    <Switch
                      aria-label={t("scheduledReports.auto_15")}
                      checked={formData.includeProducts}
                      onCheckedChange={v =>
                        setFormData(p => ({ ...p, includeProducts: v }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="font-normal">
                      {t("scheduledReports.auto_16")}
                    </Label>
                    <Switch
                      aria-label={t("scheduledReports.auto_16")}
                      checked={formData.includeCustomers}
                      onCheckedChange={v =>
                        setFormData(p => ({ ...p, includeCustomers: v }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="font-normal">
                      {t("scheduledReports.auto_17")}
                    </Label>
                    <Switch
                      aria-label={t("scheduledReports.auto_17")}
                      checked={formData.includeAppointments}
                      onCheckedChange={v =>
                        setFormData(p => ({ ...p, includeAppointments: v }))
                      }
                    />
                  </div>
                </div>
              </div>
            </form>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                {t("tenantFormsUx.ScheduledReports.cancel")}
              </Button>
              <Button
                type="submit"
                form="scheduled-report-form"
                disabled={!canManage || createMutation.isPending || updateMutation.isPending}
              >
                {editingReport ? t("notificationWorkspace.update") : t("notificationWorkspace.create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {!reports || reports.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {t("tenantFormsUx.ScheduledReports.empty")}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setIsDialogOpen(true)}
                disabled={!canManage}
              >
                <Plus className="h-4 w-4 ml-2" />
                {t("scheduledReports.auto_18")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          reports.map((report: any) => (
            <Card key={report.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 break-words">
                    <CardTitle className="text-lg break-words">{report.name}</CardTitle>
                    <CardDescription>
                      {reportTypeLabels[report.report_type] ||
                        report.report_type}
                    </CardDescription>
                  </div>
                  <Badge variant={report.is_active ? "default" : "secondary"}>
                    {report.is_active ? t("notificationWorkspace.savedEnabled") : t("notificationWorkspace.savedDisabled")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{report.schedule_time || "09:00"}</span>
                  {report.report_type === "weekly" && (
                    <span>- {dayLabels[report.schedule_day || 0]}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {report.delivery_method === "email" ||
                  report.delivery_method === "both" ? (
                    <Mail className="h-4 w-4" />
                  ) : null}
                  {report.delivery_method === "whatsapp" ||
                  report.delivery_method === "both" ? (
                    <MessageSquare className="h-4 w-4" />
                  ) : null}
                  <span>
                    {deliveryMethodLabels[report.delivery_method] ||
                      report.delivery_method}
                  </span>
                </div>
                {report.last_sent_at && (
                  <p className="text-xs text-muted-foreground">
                    {t("notificationWorkspace.lastSent")}{" "}
                    {new Date(report.last_sent_at).toLocaleString(i18n.language)}
                  </p>
                )}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(report)}
                    disabled={!canManage}
                  >
                    <Edit className="h-4 w-4 ml-1" />
                    {t("tenantFormsUx.ScheduledReports.edit")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => setDeleteId(report.id)}
                    disabled={!canManage}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">{t("tenantFormsUx.delete")}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
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
