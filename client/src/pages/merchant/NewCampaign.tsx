import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { ArrowRight, Check, MessageSquare, Users } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { QueryStateCard } from '@/components/QueryStateCard';
import { merchantDateTimeInput } from '@/lib/merchant-date';

type Audience = {
  lastActivityDays?: number;
  purchaseCountMin?: number;
  purchaseCountMax?: number;
};
const steps = ['الجمهور', 'الرسالة', 'المراجعة والحفظ'];

export default function NewCampaign() {
  const [, navigate] = useLocation();
  const [editing, params] = useRoute('/merchant/campaigns/:id/edit');
  const campaignId = Number(params?.id);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    message: '',
    imageUrl: '',
    scheduledAt: '',
  });
  const [filters, setFilters] = useState<Audience>({});
  const [validation, setValidation] = useState('');
  const loadedId = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const existing = trpc.campaigns.getById.useQuery(
    { id: campaignId },
    { enabled: editing && Number.isInteger(campaignId) && campaignId > 0 }
  );
  const audience = trpc.campaigns.filterCustomers.useQuery(filters);
  const utils = trpc.useUtils();
  const created = trpc.campaigns.create.useMutation();
  const updated = trpc.campaigns.update.useMutation();
  const pending = created.isPending || updated.isPending;

  useEffect(() => {
    if (!existing.data || loadedId.current === existing.data.id) return;
    const data = existing.data;
    loadedId.current = data.id;
    setForm({
      name: data.name,
      message: data.message,
      imageUrl: data.imageUrl || '',
      scheduledAt: merchantDateTimeInput(data.scheduledAt),
    });
    try {
      setFilters(data.targetAudience ? JSON.parse(data.targetAudience) : {});
    } catch {
      setValidation(
        'تعذر قراءة جمهور الحملة المحفوظ. راجع خيارات الجمهور قبل الحفظ.'
      );
    }
  }, [existing.data]);
  const goToStep = (next: number) => {
    setStep(next);
    setValidation('');
  };
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  const validateStep = () => {
    if (!form.name.trim())
      return 'اكتب اسمًا للحملة ليسهل العثور عليها لاحقًا.';
    if (step > 0 && !form.message.trim())
      return 'اكتب الرسالة التي تريد أن تصل إلى عملائك.';
    if (step > 0 && form.imageUrl) {
      try {
        const url = new URL(form.imageUrl);
        if (url.protocol !== 'https:' || url.username || url.password)
          return 'استخدم رابط صورة HTTPS دون بيانات دخول.';
      } catch {
        return 'راجع رابط الصورة أو اتركه فارغًا.';
      }
    }
    if (
      step > 0 &&
      form.scheduledAt &&
      (!Number.isFinite(new Date(form.scheduledAt).getTime()) ||
        new Date(form.scheduledAt).getTime() <= Date.now())
    )
      return 'اختر موعدًا في المستقبل، أو أزل الموعد للحفظ كمسودة.';
    return '';
  };
  const save = async () => {
    const error = validateStep();
    if (error) {
      setValidation(error);
      return;
    }
    try {
      const common = {
        name: form.name.trim(),
        message: form.message.trim(),
        targetAudience: JSON.stringify(filters),
      };
      if (editing)
        await updated.mutateAsync({
          ...common,
          id: campaignId,
          imageUrl: form.imageUrl || null,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt) : null,
        });
      else
        await created.mutateAsync({
          ...common,
          imageUrl: form.imageUrl || undefined,
          scheduledAt: form.scheduledAt
            ? new Date(form.scheduledAt)
            : undefined,
        });
      await Promise.all([
        utils.campaigns.list.invalidate(),
        utils.campaigns.getStats.invalidate(),
        ...(editing
          ? [utils.campaigns.getById.invalidate({ id: campaignId })]
          : []),
      ]);
      toast.success(
        form.scheduledAt ? 'تم حفظ الحملة المجدولة' : 'تم حفظ مسودة الحملة'
      );
      navigate('/merchant/campaigns');
    } catch (error) {
      setValidation(
        error instanceof Error
          ? error.message
          : 'تعذر حفظ الحملة. حاول مرة أخرى.'
      );
    }
  };

  if (
    editing &&
    (!Number.isInteger(campaignId) || campaignId <= 0 || existing.error)
  )
    return (
      <QueryStateCard
        kind="error"
        title="تعذر فتح الحملة"
        description="تحقق من رابط الحملة وصلاحية الوصول إليها."
        onRetry={() => void existing.refetch()}
      />
    );
  if (editing && !existing.data) return <p role="status">جارٍ تحميل الحملة…</p>;
  if (
    editing &&
    existing.data &&
    !['draft', 'scheduled'].includes(existing.data.status)
  )
    return (
      <section className="mw-panel">
        <h1>الحملة غير قابلة للتعديل</h1>
        <p>بدأ إرسال هذه الحملة أو اكتمل إرسالها.</p>
        <Link href={`/merchant/campaigns/${campaignId}`}>
          العودة إلى تفاصيل الحملة
        </Link>
      </section>
    );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="mw-page-heading">
        <div>
          <Link
            href="/merchant/campaigns"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-3"
          >
            <ArrowRight size={16} />
            الحملات
          </Link>
          <h1>{editing ? 'تعديل الحملة' : 'حملة جديدة، خطوة بخطوة'}</h1>
          <p>اختر جمهورك، اكتب رسالتك، وراجعها قبل الحفظ.</p>
        </div>
      </header>
      <ol className="mw-campaign-steps" aria-label="خطوات إعداد الحملة">
        {steps.map((title, index) => (
          <li
            key={title}
            className="mw-campaign-step"
            aria-current={step === index ? 'step' : undefined}
          >
            <span>{index < step ? <Check size={15} /> : index + 1}</span>
            {title}
          </li>
        ))}
      </ol>
      <form
        onSubmit={event => {
          event.preventDefault();
          const error = validateStep();
          if (error) setValidation(error);
          else if (step < 2) goToStep(step + 1);
          else void save();
        }}
        className="space-y-5"
      >
        <section
          className="mw-panel space-y-5"
          aria-labelledby="campaign-step-title"
        >
          <h2
            id="campaign-step-title"
            ref={heading}
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            {steps[step]}
          </h2>
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="campaign-name">اسم الحملة</Label>
                <Input
                  id="campaign-name"
                  maxLength={255}
                  required
                  value={form.name}
                  onChange={event =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="مثال: عروض نهاية الأسبوع"
                />
                <p className="text-xs text-muted-foreground">
                  اسم داخلي يظهر لك في قائمة الحملات.
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="campaign-activity">آخر تفاعل</Label>
                  <select
                    id="campaign-activity"
                    className="mw-form-select"
                    value={filters.lastActivityDays ?? ''}
                    onChange={event =>
                      setFilters({
                        ...filters,
                        lastActivityDays: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      })
                    }
                  >
                    <option value="">كل الأوقات</option>
                    <option value="7">آخر 7 أيام</option>
                    <option value="30">آخر 30 يومًا</option>
                    <option value="90">آخر 90 يومًا</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campaign-purchases">عدد المشتريات</Label>
                  <select
                    id="campaign-purchases"
                    className="mw-form-select"
                    value={
                      filters.purchaseCountMin === 0 &&
                      filters.purchaseCountMax === 0
                        ? '0'
                        : filters.purchaseCountMax === 5
                          ? '1-5'
                          : filters.purchaseCountMin === 6
                            ? '6+'
                            : filters.purchaseCountMin === 5
                              ? '5+'
                              : 'all'
                    }
                    onChange={event => {
                      const value = event.target.value;
                      setFilters({
                        ...filters,
                        purchaseCountMin:
                          value === '0'
                            ? 0
                            : value === '1-5'
                              ? 1
                              : value === '6+'
                                ? 6
                                : value === '5+'
                                  ? 5
                                  : undefined,
                        purchaseCountMax:
                          value === '0' ? 0 : value === '1-5' ? 5 : undefined,
                      });
                    }}
                  >
                    <option value="all">كل العملاء</option>
                    <option value="0">لم يشترِ بعد</option>
                    <option value="1-5">من 1 إلى 5 مشتريات</option>
                    {filters.purchaseCountMin === 5 && (
                      <option value="5+">5 مشتريات فأكثر (المحفوظ)</option>
                    )}
                    <option value="6+">6 مشتريات فأكثر</option>
                  </select>
                </div>
              </div>
              <div className="rounded-lg border p-4 flex items-start gap-3">
                <Users className="h-5 w-5 shrink-0 text-primary" />
                <div>
                  <strong>
                    {audience.error
                      ? 'تعذر تقدير الجمهور'
                      : audience.isLoading
                        ? 'جارٍ حساب الجمهور…'
                        : `${audience.data?.count ?? 0} محادثة تطابق الاختيارات`}
                  </strong>
                  <p className="text-xs text-muted-foreground mt-2">
                    العدد أولي؛ يُستبعد عند الإرسال من لم يوافق على الحملات
                    والأرقام المكررة والمحظورة.
                  </p>
                  {audience.error && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-2"
                      onClick={() => void audience.refetch()}
                    >
                      إعادة المحاولة
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="campaign-message">نص الرسالة</Label>
                <Textarea
                  id="campaign-message"
                  value={form.message}
                  onChange={event =>
                    setForm({ ...form, message: event.target.value })
                  }
                  maxLength={3800}
                  rows={7}
                  required
                  placeholder="اكتب رسالة واضحة ومختصرة لعملائك…"
                />
                <p className="text-xs text-muted-foreground">
                  {form.message.length} / 3800 حرف
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-image">
                  رابط الصورة{' '}
                  <span className="text-muted-foreground">(اختياري)</span>
                </Label>
                <Input
                  id="campaign-image"
                  type="url"
                  maxLength={500}
                  dir="ltr"
                  placeholder="https://…"
                  value={form.imageUrl}
                  onChange={event =>
                    setForm({ ...form, imageUrl: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-time">
                  موعد الإرسال{' '}
                  <span className="text-muted-foreground">(اختياري)</span>
                </Label>
                <Input
                  id="campaign-time"
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={event =>
                    setForm({ ...form, scheduledAt: event.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  التوقيت المحلي لجهازك (
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}). بدون موعد
                  تُحفظ مسودة لتُرسلها لاحقًا.
                </p>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h3 className="font-semibold">{form.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    الجمهور الأولي:{' '}
                    {audience.error
                      ? 'غير متاح'
                      : (audience.data?.count ?? '…')}{' '}
                    محادثة
                  </p>
                  <p className="text-sm">
                    {form.scheduledAt
                      ? `ستُجدول للإرسال في ${new Date(form.scheduledAt).toLocaleString('ar-SA')}`
                      : 'ستُحفظ كمسودة. لا تُرسل رسائل عند الحفظ.'}
                  </p>
                  {form.imageUrl && (
                    <p className="text-sm break-all" dir="ltr">
                      {form.imageUrl}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToStep(0)}
                    disabled={pending}
                  >
                    تعديل الجمهور
                  </Button>
                </div>
                <div>
                  <p className="text-sm mb-3 flex items-center gap-2">
                    <MessageSquare size={16} />
                    معاينة نص الرسالة
                  </p>
                  <div className="mw-message-preview" dir="auto">
                    {form.message}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => goToStep(1)}
                    disabled={pending}
                  >
                    تعديل الرسالة والموعد
                  </Button>
                </div>
              </div>
              {form.scheduledAt && (
                <p className="rounded-lg border p-4 text-sm">
                  حفظ الجدولة يتيح إرسال الحملة تلقائيًا في الموعد المحدد، وفق
                  اتصال واتساب والاشتراك وموافقات العملاء.
                </p>
              )}
            </>
          )}
        </section>
        {validation && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {validation}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              step ? goToStep(step - 1) : navigate('/merchant/campaigns')
            }
          >
            {step ? 'السابق' : 'إلغاء'}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? 'جارٍ الحفظ…'
              : step < 2
                ? 'التالي'
                : form.scheduledAt
                  ? 'تأكيد الجدولة'
                  : editing
                    ? 'حفظ التعديلات'
                    : 'حفظ كمسودة'}
          </Button>
        </div>
      </form>
    </div>
  );
}
