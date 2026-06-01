import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertCircle } from 'lucide-react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';

export function SubscriptionBadge() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data: subscription } = trpc.merchantSubscription.getCurrentSubscription.useQuery();
  const { data: daysData } = trpc.merchantSubscription.getDaysRemaining.useQuery();
  const { data: merchantProfile } = trpc.merchants.getCurrent.useQuery();
  const daysRemaining = daysData?.daysRemaining;

  // FIX: If admin manually activated the subscription (merchants.subscriptionStatus = 'active'),
  // don't show the expired badge even if merchant_subscriptions record is expired
  const isAdminOverrideActive = merchantProfile?.subscriptionStatus === 'active';

  if ((!subscription || subscription.status === 'expired') && !isAdminOverrideActive) {
    return (
      <Badge 
        variant="destructive" 
        className="cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setLocation('/merchant/subscription/plans')}
      >
        <AlertCircle className="ml-1 h-3 w-3" />{t('subscriptionBadge.auto_0')}</Badge>
    );
  }

  if (daysRemaining === null || daysRemaining === undefined) {
    return null;
  }

  const getVariant = () => {
    if (daysRemaining <= 3) return 'destructive';
    if (daysRemaining <= 7) return 'secondary';
    return 'default';
  };

  const getLabel = () => {
    if (subscription?.status === 'trial') {
      return `تجريبي: ${daysRemaining} يوم`;
    }
    return `${daysRemaining} يوم متبقي`;
  };

  return (
    <Badge 
      variant={getVariant()} 
      className="cursor-pointer hover:opacity-80 transition-opacity"
      onClick={() => setLocation('/merchant/subscription')}
    >
      <Calendar className="ml-1 h-3 w-3" />
      {getLabel()}
    </Badge>
  );
}
