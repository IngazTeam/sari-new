import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Star, StarOff, CheckCircle2, XCircle, Clock, AlertCircle, RefreshCw } from "lucide-react";

export default function WhatsAppInstancesPage() {
  const { user } = useAuth();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    instanceId: "",
    token: "",
    apiUrl: "https://api.green-api.com",
    phoneNumber: "",
    webhookUrl: "",
    isPrimary: false,
    expiresAt: "",
  });

  // Get merchant
  const { data: merchants } = trpc.merchants.list.useQuery(
    undefined,
    { enabled: !!user }
  );
  const merchant = merchants?.[0];

  // Get instances
  const { data: instances, refetch } = trpc.whatsappInstances.list.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Get stats
  const { data: stats } = trpc.whatsappInstances.getStats.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Get expiring instances
  const { data: expiringData } = trpc.whatsappInstances.getExpiring.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Mutations
  const createMutation = trpc.whatsappInstances.create.useMutation({
    onSuccess: () => {
      toast.success("t('toast.instances.msg1')}");
      setShowAddDialog(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "فشل إضافة Instance");
    },
  });

  const updateMutation = trpc.whatsappInstances.update.useMutation({
    onSuccess: () => {
      toast.success("t('toast.instances.msg3')}");
      setShowEditDialog(false);
      setSelectedInstance(null);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "فشل تحديث Instance");
    },
  });

  const setPrimaryMutation = trpc.whatsappInstances.setPrimary.useMutation({
    onSuccess: () => {
      toast.success("t('toast.instances.msg5')}");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "فشل تعيين Primary");
    },
  });

  const deleteMutation = trpc.whatsappInstances.delete.useMutation({
    onSuccess: () => {
      toast.success("t('toast.instances.msg7')}");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "فشل حذف Instance");
    },
  });

  const testConnectionMutation = trpc.whatsappInstances.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`t('toast.instances.msg9')}: ${data.status}`);
      } else {
        toast.error(`t('toast.instances.msg10')}: ${data.message}`);
      }
      setTestingConnection(false);
    },
    onError: (error) => {
      toast.error(error.message || "فشل اختبار الاتصال");
      setTestingConnection(false);
    },
  });

  const resetForm = () => {
    setFormData({
      instanceId: "",
      token: "",
      apiUrl: "https://api.green-api.com",
      phoneNumber: "",
      webhookUrl: "",
      isPrimary: false,
      expiresAt: "",
    });
  };

  const handleAdd = () => {
    if (!merchant) return;
    createMutation.mutate({
      merchantId: merchant.id,
      ...formData,
    });
  };

  const handleUpdate = () => {
    if (!merchant || !selectedInstance) return;
    updateMutation.mutate({
      id: selectedInstance.id,
      merchantId: merchant.id,
      ...formData,
    });
  };

  const handleSetPrimary = (instanceId: number) => {
    if (!merchant) return;
    setPrimaryMutation.mutate({
      id: instanceId,
      merchantId: merchant.id,
    });
  };

  const handleDelete = (instanceId: number) => {
    if (!merchant) return;
    if (confirm("هل أنت متأكد من حذف هذا Instance؟")) {
      deleteMutation.mutate({
        id: instanceId,
        merchantId: merchant.id,
      });
    }
  };

  const handleTestConnection = () => {
    setTestingConnection(true);
    testConnectionMutation.mutate({
      instanceId: formData.instanceId,
      token: formData.token,
      apiUrl: formData.apiUrl,
    });
  };

  const handleEdit = (instance: any) => {
    setSelectedInstance(instance);
    setFormData({
      instanceId: instance.instanceId,
      token: instance.token,
      apiUrl: instance.apiUrl || "https://api.green-api.com",
      phoneNumber: instance.phoneNumber || "",
      webhookUrl: instance.webhookUrl || "",
      isPrimary: instance.isPrimary,
      expiresAt: instance.expiresAt ? new Date(instance.expiresAt).toISOString().split('T')[0] : "",
    });
    setShowEditDialog(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 ml-1" />نشط</Badge>;
      case "inactive":
        return <Badge variant="secondary"><XCircle className="w-3 h-3 ml-1" />غير نشط</Badge>;
      case "pending":
        return <Badge variant="outline"><Clock className="w-3 h-3 ml-1" />قيد الانتظار</Badge>;
      case "expired":
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 ml-1" />منتهي</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (!merchant) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">إدارة WhatsApp Instances</h1>
          <p className="text-muted-foreground mt-1">
            إدارة اتصالات الواتساب المتعددة لمتجرك
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="w-4 h-4 ml-2" />
          إضافة Instance جديد
        </Button>
      </div>

      {/* Expiring Instances Alert */}
      {expiringData && (expiringData.expiring1Day.length > 0 || expiringData.expiring3Days.length > 0 || expiringData.expired.length > 0) && (
        <Card className="border-red-500 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              تحذير: Instances قريبة من الانتهاء
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringData.expired.length > 0 && (
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="w-4 h-4" />
                  <span className="font-semibold">{expiringData.expired.length}</span>
                  <span>instance منتهي - يرجى التجديد فوراً</span>
                </div>
              )}
              {expiringData.expiring1Day.length > 0 && (
                <div className="flex items-center gap-2 text-orange-700">
                  <Clock className="w-4 h-4" />
                  <span className="font-semibold">{expiringData.expiring1Day.length}</span>
                  <span>instance ينتهي خلال 24 ساعة</span>
                </div>
              )}
              {expiringData.expiring3Days.length > 0 && (
                <div className="flex items-center gap-2 text-yellow-700">
                  <Clock className="w-4 h-4" />
                  <span className="font-semibold">{expiringData.expiring3Days.length}</span>
                  <span>instance ينتهي خلال 3 أيام</span>
                </div>
              )}
              {expiringData.expiring7Days.length > 0 && (
                <div className="flex items-center gap-2 text-primary">
                  <Clock className="w-4 h-4" />
                  <span className="font-semibold">{expiringData.expiring7Days.length}</span>
                  <span>instance ينتهي خلال 7 أيام</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">إجمالي Instances</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">نشط</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">غير نشط</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">{stats.inactive}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">منتهي</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.expired}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Instances List */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة Instances</CardTitle>
          <CardDescription>جميع اتصالات الواتساب المسجلة</CardDescription>
        </CardHeader>
        <CardContent>
          {!instances || instances.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">لا توجد instances مسجلة</p>
              <Button onClick={() => setShowAddDialog(true)} className="mt-4">
                <Plus className="w-4 h-4 ml-2" />
                إضافة Instance الأول
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {instances.map((instance) => (
                <Card key={instance.id} className={instance.isPrimary ? "border-blue-500 border-2" : ""}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{instance.instanceId}</h3>
                          {instance.isPrimary && (
                            <Badge className="bg-primary/100">
                              <Star className="w-3 h-3 ml-1 fill-current" />
                              Primary
                            </Badge>
                          )}
                          {getStatusBadge(instance.status)}
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">رقم الهاتف:</span>
                            <span className="mr-2 font-medium">{instance.phoneNumber || "غير محدد"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">API URL:</span>
                            <span className="mr-2 font-mono text-xs">{instance.apiUrl}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">تاريخ الإضافة:</span>
                            <span className="mr-2">{new Date(instance.createdAt).toLocaleDateString('ar-SA')}</span>
                          </div>
                          {instance.expiresAt && (
                            <div>
                              <span className="text-muted-foreground">تاريخ الانتهاء:</span>
                              <span className="mr-2">{new Date(instance.expiresAt).toLocaleDateString('ar-SA')}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {!instance.isPrimary && instance.status === 'active' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetPrimary(instance.id)}
                          >
                            <Star className="w-4 h-4 ml-1" />
                            تعيين كـ Primary
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(instance)}
                        >
                          تعديل
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(instance.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>إضافة WhatsApp Instance جديد</DialogTitle>
            <DialogDescription>
              أدخل بيانات Green API Instance الخاص بك
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="instanceId">Instance ID *</Label>
              <Input
                id="instanceId"
                value={formData.instanceId}
                onChange={(e) => setFormData({ ...formData, instanceId: e.target.value })}
                placeholder="1234567890"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="token">API Token *</Label>
              <Input
                id="token"
                type="password"
                value={formData.token}
                onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                placeholder="your-api-token"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="apiUrl">API URL</Label>
              <Input
                id="apiUrl"
                value={formData.apiUrl}
                onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                placeholder="https://api.green-api.com"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phoneNumber">رقم الهاتف (اختياري)</Label>
              <Input
                id="phoneNumber"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                placeholder="+966500000000"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="webhookUrl">Webhook URL (اختياري)</Label>
              <Input
                id="webhookUrl"
                value={formData.webhookUrl}
                onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                placeholder="https://your-domain.com/webhook"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="expiresAt">تاريخ الانتهاء (اختياري)</Label>
              <Input
                id="expiresAt"
                type="date"
                value={formData.expiresAt}
                onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPrimary"
                checked={formData.isPrimary}
                onChange={(e) => setFormData({ ...formData, isPrimary: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="isPrimary" className="cursor-pointer">
                تعيين كـ Primary Instance
              </Label>
            </div>

            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={!formData.instanceId || !formData.token || testingConnection}
            >
              <RefreshCw className={`w-4 h-4 ml-2 ${testingConnection ? 'animate-spin' : ''}`} />
              اختبار الاتصال
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>
              إلغاء
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!formData.instanceId || !formData.token || createMutation.isPending}
            >
              {createMutation.isPending ? "جاري الإضافة..." : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تعديل WhatsApp Instance</DialogTitle>
            <DialogDescription>
              تحديث بيانات Instance
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-instanceId">Instance ID</Label>
              <Input
                id="edit-instanceId"
                value={formData.instanceId}
                onChange={(e) => setFormData({ ...formData, instanceId: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-token">API Token</Label>
              <Input
                id="edit-token"
                type="password"
                value={formData.token}
                onChange={(e) => setFormData({ ...formData, token: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-phoneNumber">رقم الهاتف</Label>
              <Input
                id="edit-phoneNumber"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-expiresAt">تاريخ الانتهاء</Label>
              <Input
                id="edit-expiresAt"
                type="date"
                value={formData.expiresAt}
                onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setSelectedInstance(null); resetForm(); }}>
              إلغاء
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "جاري التحديث..." : "تحديث"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
