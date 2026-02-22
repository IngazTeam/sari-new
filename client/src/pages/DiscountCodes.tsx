import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Ticket, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

export default function DiscountCodes() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newCode, setNewCode] = useState({
    code: "",
    type: "percentage" as "percentage" | "fixed",
    value: "",
    minOrderAmount: "",
    maxUses: "",
    expiresAt: "",
  });

  const merchantId = 1; // TODO: Get from merchant context

  // Queries
  const { data: codes, refetch } = trpc.discounts.list.useQuery({ merchantId });
  const { data: stats } = trpc.discounts.getStats.useQuery({ merchantId });

  // Mutations
  const createMutation = trpc.discounts.create.useMutation({
    onSuccess: () => {
      toast.success("t('toast.discounts.msg1')}");
      refetch();
      setIsCreateDialogOpen(false);
      setNewCode({
        code: "",
        type: "percentage",
        value: "",
        minOrderAmount: "",
        maxUses: "",
        expiresAt: "",
      });
    },
    onError: (error) => {
      toast.error(error.message || "فشل إنشاء كود الخصم");
    },
  });

  const updateMutation = trpc.discounts.update.useMutation({
    onSuccess: () => {
      toast.success("t('toast.discounts.msg3')}");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "فشل تحديث كود الخصم");
    },
  });

  const deleteMutation = trpc.discounts.delete.useMutation({
    onSuccess: () => {
      toast.success("t('toast.discounts.msg5')}");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "فشل حذف كود الخصم");
    },
  });

  const handleCreate = () => {
    if (!newCode.code || !newCode.value) {
      toast.error("t('toast.discounts.msg7')}");
      return;
    }

    createMutation.mutate({
      merchantId,
      code: newCode.code,
      type: newCode.type,
      value: parseFloat(newCode.value),
      minOrderAmount: newCode.minOrderAmount ? parseFloat(newCode.minOrderAmount) : undefined,
      maxUses: newCode.maxUses ? parseInt(newCode.maxUses) : undefined,
      expiresAt: newCode.expiresAt || undefined,
    });
  };

  const handleToggleActive = (id: number, currentStatus: boolean) => {
    updateMutation.mutate({
      id,
      isActive: !currentStatus,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("هل أنت متأكد من حذف هذا الكود؟")) {
      deleteMutation.mutate({ id });
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("ar-SA");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('discountCodesPage.text0')}</h1>
          <p className="text-muted-foreground">{t('discountCodesPage.text1')}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="ml-2 h-4 w-4" />
              إنشاء كود جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{t('discountCodesPage.text2')}</DialogTitle>
              <DialogDescription>
                أضف كود خصم جديد لتقديمه لعملائك
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="code">{t('discountCodesPage.text3')}</Label>
                <Input
                  id="code"
                  placeholder={t('discountCodesPage.text4')}
                  value={newCode.code}
                  onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">{t('discountCodesPage.text5')}</Label>
                  <Select
                    value={newCode.type}
                    onValueChange={(value: "percentage" | "fixed") =>
                      setNewCode({ ...newCode, type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">{t('discountCodesPage.text6')}</SelectItem>
                      <SelectItem value="fixed">{t('discountCodesPage.text7')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="value">
                    القيمة * {newCode.type === "percentage" ? "(%)" : "(ريال)"}
                  </Label>
                  <Input
                    id="value"
                    type="number"
                    placeholder={newCode.type === "percentage" ? "10" : "50"}
                    value={newCode.value}
                    onChange={(e) => setNewCode({ ...newCode, value: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="minOrderAmount">{t('discountCodesPage.text8')}</Label>
                <Input
                  id="minOrderAmount"
                  type="number"
                  placeholder="100"
                  value={newCode.minOrderAmount}
                  onChange={(e) => setNewCode({ ...newCode, minOrderAmount: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxUses">{t('discountCodesPage.text9')}</Label>
                  <Input
                    id="maxUses"
                    type="number"
                    placeholder="100"
                    value={newCode.maxUses}
                    onChange={(e) => setNewCode({ ...newCode, maxUses: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expiresAt">{t('discountCodesPage.text10')}</Label>
                  <Input
                    id="expiresAt"
                    type="date"
                    value={newCode.expiresAt}
                    onChange={(e) => setNewCode({ ...newCode, expiresAt: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('discountCodesPage.text11')}</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">{t('discountCodesPage.text12')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('discountCodesPage.text13')}</CardTitle>
            <ToggleRight className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.active || 0}</div>
            <p className="text-xs text-muted-foreground">{t('discountCodesPage.text14')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('discountCodesPage.text15')}</CardTitle>
            <Ticket className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.used || 0}</div>
            <p className="text-xs text-muted-foreground">{t('discountCodesPage.text16')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Discount Codes Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('discountCodesPage.text17')}</CardTitle>
          <CardDescription>{t('discountCodesPage.text18')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!codes || codes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Ticket className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>{t('discountCodesPage.text19')}</p>
              <p className="text-sm">{t('discountCodesPage.text20')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('discountCodesPage.text21')}</TableHead>
                  <TableHead>{t('discountCodesPage.text22')}</TableHead>
                  <TableHead>{t('discountCodesPage.text23')}</TableHead>
                  <TableHead>{t('discountCodesPage.text24')}</TableHead>
                  <TableHead>{t('discountCodesPage.text25')}</TableHead>
                  <TableHead>{t('discountCodesPage.text26')}</TableHead>
                  <TableHead>{t('discountCodesPage.text27')}</TableHead>
                  <TableHead className="text-left">{t('discountCodesPage.text28')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell className="font-mono font-bold">{code.code}</TableCell>
                    <TableCell>
                      {code.type === "percentage" ? "نسبة مئوية" : "مبلغ ثابت"}
                    </TableCell>
                    <TableCell>
                      {code.type === "percentage" ? `${code.value}%` : `${code.value} ريال`}
                    </TableCell>
                    <TableCell>
                      {code.minOrderAmount ? `${code.minOrderAmount} ريال` : "-"}
                    </TableCell>
                    <TableCell>
                      {code.usedCount} / {code.maxUses || "∞"}
                    </TableCell>
                    <TableCell>{formatDate(code.expiresAt)}</TableCell>
                    <TableCell>
                      {code.isActive ? (
                        <Badge variant="default" className="bg-green-600">{t('discountCodesPage.text29')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('discountCodesPage.text30')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-left">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(code.id, code.isActive)}
                        >
                          {code.isActive ? (
                            <ToggleLeft className="h-4 w-4" />
                          ) : (
                            <ToggleRight className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(code.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
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
