import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Flame, Plus, Eye, MousePointerClick, TrendingUp, Trash2,
  Pencil, Image, Calendar, Tag, Package, Truck, Sparkles,
  AlertCircle, Percent, DollarSign, ShoppingBag,
} from 'lucide-react';
import { toast } from 'sonner';

const PROMO_TYPE_OPTIONS = [
  { value: 'percentage', label: 'خصم نسبة مئوية', icon: Percent, emoji: '💰' },
  { value: 'fixed', label: 'خصم مبلغ ثابت', icon: DollarSign, emoji: '💵' },
  { value: 'bundle', label: 'عرض باقة', icon: Package, emoji: '📦' },
  { value: 'free_shipping', label: 'شحن مجاني', icon: Truck, emoji: '🚚' },
  { value: 'custom', label: 'عرض مخصص', icon: Sparkles, emoji: '✨' },
];

const SCOPE_OPTIONS = [
  { value: 'all', label: 'كل المنتجات' },
  { value: 'products', label: 'منتجات محددة' },
  { value: 'categories', label: 'فئات محددة' },
];

type PromoFormData = {
  title: string;
  description: string;
  type: 'percentage' | 'fixed' | 'bundle' | 'free_shipping' | 'custom';
  value: number | undefined;
  scope: 'all' | 'products' | 'categories';
  minOrderAmount: number | undefined;
  minQuantity: number | undefined;
  startsAt: string;
  expiresAt: string;
  autoGenerateCode: boolean;
  autoCodeValue: number | undefined;
  autoCodeType: 'percentage' | 'fixed';
};

const defaultFormData: PromoFormData = {
  title: '',
  description: '',
  type: 'percentage',
  value: undefined,
  scope: 'all',
  minOrderAmount: undefined,
  minQuantity: undefined,
  startsAt: '',
  expiresAt: '',
  autoGenerateCode: false,
  autoCodeValue: undefined,
  autoCodeType: 'percentage',
};

