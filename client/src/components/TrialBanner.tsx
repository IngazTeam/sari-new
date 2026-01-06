import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AlertCircle, Clock, Sparkles } from 'lucide-react';
import { Link } from 'wouter';

export function TrialBanner() {
  const { data: trialStatus } = trpc.trial.getStatus.useQuery();
  const { data: expiryData } = trpc.trial.checkExpiry.useQuery();
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    if (!trialStatus?.isTrialActive || !trialStatus?.trialEndDate) return;

    const updateTimeLeft = () => {
      const now = new Date();
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
    const interval = setInterval(updateTimeLeft, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [trialStatus]);

  // Don't show banner if trial is not active
  if (!trialStatus?.isTrialActive) {
    return null;
  }

  // Determine urgency level
  const daysRemaining = expiryData?.daysRemaining || 0;
  const isUrgent = daysRemaining <= 1;
  const isWarning = daysRemaining <= 3 && daysRemaining > 1;

  // Color scheme based on urgency
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
              <strong>الوقت المتبقي:</strong> {timeLeft}
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
            <Link href="/merchant/subscription">
              <button className={`${buttonColor} px-4 py-2 rounded-lg text-sm font-medium transition-colors`}>
                {isUrgent ? 'اشترك الآن - عرض محدود!' : 'اختر باقتك الآن'}
              </button>
            </Link>
            
            {!isUrgent && (
              <Link href="/merchant/subscription">
                <button className={`bg-white dark:bg-gray-800 ${textColor} border ${bgColor.includes('red') ? 'border-red-300' : bgColor.includes('orange') ? 'border-orange-300' : 'border-blue-300'} px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}>
                  عرض الباقات
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
