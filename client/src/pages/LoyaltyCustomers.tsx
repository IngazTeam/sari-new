import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, Plus, Minus, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function LoyaltyCustomers() {
  const { toast } = useToast();
  const { data: customers, isLoading, refetch } = trpc.loyalty.getAllCustomersPoints.useQuery({
    limit: 100,
    offset: 0,
  });
  const { data: stats } = trpc.loyalty.getStats.useQuery();
  const addPoints = trpc.loyalty.addPoints.useMutation();
  const deductPoints = trpc.loyalty.deductPoints.useMutation();

  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [isAddPointsDialogOpen, setIsAddPointsDialogOpen] = useState(false);
  const [isDeductPointsDialogOpen, setIsDeductPointsDialogOpen] = useState(false);
  const [pointsForm, setPointsForm] = useState({
    points: 0,
    reason: "",
    reasonAr: "",
  });

  const handleAddPoints = async () => {
    if (!selectedCustomer) return;

    try {
      await addPoints.mutateAsync({
        customerPhone: selectedCustomer.customerPhone,
        points: pointsForm.points,
        reason: pointsForm.reason,
        reasonAr: pointsForm.reasonAr,
      });
      await refetch();
      setIsAddPointsDialogOpen(false);
      setPointsForm({ points: 0, reason: "", reasonAr: "" });
      toast({
        title: "تم إضافة النقاط بنجاح",
        description: `تم إضافة ${pointsForm.points} نقطة لـ ${selectedCustomer.customerName}`,
      });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل إضافة النقاط",
        variant: "destructive",
      });
    }
  };

  const handleDeductPoints = async () => {
    if (!selectedCustomer) return;

    try {
      await deductPoints.mutateAsync({
        customerPhone: selectedCustomer.customerPhone,
        points: pointsForm.points,
        reason: pointsForm.reason,
        reasonAr: pointsForm.reasonAr,
      });
      await refetch();
      setIsDeductPointsDialogOpen(false);
      setPointsForm({ points: 0, reason: "", reasonAr: "" });
      toast({
        title: "تم خصم النقاط بنجاح",
        description: `تم خصم ${pointsForm.points} نقطة من ${selectedCustomer.customerName}`,
      });
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "فشل خصم النقاط",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-8">
      <div className="flex items-center gap-3 mb-6">
        <Users className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">عملاء نظام الولاء</h1>
          <p className="text-muted-foreground">عرض وإدارة نقاط العملاء</p>
        </div>
      </div>

      {/* إحصائيات */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>إجمالي العملاء</CardDescription>
            <CardTitle className="text-3xl">{stats?.totalCustomers || 0}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>النقاط الموزعة</CardDescription>
            <CardTitle className="text-3xl">{stats?.totalPointsDistributed || 0}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>النقاط المستبدلة</CardDescription>
            <CardTitle className="text-3xl">{stats?.totalPointsRedeemed || 0}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>إجمالي الاستبدالات</CardDescription>
            <CardTitle className="text-3xl">{stats?.totalRedemptions || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* جدول العملاء */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة العملاء</CardTitle>
          <CardDescription>جميع العملاء المسجلين في نظام الولاء</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>العميل</TableHead>
                <TableHead>رقم الجوال</TableHead>
                <TableHead>النقاط الحالية</TableHead>
                <TableHead>إجمالي النقاط</TableHead>
                <TableHead>المستوى</TableHead>
                <TableHead>آخر نشاط</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers?.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                    {customer.customerName || "غير معروف"}
                  </TableCell>
                  <TableCell dir="ltr" className="text-right">{customer.customerPhone}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      <span className="font-semibold">{customer.totalPoints}</span>
                    </div>
                  </TableCell>
                  <TableCell>{customer.lifetimePoints}</TableCell>
                  <TableCell>
                    {customer.tier ? (
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: customer.tier.color,
                          color: customer.tier.color,
                        }}
                      >
                        {customer.tier.icon} {customer.tier.nameAr}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">لا يوجد</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {customer.lastPointsEarnedAt
                      ? new Date(customer.lastPointsEarnedAt).toLocaleDateString("ar-SA")
                      : "-"}
                  </TableCell>
                  <TableCell className="text-left">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setIsAddPointsDialogOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setIsDeductPointsDialogOpen(true);
                        }}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {customers?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    لا يوجد عملاء مسجلين في نظام الولاء
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog إضافة نقاط */}
      <Dialog open={isAddPointsDialogOpen} onOpenChange={setIsAddPointsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة نقاط</DialogTitle>
            <DialogDescription>
              إضافة نقاط لـ {selectedCustomer?.customerName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="addPoints">عدد النقاط</Label>
              <Input
                id="addPoints"
                type="number"
                min="1"
                value={pointsForm.points}
                onChange={(e) =>
                  setPointsForm({ ...pointsForm, points: parseInt(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reasonAr">السبب (بالعربي)</Label>
              <Textarea
                id="reasonAr"
                value={pointsForm.reasonAr}
                onChange={(e) => setPointsForm({ ...pointsForm, reasonAr: e.target.value })}
                placeholder="مثال: مكافأة خاصة"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">السبب (بالإنجليزي)</Label>
              <Textarea
                id="reason"
                value={pointsForm.reason}
                onChange={(e) => setPointsForm({ ...pointsForm, reason: e.target.value })}
                placeholder="Example: Special bonus"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddPointsDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleAddPoints} disabled={addPoints.isPending}>
              {addPoints.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الإضافة...
                </>
              ) : (
                "إضافة النقاط"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog خصم نقاط */}
      <Dialog open={isDeductPointsDialogOpen} onOpenChange={setIsDeductPointsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>خصم نقاط</DialogTitle>
            <DialogDescription>
              خصم نقاط من {selectedCustomer?.customerName} (الرصيد الحالي: {selectedCustomer?.totalPoints})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deductPoints">عدد النقاط</Label>
              <Input
                id="deductPoints"
                type="number"
                min="1"
                max={selectedCustomer?.totalPoints || 0}
                value={pointsForm.points}
                onChange={(e) =>
                  setPointsForm({ ...pointsForm, points: parseInt(e.target.value) })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deductReasonAr">السبب (بالعربي)</Label>
              <Textarea
                id="deductReasonAr"
                value={pointsForm.reasonAr}
                onChange={(e) => setPointsForm({ ...pointsForm, reasonAr: e.target.value })}
                placeholder="مثال: تعديل يدوي"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deductReason">السبب (بالإنجليزي)</Label>
              <Textarea
                id="deductReason"
                value={pointsForm.reason}
                onChange={(e) => setPointsForm({ ...pointsForm, reason: e.target.value })}
                placeholder="Example: Manual adjustment"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeductPointsDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleDeductPoints}
              disabled={deductPoints.isPending}
              variant="destructive"
            >
              {deductPoints.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الخصم...
                </>
              ) : (
                "خصم النقاط"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
