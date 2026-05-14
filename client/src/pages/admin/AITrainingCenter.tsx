import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Brain, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  BookOpen, Globe2, Target, MessageCircle, ShieldAlert, Loader2,
} from "lucide-react";

type Category = 'sales' | 'culture' | 'persuasion' | 'examples' | 'limits';

interface Directive {
  id: number;
  category: Category;
  title: string;
  content: string;
  isActive: boolean;
  priority: number;
  createdAt: string;
}

const CATEGORY_CONFIG: Record<Category, { label: string; icon: any; color: string }> = {
  sales: { label: '📚 أساليب البيع', icon: BookOpen, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  culture: { label: '🌍 الذكاء الثقافي', icon: Globe2, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  persuasion: { label: '🎯 استراتيجيات الإقناع', icon: Target, color: 'bg-purple-100 text-purple-700 border-purple-200' },
  examples: { label: '🗣 أمثلة محادثات', icon: MessageCircle, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  limits: { label: '⛔ حدود صارمة', icon: ShieldAlert, color: 'bg-red-100 text-red-700 border-red-200' },
};

export default function AITrainingCenter() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    category: 'sales' as Category,
    title: '',
    content: '',
    priority: 0,
  });

  // Queries
  const { data: directives, refetch } = trpc.aiDirectives.list.useQuery();

  // Mutations
  const createMutation = trpc.aiDirectives.create.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة التوجيه بنجاح ✅");
      refetch();
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.aiDirectives.update.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث التوجيه ✅");
      refetch();
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.aiDirectives.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف التوجيه");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleMutation = trpc.aiDirectives.toggle.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetForm = () => {
    setForm({ category: 'sales', title: '', content: '', priority: 0 });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("يرجى ملء العنوان والمحتوى");
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...form });
    } else {
      createMutation.mutate({ ...form, isActive: true });
    }
  };

  const handleEdit = (d: Directive) => {
    setForm({
      category: d.category,
      title: d.title,
      content: d.content,
      priority: d.priority,
    });
    setEditingId(d.id);
    setShowForm(true);
  };

  // Group directives by category
  const grouped: Record<Category, Directive[]> = {
    sales: [], culture: [], persuasion: [], examples: [], limits: [],
  };
  directives?.forEach((d: any) => {
    if (grouped[d.category as Category]) {
      grouped[d.category as Category].push(d);
    }
  });

  const activeCount = directives?.filter((d: any) => d.isActive).length || 0;
  const totalCount = directives?.length || 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
            <Brain className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">مركز تدريب ساري</h1>
            <p className="text-sm text-muted-foreground">
              أضف قواعد بيع، ذكاء ثقافي، واستراتيجيات إقناع — ساري يطبقها فوراً
            </p>
          </div>
        </div>
        <Button
          onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
          className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
        >
          <Plus className="h-4 w-4 ml-2" />
          {showForm ? 'إلغاء' : 'إضافة توجيه جديد'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-violet-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">إجمالي التوجيهات</p>
            <p className="text-2xl font-bold">{totalCount}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">نشط</p>
            <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-sm text-muted-foreground">معطّل</p>
            <p className="text-2xl font-bold text-amber-600">{totalCount - activeCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <Card className="border-2 border-violet-200 bg-violet-50/30">
          <CardHeader>
            <CardTitle>{editingId ? 'تعديل التوجيه' : 'إضافة توجيه جديد'}</CardTitle>
            <CardDescription>
              اكتب التعليمات بالعربي — ساري سيتبعها في كل محادثاته
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>التصنيف</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v as Category })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>الأولوية (0-100)</Label>
                <Input
                  type="number"
                  min={0} max={100}
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder='مثال: "قاعدة أبو فلان الثقافية"'
              />
            </div>

            <div className="space-y-2">
              <Label>المحتوى (يُحقن مباشرة في GPT)</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder='مثال: "لا تنادي العميل أبو + اسمه! هذا خطأ ثقافي. أبو محمد تعني والد محمد..."'
                rows={5}
                className="resize-y"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex-1"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                )}
                {editingId ? 'تحديث' : 'إضافة'}
              </Button>
              <Button variant="outline" onClick={resetForm}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Directives by Category */}
      {Object.entries(CATEGORY_CONFIG).map(([category, cfg]) => {
        const items = grouped[category as Category];
        if (items.length === 0 && !showForm) return null;

        return (
          <Card key={category}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <cfg.icon className="h-5 w-5" />
                {cfg.label}
                <Badge variant="secondary" className="mr-auto">{items.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-muted-foreground text-center py-4 text-sm">
                  لا توجد توجيهات في هذا التصنيف
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">الحالة</TableHead>
                      <TableHead>العنوان</TableHead>
                      <TableHead className="max-w-md">المحتوى</TableHead>
                      <TableHead className="w-16">الأولوية</TableHead>
                      <TableHead className="w-24">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((d) => (
                      <TableRow key={d.id} className={!d.isActive ? 'opacity-50' : ''}>
                        <TableCell>
                          <button
                            onClick={() => toggleMutation.mutate({ id: d.id, isActive: !d.isActive })}
                            className="text-lg hover:opacity-70 transition"
                            title={d.isActive ? 'تعطيل' : 'تفعيل'}
                          >
                            {d.isActive ? (
                              <ToggleRight className="h-6 w-6 text-emerald-500" />
                            ) : (
                              <ToggleLeft className="h-6 w-6 text-gray-400" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="font-medium">{d.title}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                          {d.content.substring(0, 120)}{d.content.length > 120 ? '...' : ''}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{d.priority}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEdit(d)}
                              title="تعديل"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm('هل تريد حذف هذا التوجيه؟')) {
                                  deleteMutation.mutate({ id: d.id });
                                }
                              }}
                              title="حذف"
                            >
                              <Trash2 className="h-4 w-4" />
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
        );
      })}

      {/* Help Card */}
      <Card className="bg-gradient-to-r from-violet-50 to-purple-50 border-violet-200">
        <CardContent className="pt-6">
          <h3 className="font-bold text-lg mb-3">💡 كيف تستخدم مركز التدريب؟</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-violet-700">📚 أساليب البيع</p>
              <p className="text-muted-foreground">قواعد الإقناع والتفاوض: "ابدأ بالقيمة قبل السعر"</p>
            </div>
            <div>
              <p className="font-medium text-blue-700">🌍 الذكاء الثقافي</p>
              <p className="text-muted-foreground">قواعد اللهجات والمناداة: "لا تنادي العميل أبو + اسمه"</p>
            </div>
            <div>
              <p className="font-medium text-purple-700">🎯 استراتيجيات الإقناع</p>
              <p className="text-muted-foreground">متى تستخدم كل تكتيك: "العميل المتردد → دليل اجتماعي"</p>
            </div>
            <div>
              <p className="font-medium text-amber-700">🗣 أمثلة محادثات</p>
              <p className="text-muted-foreground">محادثات ناجحة حقيقية يتعلم منها ساري</p>
            </div>
            <div className="md:col-span-2">
              <p className="font-medium text-red-700">⛔ حدود صارمة</p>
              <p className="text-muted-foreground">ممنوعات: "لا تخفّض السعر بدون كود خصم"، "لا تعد بتوصيل أقل من يومين"</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
