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
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function ServiceCategories() {
  const { t } = useTranslation();
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
      toast.success(t('serviceCategoriesPage.text0'));
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
      toast.success(t('serviceCategoriesPage.text1'));
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
      toast.success(t('serviceCategoriesPage.text2'));
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
            <p className="mt-4 text-muted-foreground">{t('serviceCategoriesPage.text3')}</p>
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
          {t('serviceCategoriesPage.text22')}
        </Button>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t('serviceCategoriesPage.text4')}</h1>
            <p className="text-muted-foreground mt-2">
              {t('serviceCategoriesPage.text23')}
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="ml-2 h-4 w-4" />
            {t('serviceCategoriesPage.text24')}
          </Button>
        </div>
      </div>

      {/* Categories List */}
      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Grid3x3 className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">{t('serviceCategoriesPage.text5')}</h3>
              <p className="text-muted-foreground mt-2">
                {t('serviceCategoriesPage.text25')}
              </p>
              <Button
                className="mt-4"
                onClick={() => handleOpenDialog()}
              >
                <Plus className="ml-2 h-4 w-4" />
                {t('serviceCategoriesPage.text26')}
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
                      {t('serviceCategoriesPage.text27')}
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
              {editingCategory ? t('serviceCategoriesPage.text14') : t('serviceCategoriesPage.text15')}
            </DialogTitle>
            <DialogDescription>
              {editingCategory
                ? t('serviceCategoriesPage.text16') : t('serviceCategoriesPage.text17')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">{t('serviceCategoriesPage.text6')}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('serviceCategoriesPage.text7')}
                required
              />
            </div>

            <div>
              <Label htmlFor="nameEn">{t('serviceCategoriesPage.text8')}</Label>
              <Input
                id="nameEn"
                value={formData.nameEn}
                onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                placeholder="Haircut, Consulting, Maintenance"
              />
            </div>

            <div>
              <Label htmlFor="description">{t('serviceCategoriesPage.text9')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('serviceCategoriesPage.text10')}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="icon">{t('serviceCategoriesPage.text11')}</Label>
                <Input
                  id="icon"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="✂️ 💼 🔧"
                  maxLength={2}
                />
              </div>
              <div>
                <Label htmlFor="color">{t('serviceCategoriesPage.text12')}</Label>
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
                {t('serviceCategoriesPage.text28')}
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? t('serviceCategoriesPage.text31')
                  : editingCategory
                  ? t('serviceCategoriesPage.text18') : t('serviceCategoriesPage.text19')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('serviceCategoriesPage.text13')}</DialogTitle>
            <DialogDescription>
              {t('serviceCategoriesPage.text29')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              {t('serviceCategoriesPage.text30')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t('serviceCategoriesPage.text20') : t('serviceCategoriesPage.text21')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
