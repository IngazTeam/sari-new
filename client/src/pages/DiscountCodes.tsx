import { useState } from "react";
import { trpc } from "@/lib/trpc";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { QueryStateCard } from "@/components/QueryStateCard";
import { Ticket, Plus, Trash2, ToggleLeft, ToggleRight, Zap, Percent, DollarSign, Gift, Calendar, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

// ═══════════════════════════════════════════════════════════════
// Discount Templates — Pre-built discount presets
// ═══════════════════════════════════════════════════════════════
const DISCOUNT_TEMPLATES = [
  {
    id: 'percentage_10',
    icon: Percent,
    labelKey: 'merchantUx.discounts.templatePercentage10Label',
    descriptionKey: 'merchantUx.discounts.templatePercentage10Description',
    gradient: 'from-blue-500/20 to-cyan-500/20',
    iconColor: 'text-blue-400',
    preset: { code: 'SAVE10', type: 'percentage' as const, value: '10', minOrderAmount: '100', maxUses: '100', expiresAt: '' },
  },
  {
    id: 'percentage_25',
    icon: Sparkles,
    labelKey: 'merchantUx.discounts.templatePercentage25Label',
    descriptionKey: 'merchantUx.discounts.templatePercentage25Description',
    gradient: 'from-violet-500/20 to-purple-500/20',
    iconColor: 'text-violet-400',
    preset: { code: 'MEGA25', type: 'percentage' as const, value: '25', minOrderAmount: '200', maxUses: '50', expiresAt: '' },
  },
  {
    id: 'fixed_50',
    icon: DollarSign,
    labelKey: 'merchantUx.discounts.templateFixed50Label',
    descriptionKey: 'merchantUx.discounts.templateFixed50Description',
    gradient: 'from-emerald-500/20 to-green-500/20',
    iconColor: 'text-emerald-400',
    preset: { code: 'FLAT50', type: 'fixed' as const, value: '50', minOrderAmount: '200', maxUses: '100', expiresAt: '' },
  },
  {
    id: 'welcome',
    icon: Gift,
    labelKey: 'merchantUx.discounts.templateWelcomeLabel',
    descriptionKey: 'merchantUx.discounts.templateWelcomeDescription',
    gradient: 'from-amber-500/20 to-orange-500/20',
    iconColor: 'text-amber-400',
    preset: { code: 'WELCOME', type: 'percentage' as const, value: '15', minOrderAmount: '50', maxUses: '', expiresAt: '' },
  },
  {
    id: 'seasonal',
    icon: Calendar,
    labelKey: 'merchantUx.discounts.templateSeasonalLabel',
    descriptionKey: 'merchantUx.discounts.templateSeasonalDescription',
    gradient: 'from-rose-500/20 to-pink-500/20',
    iconColor: 'text-rose-400',
    preset: { code: 'SEASON30', type: 'percentage' as const, value: '30', minOrderAmount: '150', maxUses: '200', expiresAt: getDateAfterDays(30) },
  },
  {
    id: 'flash',
    icon: Zap,
    labelKey: 'merchantUx.discounts.templateFlashLabel',
    descriptionKey: 'merchantUx.discounts.templateFlashDescription',
    gradient: 'from-yellow-500/20 to-amber-500/20',
    iconColor: 'text-yellow-400',
    preset: { code: 'FLASH40', type: 'percentage' as const, value: '40', minOrderAmount: '100', maxUses: '30', expiresAt: getDateAfterDays(3) },
  },
];

function getDateAfterDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function DiscountCodes() {
  const { t, i18n } = useTranslation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [newCode, setNewCode] = useState({
    code: "",
    type: "percentage" as "percentage" | "fixed",
    value: "",
    minOrderAmount: "",
    maxUses: "",
    expiresAt: "",
  });

  // Queries
  const {
    data: codes,
    isLoading: codesLoading,
    error: codesError,
    refetch: refetchCodes,
  } = trpc.discounts.list.useQuery();
  const {
    data: stats,
    error: statsError,
    refetch: refetchStats,
  } = trpc.discounts.getStats.useQuery();

  const refreshDiscounts = () => void Promise.all([refetchCodes(), refetchStats()]);

  // Mutations
  const createMutation = trpc.discounts.create.useMutation({
    onSuccess: () => {
      toast.success(t('merchantUx.discounts.created'));
      refreshDiscounts();
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
    onError: (error: any) => {
      toast.error(error.message || t('merchantUx.discounts.createFailed'));
    },
  });

  const updateMutation = trpc.discounts.update.useMutation({
    onSuccess: () => {
      toast.success(t('merchantUx.discounts.updated'));
      refreshDiscounts();
    },
    onError: (error: any) => {
      toast.error(error.message || t('merchantUx.discounts.updateFailed'));
    },
  });

  const deleteMutation = trpc.discounts.delete.useMutation({
    onSuccess: () => {
      toast.success(t('merchantUx.discounts.deleted'));
      refreshDiscounts();
      setDeleteTarget(null);
    },
    onError: (error: any) => {
      toast.error(error.message || t('merchantUx.discounts.deleteFailed'));
    },
  });

  const handleCreate = () => {
    if (!newCode.code || !newCode.value) {
      toast.error(t('merchantUx.discounts.requiredFields'));
      return;
    }

    const value = Number(newCode.value);
    if (!Number.isFinite(value) || value <= 0 || (newCode.type === "percentage" && value > 100)) {
      toast.error(newCode.type === "percentage"
        ? t('merchantUx.discounts.invalidPercentage')
        : t('merchantUx.discounts.invalidValue'));
      return;
    }

    createMutation.mutate({
      code: newCode.code.trim(),
      type: newCode.type,
      value,
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

  const handleDelete = () => {
    if (deleteTarget !== null) {
      deleteMutation.mutate({ id: deleteTarget });
    }
  };

  const applyTemplate = (preset: typeof DISCOUNT_TEMPLATES[0]['preset']) => {
    setNewCode({ ...preset });
    setIsCreateDialogOpen(true);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return t('merchantUx.discounts.noExpiry');
    return new Date(date).toLocaleDateString(i18n.language);
  };

  if (codesLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label={t('merchantUx.discounts.loading')} />
      </div>
    );
  }

  if (codesError || statsError) {
    return (
      <QueryStateCard
        kind="error"
        title={t('merchantUx.discounts.loadFailed')}
        description={(codesError || statsError)?.message}
        retryLabel={t('merchantUx.discounts.retry')}
        onRetry={refreshDiscounts}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('merchantUx.discounts.title')}</h1>
          <p className="text-muted-foreground">{t('merchantUx.discounts.description')}</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="ml-2 h-4 w-4" />{t('merchantUx.discounts.add')}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{t('merchantUx.discounts.createTitle')}</DialogTitle>
              <DialogDescription>{t('merchantUx.discounts.createDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="code">{t('merchantUx.discounts.code')}</Label>
                <Input
                  id="code"
                  placeholder={t('merchantUx.discounts.codePlaceholder')}
                  value={newCode.code}
                  onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">{t('merchantUx.discounts.type')}</Label>
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
                      <SelectItem value="percentage">{t('merchantUx.discounts.percentage')}</SelectItem>
                      <SelectItem value="fixed">{t('merchantUx.discounts.fixed')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="value">
                    {t('merchantUx.discounts.value')} {newCode.type === "percentage"
                      ? '(%)'
                      : `(${t('merchantUx.discounts.currencyUnit')})`}
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
                <Label htmlFor="minOrderAmount">{t('merchantUx.discounts.minimumOrder')}</Label>
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
                  <Label htmlFor="maxUses">{t('merchantUx.discounts.maxUses')}</Label>
                  <Input
                    id="maxUses"
                    type="number"
                    placeholder="100"
                    value={newCode.maxUses}
                    onChange={(e) => setNewCode({ ...newCode, maxUses: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expiresAt">{t('merchantUx.discounts.expiresAt')}</Label>
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
                {t('merchantUx.discounts.cancel')}
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending
                  ? t('merchantUx.discounts.creating')
                  : t('merchantUx.discounts.create')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('merchantUx.discounts.totalCodes')}</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">{t('merchantUx.discounts.totalCodesDescription')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('merchantUx.discounts.activeCodes')}</CardTitle>
            <ToggleRight className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.active || 0}</div>
            <p className="text-xs text-muted-foreground">{t('merchantUx.discounts.activeCodesDescription')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('merchantUx.discounts.totalUsage')}</CardTitle>
            <Ticket className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.used || 0}</div>
            <p className="text-xs text-muted-foreground">{t('merchantUx.discounts.totalUsageDescription')}</p>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════ Discount Templates Section ═══════════ */}
      <Card className="bg-card/60 backdrop-blur-sm border-white/10">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/20">
              <Sparkles className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-lg">{t('merchantUx.discounts.templatesTitle')}</CardTitle>
              <CardDescription>{t('merchantUx.discounts.templatesDescription')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {DISCOUNT_TEMPLATES.map((tmpl) => {
              const Icon = tmpl.icon;
              return (
                <button
                  key={tmpl.id}
                  onClick={() => applyTemplate(tmpl.preset)}
                  className={`group relative p-4 rounded-xl border border-white/10 bg-gradient-to-br ${tmpl.gradient} hover:border-white/20 hover:scale-[1.02] transition-all duration-200 text-center cursor-pointer`}
                >
                  <div className={`mx-auto mb-2 p-2 rounded-lg bg-background/30 w-fit`}>
                    <Icon className={`h-5 w-5 ${tmpl.iconColor}`} />
                  </div>
                  <p className="text-sm font-semibold text-white">{t(tmpl.labelKey)}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{t(tmpl.descriptionKey)}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Discount Codes Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('merchantUx.discounts.listTitle')}</CardTitle>
          <CardDescription>{t('merchantUx.discounts.listDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!codes || codes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Ticket className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>{t('merchantUx.discounts.emptyTitle')}</p>
              <p className="text-sm">{t('merchantUx.discounts.emptyDescription')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('merchantUx.discounts.columnCode')}</TableHead>
                  <TableHead>{t('merchantUx.discounts.columnType')}</TableHead>
                  <TableHead>{t('merchantUx.discounts.columnValue')}</TableHead>
                  <TableHead>{t('merchantUx.discounts.columnMinimum')}</TableHead>
                  <TableHead>{t('merchantUx.discounts.columnUsage')}</TableHead>
                  <TableHead>{t('merchantUx.discounts.columnExpiry')}</TableHead>
                  <TableHead>{t('merchantUx.discounts.columnStatus')}</TableHead>
                  <TableHead className="text-left">{t('merchantUx.discounts.columnActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell className="font-mono font-bold">{code.code}</TableCell>
                    <TableCell>
                      {code.type === "percentage"
                        ? t('merchantUx.discounts.percentageType')
                        : t('merchantUx.discounts.fixedType')}
                    </TableCell>
                    <TableCell>
                      {code.type === "percentage"
                        ? `${code.value}%`
                        : `${code.value} ${t('merchantUx.discounts.currencyUnit')}`}
                    </TableCell>
                    <TableCell>
                      {code.minOrderAmount
                        ? `${code.minOrderAmount} ${t('merchantUx.discounts.currencyUnit')}`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {code.usedCount} / {code.maxUses || "∞"}
                    </TableCell>
                    <TableCell>{formatDate(code.expiresAt)}</TableCell>
                    <TableCell>
                      {code.isActive ? (
                        <Badge variant="default" className="bg-green-600">{t('merchantUx.discounts.active')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('merchantUx.discounts.inactive')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-left">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(code.id, Boolean(code.isActive))}
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
                          onClick={() => setDeleteTarget(code.id)}
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

      {/* ═══════════ Delete Confirmation AlertDialog ═══════════ */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('merchantUx.discounts.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('merchantUx.discounts.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('merchantUx.discounts.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending
                ? t('merchantUx.discounts.deleting')
                : t('merchantUx.discounts.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
