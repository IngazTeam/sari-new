// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, User, Phone, Briefcase, Loader2, CalendarClock, UserCheck, Layers } from "lucide-react";
import { toast } from "sonner";

interface StaffFormData {
  name: string;
  email: string;
  phone: string;
  specialization: string;
}

export default function StaffManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [formData, setFormData] = useState<StaffFormData>({
    name: "",
    email: "",
    phone: "",
    specialization: "",
  });

  const utils = trpc.useUtils();
  const { data: staffList, isLoading } = trpc.staff.list.useQuery(undefined as any);
  
  const createMutation = trpc.staff.create.useMutation({
    onSuccess: () => {
      toast.success("تمت إضافة مقدم الخدمة بنجاح ✅");
      setIsDialogOpen(false);
      resetForm();
      utils.staff.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(`فشل الإضافة: ${error.message}`);
    }
  });

  const updateMutation = trpc.staff.update.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث البيانات بنجاح ✅");
      setIsDialogOpen(false);
      resetForm();
      utils.staff.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(`فشل التحديث: ${error.message}`);
    }
  });

  const deleteMutation = trpc.staff.delete.useMutation({
    onSuccess: () => {
      toast.success("تم الحذف بنجاح");
      utils.staff.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(`فشل الحذف: ${error.message}`);
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      specialization: "",
    });
    setEditingStaff(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.phone || !formData.specialization) {
      toast.error("يرجى تعبئة الحقول المطلوبة: الاسم، الجوال، والتخصص");
      return;
    }

    const payload: any = {
      name: formData.name,
      email: formData.email || undefined,
      phone: formData.phone,
      role: formData.specialization,
    };

    if (editingStaff) {
      updateMutation.mutate({
        staffId: editingStaff.id,
        ...payload,
      });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (staff: any) => {
    setEditingStaff(staff);
    setFormData({
      name: staff.name,
      email: staff.email || '',
      phone: staff.phone || '',
      specialization: staff.role || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (staffId: number, staffName: string) => {
    if (confirm(`هل أنت متأكد من حذف "${staffName}"؟ سيتم إلغاء ربطه بجميع الخدمات.`)) {
      deleteMutation.mutate({ staffId });
    }
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const staffCount = staffList?.staff?.length || 0;
  const activeCount = staffList?.staff?.filter((s: any) => s.isActive).length || 0;
  const specializations = new Set(staffList?.staff?.map((s: any) => s.role).filter(Boolean));

  return (
    <div className="container max-w-6xl py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">مقدّمو الخدمات</h1>
          <p className="text-muted-foreground">
            أضف فريقك الذي يقدم الخدمات — سيظهرون كخيارات عند حجز المواعيد عبر الواتساب
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />إضافة مقدم خدمة</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingStaff ? "تعديل بيانات مقدم الخدمة" : "إضافة مقدم خدمة جديد"}
              </DialogTitle>
              <DialogDescription>
                الشخص الذي يقدم الخدمة ويتم حجز المواعيد عنده (حلاق، مدرب، طبيب، إلخ)
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">الاسم *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثال: محمد العتيبي"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">رقم الجوال *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="0501234567"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="اختياري"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="specialization">التخصص / نوع الخدمة *</Label>
                <Input
                  id="specialization"
                  value={formData.specialization}
                  onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                  placeholder="مثال: حلاق، معالج تجميل، مدرب لياقة"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  سيظهر للعميل عند اختيار مقدم الخدمة أثناء الحجز
                </p>
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
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />جاري الحفظ...</>
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
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي مقدمي الخدمات</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{staffCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium text-muted-foreground">النشطون حالياً</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {activeCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium text-muted-foreground">التخصصات</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {specializations.size}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* جدول مقدمي الخدمات */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة مقدمي الخدمات</CardTitle>
          <CardDescription>من يقدم خدماتك — يتم ربطهم بالخدمات المتاحة لحجز المواعيد</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : staffCount === 0 ? (
            <div className="text-center py-12">
              <CalendarClock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
              <p className="text-muted-foreground mb-2">لا يوجد مقدمو خدمات بعد</p>
              <p className="text-sm text-muted-foreground mb-4">
                أضف أول مقدم خدمة ليتمكن العملاء من حجز المواعيد عبر الواتساب
              </p>
              <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />إضافة مقدم خدمة
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>مقدم الخدمة</TableHead>
                  <TableHead>التخصص</TableHead>
                  <TableHead>الجوال</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(staffList as any)?.staff?.map((staff) => (
                  <TableRow key={staff.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{staff.name}</div>
                          {staff.email && (
                            <div className="text-sm text-muted-foreground">{staff.email}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        <Briefcase className="h-3 w-3 mr-1" />
                        {staff.role || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {staff.phone || '—'}
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