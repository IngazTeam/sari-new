import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertCircle } from 'lucide-react';
import { useLocation } from 'wouter';

export function SubscriptionBadge() {
  const [, setLocation] = useLocation();
  const { data: subscription } = trpc.merchantSubscription.getCurrentSubscription.useQuery();
  const { data: daysData } = trpc.merchantSubscription.getDaysRemaining.useQuery();
  const daysRemaining = daysData?.daysRemaining;

  if (!subscription || subscription.status === 'expired') {
    return (
      <Badge 
        variant="destructive" 
        className="cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setLocation('/merchant/subscription/plans')}
      >
        <AlertCircle className="ml-1 h-3 w-3" />
        اشترك الآن
      </Badge>
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
    if (subscription.status === 'trial') {
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
