import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Trash2, ArrowLeft, Grid3x3 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ServiceCategories() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    nameEn: '',
    description: '',
    icon: '',
    color: '#3b82f6',
  });

  const { data: categoriesData, isLoading, refetch } = trpc.serviceCategories.list.useQuery();
  
  const createMutation = trpc.serviceCategories.create.useMutation({
    onSuccess: () => {
      toast.success('تم إنشاء التصنيف بنجاح');
      refetch();
      setDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('فشل إنشاء التصنيف: ' + error.message);
    },
  });

  const updateMutation = trpc.serviceCategories.update.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث التصنيف بنجاح');
      refetch();
      setDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('فشل تحديث التصنيف: ' + error.message);
    },
  });

  const deleteMutation = trpc.serviceCategories.delete.useMutation({
    onSuccess: () => {
      toast.success('تم حذف التصنيف بنجاح');
      refetch();
      setDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast.error('فشل حذف التصنيف: ' + error.message);
    },
  });

  const categories = categoriesData?.categories || [];

  const resetForm = () => {
    setFormData({
      name: '',
      nameEn: '',
      description: '',
      icon: '',
      color: '#3b82f6',
    });
    setEditingCategory(null);
  };

  const handleOpenDialog = (category?: any) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        nameEn: category.nameEn || '',
        description: category.description || '',
        icon: category.icon || '',
        color: category.color || '#3b82f6',
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      name: formData.name,
      nameEn: formData.nameEn || undefined,
      description: formData.description || undefined,
      icon: formData.icon || undefined,
      color: formData.color,
    };

    if (editingCategory) {
      updateMutation.mutate({ categoryId: editingCategory.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (categoryId: number) => {
    setCategoryToDelete(categoryId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (categoryToDelete) {
      deleteMutation.mutate({ categoryId: categoryToDelete });
    }
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => setLocation('/merchant/services')}
          className="mb-4"
        >
          <ArrowLeft className="ml-2 h-4 w-4" />
          العودة إلى الخدمات
        </Button>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">تصنيفات الخدمات</h1>
            <p className="text-muted-foreground mt-2">
              إدارة تصنيفات الخدمات لتنظيم خدماتك
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="ml-2 h-4 w-4" />
            إضافة تصنيف جديد
          </Button>
        </div>
      </div>

      {/* Categories List */}
      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Grid3x3 className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">لا توجد تصنيفات</h3>
              <p className="text-muted-foreground mt-2">
                ابدأ بإضافة أول تصنيف لتنظيم خدماتك
              </p>
              <Button
                className="mt-4"
                onClick={() => handleOpenDialog()}
              >
                <Plus className="ml-2 h-4 w-4" />
                إضافة تصنيف جديد
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((category: any) => (
            <Card key={category.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3 flex-1">
                    {category.icon && (
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                        style={{ backgroundColor: category.color + '20' }}
                      >
                        {category.icon}
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-lg">{category.name}</CardTitle>
                      {category.nameEn && (
                        <CardDescription className="mt-1">{category.nameEn}</CardDescription>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {category.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {category.description}
                    </p>
                  )}
                  
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleOpenDialog(category)}
                    >
                      <Edit className="ml-2 h-4 w-4" />
                      تعديل
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(category.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'تعديل التصنيف' : 'إضافة تصنيف جديد'}
            </DialogTitle>
            <DialogDescription>
              {editingCategory
                ? 'تحديث معلومات التصنيف'
                : 'إضافة تصنيف جديد لتنظيم خدماتك'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">الاسم بالعربي *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="مثال: قص الشعر، الاستشارات، الصيانة"
                required
              />
            </div>

            <div>
              <Label htmlFor="nameEn">الاسم بالإنجليزي</Label>
              <Input
                id="nameEn"
                value={formData.nameEn}
                onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                placeholder="Haircut, Consulting, Maintenance"
              />
            </div>

            <div>
              <Label htmlFor="description">الوصف</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف مختصر للتصنيف"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="icon">الأيقونة (Emoji)</Label>
                <Input
                  id="icon"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="✂️ 💼 🔧"
                  maxLength={2}
                />
              </div>
              <div>
                <Label htmlFor="color">اللون</Label>
                <Input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'جاري الحفظ...'
                  : editingCategory
                  ? 'تحديث'
                  : 'إضافة'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف هذا التصنيف؟ لن يتم حذفه نهائياً بل سيتم تعطيله فقط.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
