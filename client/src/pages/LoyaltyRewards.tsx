import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Gift, Edit, Trash2, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

export default function LoyaltyRewards() {
  const { toast } = useToast();
  const { data: rewards, isLoading, refetch } = trpc.loyalty.getRewards.useQuery({
    activeOnly: false,
  });
  const createReward = trpc.loyalty.createReward.useMutation();
  const updateReward = trpc.loyalty.updateReward.useMutation();
  const deleteReward = trpc.loyalty.deleteReward.useMutation();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: "",
    titleAr: "",
    description: "",
    descriptionAr: "",
    type: "discount" as "discount" | "free_product" | "free_shipping" | "gift",
    pointsCost: 100,
    discountAmount: 0,
    discountType: "fixed" as "fixed" | "percentage",
    maxRedemptions: 0,
    isActive: 1,
  });

  const resetForm = () => {
    setFormData({
      title: "",
      titleAr: "",
      description: "",
      descriptionAr: "",
      type: "discount",
      pointsCost: 100,
      discountAmount: 0,
      discountType: "fixed",
      maxRedemptions: 0,
      isActive: 1,
    });
    setEditingReward(null);
  };

  const handleCreate = async () => {
    try {
      await createReward.mutateAsync(formData);
      await refetch();
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: "تم الإنشاء بنجاح",
        description: "تم إضافة المكافأة الجديدة",
      });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل إنشاء المكافأة",
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async () => {
    if (!editingReward) return;

    try {
      await updateReward.mutateAsync({
        id: editingReward.id,
        ...formData,
      });
      await refetch();
      setEditingReward(null);
      resetForm();
      toast({
        title: "تم التحديث بنجاح",
        description: "تم تحديث المكافأة",
      });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل تحديث المكافأة",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذه المكافأة؟")) return;

    try {
      await deleteReward.mutateAsync({ id });
      await refetch();
      toast({
        title: "تم الحذف بنجاح",
        description: "تم حذف المكافأة",
      });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل حذف المكافأة",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (reward: any) => {
    setEditingReward(reward);
    setFormData({
      title: reward.title,
      titleAr: reward.titleAr,
      description: reward.description || "",
      descriptionAr: reward.descriptionAr || "",
      type: reward.type,
      pointsCost: reward.pointsCost,
      discountAmount: reward.discountAmount || 0,
      discountType: reward.discountType || "fixed",
      maxRedemptions: reward.maxRedemptions || 0,
      isActive: reward.isActive,
    });
  };

  const getRewardTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      discount: "خصم",
      free_product: "منتج مجاني",
      free_shipping: "شحن مجاني",
      gift: "هدية",
    };
    return labels[type] || type;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Gift className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">المكافآت</h1>
            <p className="text-muted-foreground">إدارة المكافآت المتاحة للعملاء</p>
          </div>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="ml-2 h-4 w-4" />
              إضافة مكافأة جديدة
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>إضافة مكافأة جديدة</DialogTitle>
              <DialogDescription>
                أنشئ مكافأة جديدة يمكن للعملاء استبدالها بالنقاط
              </DialogDescription>
            </DialogHeader>

            <RewardForm formData={formData} setFormData={setFormData} />

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleCreate} disabled={createReward.isPending}>
                {createReward.isPending ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جاري الإنشاء...
                  </>
                ) : (
                  "إنشاء المكافأة"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* قائمة المكافآت */}
      <div className="grid gap-4">
        {rewards?.map((reward) => (
          <Card key={reward.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <CardTitle>{reward.titleAr}</CardTitle>
                    <Badge variant={reward.isActive ? "default" : "secondary"}>
                      {reward.isActive ? "نشط" : "معطل"}
                    </Badge>
                    <Badge variant="outline">
                      <Star className="ml-1 h-3 w-3 fill-current" />
                      {reward.pointsCost} نقطة
                    </Badge>
                  </div>
                  <CardDescription>{reward.title}</CardDescription>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(reward)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(reward.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">النوع</p>
                  <p className="font-medium">{getRewardTypeLabel(reward.type)}</p>
                </div>
                {reward.discountAmount && (
                  <div>
                    <p className="text-muted-foreground">قيمة الخصم</p>
                    <p className="font-medium">
                      {reward.discountAmount} {reward.discountType === "percentage" ? "%" : "ريال"}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">عدد الاستبدالات</p>
                  <p className="font-medium">
                    {reward.currentRedemptions}
                    {reward.maxRedemptions ? ` / ${reward.maxRedemptions}` : " / غير محدود"}
                  </p>
                </div>
              </div>
              {reward.descriptionAr && (
                <p className="mt-3 text-sm text-muted-foreground">{reward.descriptionAr}</p>
              )}
            </CardContent>
          </Card>
        ))}

        {rewards?.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Gift className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">لا توجد مكافآت حتى الآن</p>
              <p className="text-sm text-muted-foreground">ابدأ بإضافة مكافأة جديدة</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog للتعديل */}
      {editingReward && (
        <Dialog open={!!editingReward} onOpenChange={() => setEditingReward(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>تعديل المكافأة</DialogTitle>
              <DialogDescription>تحديث بيانات المكافأة</DialogDescription>
            </DialogHeader>

            <RewardForm formData={formData} setFormData={setFormData} />

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingReward(null)}>
                إلغاء
              </Button>
              <Button onClick={handleUpdate} disabled={updateReward.isPending}>
                {updateReward.isPending ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جاري التحديث...
                  </>
                ) : (
                  "حفظ التعديلات"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// مكون النموذج
function RewardForm({ formData, setFormData }: any) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="titleAr">العنوان بالعربي *</Label>
          <Input
            id="titleAr"
            value={formData.titleAr}
            onChange={(e) => setFormData({ ...formData, titleAr: e.target.value })}
            placeholder="خصم 10 ريال"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">العنوان بالإنجليزي *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="10 SAR Discount"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="descriptionAr">الوصف بالعربي</Label>
          <Textarea
            id="descriptionAr"
            value={formData.descriptionAr}
            onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
            placeholder="احصل على خصم 10 ريال على طلبك القادم"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">الوصف بالإنجليزي</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Get 10 SAR discount on your next order"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="type">نوع المكافأة *</Label>
          <Select
            value={formData.type}
            onValueChange={(value) => setFormData({ ...formData, type: value })}
          >
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="discount">خصم</SelectItem>
              <SelectItem value="free_product">منتج مجاني</SelectItem>
              <SelectItem value="free_shipping">شحن مجاني</SelectItem>
              <SelectItem value="gift">هدية</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pointsCost">تكلفة النقاط *</Label>
          <Input
            id="pointsCost"
            type="number"
            min="1"
            value={formData.pointsCost}
            onChange={(e) => setFormData({ ...formData, pointsCost: parseInt(e.target.value) })}
          />
        </div>
      </div>

      {formData.type === "discount" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="discountAmount">قيمة الخصم *</Label>
            <Input
              id="discountAmount"
              type="number"
              min="0"
              value={formData.discountAmount}
              onChange={(e) =>
                setFormData({ ...formData, discountAmount: parseInt(e.target.value) })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="discountType">نوع الخصم *</Label>
            <Select
              value={formData.discountType}
              onValueChange={(value) => setFormData({ ...formData, discountType: value })}
            >
              <SelectTrigger id="discountType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">مبلغ ثابت (ريال)</SelectItem>
                <SelectItem value="percentage">نسبة مئوية (%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="maxRedemptions">الحد الأقصى للاستبدالات</Label>
          <Input
            id="maxRedemptions"
            type="number"
            min="0"
            value={formData.maxRedemptions}
            onChange={(e) =>
              setFormData({ ...formData, maxRedemptions: parseInt(e.target.value) })
            }
            placeholder="0 = غير محدود"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="isActive">الحالة</Label>
          <div className="flex items-center gap-2 h-10">
            <Switch
              id="isActive"
              checked={formData.isActive === 1}
              onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked ? 1 : 0 })}
            />
            <Label htmlFor="isActive" className="cursor-pointer">
              {formData.isActive === 1 ? "نشط" : "معطل"}
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}
