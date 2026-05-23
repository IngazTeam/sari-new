import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Package, Plus, Upload, Edit, Trash2, Image as ImageIcon, Tag, Layers, AlertTriangle, BarChart3, CheckSquare, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency } from '@/../../shared/currency';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { ProductsSkeleton } from '@/components/ProductsSkeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { useIntegration, IntegrationLockBanner } from '@/hooks/useIntegration';

export default function Products() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: merchant } = trpc.merchants.getCurrent.useQuery();
  const currency = merchant?.currency || 'SAR';

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // PERF-08: Debounce search to avoid spamming the server
  const searchTimerRef = (globalThis as any).__prodSearchTimer;
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if ((globalThis as any).__prodSearchTimer) clearTimeout((globalThis as any).__prodSearchTimer);
    (globalThis as any).__prodSearchTimer = setTimeout(() => {
      setDebouncedSearch(value);
      setCurrentPage(1);
    }, 300);
  };

  // Integration awareness — lock editing when managed by Byaan
  const { isLocked, term } = useIntegration();

  // PERF-03 FIX: Server-side pagination + search
  const { data: productsData, refetch, isLoading } = trpc.products.list.useQuery({
    page: currentPage,
    pageSize: ITEMS_PER_PAGE,
    search: debouncedSearch || undefined,
  });
  const products = productsData?.items || [];
  const totalPages = productsData?.totalPages || 1;
  const totalProducts = productsData?.total || 0;
  const paginatedProducts = products; // Server already returns the correct page

  const [formData, setFormData] = useState({
    name: '', description: '', price: '', imageUrl: '', stock: '',
    sku: '', barcode: '', compareAtPrice: '', costPrice: '', weight: '',
    category: '', tags: '', productType: 'physical' as string, status: 'active' as string,
    lowStockAlert: '5', trackInventory: true,
  });
  const [activeTab, setActiveTab] = useState('basic');

  const createMutation = trpc.products.create.useMutation({
    onSuccess: () => {
      toast.success(t('toast.products.msg1'));
      utils.products.list.invalidate();
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(t('toast.products.msg2') + ': ' + error.message);
    },
  });

  const updateMutation = trpc.products.update.useMutation({
    onSuccess: () => {
      toast.success(t('toast.products.msg3'));
      utils.products.list.invalidate();
      setIsEditDialogOpen(false);
      setEditingProduct(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(t('toast.products.msg4') + ': ' + error.message);
    },
  });

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      toast.success(t('toast.products.msg5'));
      utils.products.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(t('toast.products.msg6') + ': ' + error.message);
    },
  });

  const bulkDeleteMutation = trpc.products.bulkDelete.useMutation({
    onSuccess: (data: any) => {
      toast.success(`تم حذف ${data.deleted} منتج بنجاح`);
      setSelectedIds(new Set());
      utils.products.list.invalidate();
    },
    onError: (error: any) => {
      toast.error('فشل الحذف الجماعي: ' + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '', description: '', price: '', imageUrl: '', stock: '',
      sku: '', barcode: '', compareAtPrice: '', costPrice: '', weight: '',
      category: '', tags: '', productType: 'physical', status: 'active',
      lowStockAlert: '5', trackInventory: true,
    });
    setActiveTab('basic');
  };

  const handleCreate = () => {
    if (!formData.name || !formData.price) {
      toast.error(t('toast.products.msg7'));
      return;
    }

    createMutation.mutate({
      name: formData.name,
      description: formData.description || undefined,
      price: parseFloat(formData.price),
      imageUrl: formData.imageUrl || undefined,
      stock: formData.stock ? parseInt(formData.stock) : undefined,
      sku: formData.sku || undefined,
      barcode: formData.barcode || undefined,
      compareAtPrice: formData.compareAtPrice ? parseFloat(formData.compareAtPrice) : undefined,
      costPrice: formData.costPrice ? parseFloat(formData.costPrice) : undefined,
      weight: formData.weight || undefined,
      category: formData.category || undefined,
      tags: formData.tags || undefined,
      productType: formData.productType as any,
      status: formData.status as any,
      trackInventory: formData.trackInventory ? 1 : 0,
      lowStockAlert: formData.lowStockAlert ? parseInt(formData.lowStockAlert) : 5,
    });
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name, description: product.description || '',
      price: product.price.toString(), imageUrl: product.imageUrl || '',
      stock: product.stock?.toString() || '',
      sku: product.sku || '', barcode: product.barcode || '',
      compareAtPrice: product.compareAtPrice?.toString() || '',
      costPrice: product.costPrice?.toString() || '',
      weight: product.weight || '', category: product.category || '',
      tags: product.tags || '', productType: product.productType || 'physical',
      status: product.status || 'active',
      lowStockAlert: product.lowStockAlert?.toString() || '5',
      trackInventory: product.trackInventory !== 0,
    });
    setActiveTab('basic');
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!editingProduct) return;

    updateMutation.mutate({
      productId: editingProduct.id,
      name: formData.name,
      description: formData.description || undefined,
      price: parseFloat(formData.price),
      imageUrl: formData.imageUrl || undefined,
      stock: formData.stock ? parseInt(formData.stock) : 0,
      sku: formData.sku || undefined,
      barcode: formData.barcode || undefined,
      compareAtPrice: formData.compareAtPrice ? parseFloat(formData.compareAtPrice) : undefined,
      costPrice: formData.costPrice ? parseFloat(formData.costPrice) : undefined,
      weight: formData.weight || undefined,
      category: formData.category || undefined,
      tags: formData.tags || undefined,
      productType: formData.productType as any,
      status: formData.status as any,
      trackInventory: formData.trackInventory ? 1 : 0,
      lowStockAlert: formData.lowStockAlert ? parseInt(formData.lowStockAlert) : 5,
    });
  };

  const handleDelete = (productId: number, productName: string) => {
    if (confirm(`${t('productsPage.confirmDelete')} "${productName}"?`)) {
      deleteMutation.mutate({ productId });
    }
  };

  const toggleSelectAll = () => {
    if (!paginatedProducts.length) return;
    const pageIds = paginatedProducts.map((p: any) => p.id);
    const allSelected = pageIds.every((id: number) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pageIds.forEach((id: number) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pageIds.forEach((id: number) => next.add(id));
        return next;
      });
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!confirm(`هل أنت متأكد من حذف ${count} منتج؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    
    // Split into batches of 100 to avoid the 500-item validation limit
    const allIds = Array.from(selectedIds);
    const BATCH_SIZE = 100;
    let totalDeleted = 0;
    
    for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
      const batch = allIds.slice(i, i + BATCH_SIZE);
      try {
        const result = await bulkDeleteMutation.mutateAsync({ productIds: batch });
        totalDeleted += result.deleted;
      } catch (error: any) {
        toast.error(`فشل حذف دفعة: ${error.message}`);
        break;
      }
    }
    
    if (totalDeleted > 0) {
      toast.success(`تم حذف ${totalDeleted} منتج بنجاح`);
      setSelectedIds(new Set());
      utils.products.list.invalidate();
    }
  };

  // Show loading skeleton
  if (isLoading) {
    return <ProductsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Integration Lock Banner */}
      <IntegrationLockBanner />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('productsPage.title')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('productsPage.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setLocation('/merchant/products/upload')} disabled={isLocked}>
            <Upload className="h-4 w-4 ml-2" />
            {t('productsPage.uploadCSV')}
          </Button>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={isLocked}>
                <Plus className="h-4 w-4 ml-2" />
                {t('productsPage.addProduct')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('productsPage.addNewProduct')}</DialogTitle>
                <DialogDescription>{t('productsPage.addNewProductDesc')}</DialogDescription>
              </DialogHeader>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic"><Package className="h-3 w-3 me-1" /> أساسي</TabsTrigger>
                  <TabsTrigger value="pricing"><BarChart3 className="h-3 w-3 me-1" /> التسعير</TabsTrigger>
                  <TabsTrigger value="inventory"><Layers className="h-3 w-3 me-1" /> المخزون</TabsTrigger>
                </TabsList>
                <TabsContent value="basic" className="space-y-3 mt-3">
                  <div className="grid gap-2">
                    <Label>{t('productsPage.productNameRequired')}</Label>
                    <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={t('productsPage.productNamePlaceholder')} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('productsPage.descriptionLabel')}</Label>
                    <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder={t('productsPage.descriptionPlaceholder')} rows={3} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>التصنيف</Label>
                      <Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} placeholder="مثل: إلكترونيات" />
                    </div>
                    <div className="grid gap-2">
                      <Label>نوع المنتج</Label>
                      <Select value={formData.productType} onValueChange={(v) => setFormData({ ...formData, productType: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="physical">فيزيائي</SelectItem>
                          <SelectItem value="digital">رقمي</SelectItem>
                          <SelectItem value="service">خدمة</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('productsPage.imageUrl')}</Label>
                    <Input value={formData.imageUrl} onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })} placeholder="https://example.com/image.jpg" />
                  </div>
                  <div className="grid gap-2">
                    <Label>الوسوم (مفصولة بفاصلة)</Label>
                    <Input value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })} placeholder="عرض, جديد, حصري" />
                  </div>
                  <div className="grid gap-2">
                    <Label>الحالة</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">نشط</SelectItem>
                        <SelectItem value="draft">مسودة</SelectItem>
                        <SelectItem value="archived">مؤرشف</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>
                <TabsContent value="pricing" className="space-y-3 mt-3">
                  <div className="grid gap-2">
                    <Label>{t('productsPage.priceLabel')} ({currency === 'SAR' ? t('productsPage.sar') : t('productsPage.dollar')}) *</Label>
                    <Input type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>سعر المقارنة <span className="text-xs text-muted-foreground">(قبل الخصم)</span></Label>
                      <Input type="number" step="0.01" value={formData.compareAtPrice} onChange={(e) => setFormData({ ...formData, compareAtPrice: e.target.value })} placeholder="0.00" />
                    </div>
                    <div className="grid gap-2">
                      <Label>سعر التكلفة</Label>
                      <Input type="number" step="0.01" value={formData.costPrice} onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })} placeholder="0.00" />
                    </div>
                  </div>
                  {formData.price && formData.costPrice && parseFloat(formData.costPrice) > 0 && (
                    <div className="rounded-lg border p-3 bg-muted/30">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">هامش الربح</span>
                        <span className="text-lg font-bold text-green-600">
                          {Math.round(((parseFloat(formData.price) - parseFloat(formData.costPrice)) / parseFloat(formData.price)) * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 mt-2">
                        <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round(((parseFloat(formData.price) - parseFloat(formData.costPrice)) / parseFloat(formData.price)) * 100))}%` }} />
                      </div>
                    </div>
                  )}
                  {formData.compareAtPrice && parseFloat(formData.compareAtPrice) > 0 && formData.price && (
                    <div className="rounded-lg border p-3 bg-red-50 dark:bg-red-950/20">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">نسبة الخصم</span>
                        <span className="text-lg font-bold text-red-600">
                          {Math.round(((parseFloat(formData.compareAtPrice) - parseFloat(formData.price)) / parseFloat(formData.compareAtPrice)) * 100)}%
                        </span>
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="inventory" className="space-y-3 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>SKU (رقم الصنف)</Label>
                      <Input value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} placeholder="SKU-001" />
                    </div>
                    <div className="grid gap-2">
                      <Label>الباركود</Label>
                      <Input value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} placeholder="123456789" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>{t('productsPage.stockAvailable')}</Label>
                      <Input type="number" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })} placeholder="0" />
                    </div>
                    <div className="grid gap-2">
                      <Label>تنبيه نفاد عند</Label>
                      <Input type="number" value={formData.lowStockAlert} onChange={(e) => setFormData({ ...formData, lowStockAlert: e.target.value })} placeholder="5" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>الوزن (كجم)</Label>
                    <Input value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} placeholder="0.5" />
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border p-3">
                    <input type="checkbox" id="trackInventory" checked={formData.trackInventory} onChange={(e) => setFormData({ ...formData, trackInventory: e.target.checked })} className="h-4 w-4" />
                    <Label htmlFor="trackInventory" className="cursor-pointer">تتبع المخزون تلقائياً</Label>
                  </div>
                </TabsContent>
              </Tabs>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  {t('productsPage.cancel')}
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? t('productsPage.adding') : t('productsPage.add')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('productsPage.totalProducts')}</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('productsPage.availableProducts')}</CardTitle>
            <Package className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {totalProducts}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('productsPage.outOfStock')}</CardTitle>
            <Package className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {products?.filter((p: any) => p.trackInventory && p.stock !== null && p.stock !== undefined && p.stock <= 0).length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('productsPage.productList')}</CardTitle>
              <CardDescription>
                {t('productsPage.productListDesc')}
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`بحث في ${term('products')}...`}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pr-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{t('productsPage.loading')}</p>
            </div>
          ) : products && products.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table style={{ tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  <col style={{ width: '40px' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '100px' }} />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Checkbox
                        checked={paginatedProducts.length > 0 && paginatedProducts.every((p: any) => selectedIds.has(p.id))}
                        onCheckedChange={toggleSelectAll}
                        aria-label="تحديد الكل"
                      />
                    </TableHead>
                    <TableHead>{t('productsPage.product')}</TableHead>
                    <TableHead>{t('productsPage.descriptionLabel')}</TableHead>
                    <TableHead>{t('productsPage.price')}</TableHead>
                    <TableHead>{t('productsPage.stock')}</TableHead>
                    <TableHead>{t('productsPage.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProducts.map((product: any) => (
                    <TableRow key={product.id} className={selectedIds.has(product.id) ? 'bg-primary/5' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={() => toggleSelect(product.id)}
                          aria-label={`تحديد ${product.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3 overflow-hidden">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                              <ImageIcon className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          <span className="font-medium truncate" title={product.name}>{product.name}</span>
                        </div>
                      </TableCell>
                      <TableCell style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={product.description || ''}>
                        <span className="text-sm text-muted-foreground">
                          {product.description || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium whitespace-nowrap">{formatCurrency(product.price, currency)}</span>
                      </TableCell>
                      <TableCell>
                        {product.trackInventory && product.stock !== null && product.stock !== undefined ? (
                          <Badge variant={product.stock > 0 ? "default" : "destructive"}>
                            {product.stock}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-600 border-green-200">∞ مفتوح</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(product)}
                            disabled={isLocked}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(product.id, product.name)}
                            disabled={deleteMutation.isPending || isLocked}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <div className="text-sm text-muted-foreground">
                    عرض {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, totalProducts)} من {totalProducts} منتج
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                      السابق
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let page: number;
                        if (totalPages <= 5) {
                          page = i + 1;
                        } else if (currentPage <= 3) {
                          page = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          page = totalPages - 4 + i;
                        } else {
                          page = currentPage - 2 + i;
                        }
                        return (
                          <Button
                            key={page}
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            className="w-8 h-8 p-0"
                            onClick={() => setCurrentPage(page)}
                          >
                            {page}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      التالي
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-lg font-medium">{t('productsPage.noProducts')}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('productsPage.startAdding')}
              </p>
              <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 ml-2" />
                {t('productsPage.addProduct')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="flex items-center gap-4 px-6 py-3 rounded-xl bg-background border shadow-2xl">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">
                تم تحديد <strong className="text-primary">{selectedIds.size}</strong> منتج
              </span>
            </div>
            <div className="w-px h-6 bg-border" />
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? (
                <>
                  <span className="animate-spin ml-2">⏳</span>
                  جاري الحذف...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 ml-2" />
                  حذف المحدد
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              إلغاء التحديد
            </Button>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('productsPage.editProduct')}</DialogTitle>
            <DialogDescription>{t('productsPage.editProductDesc')}</DialogDescription>
          </DialogHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic"><Package className="h-3 w-3 me-1" /> أساسي</TabsTrigger>
              <TabsTrigger value="pricing"><BarChart3 className="h-3 w-3 me-1" /> التسعير</TabsTrigger>
              <TabsTrigger value="inventory"><Layers className="h-3 w-3 me-1" /> المخزون</TabsTrigger>
            </TabsList>
            <TabsContent value="basic" className="space-y-3 mt-3">
              <div className="grid gap-2">
                <Label>{t('productsPage.productNameRequired')}</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>{t('productsPage.descriptionLabel')}</Label>
                <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>التصنيف</Label>
                  <Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>نوع المنتج</Label>
                  <Select value={formData.productType} onValueChange={(v) => setFormData({ ...formData, productType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physical">فيزيائي</SelectItem>
                      <SelectItem value="digital">رقمي</SelectItem>
                      <SelectItem value="service">خدمة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>{t('productsPage.imageUrl')}</Label>
                <Input value={formData.imageUrl} onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>الوسوم</Label>
                <Input value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>الحالة</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="draft">مسودة</SelectItem>
                    <SelectItem value="archived">مؤرشف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
            <TabsContent value="pricing" className="space-y-3 mt-3">
              <div className="grid gap-2">
                <Label>{t('productsPage.priceLabel')} *</Label>
                <Input type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>سعر المقارنة</Label>
                  <Input type="number" step="0.01" value={formData.compareAtPrice} onChange={(e) => setFormData({ ...formData, compareAtPrice: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>سعر التكلفة</Label>
                  <Input type="number" step="0.01" value={formData.costPrice} onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })} />
                </div>
              </div>
              {formData.price && formData.costPrice && parseFloat(formData.costPrice) > 0 && (
                <div className="rounded-lg border p-3 bg-muted/30">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">هامش الربح</span>
                    <span className="text-lg font-bold text-green-600">{Math.round(((parseFloat(formData.price) - parseFloat(formData.costPrice)) / parseFloat(formData.price)) * 100)}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 mt-2">
                    <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round(((parseFloat(formData.price) - parseFloat(formData.costPrice)) / parseFloat(formData.price)) * 100))}%` }} />
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="inventory" className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>SKU</Label>
                  <Input value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>الباركود</Label>
                  <Input value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>{t('productsPage.stockAvailable')}</Label>
                  <Input type="number" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>تنبيه نفاد عند</Label>
                  <Input type="number" value={formData.lowStockAlert} onChange={(e) => setFormData({ ...formData, lowStockAlert: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>الوزن (كجم)</Label>
                <Input value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} />
              </div>
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <input type="checkbox" id="editTrackInventory" checked={formData.trackInventory} onChange={(e) => setFormData({ ...formData, trackInventory: e.target.checked })} className="h-4 w-4" />
                <Label htmlFor="editTrackInventory" className="cursor-pointer">تتبع المخزون تلقائياً</Label>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEditDialogOpen(false);
              setEditingProduct(null);
              resetForm();
            }}>
              {t('productsPage.cancel')}
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('productsPage.updating') : t('productsPage.updateBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
