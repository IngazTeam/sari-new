import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Settings as SettingsIcon, Plus, Pencil, Check, X, History, Clock, Filter, RotateCcw } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';
interface PlanFormData {
  id?: number;
  name: string;
  nameAr: string;
  priceMonthly: number;
  conversationLimit: number;
  voiceMessageLimit: number;
  features: string;
  isActive: boolean;
}

export default function Settings() {
  const { t } = useTranslation();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanFormData | null>(null);
  
  // Filters state
  const [filterPlanId, setFilterPlanId] = useState<number | 'all'>('all');
  const [filterFieldName, setFilterFieldName] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');

  const { data: plans, isLoading, refetch } = trpc.plans.list.useQuery();
  const { data: changeLogs, refetch: refetchLogs } = trpc.plans.getChangeLogs.useQuery({});
  
  // Filter logs
  const filteredLogs = useMemo(() => {
    if (!changeLogs) return [];
    
    return changeLogs.filter((log) => {
      // Filter by plan
      if (filterPlanId !== 'all' && log.planId !== filterPlanId) {
        return false;
      }
      
      // Filter by field name
      if (filterFieldName !== 'all' && log.fieldName !== filterFieldName) {
        return false;
      }
      
      // Filter by date range
      if (filterDateFrom) {
        const logDate = new Date(log.createdAt);
        const fromDate = new Date(filterDateFrom);
        if (logDate < fromDate) {
          return false;
        }
      }
      
      if (filterDateTo) {
        const logDate = new Date(log.createdAt);
        const toDate = new Date(filterDateTo);
        toDate.setHours(23, 59, 59, 999); // End of day
        if (logDate > toDate) {
          return false;
        }
      }
      
      return true;
    });
  }, [changeLogs, filterPlanId, filterFieldName, filterDateFrom, filterDateTo]);
  const { data: users } = trpc.auth.me.useQuery();

  const createMutation = trpc.plans.create.useMutation({
    onSuccess: () => {
      toast.success(t('toast.common.msg1'));
      refetch();
      setIsDialogOpen(false);
      setEditingPlan(null);
    },
    onError: (error) => {
      toast.error(error.message || 'فشل إضافة الباقة');
    },
  });

  const updateMutation = trpc.plans.update.useMutation({
    onSuccess: () => {
      toast.success(t('toast.common.msg1'));
      refetch();
      refetchLogs();
      setIsDialogOpen(false);
      setEditingPlan(null);
    },
    onError: (error) => {
      toast.error(error.message || 'فشل تحديث الباقة');
    },
  });

  const handleOpenDialog = (plan?: any) => {
    if (plan) {
      setEditingPlan({
        id: plan.id,
        name: plan.name,
        nameAr: plan.nameAr,
        priceMonthly: plan.priceMonthly,
        conversationLimit: plan.conversationLimit,
        voiceMessageLimit: plan.voiceMessageLimit,
        features: plan.features || '',
        isActive: plan.isActive,
      });
    } else {
      setEditingPlan({
        name: '',
        nameAr: '',
        priceMonthly: 0,
        conversationLimit: 0,
        voiceMessageLimit: 0,
        features: '',
        isActive: true,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPlan(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    if (editingPlan.id) {
      // Update existing plan
      await updateMutation.mutateAsync({
        id: editingPlan.id,
        name: editingPlan.name,
        nameAr: editingPlan.nameAr,
        priceMonthly: editingPlan.priceMonthly,
        conversationLimit: editingPlan.conversationLimit,
        voiceMessageLimit: editingPlan.voiceMessageLimit,
        features: editingPlan.features,
        isActive: editingPlan.isActive,
      });
    } else {
      // Create new plan
      await createMutation.mutateAsync({
        name: editingPlan.name,
        nameAr: editingPlan.nameAr,
        priceMonthly: editingPlan.priceMonthly,
        conversationLimit: editingPlan.conversationLimit,
        voiceMessageLimit: editingPlan.voiceMessageLimit,
        features: editingPlan.features,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <SettingsIcon className="w-8 h-8" />
            إعدادات النظام
          </h1>
          <p className="text-muted-foreground mt-2">
            إدارة الباقات والأسعار والإعدادات العامة
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4 ml-2" />
          باقة جديدة
        </Button>
      </div>

      {/* Plans Management */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adminSettingsPage.text0')}</CardTitle>
          <CardDescription>
            الباقات المتاحة للتجار مع الأسعار والحدود
          </CardDescription>
        </CardHeader>
        <CardContent>
          {plans && plans.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('adminSettingsPage.text1')}</TableHead>
                  <TableHead>{t('adminSettingsPage.text2')}</TableHead>
                  <TableHead>{t('adminSettingsPage.text3')}</TableHead>
                  <TableHead>{t('adminSettingsPage.text4')}</TableHead>
                  <TableHead>{t('adminSettingsPage.text5')}</TableHead>
                  <TableHead>{t('adminSettingsPage.text6')}</TableHead>
                  <TableHead className="text-left">{t('adminSettingsPage.text7')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell>{plan.nameAr}</TableCell>
                    <TableCell>
                      <span className="font-bold text-green-600">
                        {plan.priceMonthly} ريال
                      </span>
                    </TableCell>
                    <TableCell>
                      {plan.conversationLimit.toLocaleString('ar-SA')} محادثة
                    </TableCell>
                    <TableCell>
                      {plan.voiceMessageLimit === -1
                        ? 'غير محدود'
                        : t('adminSettingsPage.text8', { var0: plan.voiceMessageLimit.toLocaleString('ar-SA') })}
                    </TableCell>
                    <TableCell>
                      {plan.isActive ? (
                        <Badge variant="default" className="flex items-center w-fit">
                          <Check className="w-3 h-3 ml-1" />
                          نشط
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="flex items-center w-fit">
                          <X className="w-3 h-3 ml-1" />
                          غير نشط
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenDialog(plan)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <SettingsIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('adminSettingsPage.text9')}</h3>
              <p className="text-muted-foreground mb-4">
                ابدأ بإضافة الباقات الثلاث الأساسية
              </p>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="w-4 h-4 ml-2" />
                إضافة باقة جديدة
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suggested Plans Info */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adminSettingsPage.text10')}</CardTitle>
          <CardDescription>
            الباقات الثلاث الأساسية للنظام
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-center">B1 - Starter</CardTitle>
                <div className="text-center">
                  <span className="text-3xl font-bold text-green-600">{t('adminSettingsPage.text11')}</span>
                  <span className="text-muted-foreground">{t('adminSettingsPage.text12')}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('adminSettingsPage.text13')}</span>
                  <span className="font-semibold">{t('adminSettingsPage.text14')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('adminSettingsPage.text15')}</span>
                  <span className="font-semibold">{t('adminSettingsPage.text16')}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-primary">
              <CardHeader>
                <CardTitle className="text-center">B2 - Growth</CardTitle>
                <div className="text-center">
                  <span className="text-3xl font-bold text-green-600">{t('adminSettingsPage.text17')}</span>
                  <span className="text-muted-foreground">{t('adminSettingsPage.text18')}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('adminSettingsPage.text19')}</span>
                  <span className="font-semibold">{t('adminSettingsPage.text20')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('adminSettingsPage.text21')}</span>
                  <span className="font-semibold">{t('adminSettingsPage.text22')}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-center">B3 - Pro</CardTitle>
                <div className="text-center">
                  <span className="text-3xl font-bold text-green-600">{t('adminSettingsPage.text23')}</span>
                  <span className="text-muted-foreground">{t('adminSettingsPage.text24')}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('adminSettingsPage.text25')}</span>
                  <span className="font-semibold">{t('adminSettingsPage.text26')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('adminSettingsPage.text27')}</span>
                  <span className="font-semibold">{t('adminSettingsPage.text28')}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Change Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            سجل التغييرات
          </CardTitle>
          <CardDescription>
            تاريخ جميع التعديلات التي تمت على الباقات
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-6 p-4 bg-muted/50 rounded-lg space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4" />
              <h4 className="font-semibold">{t('adminSettingsPage.text29')}</h4>
            </div>
            
            <div className="grid gap-4 md:grid-cols-4">
              {/* Plan Filter */}
              <div className="space-y-2">
                <Label htmlFor="filter-plan">{t('adminSettingsPage.text30')}</Label>
                <select
                  id="filter-plan"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  value={filterPlanId}
                  onChange={(e) => setFilterPlanId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                >
                  <option value="all">{t('adminSettingsPage.text31')}</option>
                  {plans?.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - {plan.nameAr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Field Filter */}
              <div className="space-y-2">
                <Label htmlFor="filter-field">{t('adminSettingsPage.text32')}</Label>
                <select
                  id="filter-field"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  value={filterFieldName}
                  onChange={(e) => setFilterFieldName(e.target.value)}
                >
                  <option value="all">{t('adminSettingsPage.text33')}</option>
                  <option value="priceMonthly">{t('adminSettingsPage.text34')}</option>
                  <option value="conversationLimit">{t('adminSettingsPage.text35')}</option>
                  <option value="voiceMessageLimit">{t('adminSettingsPage.text36')}</option>
                  <option value="name">{t('adminSettingsPage.text37')}</option>
                  <option value="nameAr">{t('adminSettingsPage.text38')}</option>
                  <option value="isActive">{t('adminSettingsPage.text39')}</option>
                </select>
              </div>

              {/* Date From Filter */}
              <div className="space-y-2">
                <Label htmlFor="filter-date-from">{t('adminSettingsPage.text40')}</Label>
                <Input
                  id="filter-date-from"
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                />
              </div>

              {/* Date To Filter */}
              <div className="space-y-2">
                <Label htmlFor="filter-date-to">{t('adminSettingsPage.text41')}</Label>
                <Input
                  id="filter-date-to"
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                />
              </div>
            </div>

            {/* Reset Button */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilterPlanId('all');
                  setFilterFieldName('all');
                  setFilterDateFrom('');
                  setFilterDateTo('');
                }}
              >
                <RotateCcw className="w-4 h-4 ml-2" />
                إعادة تعيين
              </Button>
            </div>
          </div>

          {/* Results Count */}
          {changeLogs && changeLogs.length > 0 && (
            <div className="mb-4 text-sm text-muted-foreground">
              عرض {filteredLogs.length} من {changeLogs.length} سجل
            </div>
          )}

          {filteredLogs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('adminSettingsPage.text42')}</TableHead>
                  <TableHead>{t('adminSettingsPage.text43')}</TableHead>
                  <TableHead>{t('adminSettingsPage.text44')}</TableHead>
                  <TableHead>{t('adminSettingsPage.text45')}</TableHead>
                  <TableHead>{t('adminSettingsPage.text46')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => {
                  const plan = plans?.find((p) => p.id === log.planId);
                  const fieldNameAr: Record<string, string> = {
                    priceMonthly: 'السعر الشهري',
                    conversationLimit: 'حد المحادثات',
                    voiceMessageLimit: 'حد الرسائل الصوتية',
                    name: 'الرمز',
                    nameAr: 'الاسم العربي',
                    isActive: 'الحالة',
                  };
                  
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">
                        {plan?.name || `Plan #${log.planId}`}
                      </TableCell>
                      <TableCell>{fieldNameAr[log.fieldName] || log.fieldName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {log.oldValue || '-'}
                      </TableCell>
                      <TableCell className="font-semibold text-green-600">
                        {log.newValue}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {new Date(log.createdAt).toLocaleString('ar-SA', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <History className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('adminSettingsPage.text47')}</h3>
              <p className="text-muted-foreground">
                سيتم عرض جميع التعديلات التي تتم على الباقات هنا
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingPlan?.id ? 'تعديل الباقة' : 'إضافة باقة جديدة'}
            </DialogTitle>
            <DialogDescription>
              قم بتعديل معلومات الباقة والأسعار والحدود
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">{t('adminSettingsPage.text48')}</Label>
                <Input
                  id="name"
                  value={editingPlan?.name || ''}
                  onChange={(e) =>
                    setEditingPlan((prev) => prev ? { ...prev, name: e.target.value } : null)
                  }
                  placeholder="B1"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nameAr">{t('adminSettingsPage.text49')}</Label>
                <Input
                  id="nameAr"
                  value={editingPlan?.nameAr || ''}
                  onChange={(e) =>
                    setEditingPlan((prev) => prev ? { ...prev, nameAr: e.target.value } : null)
                  }
                  placeholder="Starter"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="priceMonthly">{t('adminSettingsPage.text50')}</Label>
                <Input
                  id="priceMonthly"
                  type="number"
                  value={editingPlan?.priceMonthly || 0}
                  onChange={(e) =>
                    setEditingPlan((prev) =>
                      prev ? { ...prev, priceMonthly: parseInt(e.target.value) } : null
                    )
                  }
                  placeholder="90"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="conversationLimit">{t('adminSettingsPage.text51')}</Label>
                <Input
                  id="conversationLimit"
                  type="number"
                  value={editingPlan?.conversationLimit || 0}
                  onChange={(e) =>
                    setEditingPlan((prev) =>
                      prev ? { ...prev, conversationLimit: parseInt(e.target.value) } : null
                    )
                  }
                  placeholder="150"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="voiceMessageLimit">
                  حد الرسائل الصوتية (-1 = غير محدود)
                </Label>
                <Input
                  id="voiceMessageLimit"
                  type="number"
                  value={editingPlan?.voiceMessageLimit || 0}
                  onChange={(e) =>
                    setEditingPlan((prev) =>
                      prev ? { ...prev, voiceMessageLimit: parseInt(e.target.value) } : null
                    )
                  }
                  placeholder="50"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="isActive">{t('adminSettingsPage.text52')}</Label>
                <select
                  id="isActive"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  value={editingPlan?.isActive ? 'true' : 'false'}
                  onChange={(e) =>
                    setEditingPlan((prev) =>
                      prev ? { ...prev, isActive: e.target.value === 'true' } : null
                    )
                  }
                >
                  <option value="true">{t('adminSettingsPage.text53')}</option>
                  <option value="false">{t('adminSettingsPage.text54')}</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="features">{t('adminSettingsPage.text55')}</Label>
              <Textarea
                id="features"
                value={editingPlan?.features || ''}
                onChange={(e) =>
                  setEditingPlan((prev) => prev ? { ...prev, features: e.target.value } : null)
                }
                placeholder='{"ai": true, "whatsapp": true}'
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingPlan?.id ? 'تحديث' : 'إضافة'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
