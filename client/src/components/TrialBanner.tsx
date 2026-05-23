import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AlertCircle, Clock, Sparkles, XCircle } from 'lucide-react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';

export function TrialBanner() {
  const { t } = useTranslation();
  const { data: trialStatus } = trpc.trial.getStatus.useQuery();
  const { data: expiryData } = trpc.trial.checkExpiry.useQuery();
  const { data: subscription } = trpc.merchantSubscription.getCurrentSubscription.useQuery();
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    if (!trialStatus?.trialEndDate) return;

    const updateTimeLeft = () => {
      const now = new Date();
      // @ts-ignore
      const endDate = new Date(trialStatus.trialEndDate);
      const diff = endDate.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft('انتهت الفترة التجريبية');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeLeft(`${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومين' : 'أيام'} و ${hours} ${hours === 1 ? 'ساعة' : 'ساعات'}`);
      } else if (hours > 0) {
        setTimeLeft(`${hours} ${hours === 1 ? 'ساعة' : 'ساعات'} و ${minutes} ${minutes === 1 ? 'دقيقة' : 'دقائق'}`);
      } else {
        setTimeLeft(`${minutes} ${minutes === 1 ? 'دقيقة' : 'دقائق'}`);
      }
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 60000);

    return () => clearInterval(interval);
  }, [trialStatus]);

  // If user has an active paid subscription, don't show any banner
  if (subscription?.status === 'active') {
    return null;
  }

  // Check if trial is expired (subscription status = expired OR trial ended)
  const isTrialExpired = subscription?.status === 'expired' ||
    (trialStatus?.trialEndDate && !trialStatus?.isTrialActive);

  // Check if trial is active
  const isTrialActive = trialStatus?.isTrialActive;

  // Don't show banner if no trial info at all
  if (!isTrialActive && !isTrialExpired) {
    return null;
  }

  // ===== EXPIRED STATE =====
  if (isTrialExpired) {
    return (
      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-4">
          <div className="text-red-600 dark:text-red-400 mt-0.5">
            <XCircle className="h-6 w-6" />
          </div>

          <div className="flex-1">
            <h3 className="font-semibold text-lg text-red-900 dark:text-red-100">{t('trialBanner.auto_0')}</h3>

            <p className="text-sm text-red-700 dark:text-red-300 mt-1 mb-3">{t('trialBanner.auto_1')}</p>

            <Link href="/merchant/subscription/plans">
              <button className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">{t('trialBanner.auto_2')}</button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ===== ACTIVE TRIAL STATE =====
  const daysRemaining = expiryData?.daysRemaining || 0;
  const isUrgent = daysRemaining <= 1;
  const isWarning = daysRemaining <= 3 && daysRemaining > 1;

  const bgColor = isUrgent
    ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
    : isWarning
      ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800'
      : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800';

  const textColor = isUrgent
    ? 'text-red-900 dark:text-red-100'
    : isWarning
      ? 'text-orange-900 dark:text-orange-100'
      : 'text-blue-900 dark:text-blue-100';

  const iconColor = isUrgent
    ? 'text-red-600 dark:text-red-400'
    : isWarning
      ? 'text-orange-600 dark:text-orange-400'
      : 'text-blue-600 dark:text-blue-400';

  const buttonColor = isUrgent
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : isWarning
      ? 'bg-orange-600 hover:bg-orange-700 text-white'
      : 'bg-blue-600 hover:bg-blue-700 text-white';

  const Icon = isUrgent || isWarning ? AlertCircle : Sparkles;

  return (
    <div className={`${bgColor} border rounded-lg p-4 mb-6`}>
      <div className="flex items-start gap-4">
        <div className={`${iconColor} mt-0.5`}>
          <Icon className="h-6 w-6" />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className={`font-semibold text-lg ${textColor}`}>
              {isUrgent ? '⏰ تنبيه عاجل: فترتك التجريبية تنتهي قريباً!' :
                isWarning ? '⚠️ فترتك التجريبية تنتهي قريباً' :
                  '🎁 أنت في الفترة التجريبية المجانية'}
            </h3>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <Clock className={`h-4 w-4 ${iconColor}`} />
            <p className={`text-sm ${textColor}`}>
              <strong>{t('compTrialBannerPage.text0')}</strong> {timeLeft}
            </p>
          </div>

          <p className={`text-sm ${textColor} mb-3`}>
            {isUrgent ?
              'فترتك التجريبية على وشك الانتهاء! اشترك الآن للاستمرار في استخدام جميع ميزات ساري بدون انقطاع.' :
              isWarning ?
                'لا تفوت فرصة الاستمرار في استخدام ساري! اشترك الآن واحصل على جميع الميزات المتقدمة.' :
                'استمتع بجميع ميزات ساري مجاناً خلال الفترة التجريبية. اشترك في إحدى باقاتنا للاستمرار بعد انتهاء الفترة التجريبية.'}
          </p>

          <div className="flex gap-3">
            <Link href="/merchant/subscription/plans">
              <button className={`${buttonColor} px-4 py-2 rounded-lg text-sm font-medium transition-colors`}>
                {isUrgent ? 'اشترك الآن!' : 'اختر باقتك الآن'}
              </button>
            </Link>

            {!isUrgent && (
              <Link href="/merchant/subscription/plans">
                <button className={`bg-white dark:bg-gray-800 ${textColor} border ${isWarning ? 'border-orange-300' : 'border-blue-300'} px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}>{t('trialBanner.auto_3')}</button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}