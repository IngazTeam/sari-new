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
import { useLocation } from 'wouter';

export default function Products() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: products, isLoading } = trpc.products.list.useQuery();
  
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
      toast.success('تم إضافة المنتج بنجاح');
      utils.products.list.invalidate();
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('فشل إضافة المنتج: ' + error.message);
    },
  });

  const updateMutation = trpc.products.update.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث المنتج بنجاح');
      utils.products.list.invalidate();
      setIsEditDialogOpen(false);
      setEditingProduct(null);
      resetForm();
    },
    onError: (error) => {
      toast.error('فشل تحديث المنتج: ' + error.message);
    },
  });

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      toast.success('تم حذف المنتج بنجاح');
      utils.products.list.invalidate();
    },
    onError: (error) => {
      toast.error('فشل حذف المنتج: ' + error.message);
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
      toast.error('يرجى إدخال اسم المنتج والسعر');
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
    if (confirm(`هل أنت متأكد من حذف المنتج "${productName}"؟`)) {
      deleteMutation.mutate({ productId });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">إدارة المنتجات</h1>
          <p className="text-muted-foreground mt-2">
            إدارة منتجات متجرك وأسعارها
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setLocation('/merchant/products/upload')}>
            <Upload className="h-4 w-4 ml-2" />
            رفع CSV
          </Button>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 ml-2" />
                إضافة منتج
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>إضافة منتج جديد</DialogTitle>
                <DialogDescription>
                  أدخل معلومات المنتج الجديد
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">اسم المنتج *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: هاتف ذكي"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">الوصف</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="وصف المنتج..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="price">السعر (ريال) *</Label>
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
                  <Label htmlFor="imageUrl">رابط الصورة</Label>
                  <Input
                    id="imageUrl"
                    type="url"
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="stock">الكمية المتوفرة</Label>
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
                  إلغاء
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'جاري الإضافة...' : 'إضافة'}
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
            <CardTitle className="text-sm font-medium">إجمالي المنتجات</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المنتجات المتوفرة</CardTitle>
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
            <CardTitle className="text-sm font-medium">نفدت الكمية</CardTitle>
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
          <CardTitle>قائمة المنتجات</CardTitle>
          <CardDescription>
            جميع منتجات متجرك
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">جاري التحميل...</p>
            </div>
          ) : products && products.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المنتج</TableHead>
                    <TableHead>الوصف</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>الكمية</TableHead>
                    <TableHead>الإجراءات</TableHead>
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
                        <span className="font-medium">{product.price} ريال</span>
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
              <p className="mt-4 text-lg font-medium">لا توجد منتجات بعد</p>
              <p className="text-sm text-muted-foreground mt-1">
                ابدأ بإضافة منتجات إلى متجرك
              </p>
              <Button className="mt-4" onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 ml-2" />
                إضافة منتج
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>تعديل المنتج</DialogTitle>
            <DialogDescription>
              تحديث معلومات المنتج
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">اسم المنتج *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">الوصف</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-price">السعر (ريال) *</Label>
              <Input
                id="edit-price"
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-imageUrl">رابط الصورة</Label>
              <Input
                id="edit-imageUrl"
                type="url"
                value={formData.imageUrl}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-stock">الكمية المتوفرة</Label>
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
              إلغاء
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'جاري التحديث...' : 'تحديث'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
