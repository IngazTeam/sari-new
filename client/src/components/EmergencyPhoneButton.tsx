import { useState, useEffect } from 'react';
import { Phone, PhoneCall, Loader2, Check, Plus, Trash2, ArrowUp, ArrowDown, AlertTriangle, Clock } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { useTranslation } from 'react-i18next';

interface EscalationContact {
  phone: string;
  label: string;
  order: number;
}

/**
 * Emergency Phone Button — Header component (Multi-Phone Cascading Chain)
 * Opens a popup for the merchant to manage their escalation phone chain.
 * Supports up to 5 ordered contacts with 5-minute cascade between each.
 */
export function EmergencyPhoneButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [phones, setPhones] = useState<EscalationContact[]>([]);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conflictIndexes, setConflictIndexes] = useState<Set<number>>(new Set());

  // Always enabled so the badge shows even when dialog is closed
  const { data, isLoading } = trpc.merchants.getEscalationPhones.useQuery(undefined);

  // Fetch merchant ID for WhatsApp instances query
  const { data: merchantData } = trpc.merchants.getCurrent.useQuery(undefined);
  
  // Fetch bot's connected WhatsApp numbers for client-side validation
  const { data: instancesData } = trpc.whatsappInstances.listSafe.useQuery(
    { merchantId: merchantData?.id! },
    { enabled: open && !!merchantData?.id },
  );

  // Normalize phone: strip hidden chars, convert Arabic digits, standardize format
  const normalizePhone = (phone: string): string => {
    let p = phone
      // Remove RTL/LTR marks, zero-width chars, non-breaking spaces
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00A0]/g, '')
      // Convert Arabic-Indic digits (٠-٩) to ASCII
      .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
      // Convert Extended Arabic-Indic digits (۰-۹) to ASCII
      .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0))
      // Convert fullwidth digits (０-９) to ASCII
      .replace(/[\uFF10-\uFF19]/g, (c) => String(c.charCodeAt(0) - 0xFF10))
      // Strip spaces, dashes, dots, parens, plus
      .replace(/[\s\-().+]/g, '')
      // Remove leading 00 (international prefix)
      .replace(/^00/, '');
    // Saudi local → international: 05xxxxxxxx → 9665xxxxxxxx
    if (/^05\d{8}$/.test(p)) p = '966' + p.slice(1);
    // 5xxxxxxxx (no leading 0) → 9665xxxxxxxx
    if (/^5\d{8}$/.test(p)) p = '966' + p;
    return p;
  };

  // Get list of bot phone numbers (normalized)
  const botPhones = (instancesData || [])
    .filter((i: any) => i.status === 'active')
    .map((i: any) => normalizePhone(String(i.phoneNumber || '')))
    .filter((p: string) => p.length > 0);

  const updateMut = trpc.merchants.updateEscalationPhones.useMutation({
    onSuccess: () => {
      setSaved(true);
      setErrorMsg(null);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => {
      setErrorMsg(err.message || 'حدث خطأ أثناء الحفظ');
      setTimeout(() => setErrorMsg(null), 8000);
    },
  });

  // Sync from server when dialog opens
  useEffect(() => {
    if (data?.phones) {
      setPhones(data.phones.length > 0 ? data.phones : [{ phone: '', label: '', order: 1 }]);
    }
  }, [data]);

  // Check for conflicts whenever phones change
  useEffect(() => {
    if (botPhones.length === 0) return;
    const conflicts = new Set<number>();
    phones.forEach((contact, index) => {
      const normalized = normalizePhone(contact.phone);
      if (normalized && botPhones.includes(normalized)) {
        conflicts.add(index);
      }
    });
    setConflictIndexes(conflicts);
  }, [phones, instancesData]);

  const hasConflict = conflictIndexes.size > 0;

  const handleSave = () => {
    setErrorMsg(null);
    // Normalize each phone independently, preserve label
    const cleaned = phones
      .map((p, i) => ({
        phone: normalizePhone(p.phone),
        label: p.label.trim(),
        order: i + 1,
      }))
      .filter(p => p.phone.length > 0);
    
    if (cleaned.length === 0) {
      setErrorMsg('⚠️ أضف رقم واحد على الأقل لسلسلة التصعيد');
      return;
    }
    if (hasConflict) {
      setErrorMsg('🚫 أزل أرقام الواتساب المربوطة بالبوت أولاً — لا يمكن استخدامها للتصعيد');
      return;
    }
    // Client-side validation: each phone must be digits only after normalization
    const invalidRow = cleaned.find(p => !/^\d{9,15}$/.test(p.phone));
    if (invalidRow) {
      setErrorMsg(`⚠️ الرقم "${invalidRow.phone || '(فارغ)'}" غير صالح — يجب أن يكون أرقام فقط (مثال: 966501234567)`);
      return;
    }
    updateMut.mutate({ phones: cleaned });
  };

  const addPhone = () => {
    if (phones.length >= 5) return;
    setPhones([...phones, { phone: '', label: '', order: phones.length + 1 }]);
  };

  const removePhone = (index: number) => {
    const updated = phones.filter((_, i) => i !== index).map((p, i) => ({ ...p, order: i + 1 }));
    setPhones(updated.length > 0 ? updated : [{ phone: '', label: '', order: 1 }]);
  };

  const movePhone = (index: number, direction: 'up' | 'down') => {
    const newPhones = [...phones];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newPhones.length) return;
    [newPhones[index], newPhones[swapIndex]] = [newPhones[swapIndex], newPhones[index]];
    setPhones(newPhones.map((p, i) => ({ ...p, order: i + 1 })));
  };

  const updatePhone = (index: number, field: keyof EscalationContact, value: string) => {
    const updated = [...phones];
    (updated[index] as any)[field] = value;
    setPhones(updated);
  };

  const hasPhones = data?.phones && data.phones.length > 0 && data.phones[0]?.phone;
  const configuredCount = data?.phones?.filter(p => p.phone)?.length || 0;
  const needsAttention = !isLoading && !hasPhones;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          id="emergency-phone-btn"
          className={`relative flex items-center justify-center h-9 w-9 rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            hasPhones
              ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 animate-pulse'
          }`}
          title={hasPhones
            ? t('emergencyPhone.configured', `${configuredCount} أرقام تصعيد مفعّلة`)
            : t('emergencyPhone.notConfigured', 'فعّل سلسلة تنبيهات ساري')
          }
        >
          {hasPhones ? (
            <>
              <PhoneCall className="h-4 w-4" />
              {configuredCount > 1 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
                  {configuredCount}
                </span>
              )}
            </>
          ) : (
            <>
              <Phone className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex items-center justify-center rounded-full h-4 w-4 bg-red-500 text-white text-[8px] font-bold">!</span>
              </span>
            </>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center shadow-sm">
              <PhoneCall className="h-5 w-5 text-white" />
            </div>
            {t('emergencyPhone.title', 'سلسلة تنبيهات ساري')}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {t('emergencyPhone.description', 'عندما لا يعرف ساري الجواب، يرسل تنبيه للرقم الأول. لو ما رد خلال 5 دقائق — يرسل للثاني، وهكذا.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Visual Cascade Flow */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-violet-500/5 to-primary/5 border border-violet-200/50 dark:border-violet-800/30">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
              <span className="text-base">👤</span>
              <span>عميل يسأل</span>
              <span className="text-muted-foreground/50">→</span>
              <span className="text-base">🤖</span>
              <span>ساري يبحث</span>
              <span className="text-muted-foreground/50">→</span>
              <span className="text-base">📲</span>
              <span className="font-medium text-primary">رقم ①</span>
              {phones.length > 1 && (
                <>
                  <span className="text-muted-foreground/50">→</span>
                  <Clock className="h-3 w-3 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400 text-[10px]">5 دقائق</span>
                  <span className="text-muted-foreground/50">→</span>
                  <span className="text-base">📲</span>
                  <span className="font-medium text-primary">رقم ②</span>
                </>
              )}
              {phones.length > 2 && (
                <>
                  <span className="text-muted-foreground/50">→ ...</span>
                </>
              )}
              <span className="text-muted-foreground/50">→</span>
              <span className="text-base">✅</span>
              <span>أي رد يوصل للعميل</span>
            </div>
          </div>

          {/* Phone List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                {t('emergencyPhone.chainLabel', 'أرقام التصعيد (بالترتيب)')}
              </label>
              <span className="text-[11px] text-muted-foreground">{phones.filter(p => p.phone).length}/5</span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                {phones.map((contact, index) => {
                  const isConflict = conflictIndexes.has(index);
                  return (
                  <div key={index} className={`group flex items-start gap-2 p-3 rounded-xl border bg-background transition-colors ${isConflict ? 'border-red-400 bg-red-50/50 dark:bg-red-950/20' : 'border-border hover:border-primary/30'}`}>
                    {/* Level indicator */}
                    <div className="flex flex-col items-center gap-0.5 pt-1.5">
                      <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${
                        index === 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                        : index === 1 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                      }`}>
                        {index + 1}
                      </span>
                      {index < phones.length - 1 && (
                        <div className="flex flex-col items-center gap-px mt-1">
                          <div className="w-px h-2 bg-border" />
                          <Clock className="h-2.5 w-2.5 text-muted-foreground/50" />
                          <span className="text-[8px] text-muted-foreground/60">5 د</span>
                          <div className="w-px h-2 bg-border" />
                        </div>
                      )}
                    </div>

                    {/* Inputs */}
                    <div className="flex-1 space-y-1.5">
                      <input
                        type="tel"
                        dir="ltr"
                        value={contact.phone}
                        onChange={(e) => updatePhone(index, 'phone', e.target.value)}
                        placeholder="966501234567"
                        className={`w-full h-9 px-3 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 placeholder:text-muted-foreground/40 transition-all ${isConflict ? 'border-red-400 focus:ring-red-300 text-red-700' : 'border-border focus:ring-ring focus:border-primary'}`}
                      />
                      {isConflict && (
                        <p className="text-[10px] text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          هذا الرقم مربوط بالبوت — سيسبب حلقة لا نهائية!
                        </p>
                      )}
                      <input
                        type="text"
                        value={contact.label}
                        onChange={(e) => updatePhone(index, 'label', e.target.value)}
                        placeholder={index === 0 ? 'المدير (اختياري)' : index === 1 ? 'المساعد (اختياري)' : 'الاسم (اختياري)'}
                        className="w-full h-8 px-3 text-xs rounded-lg border border-border/60 bg-muted/30 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40 transition-all"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-center gap-0.5 pt-1">
                      <button
                        onClick={() => movePhone(index, 'up')}
                        disabled={index === 0}
                        className="p-1 rounded hover:bg-muted disabled:opacity-20 transition-colors"
                        title="تقديم"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => movePhone(index, 'down')}
                        disabled={index === phones.length - 1}
                        className="p-1 rounded hover:bg-muted disabled:opacity-20 transition-colors"
                        title="تأخير"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => removePhone(index)}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="حذف"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* Add Phone Button */}
            {phones.length < 5 && !isLoading && (
              <button
                onClick={addPhone}
                className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl border-2 border-dashed border-border hover:border-primary/40 text-muted-foreground hover:text-primary text-sm transition-colors"
              >
                <Plus className="h-4 w-4" />
                {t('emergencyPhone.addPhone', 'إضافة رقم آخر')}
              </button>
            )}
          </div>

          {/* Warning if no phone */}
          {!hasPhones && !isLoading && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {t('emergencyPhone.warning', 'بدون أرقام تصعيد، ساري يبلّغ العميل بالانتظار لكن ما يقدر يوصل لك السؤال.')}
              </p>
            </div>
          )}

          {/* Error Alert */}
          {errorMsg && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 animate-in fade-in slide-in-from-top-2 duration-300">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-300 font-medium">{errorMsg}</p>
            </div>
          )}

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={updateMut.isPending || isLoading}
            className="w-full h-11 rounded-xl font-medium text-base shadow-sm transition-all"
          >
            {updateMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
            ) : saved ? (
              <Check className="h-4 w-4 ml-2 text-emerald-200" />
            ) : null}
            {saved
              ? t('emergencyPhone.saved', 'تم الحفظ! ✅')
              : t('emergencyPhone.save', 'حفظ سلسلة التنبيهات')
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
