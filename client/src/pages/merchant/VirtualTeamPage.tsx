import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Users, Plus, Pencil, Trash2, Save, Sparkles,
  MessageCircle, X, Star, Zap, Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

const TONE_OPTIONS = [
  { value: 'friendly', label: 'ودود', color: 'bg-emerald-100 text-emerald-700 border-emerald-300', gradient: 'from-emerald-500 to-teal-600' },
  { value: 'professional', label: 'رسمي', color: 'bg-blue-100 text-blue-700 border-blue-300', gradient: 'from-blue-500 to-indigo-600' },
  { value: 'casual', label: 'عفوي', color: 'bg-orange-100 text-orange-700 border-orange-300', gradient: 'from-orange-500 to-amber-600' },
  { value: 'empathetic', label: 'متعاطف', color: 'bg-purple-100 text-purple-700 border-purple-300', gradient: 'from-purple-500 to-violet-600' },
  { value: 'persuasive', label: 'مقنع', color: 'bg-amber-100 text-amber-700 border-amber-300', gradient: 'from-amber-500 to-yellow-600' },
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
    onSuccess: () => { toast.success('تم إضافة الشخصية بنجاح ✨'); utils.virtualAgents.list.invalidate(); setDialogOpen(false); },
    onError: (e) => toast.error('خطأ: ' + e.message),
  });
  const updateMutation = trpc.virtualAgents.update.useMutation({
    onSuccess: () => { toast.success('تم تحديث الشخصية'); utils.virtualAgents.list.invalidate(); setDialogOpen(false); },
    onError: (e) => toast.error('خطأ: ' + e.message),
  });
  const deleteMutation = trpc.virtualAgents.delete.useMutation({
    onSuccess: () => { toast.success('تم حذف الشخصية'); utils.virtualAgents.list.invalidate(); },
    onError: (e) => toast.error('خطأ: ' + e.message),
  });
  const seedMutation = trpc.virtualAgents.seedTemplates.useMutation({
    onSuccess: (data) => {
      if (data.success) { toast.success(`تم إضافة ${data.count} شخصيات`); utils.virtualAgents.list.invalidate(); }
      else toast.info('لديك شخصيات بالفعل');
    },
    onError: (e) => toast.error('خطأ: ' + e.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AgentFormData>({ ...emptyForm });
  const [kwInput, setKwInput] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
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
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.role || !form.personalityPrompt) {
      toast.error('يرجى ملء الحقول المطلوبة');
      return;
    }
    const payload = {
      name: form.name, role: form.role,
      department: form.department || undefined,
      personalityPrompt: form.personalityPrompt,
      tone: form.tone as any, avatarEmoji: form.avatarEmoji,
      isDefault: form.isDefault,
      triggerKeywords: JSON.stringify(form.triggerKeywords),
    };
    if (editingId) updateMutation.mutate({ id: editingId, ...payload });
    else createMutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="container max-w-5xl py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse space-y-4 w-full max-w-lg">
            <div className="h-8 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="grid grid-cols-3 gap-4">
              <div className="h-48 bg-muted rounded-xl" />
              <div className="h-48 bg-muted rounded-xl" />
              <div className="h-48 bg-muted rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-200 dark:shadow-violet-900/30">
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
              {seedMutation.isPending ? 'جارٍ...' : 'قوالب جاهزة'}
            </Button>
          )}
          <Button onClick={openCreate} className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-200 dark:shadow-violet-900/30">
            <Plus className="h-4 w-4 ml-2" />
            أضف شخصية
          </Button>
        </div>
      </div>

      {/* Agent Cards */}
      {agents && agents.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {agents.map((agent: any) => {
            const toneInfo = TONE_OPTIONS.find(t => t.value === agent.tone) || TONE_OPTIONS[0];
            let keywords: string[] = [];
            try { keywords = agent.triggerKeywords ? JSON.parse(agent.triggerKeywords) : []; } catch {}

            return (
              <Card
                key={agent.id}
                className="group relative overflow-hidden border-0 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                {/* Gradient Header */}
                <div className={`h-20 bg-gradient-to-br ${toneInfo.gradient} relative`}>
                  {agent.isDefault && (
                    <div className="absolute top-2 left-2">
                      <Badge className="bg-white/20 backdrop-blur-sm text-white border-white/30 text-xs gap-1">
                        <Star className="h-3 w-3 fill-current" />
                        افتراضي
                      </Badge>
                    </div>
                  )}
                  {/* Status dot */}
                  <div className="absolute top-2 right-2 flex items-center gap-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${agent.isActive ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50 animate-pulse' : 'bg-white/40'}`} />
                  </div>
                  {/* Action buttons - appear on hover */}
                  <div className="absolute bottom-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(agent)}
                      className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(agent.id)}
                      className="p-1.5 rounded-lg bg-red-500/30 backdrop-blur-sm text-white hover:bg-red-500/50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Avatar overlapping header */}
                <div className="flex justify-center -mt-8 relative z-10">
                  <div className="text-5xl bg-background rounded-2xl p-2 shadow-lg border-2 border-background">
                    {agent.avatarEmoji || '👩‍💼'}
                  </div>
                </div>

                <CardContent className="pt-3 pb-5 text-center space-y-3">
                  {/* Name & Role */}
                  <div>
                    <h3 className="font-bold text-lg">{agent.name}</h3>
                    <p className="text-sm text-muted-foreground">{agent.role}</p>
                  </div>

                  {/* Badges row */}
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    {agent.department && (
                      <Badge variant="outline" className="text-xs font-normal">
                        {agent.department}
                      </Badge>
                    )}
                    <Badge className={`text-xs border ${toneInfo.color}`}>
                      {toneInfo.label}
                    </Badge>
                  </div>

                  {/* Keywords */}
                  {keywords.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1">
                      {keywords.slice(0, 3).map((kw, i) => (
                        <span key={i} className="text-[11px] bg-muted/80 px-2 py-0.5 rounded-full text-muted-foreground">
                          {kw}
                        </span>
                      ))}
                      {keywords.length > 3 && (
                        <span className="text-[11px] text-muted-foreground px-1">+{keywords.length - 3}</span>
                      )}
                    </div>
                  )}

                  {/* Prompt preview */}
                  <p className="text-xs text-muted-foreground line-clamp-2 px-2 leading-relaxed">
                    {agent.personalityPrompt}
                  </p>

                  {/* Status bar */}
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <span className={`text-xs font-medium ${agent.isActive ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                      {agent.isActive ? '● نشط' : '○ متوقف'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Add New Card */}
          <button
            onClick={openCreate}
            className="border-2 border-dashed border-muted-foreground/20 rounded-xl flex flex-col items-center justify-center gap-3 p-8 text-muted-foreground hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-all min-h-[280px] group"
          >
            <div className="p-3 rounded-2xl bg-muted/50 group-hover:bg-violet-100 dark:group-hover:bg-violet-900/30 transition-colors">
              <Plus className="h-7 w-7" />
            </div>
            <span className="text-sm font-medium">أضف شخصية جديدة</span>
          </button>
        </div>
      ) : (
        <Card className="py-16 border-0 shadow-lg bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20">
          <CardContent className="flex flex-col items-center gap-5 text-center">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg">
              <Users className="h-10 w-10" />
            </div>
            <h3 className="text-2xl font-bold">أنشئ فريقك الافتراضي</h3>
            <p className="text-muted-foreground max-w-md">
              أضف شخصيات بأدوار مختلفة — استقبال، مبيعات، دعم فني — كل شخصية ترد بأسلوبها الخاص
            </p>
            <div className="flex gap-3 mt-2">
              <Button onClick={() => seedMutation.mutate()} variant="outline" disabled={seedMutation.isPending} className="gap-2">
                <Sparkles className="h-4 w-4" />
                ابدأ بقوالب جاهزة
              </Button>
              <Button onClick={openCreate} className="bg-gradient-to-r from-violet-600 to-purple-600 gap-2">
                <Plus className="h-4 w-4" />
                أنشئ من الصفر
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Card */}
      {agents && agents.length >= 2 && (
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="p-5 border-b bg-muted/30">
            <h3 className="font-semibold flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-violet-600" />
              معاينة التحويل
            </h3>
            <p className="text-sm text-muted-foreground mt-1">هكذا يبدو التحويل بين شخصيات فريقك</p>
          </div>
          <CardContent className="p-5">
            <div className="bg-[#0b141a] rounded-xl p-4 space-y-3 max-w-sm mx-auto text-sm">
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

      {/* ─── Agent Editor Dialog (Popup) ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              {editingId ? (
                <><Pencil className="h-5 w-5 text-violet-600" /> تعديل الشخصية</>
              ) : (
                <><Sparkles className="h-5 w-5 text-violet-600" /> شخصية جديدة</>
              )}
            </DialogTitle>
            <DialogDescription>
              {editingId ? 'عدّل بيانات الشخصية وأسلوبها' : 'أنشئ شخصية جديدة لفريقك الافتراضي'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Emoji Picker */}
            <div className="space-y-2">
              <Label className="font-semibold text-sm">الإيموجي</Label>
              <div className="flex flex-wrap gap-1.5 p-3 bg-muted/40 rounded-xl">
                {EMOJI_OPTIONS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, avatarEmoji: emoji }))}
                    className={`text-2xl p-2 rounded-xl transition-all ${
                      form.avatarEmoji === emoji
                        ? 'bg-violet-100 dark:bg-violet-900/40 ring-2 ring-violet-500 scale-110 shadow-md'
                        : 'hover:bg-muted hover:scale-105'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Name + Role + Department */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">الاسم <span className="text-red-500">*</span></Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="سارة"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">الدور <span className="text-red-500">*</span></Label>
                <Input
                  value={form.role}
                  onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                  placeholder="موظفة استقبال"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold text-sm">القسم</Label>
                <Input
                  value={form.department}
                  onChange={(e) => setForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="الاستقبال"
                />
              </div>
            </div>

            {/* Tone Selector */}
            <div className="space-y-2">
              <Label className="font-semibold text-sm">الأسلوب</Label>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, tone: t.value }))}
                    className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                      form.tone === t.value
                        ? `${t.color} ring-2 ring-offset-2 shadow-sm`
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
              <Label className="font-semibold text-sm">وصف الشخصية (System Prompt) <span className="text-red-500">*</span></Label>
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
              <Label className="font-semibold text-sm">كلمات التفعيل</Label>
              {form.triggerKeywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.triggerKeywords.map((kw, i) => (
                    <Badge key={i} variant="secondary" className="text-xs flex items-center gap-1 px-2.5 py-1 rounded-lg">
                      {kw}
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, triggerKeywords: f.triggerKeywords.filter((_, idx) => idx !== i) }))}
                        className="hover:text-destructive transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
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
              />
            </div>

            <Separator />

            {/* Default Switch */}
            <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl">
              <div>
                <Label className="font-semibold text-sm">الشخصية الافتراضية</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ترد على العملاء عند عدم تطابق أي كلمة تفعيل
                </p>
              </div>
              <Switch
                checked={form.isDefault}
                onCheckedChange={(v) => setForm(f => ({ ...f, isDefault: v }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 gap-2"
            >
              <Save className="h-4 w-4" />
              {(createMutation.isPending || updateMutation.isPending) ? 'جارٍ الحفظ...' : 'حفظ الشخصية'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              حذف الشخصية
            </DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف هذه الشخصية؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirmId) {
                  deleteMutation.mutate({ id: deleteConfirmId });
                  setDeleteConfirmId(null);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 ml-2" />
              {deleteMutation.isPending ? 'جارٍ الحذف...' : 'نعم، احذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
