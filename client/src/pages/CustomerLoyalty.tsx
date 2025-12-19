import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Star, Gift, TrendingUp, Clock, Award } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export default function CustomerLoyalty() {
  const { customerPhone } = useParams<{ customerPhone: string }>();
  const { toast } = useToast();
  
  const { data: customerPoints, isLoading: isLoadingPoints, refetch } = trpc.loyalty.getCustomerPoints.useQuery({
    customerPhone: customerPhone || "",
  });
  
  const { data: rewards, isLoading: isLoadingRewards } = trpc.loyalty.getRewards.useQuery({
    activeOnly: true,
  });
  
  const { data: transactions, isLoading: isLoadingTransactions } = trpc.loyalty.getTransactions.useQuery({
    customerPhone: customerPhone || "",
    limit: 50,
    offset: 0,
  });
  
  const { data: redemptions, isLoading: isLoadingRedemptions } = trpc.loyalty.getRedemptions.useQuery({
    customerPhone: customerPhone || "",
    limit: 50,
    offset: 0,
  });

  const redeemReward = trpc.loyalty.redeemReward.useMutation();
  const [selectedReward, setSelectedReward] = useState<any>(null);

  const handleRedeemReward = async () => {
    if (!selectedReward || !customerPoints) return;

    try {
      await redeemReward.mutateAsync({
        customerPhone: customerPhone || "",
        customerName: customerPoints.customerName || "عميل",
        rewardId: selectedReward.id,
      });
      await refetch();
      setSelectedReward(null);
      toast({
        title: "تم الاستبدال بنجاح! 🎉",
        description: `تم استبدال ${selectedReward.titleAr}`,
      });
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "فشل استبدال المكافأة",
        variant: "destructive",
      });
    }
  };

  if (isLoadingPoints) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8">
      {/* رأس الصفحة */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-2">برنامج الولاء</h1>
        <p className="text-muted-foreground">اكسب نقاطاً واحصل على مكافآت رائعة!</p>
      </div>

      {/* بطاقة النقاط الرئيسية */}
      <Card className="mb-8 bg-gradient-to-br from-primary/10 via-primary/5 to-background border-2 border-primary/20">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* النقاط الحالية */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Star className="h-5 w-5 text-yellow-500 fill-current" />
                <p className="text-sm text-muted-foreground">نقاطك الحالية</p>
              </div>
              <p className="text-5xl font-bold text-primary">{customerPoints?.totalPoints || 0}</p>
            </div>

            {/* إجمالي النقاط */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <p className="text-sm text-muted-foreground">إجمالي النقاط</p>
              </div>
              <p className="text-5xl font-bold">{customerPoints?.lifetimePoints || 0}</p>
            </div>

            {/* المستوى */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Award className="h-5 w-5 text-purple-500" />
                <p className="text-sm text-muted-foreground">مستواك</p>
              </div>
              {customerPoints?.tier ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-4xl">{customerPoints.tier.icon}</span>
                  <Badge
                    variant="outline"
                    className="text-lg px-4 py-1"
                    style={{
                      borderColor: customerPoints.tier.color,
                      color: customerPoints.tier.color,
                    }}
                  >
                    {customerPoints.tier.nameAr}
                  </Badge>
                </div>
              ) : (
                <p className="text-2xl text-muted-foreground">لا يوجد</p>
              )}
            </div>
          </div>

          {/* مزايا المستوى */}
          {customerPoints?.tier && (
            <div className="mt-6 p-4 bg-background/50 rounded-lg">
              <h3 className="font-semibold mb-2 text-center">مزاياك الحالية:</h3>
              <div className="flex flex-wrap justify-center gap-3">
                <Badge variant="secondary">
                  خصم {customerPoints.tier.discountPercentage}%
                </Badge>
                {customerPoints.tier.freeShipping === 1 && (
                  <Badge variant="secondary">شحن مجاني</Badge>
                )}
                {customerPoints.tier.priority > 0 && (
                  <Badge variant="secondary">أولوية في الخدمة</Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="rewards" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rewards">
            <Gift className="ml-2 h-4 w-4" />
            المكافآت المتاحة
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="ml-2 h-4 w-4" />
            سجل النقاط
          </TabsTrigger>
          <TabsTrigger value="redemptions">
            <Award className="ml-2 h-4 w-4" />
            استبدالاتي
          </TabsTrigger>
        </TabsList>

        {/* المكافآت المتاحة */}
        <TabsContent value="rewards" className="space-y-4">
          {isLoadingRewards ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rewards?.map((reward) => {
                const canRedeem = (customerPoints?.totalPoints || 0) >= reward.pointsCost;
                const isMaxedOut = reward.maxRedemptions && reward.currentRedemptions >= reward.maxRedemptions;

                return (
                  <Card key={reward.id} className={!canRedeem || isMaxedOut ? "opacity-60" : ""}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle>{reward.titleAr}</CardTitle>
                          <CardDescription className="mt-1">{reward.descriptionAr}</CardDescription>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          <Star className="ml-1 h-3 w-3 fill-current" />
                          {reward.pointsCost}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {reward.discountAmount && (
                          <p className="text-sm text-muted-foreground">
                            قيمة الخصم: {reward.discountAmount}{" "}
                            {reward.discountType === "percentage" ? "%" : "ريال"}
                          </p>
                        )}
                        
                        {isMaxedOut ? (
                          <Button disabled className="w-full">
                            نفذت الكمية
                          </Button>
                        ) : (
                          <Button
                            onClick={() => setSelectedReward(reward)}
                            disabled={!canRedeem}
                            className="w-full"
                          >
                            {canRedeem ? "استبدال الآن" : `تحتاج ${reward.pointsCost - (customerPoints?.totalPoints || 0)} نقطة إضافية`}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {rewards?.length === 0 && (
                <div className="col-span-2 text-center py-12 text-muted-foreground">
                  لا توجد مكافآت متاحة حالياً
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* سجل النقاط */}
        <TabsContent value="history" className="space-y-4">
          {isLoadingTransactions ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {transactions?.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{transaction.reasonAr}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(transaction.createdAt).toLocaleString("ar-SA")}
                        </p>
                      </div>
                      <div className="text-left">
                        <p
                          className={`text-lg font-bold ${
                            transaction.points > 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {transaction.points > 0 ? "+" : ""}
                          {transaction.points}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          الرصيد: {transaction.balanceAfter}
                        </p>
                      </div>
                    </div>
                  ))}

                  {transactions?.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      لا يوجد سجل حركات حتى الآن
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* الاستبدالات */}
        <TabsContent value="redemptions" className="space-y-4">
          {isLoadingRedemptions ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {redemptions?.map((redemption) => (
                    <div
                      key={redemption.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium">استبدال مكافأة</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(redemption.createdAt).toLocaleString("ar-SA")}
                        </p>
                      </div>
                      <div className="text-left space-y-1">
                        <Badge
                          variant={
                            redemption.status === "approved"
                              ? "default"
                              : redemption.status === "used"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {redemption.status === "approved" && "معتمد"}
                          {redemption.status === "used" && "مستخدم"}
                          {redemption.status === "pending" && "قيد الانتظار"}
                          {redemption.status === "cancelled" && "ملغي"}
                          {redemption.status === "expired" && "منتهي"}
                        </Badge>
                        <p className="text-sm text-muted-foreground">
                          {redemption.pointsSpent} نقطة
                        </p>
                      </div>
                    </div>
                  ))}

                  {redemptions?.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      لم تقم باستبدال أي مكافآت بعد
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog تأكيد الاستبدال */}
      <Dialog open={!!selectedReward} onOpenChange={() => setSelectedReward(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الاستبدال</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من استبدال هذه المكافأة؟
            </DialogDescription>
          </DialogHeader>

          {selectedReward && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">{selectedReward.titleAr}</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {selectedReward.descriptionAr}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm">التكلفة:</span>
                  <Badge variant="outline">
                    <Star className="ml-1 h-3 w-3 fill-current" />
                    {selectedReward.pointsCost} نقطة
                  </Badge>
                </div>
              </div>

              <div className="p-4 bg-primary/10 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span>رصيدك الحالي:</span>
                  <span className="font-bold">{customerPoints?.totalPoints}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span>الرصيد بعد الاستبدال:</span>
                  <span className="font-bold">
                    {(customerPoints?.totalPoints || 0) - selectedReward.pointsCost}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedReward(null)}>
              إلغاء
            </Button>
            <Button onClick={handleRedeemReward} disabled={redeemReward.isPending}>
              {redeemReward.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الاستبدال...
                </>
              ) : (
                "تأكيد الاستبدال"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
