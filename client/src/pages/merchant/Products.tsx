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
import { Package, Plus, Upload, Edit, Trash2, Image as ImageIcon, Tag, Layers, AlertTriangle, BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency } from '@/../../shared/currency';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { ProductsSkeleton } from '@/components/ProductsSkeleton';

export default function Products() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: products, refetch, isLoading } = trpc.products.list.useQuery();
  const { data: merchant } = trpc.merchants.getCurrent.useQuery();
  const currency = merchant?.currency || 'SAR';

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

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
    onError: (error) => {
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
    onError: (error) => {
      toast.error(t('toast.products.msg4') + ': ' + error.message);
    },
  });

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      toast.success(t('toast.products.msg5'));
      utils.products.list.invalidate();
    },
    onError: (error) => {
      toast.error(t('toast.products.msg6') + ': ' + error.message);
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

  // Show loading skeleton
  if (isLoading) {
    return <ProductsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('productsPage.title')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('productsPage.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setLocation('/merchant/products/upload')}>
            <Upload className="h-4 w-4 ml-2" />
            {t('productsPage.uploadCSV')}
          </Button>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
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
            <div className="text-2xl font-bold">{products?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('productsPage.availableProducts')}</CardTitle>
            <Package className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {products?.filter((p: any) => !p.stock || p.stock > 0).length || 0}
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
              {products?.filter((p: any) => p.stock === 0).length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('productsPage.productList')}</CardTitle>
          <CardDescription>
            {t('productsPage.productListDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{t('productsPage.loading')}</p>
            </div>
          ) : products && products.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('productsPage.product')}</TableHead>
                    <TableHead>{t('productsPage.descriptionLabel')}</TableHead>
                    <TableHead>{t('productsPage.price')}</TableHead>
                    <TableHead>{t('productsPage.stock')}</TableHead>
                    <TableHead>{t('productsPage.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product: any) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-10 h-10 rounded object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                              <ImageIcon className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          <span className="font-medium">{product.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground line-clamp-2">
                          {product.description || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{formatCurrency(product.price, currency)}</span>
                      </TableCell>
                      <TableCell>
                        {product.stock !== null && product.stock !== undefined ? (
                          <Badge variant={product.stock > 0 ? "default" : "destructive"}>
                            {product.stock}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(product)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(product.id, product.name)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
