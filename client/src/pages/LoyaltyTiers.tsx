import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function LoyaltyTiers() {
  const { toast } = useToast();
  const { data: tiers, isLoading, refetch } = trpc.loyalty.getTiers.useQuery();
  const updateTier = trpc.loyalty.updateTier.useMutation();

  const [editingTiers, setEditingTiers] = useState<Record<number, any>>({});

  const handleEdit = (tier: any) => {
    setEditingTiers({
      ...editingTiers,
      [tier.id]: { ...tier },
    });
  };

  const handleSave = async (tierId: number) => {
    try {
      const tierData = editingTiers[tierId];
      await updateTier.mutateAsync(tierData);
      await refetch();
      
      // إزالة من قائمة التعديل
      const newEditing = { ...editingTiers };
      delete newEditing[tierId];
      setEditingTiers(newEditing);

      toast({
        title: "تم الحفظ بنجاح",
        description: `تم تحديث مستوى ${tierData.nameAr}`,
      });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل حفظ المستوى",
        variant: "destructive",
      });
    }
  };

  const handleCancel = (tierId: number) => {
    const newEditing = { ...editingTiers };
    delete newEditing[tierId];
    setEditingTiers(newEditing);
  };

  const updateEditingTier = (tierId: number, field: string, value: any) => {
    setEditingTiers({
      ...editingTiers,
      [tierId]: {
        ...editingTiers[tierId],
        [field]: value,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-8">
      <div className="flex items-center gap-3 mb-6">
        <Trophy className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">مستويات الولاء</h1>
          <p className="text-muted-foreground">إدارة مستويات العملاء ومزاياهم</p>
        </div>
      </div>

      <div className="grid gap-6">
        {tiers?.map((tier) => {
          const isEditing = editingTiers[tier.id];
          const displayTier = isEditing || tier;

          return (
            <Card key={tier.id} className="border-2" style={{ borderColor: tier.color }}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{tier.icon}</span>
                    <div>
                      <CardTitle className="text-2xl">{tier.nameAr}</CardTitle>
                      <CardDescription>{tier.name}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" style={{ borderColor: tier.color, color: tier.color }}>
                    {tier.minPoints}+ نقطة
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`minPoints-${tier.id}`}>الحد الأدنى من النقاط</Label>
                    <Input
                      id={`minPoints-${tier.id}`}
                      type="number"
                      min="0"
                      value={displayTier.minPoints}
                      onChange={(e) =>
                        updateEditingTier(tier.id, "minPoints", parseInt(e.target.value))
                      }
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`discountPercentage-${tier.id}`}>نسبة الخصم (%)</Label>
                    <Input
                      id={`discountPercentage-${tier.id}`}
                      type="number"
                      min="0"
                      max="100"
                      value={displayTier.discountPercentage}
                      onChange={(e) =>
                        updateEditingTier(tier.id, "discountPercentage", parseInt(e.target.value))
                      }
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`priority-${tier.id}`}>الأولوية</Label>
                    <Input
                      id={`priority-${tier.id}`}
                      type="number"
                      min="0"
                      value={displayTier.priority}
                      onChange={(e) =>
                        updateEditingTier(tier.id, "priority", parseInt(e.target.value))
                      }
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`color-${tier.id}`}>اللون</Label>
                    <div className="flex gap-2">
                      <Input
                        id={`color-${tier.id}`}
                        type="color"
                        value={displayTier.color}
                        onChange={(e) => updateEditingTier(tier.id, "color", e.target.value)}
                        disabled={!isEditing}
                        className="w-20"
                      />
                      <Input
                        type="text"
                        value={displayTier.color}
                        onChange={(e) => updateEditingTier(tier.id, "color", e.target.value)}
                        disabled={!isEditing}
                      />
                    </div>
                  </div>
                </div>

                {/* المزايا */}
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <h4 className="font-semibold">المزايا:</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>خصم {displayTier.discountPercentage}% على جميع المشتريات</li>
                    {displayTier.freeShipping === 1 && <li>شحن مجاني</li>}
                    {displayTier.priority > 0 && <li>أولوية في الخدمة (مستوى {displayTier.priority})</li>}
                  </ul>
                </div>

                {/* أزرار التحكم */}
                <div className="flex justify-end gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => handleCancel(tier.id)}
                      >
                        إلغاء
                      </Button>
                      <Button
                        onClick={() => handleSave(tier.id)}
                        disabled={updateTier.isPending}
                      >
                        {updateTier.isPending ? (
                          <>
                            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                            جاري الحفظ...
                          </>
                        ) : (
                          <>
                            <Save className="ml-2 h-4 w-4" />
                            حفظ
                          </>
                        )}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" onClick={() => handleEdit(tier)}>
                      تعديل
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
