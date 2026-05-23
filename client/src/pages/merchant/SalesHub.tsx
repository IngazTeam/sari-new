import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useState } from 'react';
import {
  Receipt, Target, TrendingUp, Plus, Copy, CheckCircle2, XCircle,
  Clock, Send, Eye, DollarSign, BarChart3, FileText, Trash2,
} from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; icon: string; color: string }> = {
  sent: { label: 'مُرسل', icon: '📤', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  viewed: { label: 'تم الاطلاع', icon: '👁️', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  accepted: { label: 'مقبول', icon: '✅', color: 'bg-green-100 text-green-800 border-green-200' },
  rejected: { label: 'مرفوض', icon: '❌', color: 'bg-red-100 text-red-800 border-red-200' },
  expired: { label: 'منتهي', icon: '⏰', color: 'bg-gray-100 text-gray-800 border-gray-200' },
};

export default function SalesHub() {
  const utils = trpc.useUtils();
  const { data: quotations, isLoading } = trpc.sariBrain.getQuotations.useQuery({ limit: 50 });
  const { data: stats } = trpc.sariBrain.getQuotationStats.useQuery();
  const { data: currentTarget } = trpc.sariBrain.getCurrentTarget.useQuery();

  // New quotation state
  const [createOpen, setCreateOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [items, setItems] = useState([{ name: '', description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  const [validDays, setValidDays] = useState(7);

  // Target state
  const [targetOpen, setTargetOpen] = useState(false);
  const [targetAmount, setTargetAmount] = useState('');

  const createMut = trpc.sariBrain.createQuotation.useMutation({
    onSuccess: (data: any) => {
      toast.success(`تم إنشاء عرض سعر #${data.quotationNumber}`);
      setCreateOpen(false);
      resetForm();
      utils.sariBrain.getQuotations.invalidate();
      utils.sariBrain.getQuotationStats.invalidate();
    },
    onError: (e) => toast.error('فشل: ' + e.message),
  });

  const statusMut = trpc.sariBrain.updateQuotationStatus.useMutation({
    onSuccess: () => {
      toast.success('تم تحديث الحالة');
      utils.sariBrain.getQuotations.invalidate();
      utils.sariBrain.getQuotationStats.invalidate();
      utils.sariBrain.getCurrentTarget.invalidate();
    },
    onError: (e) => toast.error('فشل: ' + e.message),
  });

  const targetMut = trpc.sariBrain.setMonthlyTarget.useMutation({
    onSuccess: () => {
      toast.success('تم تحديد الهدف الشهري');
      setTargetOpen(false);
      utils.sariBrain.getCurrentTarget.invalidate();
    },
    onError: (e) => toast.error('فشل: ' + e.message),
  });

  const resetForm = () => {
    setCustomerName('');
    setCustomerPhone('');
    setItems([{ name: '', description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    if (field === 'quantity' || field === 'unitPrice') {
      newItems[index].total = newItems[index].quantity * newItems[index].unitPrice;
    }
    setItems(newItems);
  };

  const addItem = () => setItems([...items, { name: '', description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const tax = Math.round(subtotal * 0.15 * 100) / 100;
  const grandTotal = subtotal + tax;

  const handleCreate = () => {
    const validItems = items.filter(i => i.name.trim() && i.total > 0);
    if (validItems.length === 0) return toast.error('أضف عنصر واحد على الأقل');
    createMut.mutate({
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      items: validItems,
      validDays,
    });
  };

  const copyWhatsApp = async (quotationId: number) => {
    try {
      const result = await utils.sariBrain.formatQuotationForWhatsApp.fetch({ quotationId });
      await navigator.clipboard.writeText(result.message);
      toast.success('تم نسخ عرض السعر — الصقه في واتساب');
    } catch {
      toast.error('فشل النسخ');
    }
  };

  // Target progress
  const targetProgress = currentTarget ? Math.min(100, Math.round((Number(currentTarget.achievedAmount) / Number(currentTarget.targetAmount)) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Receipt className="h-8 w-8 text-primary" />
            مركز المبيعات
          </h1>
          <p className="text-muted-foreground mt-2">
            إنشاء وتتبع عروض الأسعار وأهداف المبيعات
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={targetOpen} onOpenChange={setTargetOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Target className="h-4 w-4 ml-2" />
                تحديد هدف شهري
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-right">🎯 هدف المبيعات الشهري</DialogTitle>
                <DialogDescription className="text-right">حدد هدف المبيعات لهذا الشهر بالريال</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <Label>المبلغ المستهدف (ر.س)</Label>
                <Input type="number" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} placeholder="50000" dir="ltr" />
              </div>
              <DialogFooter>
                <Button onClick={() => targetMut.mutate({ targetAmount: Number(targetAmount) })} disabled={!targetAmount || Number(targetAmount) <= 0}>
                  💾 حفظ
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 ml-2" />
                إنشاء عرض سعر
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-right">📋 إنشاء عرض سعر جديد</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>اسم العميل</Label>
                    <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="أحمد محمد" dir="auto" />
                  </div>
                  <div className="space-y-1">
                    <Label>رقم الجوال</Label>
                    <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="966500000000" dir="ltr" />
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">العناصر</Label>
                    <Button variant="outline" size="sm" onClick={addItem}>
                      <Plus className="h-3 w-3 ml-1" /> إضافة عنصر
                    </Button>
                  </div>
                  {items.map((item, i) => (
                    <div key={i} className="p-3 rounded-lg border space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">{i + 1}.</span>
                        <Input value={item.name} onChange={(e) => updateItem(i, 'name', e.target.value)} placeholder="اسم المنتج/الخدمة" dir="auto" className="flex-1" />
                        {items.length > 1 && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400" onClick={() => removeItem(i)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <Input value={item.description} onChange={(e) => updateItem(i, 'description', e.target.value)} placeholder="وصف (اختياري)" dir="auto" className="text-xs" />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[10px]">الكمية</Label>
                          <Input type="number" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))} min={1} dir="ltr" />
                        </div>
                        <div>
                          <Label className="text-[10px]">سعر الوحدة</Label>
                          <Input type="number" value={item.unitPrice} onChange={(e) => updateItem(i, 'unitPrice', Number(e.target.value))} min={0} dir="ltr" />
                        </div>
                        <div>
                          <Label className="text-[10px]">الإجمالي</Label>
                          <Input value={item.total.toFixed(2)} readOnly dir="ltr" className="bg-muted" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>المجموع</span>
                    <span>{subtotal.toFixed(2)} ر.س</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>ضريبة (15%)</span>
                    <span>{tax.toFixed(2)} ر.س</span>
                  </div>
                  <div className="flex justify-between text-base font-bold border-t pt-1">
                    <span>الإجمالي</span>
                    <span className="text-primary">{grandTotal.toFixed(2)} ر.س</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>صلاحية العرض (أيام)</Label>
                  <Input type="number" value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} min={1} max={365} dir="ltr" />
                </div>
              </div>
              <DialogFooter className="flex-row-reverse gap-2">
                <Button onClick={handleCreate} disabled={createMut.isPending}>
                  {createMut.isPending ? 'جاري الإنشاء...' : '📋 إنشاء العرض'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-primary">{stats?.total || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">📋 إجمالي العروض</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-green-600">{stats?.accepted || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">✅ مقبول</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{(stats?.totalRevenue || 0).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">💰 إيرادات (ر.س)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className={`text-3xl font-bold ${(stats?.conversionRate || 0) >= 30 ? 'text-green-600' : 'text-orange-600'}`}>{stats?.conversionRate || 0}%</p>
            <p className="text-xs text-muted-foreground mt-1">📊 نسبة التحويل</p>
          </CardContent>
        </Card>
      </div>

      {/* Sales Target Progress */}
      {currentTarget && (
        <Card className="border-primary/20 overflow-hidden">
          <CardHeader className="bg-gradient-to-l from-primary/10 to-transparent pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" />
              🎯 هدف المبيعات الشهري
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                {Number(currentTarget.achievedAmount).toLocaleString()} / {Number(currentTarget.targetAmount).toLocaleString()} ر.س
              </span>
              <span className={`text-sm font-bold ${targetProgress >= 100 ? 'text-green-600' : targetProgress >= 50 ? 'text-blue-600' : 'text-orange-600'}`}>
                {targetProgress}%
              </span>
            </div>
            <div className="h-4 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${targetProgress >= 100 ? 'bg-green-500' : targetProgress >= 50 ? 'bg-blue-500' : 'bg-orange-500'}`}
                style={{ width: `${Math.min(100, targetProgress)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-2 rounded bg-muted/50">
                <p className="text-lg font-bold">{currentTarget.quotationsSent}</p>
                <p className="text-[10px] text-muted-foreground">عروض مرسلة</p>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <p className="text-lg font-bold">{currentTarget.quotationsWon}</p>
                <p className="text-[10px] text-muted-foreground">عروض ناجحة</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quotations List */}
      <Card>
        <CardHeader>
          <CardTitle>📋 عروض الأسعار</CardTitle>
          <CardDescription>جميع عروض الأسعار المنشأة</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : quotations && quotations.length > 0 ? (
            <div className="space-y-3">
              {quotations.map((q: any) => {
                const statusInfo = STATUS_MAP[q.status] || STATUS_MAP.sent;
                return (
                  <div key={q.id} className="flex items-center gap-4 p-4 rounded-lg border hover:bg-accent/50 transition-colors">
                    <div className="text-2xl">{statusInfo.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{q.quotationNumber}</p>
                        <Badge className={`text-[10px] ${statusInfo.color}`}>{statusInfo.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {q.customerName || 'بدون اسم'} {q.customerPhone ? `• ${q.customerPhone}` : ''}
                        {' • '}{new Date(q.createdAt).toLocaleDateString('ar-SA')}
                      </p>
                      <p className="text-xs text-muted-foreground">{q.items?.length || 0} عنصر</p>
                    </div>
                    <div className="text-left">
                      <p className="text-lg font-bold text-primary">{Number(q.total).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">{q.currency}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="نسخ للواتساب" onClick={() => copyWhatsApp(q.id)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      {q.status === 'sent' && (
                        <>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600" title="قبول" onClick={() => statusMut.mutate({ quotationId: q.id, status: 'accepted' })}>
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600" title="رفض" onClick={() => statusMut.mutate({ quotationId: q.id, status: 'rejected' })}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Receipt className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-lg font-medium">لا توجد عروض أسعار</p>
              <p className="text-sm text-muted-foreground mt-1">أنشئ أول عرض سعر لعملائك</p>
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 ml-2" />
                إنشاء عرض سعر
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
