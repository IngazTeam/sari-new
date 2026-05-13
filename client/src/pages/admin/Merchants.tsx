import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Store, Eye, Trash2, ChevronRight, ChevronLeft, Search, Users, UserCheck, UserX } from 'lucide-react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 30;

export default function MerchantsManagement() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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
      selectedIds.delete(data.deletedId);
      setSelectedIds(new Set(selectedIds));
    },
    onError: (error) => {
      toast.error('فشل حذف التاجر: ' + error.message);
      setDeleteTarget(null);
    },
  });

  // Filter & search
  const filteredMerchants = useMemo(() => {
    if (!merchants) return [];
    return merchants.filter((m: any) => {
      const matchesSearch = !searchQuery ||
        m.businessName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.phoneNumber?.includes(searchQuery) ||
        m.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(m.id).includes(searchQuery);
      const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [merchants, searchQuery, statusFilter]);

  // Pagination
  const totalMerchants = filteredMerchants.length;
  const totalPages = Math.max(1, Math.ceil(totalMerchants / PAGE_SIZE));
  const paginatedMerchants = filteredMerchants.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        await deleteMutation.mutateAsync({ merchantId: id });
      } catch {
        // continue with next
      }
    }
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedMerchants.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedMerchants.map((m: any) => m.id)));
    }
  };

  const getSubscriptionBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-emerald-50 text-emerald-600 hover:bg-emerald-50 border border-emerald-200 text-xs">مشترك</Badge>;
      case 'trial':
        return <Badge className="bg-blue-50 text-blue-600 hover:bg-blue-50 border border-blue-200 text-xs">تجريبي</Badge>;
      case 'expired':
        return <Badge className="bg-red-50 text-red-600 hover:bg-red-50 border border-red-200 text-xs">منتهي</Badge>;
      case 'none':
      default:
        return <Badge className="bg-gray-50 text-gray-400 hover:bg-gray-50 border border-gray-200 text-xs">بدون اشتراك</Badge>;
    }
  };

  const allMerchants = merchants || [];
  const activeCount = allMerchants.filter((m: any) => m.status === 'active').length;
  const pendingCount = allMerchants.filter((m: any) => m.status === 'pending').length;
  const suspendedCount = allMerchants.filter((m: any) => m.status === 'suspended').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('adminMerchantsPage.text4')}</h1>
        <p className="text-muted-foreground mt-2">{t('merchants.auto_0')}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('all')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminMerchantsPage.text5')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allMerchants.length}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('active')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminMerchantsPage.text6')}</CardTitle>
            <UserCheck className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{activeCount}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('pending')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminMerchantsPage.text7')}</CardTitle>
            <Store className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('suspended')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">موقوف</CardTitle>
            <UserX className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{suspendedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Merchants Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{t('adminMerchantsPage.text8')}</CardTitle>
              <CardDescription>{t('merchants.auto_1')}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم، الإيميل، الرقم..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="w-[250px] pr-9"
                />
              </div>
              {/* Bulk delete */}
              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4 ml-1" />
                  حذف ({selectedIds.size})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{t('adminMerchantsPage.text9')}</p>
            </div>
          ) : paginatedMerchants.length > 0 ? (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={selectedIds.size === paginatedMerchants.length && paginatedMerchants.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="w-[50px] text-center">#</TableHead>
                      <TableHead className="min-w-[180px]">اسم المتجر</TableHead>
                      <TableHead className="min-w-[180px]">الإيميل</TableHead>
                      <TableHead className="min-w-[130px]">الهاتف</TableHead>
                      <TableHead className="w-[90px] text-center">الاشتراك</TableHead>
                      <TableHead className="w-[100px] text-center">التسجيل</TableHead>
                      <TableHead className="w-[130px] text-center">الحالة</TableHead>
                      <TableHead className="w-[90px] text-center">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMerchants.map((merchant: any) => (
                      <TableRow key={merchant.id} className={selectedIds.has(merchant.id) ? 'bg-blue-50/50' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(merchant.id)}
                            onCheckedChange={() => toggleSelect(merchant.id)}
                          />
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground text-xs font-mono">{merchant.id}</TableCell>
                        <TableCell>
                          <span className="font-medium text-sm">{merchant.businessName || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground" dir="ltr">
                            {merchant.email || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground font-mono" dir="ltr">
                            {merchant.phoneNumber || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {getSubscriptionBadge(merchant.subscriptionStatus)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs text-muted-foreground">
                            {new Date(merchant.createdAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Select
                            value={merchant.status}
                            onValueChange={(value) => handleStatusChange(merchant.id, value)}
                            disabled={updateStatusMutation.isPending}
                          >
                            <SelectTrigger className={`h-8 w-[120px] text-xs mx-auto ${
                              merchant.status === 'active' ? 'border-emerald-300 text-emerald-700' :
                              merchant.status === 'suspended' ? 'border-red-300 text-red-700' :
                              'border-amber-300 text-amber-700'
                            }`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">✅ نشط</SelectItem>
                              <SelectItem value="pending">⏳ قيد المراجعة</SelectItem>
                              <SelectItem value="suspended">⛔ معلق</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setLocation(`/admin/merchants/${merchant.id}`)}
                              title="عرض التفاصيل"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteTarget({ id: merchant.id, name: merchant.businessName || `#${merchant.id}` })}
                              disabled={deleteMutation.isPending}
                              title="حذف"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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
                      className="h-8 w-8"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const start = Math.max(1, currentPage - 2);
                      const page = start + i;
                      if (page > totalPages) return null;
                      return (
                        <Button
                          key={page}
                          variant={page === currentPage ? 'default' : 'outline'}
                          size="icon"
                          onClick={() => setCurrentPage(page)}
                          className="h-8 w-8 text-xs"
                        >
                          {page}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
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
              <p className="mt-4 text-lg font-medium">{searchQuery ? 'لا توجد نتائج' : t('adminMerchantsPage.text20')}</p>
              <p className="text-sm text-muted-foreground mt-1">{searchQuery ? 'جرب كلمة بحث مختلفة' : t('merchants.auto_7')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Single Confirmation */}
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

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">⚠️ حذف {selectedIds.size} تاجر نهائياً</AlertDialogTitle>
            <AlertDialogDescription className="text-right space-y-2">
              <p>هل أنت متأكد من حذف <strong className="text-foreground">{selectedIds.size} تاجر</strong> المحددين؟</p>
              <p className="text-red-600 font-bold text-sm">سيتم حذف جميع بياناتهم نهائياً بما في ذلك المنتجات والمحادثات والاشتراكات!</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'جاري الحذف...' : `حذف ${selectedIds.size} تاجر`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
