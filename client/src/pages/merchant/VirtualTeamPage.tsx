import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import {
  Users, Plus, Pencil, Trash2, Save, Sparkles, GripVertical,
  MessageCircle, X
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

const TONE_OPTIONS = [
  { value: 'friendly', label: 'ودود', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { value: 'professional', label: 'رسمي', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'casual', label: 'عفوي', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'empathetic', label: 'متعاطف', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'persuasive', label: 'مقنع', color: 'bg-amber-100 text-amber-700 border-amber-300' },
];

const EMOJI_OPTIONS = ['👩‍💼', '👨‍💼', '👩‍💻', '👨‍💻', '👩‍⚕️', '👨‍⚕️', '👩‍🍳', '👨‍🍳', '🧑‍💼', '🤵', '👸', '🦸‍♀️'];

type AgentFormData = {
  name: string;
  role: string;
  department: string;
  personalityPrompt: string;
  tone: string;
  avatarEmoji: string;
  isDefault: boolean;
  triggerKeywords: string[];
};

const emptyForm: AgentFormData = {
  name: '', role: '', department: '', personalityPrompt: '',
  tone: 'friendly', avatarEmoji: '👩‍💼', isDefault: false, triggerKeywords: [],
};

export default function VirtualTeamPage() {
  const utils = trpc.useUtils();
  const { data: agents, isLoading } = trpc.virtualAgents.list.useQuery();

  const createMutation = trpc.virtualAgents.create.useMutation({
    onSuccess: () => { toast.success('تم إضافة الشخصية'); utils.virtualAgents.list.invalidate(); setSheetOpen(false); },
    onError: (e) => toast.error('خطأ: ' + e.message),
  });
  const updateMutation = trpc.virtualAgents.update.useMutation({
    onSuccess: () => { toast.success('تم التحديث'); utils.virtualAgents.list.invalidate(); setSheetOpen(false); },
    onError: (e) => toast.error('خطأ: ' + e.message),
  });
  const deleteMutation = trpc.virtualAgents.delete.useMutation({
    onSuccess: () => { toast.success('تم الحذف'); utils.virtualAgents.list.invalidate(); },
    onError: (e) => toast.error('خطأ: ' + e.message),
  });
  const seedMutation = trpc.virtualAgents.seedTemplates.useMutation({
    onSuccess: (data) => {
      if (data.success) { toast.success(`تم إضافة ${data.count} شخصيات`); utils.virtualAgents.list.invalidate(); }
      else toast.info('لديك شخصيات بالفعل');
    },
    onError: (e) => toast.error('خطأ: ' + e.message),
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AgentFormData>({ ...emptyForm });
  const [kwInput, setKwInput] = useState('');

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setSheetOpen(true);
  };

  const openEdit = (agent: any) => {
    setEditingId(agent.id);
    let keywords: string[] = [];
    try { keywords = agent.triggerKeywords ? JSON.parse(agent.triggerKeywords) : []; } catch { keywords = []; }
    setForm({
      name: agent.name,
      role: agent.role,
      department: agent.department || '',
      personalityPrompt: agent.personalityPrompt,
      tone: agent.tone,
      avatarEmoji: agent.avatarEmoji || '👩‍💼',
      isDefault: agent.isDefault === 1,
      triggerKeywords: keywords,
    });
    setSheetOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.role || !form.personalityPrompt) {
      toast.error('يرجى ملء الحقول المطلوبة');
      return;
    }

    const payload = {
      name: form.name,
      role: form.role,
      department: form.department || undefined,
      personalityPrompt: form.personalityPrompt,
      tone: form.tone as any,
      avatarEmoji: form.avatarEmoji,
      isDefault: form.isDefault,
      triggerKeywords: JSON.stringify(form.triggerKeywords),
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse space-y-4 w-full max-w-lg">
            <div className="h-8 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="grid grid-cols-3 gap-4">
              <div className="h-32 bg-muted rounded" />
              <div className="h-32 bg-muted rounded" />
              <div className="h-32 bg-muted rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white">
              <Users className="h-6 w-6" />
            </div>
            فريق العمل الافتراضي
          </h1>
          <p className="text-muted-foreground">
            فريقك الذكي يعمل 24/7 بأسلوب يناسب كل عميل — كل شخصية لها دور ونبرة وكلمات تفعيل
          </p>
        </div>
        <div className="flex gap-2">
          {(!agents || agents.length === 0) && (
            <Button variant="outline" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              <Sparkles className="h-4 w-4 ml-2" />
              {seedMutation.isPending ? 'جارٍ...' : 'استخدم قوالب جاهزة'}
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 ml-2" />
            أضف شخصية
          </Button>
        </div>
      </div>

      {/* Agent Cards Grid */}
      {agents && agents.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent: any) => {
            const toneInfo = TONE_OPTIONS.find(t => t.value === agent.tone) || TONE_OPTIONS[0];
            let keywords: string[] = [];
            try { keywords = agent.triggerKeywords ? JSON.parse(agent.triggerKeywords) : []; } catch {}

            return (
              <Card
                key={agent.id}
                className={`relative overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 ${
                  agent.isDefault ? 'ring-2 ring-primary' : ''
                }`}
              >
                {agent.isDefault && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-purple-600" />
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-4xl">{agent.avatarEmoji || '👩‍💼'}</div>
                      <div>
                        <CardTitle className="text-lg">{agent.name}</CardTitle>
                        <CardDescription>{agent.role}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(agent)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm('هل أنت متأكد من حذف هذه الشخصية؟')) {
                            deleteMutation.mutate({ id: agent.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {agent.department && (
                    <Badge variant="outline" className="text-xs">
                      {agent.department}
                    </Badge>
                  )}
                  <Badge className={`text-xs border ${toneInfo.color}`}>
                    {toneInfo.label}
                  </Badge>
                  {agent.isDefault ? (
                    <Badge className="text-xs bg-primary text-primary-foreground mr-1">
                      ⭐ افتراضي
                    </Badge>
                  ) : null}

                  {keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {keywords.slice(0, 4).map((kw, i) => (
                        <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full">
                          {kw}
                        </span>
                      ))}
                      {keywords.length > 4 && (
                        <span className="text-xs text-muted-foreground">+{keywords.length - 4}</span>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground line-clamp-2 mt-2">
                    {agent.personalityPrompt}
                  </p>

                  <div className="flex items-center gap-2 pt-2">
                    <div className={`h-2 w-2 rounded-full ${agent.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                    <span className="text-xs text-muted-foreground">
                      {agent.isActive ? 'نشط' : 'متوقف'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Add New Card */}
          <button
            onClick={openCreate}
            className="border-2 border-dashed border-muted-foreground/20 rounded-xl flex flex-col items-center justify-center gap-2 p-6 text-muted-foreground hover:border-primary/50 hover:text-primary transition-all min-h-[200px]"
          >
            <Plus className="h-8 w-8" />
            <span className="text-sm font-medium">أضف شخصية جديدة</span>
          </button>
        </div>
      ) : (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <div className="p-4 rounded-full bg-violet-100 dark:bg-violet-900/30">
              <Users className="h-10 w-10 text-violet-600" />
            </div>
            <h3 className="text-xl font-semibold">أنشئ فريقك الافتراضي</h3>
            <p className="text-muted-foreground max-w-md">
              أضف شخصيات بأدوار مختلفة — استقبال، مبيعات، دعم فني — كل شخصية ترد بأسلوبها الخاص
            </p>
            <div className="flex gap-3">
              <Button onClick={() => seedMutation.mutate()} variant="outline" disabled={seedMutation.isPending}>
                <Sparkles className="h-4 w-4 ml-2" />
                ابدأ بقوالب جاهزة
              </Button>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 ml-2" />
                أنشئ من الصفر
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Card */}
      {agents && agents.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              معاينة التحويل
            </CardTitle>
            <CardDescription>هكذا يبدو التحويل بين شخصيات فريقك</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-[#0b141a] rounded-xl p-4 space-y-3 max-w-sm mx-auto text-sm">
              {/* Simulated WhatsApp chat */}
              <div className="flex justify-start">
                <div className="bg-[#202c33] text-white px-3 py-2 rounded-xl rounded-tl-sm max-w-[80%]">
                  أبي أرجع المنتج اللي طلبته
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-[#005c4b] text-white px-3 py-2 rounded-xl rounded-tr-sm max-w-[80%]">
                  <div className="text-xs text-emerald-300 mb-1">{agents[0]?.avatarEmoji} {agents[0]?.name}</div>
                  لحظة أحولك لزميل{agents.length > 1 && agents[1].avatarEmoji?.includes('👩') ? 'تي' : 'ي'} {agents.length > 1 ? agents[1].name : ''} من {agents.length > 1 ? agents[1].department || 'الدعم' : 'الدعم'}
                </div>
              </div>
              {agents.length > 1 && (
                <div className="flex justify-end">
                  <div className="bg-[#005c4b] text-white px-3 py-2 rounded-xl rounded-tr-sm max-w-[80%]">
                    <div className="text-xs text-emerald-300 mb-1">{agents[1].avatarEmoji} {agents[1].name}</div>
                    أهلاً! أنا {agents[1].name}. أقدر أساعدك في موضوع الإرجاع 😊
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent Editor Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingId ? 'تعديل الشخصية' : 'شخصية جديدة'}</SheetTitle>
            <SheetDescription>
              {editingId ? 'عدّل بيانات الشخصية' : 'أنشئ شخصية جديدة لفريقك الافتراضي'}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-6">
            {/* Emoji Picker */}
            <div className="space-y-2">
              <Label className="font-semibold">الإيموجي</Label>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, avatarEmoji: emoji }))}
                    className={`text-2xl p-1.5 rounded-lg transition-all ${
                      form.avatarEmoji === emoji
                        ? 'bg-primary/10 ring-2 ring-primary scale-110'
                        : 'hover:bg-muted'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Name + Role */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-semibold">الاسم *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="سارة"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">الدور *</Label>
                <Input
                  value={form.role}
                  onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                  placeholder="موظفة استقبال"
                />
              </div>
            </div>

            {/* Department */}
            <div className="space-y-2">
              <Label className="font-semibold">القسم</Label>
              <Input
                value={form.department}
                onChange={(e) => setForm(f => ({ ...f, department: e.target.value }))}
                placeholder="الاستقبال"
              />
            </div>

            {/* Tone Selector */}
            <div className="space-y-2">
              <Label className="font-semibold">الأسلوب</Label>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, tone: t.value }))}
                    className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-all ${
                      form.tone === t.value
                        ? `${t.color} ring-2 ring-offset-1`
                        : 'border-muted text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Personality Prompt */}
            <div className="space-y-2">
              <Label className="font-semibold">وصف الشخصية (System Prompt) *</Label>
              <Textarea
                value={form.personalityPrompt}
                onChange={(e) => setForm(f => ({ ...f, personalityPrompt: e.target.value }))}
                placeholder="أنتِ سارة، موظفة استقبال ودودة ومرحبة..."
                rows={4}
                className="resize-none"
              />
              <div className="text-xs text-muted-foreground text-left">
                {form.personalityPrompt.length} حرف
              </div>
            </div>

            {/* Trigger Keywords */}
            <div className="space-y-2">
              <Label className="font-semibold">كلمات التفعيل</Label>
              <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                {form.triggerKeywords.map((kw, i) => (
                  <Badge key={i} variant="secondary" className="text-xs flex items-center gap-1 px-2 py-1">
                    {kw}
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, triggerKeywords: f.triggerKeywords.filter((_, idx) => idx !== i) }))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={kwInput}
                  onChange={(e) => setKwInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && kwInput.trim()) {
                      e.preventDefault();
                      setForm(f => ({ ...f, triggerKeywords: [...f.triggerKeywords, kwInput.trim()] }));
                      setKwInput('');
                    }
                  }}
                  placeholder="اكتب كلمة ثم Enter"
                  className="flex-1"
                />
              </div>
            </div>

            <Separator />

            {/* Default Switch */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-semibold">الشخصية الافتراضية</Label>
                <p className="text-xs text-muted-foreground">
                  ترد على العملاء عند عدم تطابق أي كلمة تفعيل
                </p>
              </div>
              <Switch
                checked={form.isDefault}
                onCheckedChange={(v) => setForm(f => ({ ...f, isDefault: v }))}
              />
            </div>
          </div>

          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              <Save className="h-4 w-4 ml-2" />
              {(createMutation.isPending || updateMutation.isPending) ? 'جارٍ...' : 'حفظ'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