export default function PromotionsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<number | null>(null);
  const [formData, setFormData] = useState<PromoFormData>(defaultFormData);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Fetch promotions
  const { data: promotions = [], refetch } = trpc.promotions.list.useQuery();
  const { data: stats } = trpc.promotions.getStats.useQuery();

  // Mutations
  const createMutation = trpc.promotions.create.useMutation({
    onSuccess: () => {
      toast.success('تم إنشاء العرض بنجاح! 🔥');
      setIsCreateOpen(false);
      setFormData(defaultFormData);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.promotions.update.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث العرض ✅');
      setEditingPromo(null);
      setFormData(defaultFormData);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleMutation = trpc.promotions.toggleActive.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث الحالة');
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.promotions.delete.useMutation({
    onSuccess: () => {
      toast.success('تم حذف العرض');
      setDeleteConfirm(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast.error('عنوان العرض مطلوب');
      return;
    }

    const payload = {
      title: formData.title,
      description: formData.description || undefined,
      type: formData.type,
      value: formData.value,
      scope: formData.scope,
      minOrderAmount: formData.minOrderAmount,
      minQuantity: formData.minQuantity,
      startsAt: formData.startsAt || undefined,
      expiresAt: formData.expiresAt || undefined,
      autoGenerateCode: formData.autoGenerateCode,
      autoCodeValue: formData.autoCodeValue,
      autoCodeType: formData.autoCodeType,
    };

    if (editingPromo) {
      updateMutation.mutate({ id: editingPromo, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openEdit = (promo: any) => {
    setFormData({
      title: promo.title,
      description: promo.description || '',
      type: promo.type,
      value: promo.value || undefined,
      scope: promo.scope || 'all',
      minOrderAmount: promo.minOrderAmount || undefined,
      minQuantity: promo.minQuantity || undefined,
      startsAt: promo.startsAt ? promo.startsAt.split('T')[0] : '',
      expiresAt: promo.expiresAt ? promo.expiresAt.split('T')[0] : '',
      autoGenerateCode: false,
      autoCodeValue: undefined,
      autoCodeType: 'percentage',
    });
    setEditingPromo(promo.id);
    setIsCreateOpen(true);
  };

  const getTypeInfo = (type: string) => {
    return PROMO_TYPE_OPTIONS.find(t => t.value === type) || PROMO_TYPE_OPTIONS[4];
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'بدون تاريخ';
    return new Date(dateStr).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const isExpired = (promo: any) => {
    if (!promo.expiresAt) return false;
    return new Date(promo.expiresAt) < new Date();
  };

  const isActive = (promo: any) => {
    return promo.isActive === 1 && !isExpired(promo);
  };

  return (
    <div className="container mx-auto py-8 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Flame className="h-8 w-8 text-orange-500" />
            العروض الترويجية
          </h1>
          <p className="text-muted-foreground mt-1">
            أنشئ عروض ترويجية يقترحها الذكاء الاصطناعي تلقائياً على عملائك عبر واتساب
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) { setEditingPromo(null); setFormData(defaultFormData); }
        }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600">
              <Plus className="h-4 w-4 ml-2" />
              إنشاء عرض جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {editingPromo ? 'تعديل العرض' : '🔥 إنشاء عرض ترويجي جديد'}
              </DialogTitle>
              <DialogDescription>
                العرض سيظهر للذكاء الاصطناعي ليقترحه على العملاء المهتمين تلقائياً
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="promo-title">عنوان العرض *</Label>
                <Input
                  id="promo-title"
                  placeholder="مثال: خصم 30% على العطور الفاخرة"
                  value={formData.title}
                  onChange={(e) => setFormData(d => ({ ...d, title: e.target.value }))}
                  maxLength={100}
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="promo-desc">وصف العرض</Label>
                <Textarea
                  id="promo-desc"
                  placeholder="وصف مختصر يساعد الذكاء الاصطناعي في تقديم العرض بشكل مقنع"
                  value={formData.description}
                  onChange={(e) => setFormData(d => ({ ...d, description: e.target.value }))}
                  maxLength={500}
                  rows={3}
                />
              </div>

              {/* Type & Value */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>نوع العرض</Label>
                  <Select value={formData.type} onValueChange={(v: any) => setFormData(d => ({ ...d, type: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROMO_TYPE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="flex items-center gap-2">
                            <span>{opt.emoji}</span> {opt.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(formData.type === 'percentage' || formData.type === 'fixed') && (
                  <div className="space-y-2">
                    <Label>القيمة {formData.type === 'percentage' ? '(%)' : '(ريال)'}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={formData.type === 'percentage' ? 100 : 99999}
                      value={formData.value || ''}
                      onChange={(e) => setFormData(d => ({ ...d, value: parseInt(e.target.value) || undefined }))}
                      placeholder={formData.type === 'percentage' ? '30' : '50'}
                    />
                  </div>
                )}
              </div>

              {/* Scope */}
              <div className="space-y-2">
                <Label>نطاق التطبيق</Label>
                <Select value={formData.scope} onValueChange={(v: any) => setFormData(d => ({ ...d, scope: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Conditions */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>حد أدنى للطلب (ريال)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={formData.minOrderAmount || ''}
                    onChange={(e) => setFormData(d => ({ ...d, minOrderAmount: parseInt(e.target.value) || undefined }))}
                    placeholder="اختياري"
                  />
                </div>
                <div className="space-y-2">
                  <Label>حد أدنى للكمية</Label>
                  <Input
                    type="number"
                    min={1}
                    value={formData.minQuantity || ''}
                    onChange={(e) => setFormData(d => ({ ...d, minQuantity: parseInt(e.target.value) || undefined }))}
                    placeholder="اختياري"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>تاريخ البداية</Label>
                  <Input
                    type="date"
                    value={formData.startsAt}
                    onChange={(e) => setFormData(d => ({ ...d, startsAt: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>تاريخ الانتهاء</Label>
                  <Input
                    type="date"
                    value={formData.expiresAt}
                    onChange={(e) => setFormData(d => ({ ...d, expiresAt: e.target.value }))}
                  />
                </div>
              </div>

              {/* Auto Discount Code */}
              {!editingPromo && (
                <Card className="border-dashed border-orange-300 bg-orange-50/50">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-orange-500" />
                        <Label className="font-medium">إنشاء كود خصم تلقائي</Label>
                      </div>
                      <Switch
                        checked={formData.autoGenerateCode}
                        onCheckedChange={(v) => setFormData(d => ({ ...d, autoGenerateCode: v }))}
                      />
                    </div>
                    {formData.autoGenerateCode && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">نوع الخصم</Label>
                          <Select value={formData.autoCodeType} onValueChange={(v: any) => setFormData(d => ({ ...d, autoCodeType: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percentage">نسبة %</SelectItem>
                              <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">القيمة</Label>
                          <Input
                            type="number"
                            min={1}
                            value={formData.autoCodeValue || ''}
                            onChange={(e) => setFormData(d => ({ ...d, autoCodeValue: parseInt(e.target.value) || undefined }))}
                            placeholder={formData.autoCodeType === 'percentage' ? '20' : '50'}
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsCreateOpen(false); setEditingPromo(null); setFormData(defaultFormData); }}>
                إلغاء
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-gradient-to-r from-orange-500 to-red-500 text-white"
              >
                {(createMutation.isPending || updateMutation.isPending) ? 'جاري الحفظ...' : editingPromo ? 'تحديث' : 'إنشاء العرض'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">العروض النشطة</CardTitle>
            <Flame className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.active || 0} <span className="text-sm text-muted-foreground font-normal">/ {stats?.maxActive || 5}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي العروض</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">مرات العرض</CardTitle>
            <Eye className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalViews || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">معدل التحويل</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.conversionRate || 0}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Limit Warning */}
      {stats && stats.active >= stats.maxActive && (
        <Card className="border-orange-400 bg-orange-50/50">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-orange-500 flex-shrink-0" />
            <p className="text-sm text-orange-700">
              وصلت للحد الأقصى ({stats.maxActive} عروض نشطة). عطّل عرض قديم لإنشاء عرض جديد.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Promotions List */}
      {promotions.length === 0 ? (
        <Card className="py-16">
          <CardContent className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
              <Flame className="h-8 w-8 text-orange-400" />
            </div>
            <h3 className="text-lg font-semibold">لا توجد عروض ترويجية بعد</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              أنشئ عرضك الأول وسيقوم الذكاء الاصطناعي باقتراحه تلقائياً للعملاء المهتمين عبر واتساب
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {promotions.map((promo: any) => {
            const typeInfo = getTypeInfo(promo.type);
            const expired = isExpired(promo);
            const active = isActive(promo);

            return (
              <Card key={promo.id} className={`relative overflow-hidden transition-all ${
                active ? 'border-orange-300 shadow-md' : expired ? 'opacity-60' : ''
              }`}>
                {/* Status indicator */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${
                  active ? 'bg-gradient-to-r from-orange-400 to-red-400' :
                  expired ? 'bg-gray-300' : 'bg-gray-200'
                }`} />

                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-2xl">{typeInfo.emoji}</span>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{promo.title}</CardTitle>
                        {promo.description && (
                          <CardDescription className="line-clamp-2 mt-1">{promo.description}</CardDescription>
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={promo.isActive === 1}
                      onCheckedChange={() => toggleMutation.mutate({ id: promo.id })}
                      disabled={toggleMutation.isPending}
                    />
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Type & Value */}
                  <div className="flex items-center gap-2">
                    <Badge variant={active ? 'default' : 'secondary'} className={active ? 'bg-orange-500' : ''}>
                      {typeInfo.label}
                      {promo.value ? ` — ${promo.value}${promo.type === 'percentage' ? '%' : ' ريال'}` : ''}
                    </Badge>
                    {expired && <Badge variant="destructive" className="text-xs">منتهي</Badge>}
                  </div>

                  {/* Conditions */}
                  {(promo.minOrderAmount || promo.minQuantity) && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {promo.minOrderAmount && <p>🛒 حد أدنى: {promo.minOrderAmount} ريال</p>}
                      {promo.minQuantity && <p>📦 كمية أدنى: {promo.minQuantity} قطعة</p>}
                    </div>
                  )}

                  {/* Dates */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(promo.startsAt)} — {formatDate(promo.expiresAt)}</span>
                  </div>

                  {/* Analytics */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {promo.viewCount} عرض
                    </span>
                    <span className="flex items-center gap-1">
                      <MousePointerClick className="h-3 w-3" /> {promo.clickCount} نقرة
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline" size="sm"
                      className="flex-1"
                      onClick={() => openEdit(promo)}
                    >
                      <Pencil className="h-3 w-3 ml-1" /> تعديل
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteConfirm(promo.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>حذف العرض</DialogTitle>
            <DialogDescription>هل أنت متأكد؟ هذا الإجراء لا يمكن التراجع عنه.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate({ id: deleteConfirm })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* How AI Uses Promotions */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-700">
            <Sparkles className="h-5 w-5" />
            كيف يستخدم الذكاء الاصطناعي عروضك؟
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-blue-800">
          <div className="flex items-start gap-2">
            <span className="font-bold text-blue-500 mt-0.5">1.</span>
            <p>عند محادثة عميل مهتم بمنتج معين، يقترح الـ AI العرض المناسب بشكل طبيعي</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-blue-500 mt-0.5">2.</span>
            <p>إذا أرفقت صورة بانر، يمكن للـ AI إرسالها مع العرض عبر واتساب</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-blue-500 mt-0.5">3.</span>
            <p>كود الخصم التلقائي يُشارك مع العميل عند اهتمامه لتسهيل التحويل</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-blue-500 mt-0.5">4.</span>
            <p>الحد الأقصى 5 عروض نشطة لضمان جودة الاقتراحات وعدم إرهاق العميل</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
