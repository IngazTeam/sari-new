import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Package, Plus, Upload, Edit, Trash2, Image as ImageIcon } from 'lucide-react';
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
    name: '',
    description: '',
    price: '',
    imageUrl: '',
    stock: '',
  });

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
      name: '',
      description: '',
      price: '',
      imageUrl: '',
      stock: '',
    });
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
    });
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      imageUrl: product.imageUrl || '',
      stock: product.stock?.toString() || '',
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!editingProduct) return;

    const updates: any = {
      productId: editingProduct.id,
    };

    if (formData.name !== editingProduct.name) updates.name = formData.name;
    if (formData.description !== (editingProduct.description || '')) updates.description = formData.description;
    if (parseFloat(formData.price) !== editingProduct.price) updates.price = parseFloat(formData.price);
    if (formData.imageUrl !== (editingProduct.imageUrl || '')) updates.imageUrl = formData.imageUrl;
    if (formData.stock && parseInt(formData.stock) !== editingProduct.stock) updates.stock = parseInt(formData.stock);

    updateMutation.mutate(updates);
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
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{t('productsPage.addNewProduct')}</DialogTitle>
                <DialogDescription>
                  {t('productsPage.addNewProductDesc')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">{t('productsPage.productNameRequired')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('productsPage.productNamePlaceholder')}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">{t('productsPage.descriptionLabel')}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('productsPage.descriptionPlaceholder')}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="price">{t('productsPage.priceLabel')} ({currency === 'SAR' ? t('productsPage.sar') : t('productsPage.dollar')}) *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="imageUrl">{t('productsPage.imageUrl')}</Label>
                  <Input
                    id="imageUrl"
                    type="url"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="stock">{t('productsPage.stockAvailable')}</Label>
                  <Input
                    id="stock"
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('productsPage.editProduct')}</DialogTitle>
            <DialogDescription>
              {t('productsPage.editProductDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">{t('productsPage.productNameRequired')}</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">{t('productsPage.descriptionLabel')}</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-price">{t('productsPage.priceLabel')} ({currency === 'SAR' ? t('productsPage.sar') : t('productsPage.dollar')}) *</Label>
              <Input
                id="edit-price"
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-imageUrl">{t('productsPage.imageUrl')}</Label>
              <Input
                id="edit-imageUrl"
                type="url"
                value={formData.imageUrl}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-stock">{t('productsPage.stockAvailable')}</Label>
              <Input
                id="edit-stock"
                type="number"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
              />
            </div>
          </div>
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
