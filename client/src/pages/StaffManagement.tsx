import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, User, Mail, Phone, Briefcase, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

interface StaffFormData {
  name: string;
  email: string;
  phone: string;
  specialization: string;
  workingHours?: string;
}

export default function StaffManagement() {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [formData, setFormData] = useState<StaffFormData>({
    name: "",
    email: "",
    phone: "",
    specialization: "",
    workingHours: ""
  });

  const utils = trpc.useUtils();
  const { data: staffList, isLoading } = trpc.staff.list.useQuery();
  
  const createMutation = trpc.staff.create.useMutation({
    onSuccess: () => {
      toast.success(t('staffManagementPage.text0'));
      setIsDialogOpen(false);
      resetForm();
      utils.staff.list.invalidate();
    },
    onError: (error) => {
      toast.error(`فشل إضافة الموظف: ${error.message}`);
    }
  });

  const updateMutation = trpc.staff.update.useMutation({
    onSuccess: () => {
      toast.success(t('staffManagementPage.text1'));
      setIsDialogOpen(false);
      resetForm();
      utils.staff.list.invalidate();
    },
    onError: (error) => {
      toast.error(`فشل تحديث الموظف: ${error.message}`);
    }
  });

  const deleteMutation = trpc.staff.delete.useMutation({
    onSuccess: () => {
      toast.success(t('staffManagementPage.text2'));
      utils.staff.list.invalidate();
    },
    onError: (error) => {
      toast.error(`فشل حذف الموظف: ${error.message}`);
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      specialization: "",
      workingHours: ""
    });
    setEditingStaff(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.phone || !formData.specialization) {
      toast.error(t('staffManagementPage.text3'));
      return;
    }

    if (editingStaff) {
      updateMutation.mutate({
        staffId: editingStaff.id,
        ...formData
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (staff: any) => {
    setEditingStaff(staff);
    setFormData({
      name: staff.name,
      email: staff.email,
      phone: staff.phone,
      specialization: staff.specialization,
      workingHours: staff.workingHours || ""
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (staffId: number, staffName: string) => {
    if (confirm(`هل أنت متأكد من حذف الموظف "${staffName}"؟`)) {
      deleteMutation.mutate({ staffId });
    }
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  return (
    <div className="container max-w-6xl py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t('staffManagementPage.text4')}</h1>
          <p className="text-muted-foreground">
            إدارة فريق العمل وربطهم بالخدمات والمواعيد
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              إضافة موظف
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingStaff ? "تعديل بيانات الموظف" : "إضافة موظف جديد"}
              </DialogTitle>
              <DialogDescription>
                أدخل بيانات الموظف وتخصصه
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('staffManagementPage.text5')}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t('staffManagementPage.text6')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('staffManagementPage.text7')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="ahmed@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t('staffManagementPage.text8')}</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="0501234567"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="specialization">{t('staffManagementPage.text9')}</Label>
                <Input
                  id="specialization"
                  value={formData.specialization}
                  onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                  placeholder={t('staffManagementPage.text10')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="workingHours">{t('staffManagementPage.text11')}</Label>
                <Textarea
                  id="workingHours"
                  value={formData.workingHours}
                  onChange={(e) => setFormData({ ...formData, workingHours: e.target.value })}
                  placeholder={t('staffManagementPage.text12')}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => handleDialogClose(false)}
                >
                  إلغاء
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      جاري الحفظ...
                    </>
                  ) : (
                    editingStaff ? "تحديث" : "إضافة"
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* إحصائيات سريعة */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              إجمالي الموظفين
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{staffList?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              الموظفين النشطين
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {staffList?.filter(s => s.isActive).length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              التخصصات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(staffList?.map(s => s.specialization)).size || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* جدول الموظفين */}
      <Card>
        <CardHeader>
          <CardTitle>{t('staffManagementPage.text13')}</CardTitle>
          <CardDescription>
            جميع الموظفين المسجلين في النظام
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : !staffList || staffList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا يوجد موظفين مسجلين. قم بإضافة موظف جديد للبدء.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('staffManagementPage.text14')}</TableHead>
                  <TableHead>{t('staffManagementPage.text15')}</TableHead>
                  <TableHead>{t('staffManagementPage.text16')}</TableHead>
                  <TableHead>{t('staffManagementPage.text17')}</TableHead>
                  <TableHead className="text-left">{t('staffManagementPage.text18')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffList.map((staff) => (
                  <TableRow key={staff.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{staff.name}</div>
                          <div className="text-sm text-muted-foreground">{staff.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        <Briefcase className="h-3 w-3 mr-1" />
                        {staff.specialization}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {staff.phone}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={staff.isActive ? "default" : "secondary"}>
                        {staff.isActive ? "نشط" : "غير نشط"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-left">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(staff)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(staff.id, staff.name)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
