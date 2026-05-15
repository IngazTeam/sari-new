import { useState, useEffect } from 'react';
import { Phone, PhoneCall, Loader2, Check, X, AlertTriangle } from 'lucide-react';
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

/**
 * Emergency Phone Button — Header component
 * Opens a popup for the merchant to set their personal phone number
 * for receiving Sari escalation alerts when the bot can't answer a question.
 */
export function EmergencyPhoneButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = trpc.merchants.getEmergencyPhone.useQuery(undefined, {
    enabled: open,
  });

  const updateMut = trpc.merchants.updateEmergencyPhone.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  // Sync from server when dialog opens
  useEffect(() => {
    if (data) {
      setPhone(data.emergencyPhone || data.phone || '');
    }
  }, [data]);

  const handleSave = () => {
    const cleaned = phone.replace(/\s/g, '');
    updateMut.mutate({ emergencyPhone: cleaned || null });
  };

  const hasPhone = data?.emergencyPhone;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          id="emergency-phone-btn"
          className={`relative flex items-center justify-center h-9 w-9 rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            hasPhone
              ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 animate-pulse'
          }`}
          title={hasPhone ? t('emergencyPhone.configured', 'رقم التنبيهات مفعّل') : t('emergencyPhone.notConfigured', 'فعّل رقم تنبيهات ساري')}
        >
          {hasPhone ? (
            <PhoneCall className="h-4 w-4" />
          ) : (
            <>
              <Phone className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
            </>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center shadow-sm">
              <PhoneCall className="h-5 w-5 text-white" />
            </div>
            {t('emergencyPhone.title', 'رقم تنبيهات ساري')}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {t('emergencyPhone.description', 'عندما يسأل عميل سؤال لا يعرف ساري إجابته، سيرسل لك تنبيه على هذا الرقم لتجاوبه — والجواب يوصل العميل تلقائياً!')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Visual Flow */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-violet-500/5 to-primary/5 border border-violet-200/50 dark:border-violet-800/30">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="text-base">👤</span>
              <span>عميل يسأل</span>
              <span className="text-muted-foreground/50">→</span>
              <span className="text-base">🤖</span>
              <span>ساري يبحث</span>
              <span className="text-muted-foreground/50">→</span>
              <span className="text-base">📲</span>
              <span className="font-medium text-primary">تنبيه لك</span>
              <span className="text-muted-foreground/50">→</span>
              <span className="text-base">✅</span>
              <span>تردّ والعميل يستلم</span>
            </div>
          </div>

          {/* Phone Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="emergency-phone-input">
              {t('emergencyPhone.label', 'رقم الواتساب الشخصي')}
            </label>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  id="emergency-phone-input"
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="966501234567"
                  className="w-full h-11 pr-10 pl-4 text-base rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary placeholder:text-muted-foreground/50 transition-all"
                />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              {t('emergencyPhone.hint', 'أدخل رقمك بالكود الدولي (مثال: 966501234567). هذا الرقم يستخدمه ساري فقط لإرسال تنبيهات أسئلة العملاء.')}
            </p>
          </div>

          {/* Warning if no phone */}
          {!hasPhone && !isLoading && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {t('emergencyPhone.warning', 'بدون هذا الرقم، ساري ما يقدر يرسل لك أسئلة العملاء — سيكتفي بإخبارهم بالانتظار.')}
              </p>
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
              : t('emergencyPhone.save', 'حفظ رقم التنبيهات')
            }
          </Button>

          {/* Clear button if phone exists */}
          {hasPhone && (
            <button
              onClick={() => {
                setPhone('');
                updateMut.mutate({ emergencyPhone: null });
              }}
              className="w-full text-xs text-muted-foreground hover:text-destructive transition-colors py-1"
            >
              <X className="h-3 w-3 inline ml-1" />
              {t('emergencyPhone.clear', 'إزالة رقم التنبيهات')}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
