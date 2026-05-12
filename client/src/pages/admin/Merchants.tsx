import { useState } from 'react';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Store, Phone, Mail, Calendar, Eye, Trash2, ChevronRight, ChevronLeft } from 'lucide-react';
import { useLocation } from 'wouter';

import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 30;

export default function MerchantsManagement() {
  const { t } = useTranslation();

  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

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

  const deleteMutation = trpc.merchants.delete.useMutation({
    onSuccess: (data) => {
      toast.success(`تم حذف التاجر #${data.deletedId} بنجاح`);
      utils.merchants.list.invalidate();
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error('فشل حذف التاجر: ' + error.message);
      setDeleteTarget(null);
    },
  });

  const handleStatusChange = (merchantId: number, newStatus: string) => {
    updateStatusMutation.mutate({
      merchantId,
      status: newStatus as 'active' | 'suspended' | 'pending',
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ merchantId: deleteTarget.id });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{t('adminMerchantsPage.text0')}</Badge>;
      case 'suspended':
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{t('adminMerchantsPage.text1')}</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">{t('adminMerchantsPage.text2')}</Badge>;
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
        return t('adminMerchantsPage.text3', { var0: planId });
    }
  };

  // Pagination
  const totalMerchants = merchants?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalMerchants / PAGE_SIZE));
  const paginatedMerchants = merchants?.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('adminMerchantsPage.text4')}</h1>
        <p className="text-muted-foreground mt-2">{t('merchants.auto_0')}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminMerchantsPage.text5')}</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{merchants?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminMerchantsPage.text6')}</CardTitle>
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
            <CardTitle className="text-sm font-medium">{t('adminMerchantsPage.text7')}</CardTitle>
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('adminMerchantsPage.text8')}</CardTitle>
              <CardDescription>{t('merchants.auto_1')}</CardDescription>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                صفحة {currentPage} من {totalPages} ({totalMerchants} تاجر)
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{t('adminMerchantsPage.text9')}</p>
            </div>
          ) : merchants && merchants.length > 0 ? (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('adminMerchantsPage.text10')}</TableHead>
                      <TableHead>{t('adminMerchantsPage.text11')}</TableHead>
                      <TableHead>{t('adminMerchantsPage.text12')}</TableHead>
                      <TableHead>{t('adminMerchantsPage.text13')}</TableHead>
                      <TableHead>{t('adminMerchantsPage.text14')}</TableHead>
                      <TableHead>{t('adminMerchantsPage.text15')}</TableHead>
                      <TableHead>{t('adminMerchantsPage.text16')}</TableHead>
                      <TableHead>حذف</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMerchants.map((merchant: any) => (
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
                          {merchant.subscriptionStatus === 'active' ? (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{t('merchants.auto_2')}</Badge>
                          ) : merchant.subscriptionStatus === 'trial' ? (
                            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">{t('merchants.auto_3')}</Badge>
                          ) : merchant.subscriptionStatus === 'expired' ? (
                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{t('merchants.auto_4')}</Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">{t('merchants.auto_5')}</Badge>
                          )}
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
                              <SelectItem value="active">{t('adminMerchantsPage.text17')}</SelectItem>
                              <SelectItem value="pending">{t('adminMerchantsPage.text18')}</SelectItem>
                              <SelectItem value="suspended">{t('adminMerchantsPage.text19')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLocation(`/admin/merchants/${merchant.id}`)}
                          >
                            <Eye className="h-4 w-4 ml-2" />{t('merchants.auto_6')}</Button>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteTarget({ id: merchant.id, name: merchant.businessName || `#${merchant.id}` })}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    عرض {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, totalMerchants)} من {totalMerchants}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <Button
                        key={page}
                        variant={page === currentPage ? 'default' : 'outline'}
                        size="icon"
                        onClick={() => setCurrentPage(page)}
                        className="w-9 h-9"
                      >
                        {page}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <Store className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-lg font-medium">{t('adminMerchantsPage.text20')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('merchants.auto_7')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">⚠️ حذف تاجر نهائياً</AlertDialogTitle>
            <AlertDialogDescription className="text-right space-y-2">
              <p>هل أنت متأكد من حذف التاجر <strong className="text-foreground">{deleteTarget?.name}</strong> (#{deleteTarget?.id})؟</p>
              <p className="text-red-500 font-medium">سيتم حذف جميع البيانات المرتبطة نهائياً:</p>
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                <li>المنتجات والأسئلة الشائعة</li>
                <li>المحادثات والرسائل</li>
                <li>العملاء والطلبات</li>
                <li>الاشتراكات ومفاتيح API</li>
                <li>حساب المستخدم</li>
              </ul>
              <p className="text-red-600 font-bold text-sm">هذا الإجراء لا يمكن التراجع عنه!</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'جاري الحذف...' : 'حذف نهائياً'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
