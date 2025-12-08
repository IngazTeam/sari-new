import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, Edit, Trash2, MessageSquare, TrendingUp, ToggleLeft, ToggleRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function QuickResponses() {
  const utils = trpc.useUtils();
  const { data: responses, isLoading } = trpc.quickResponses.list.useQuery();
  const { data: stats } = trpc.quickResponses.getStats.useQuery();
  const createMutation = trpc.quickResponses.create.useMutation();
  const updateMutation = trpc.quickResponses.update.useMutation();
  const deleteMutation = trpc.quickResponses.delete.useMutation();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingResponse, setEditingResponse] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    trigger: "",
    response: "",
    keywords: "",
    priority: 5,
  });
  
  const resetForm = () => {
    setFormData({
      trigger: "",
      response: "",
      keywords: "",
      priority: 5,
    });
  };
  
  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync(formData);
      toast.success("تم إضافة الرد السريع بنجاح");
      setIsCreateOpen(false);
      resetForm();
      utils.quickResponses.list.invalidate();
      utils.quickResponses.getStats.invalidate();
    } catch (error) {
      toast.error("فشل إضافة الرد السريع");
    }
  };
  
  const handleEdit = async () => {
    if (!editingResponse) return;
    
    try {
      await updateMutation.mutateAsync({
        id: editingResponse.id,
        ...formData,
      });
      toast.success("تم تحديث الرد السريع بنجاح");
      setIsEditOpen(false);
      setEditingResponse(null);
      resetForm();
      utils.quickResponses.list.invalidate();
    } catch (error) {
      toast.error("فشل تحديث الرد السريع");
    }
  };
  
  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا الرد السريع؟")) return;
    
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("تم حذف الرد السريع بنجاح");
      utils.quickResponses.list.invalidate();
      utils.quickResponses.getStats.invalidate();
    } catch (error) {
      toast.error("فشل حذف الرد السريع");
    }
  };
  
  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      await updateMutation.mutateAsync({ id, isActive: !isActive });
      toast.success(isActive ? "تم تعطيل الرد السريع" : "تم تفعيل الرد السريع");
      utils.quickResponses.list.invalidate();
      utils.quickResponses.getStats.invalidate();
    } catch (error) {
      toast.error("فشل تحديث حالة الرد السريع");
    }
  };
  
  const openEditDialog = (response: any) => {
    setEditingResponse(response);
    setFormData({
      trigger: response.trigger,
      response: response.response,
      keywords: response.keywords || "",
      priority: response.priority || 5,
    });
    setIsEditOpen(true);
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <MessageSquare className="h-8 w-8 text-primary" />
            إدارة الردود السريعة
          </h1>
          <p className="text-muted-foreground mt-2">
            أضف وعدّل الردود الجاهزة التي يستخدمها ساري في المحادثات
          </p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              إضافة رد جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>إضافة رد سريع جديد</DialogTitle>
              <DialogDescription>
                أضف رداً جاهزاً يستخدمه ساري عند اكتشاف كلمات معينة
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="trigger">العبارة المحفزة *</Label>
                <Input
                  id="trigger"
                  value={formData.trigger}
                  onChange={(e) => setFormData({ ...formData, trigger: e.target.value })}
                  placeholder="مثال: السعر، كم التوصيل، متى يوصل"
                />
                <p className="text-sm text-muted-foreground">
                  الكلمة أو العبارة التي تحفز هذا الرد
                </p>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="response">الرد *</Label>
                <Textarea
                  id="response"
                  value={formData.response}
                  onChange={(e) => setFormData({ ...formData, response: e.target.value })}
                  placeholder="مثال: أسعارنا تبدأ من 50 ريال، والتوصيل مجاني للطلبات فوق 200 ريال"
                  rows={4}
                />
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="keywords">كلمات مفتاحية إضافية</Label>
                <Input
                  id="keywords"
                  value={formData.keywords}
                  onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                  placeholder="مثال: سعر، كم، فلوس، ثمن (افصل بفاصلة)"
                />
                <p className="text-sm text-muted-foreground">
                  كلمات إضافية تحفز نفس الرد (اختياري)
                </p>
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="priority">الأولوية (0-10)</Label>
                <Input
                  id="priority"
                  type="number"
                  min="0"
                  max="10"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                />
                <p className="text-sm text-muted-foreground">
                  الأولوية الأعلى تعني استخدام هذا الرد أولاً
                </p>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending || !formData.trigger || !formData.response}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                إضافة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الردود</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الردود النشطة</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الردود المعطلة</CardTitle>
              <ToggleLeft className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">{stats.inactive}</div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Responses Table */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة الردود السريعة</CardTitle>
          <CardDescription>
            جميع الردود الجاهزة المتاحة لساري
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!responses || responses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>لا توجد ردود سريعة حالياً</p>
              <p className="text-sm mt-2">ابدأ بإضافة أول رد سريع</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                <TableHead>العبارة المحفزة</TableHead>
                <TableHead>الرد</TableHead>
                <TableHead>الأولوية</TableHead>
                <TableHead>عدد الاستخدام</TableHead>
                <TableHead>الحالة</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {responses.map((response) => (
                  <TableRow key={response.id}>
                    <TableCell className="font-medium">{response.trigger}</TableCell>
                    <TableCell className="max-w-md truncate">{response.response}</TableCell>
                    <TableCell>
                      <Badge variant={response.priority >= 7 ? "default" : "secondary"}>
                        {response.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {response.useCount} مرة
                    </TableCell>
                    <TableCell>
                      {response.isActive ? (
                        <Badge className="bg-green-600">نشط</Badge>
                      ) : (
                        <Badge variant="secondary">معطل</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-left">
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(response.id, response.isActive)}
                        >
                          {response.isActive ? (
                            <ToggleLeft className="h-4 w-4" />
                          ) : (
                            <ToggleRight className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(response)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(response.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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
      
      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تعديل الرد السريع</DialogTitle>
            <DialogDescription>
              عدّل الرد الجاهز حسب احتياجك
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-trigger">العبارة المحفزة *</Label>
              <Input
                id="edit-trigger"
                value={formData.trigger}
                onChange={(e) => setFormData({ ...formData, trigger: e.target.value })}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="edit-response">الرد *</Label>
              <Textarea
                id="edit-response"
                value={formData.response}
                onChange={(e) => setFormData({ ...formData, response: e.target.value })}
                rows={4}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="edit-keywords">كلمات مفتاحية إضافية</Label>
              <Input
                id="edit-keywords"
                value={formData.keywords}
                onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="edit-priority">الأولوية (0-10)</Label>
              <Input
                id="edit-priority"
                type="number"
                min="0"
                max="10"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending || !formData.trigger || !formData.response}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              حفظ التغييرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
