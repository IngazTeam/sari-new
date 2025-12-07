import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Store, Phone, Mail, Calendar, Eye } from 'lucide-react';
import { useLocation } from 'wouter';

import { useTranslation } from 'react-i18next';
export default function MerchantsManagement() {
  const { t } = useTranslation();

  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const { data: merchants, isLoading } = trpc.merchants.list.useQuery();
  
  const updateStatusMutation = trpc.merchants.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(t('toast.merchants.msg1'));
      utils.merchants.list.invalidate();
    },
    onError: (error) => {
      toast.error(t('toast.merchants.msg2') + ': ' + error.message);
    },
  });

  const handleStatusChange = (merchantId: number, newStatus: string) => {
    updateStatusMutation.mutate({
      merchantId,
      status: newStatus as 'active' | 'suspended' | 'pending',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">نشط</Badge>;
      case 'suspended':
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">معلق</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">قيد المراجعة</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPlanName = (planId: number | null) => {
    if (!planId) return 'لا يوجد';
    switch (planId) {
      case 1:
        return 'Starter (B1)';
      case 2:
        return 'Growth (B2)';
      case 3:
        return 'Pro (B3)';
      default:
        return `باقة ${planId}`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">إدارة التجار</h1>
        <p className="text-muted-foreground mt-2">
          عرض وإدارة جميع التجار المسجلين في المنصة
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي التجار</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{merchants?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">التجار النشطون</CardTitle>
            <Store className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {merchants?.filter((m: any) => m.status === 'active').length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">قيد المراجعة</CardTitle>
            <Store className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {merchants?.filter((m: any) => m.status === 'pending').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Merchants Table */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة التجار</CardTitle>
          <CardDescription>
            جميع التجار المسجلين مع إمكانية تغيير حالاتهم
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">جاري التحميل...</p>
            </div>
          ) : merchants && merchants.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>اسم المتجر</TableHead>
                    <TableHead>معلومات الاتصال</TableHead>
                    <TableHead>الباقة</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>تاريخ التسجيل</TableHead>
                    <TableHead>تغيير الحالة</TableHead>
                    <TableHead>عرض التفاصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {merchants.map((merchant: any) => (
                    <TableRow key={merchant.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Store className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{merchant.businessName}</p>
                            <p className="text-sm text-muted-foreground">
                              ID: {merchant.id}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {merchant.phoneNumber && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              <span>{merchant.phoneNumber}</span>
                            </div>
                          )}
                          {merchant.email && (
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              <span>{merchant.email}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">
                          {getPlanName(merchant.currentPlanId)}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(merchant.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(merchant.createdAt).toLocaleDateString('ar-SA')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={merchant.status}
                          onValueChange={(value) => handleStatusChange(merchant.id, value)}
                          disabled={updateStatusMutation.isPending}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">نشط</SelectItem>
                            <SelectItem value="pending">قيد المراجعة</SelectItem>
                            <SelectItem value="suspended">معلق</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLocation(`/admin/merchants/${merchant.id}`)}
                        >
                          <Eye className="h-4 w-4 ml-2" />
                          عرض التفاصيل
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Store className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-lg font-medium">لا يوجد تجار بعد</p>
              <p className="text-sm text-muted-foreground mt-1">
                سيظهر التجار هنا بمجرد تسجيلهم في المنصة
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
