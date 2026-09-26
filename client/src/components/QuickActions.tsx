import { Button } from '@/components/ui/button';
import { Package, CreditCard, Calendar, MapPin, Clock, UserPlus, Truck, Gift, Star, FileText, MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export interface QuickActionDraft { message: string; }
interface QuickActionsProps {
  conversationId: number;
  customerPhone: string;
  customerName?: string;
  merchantId?: number;
  onActionComplete?: (action: string, data: QuickActionDraft) => void;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
}

/** Draft helpers only. Payments, bookings and order updates require verified workflows. */
export function QuickActions({ onActionComplete, className, compact = false, disabled = false }: QuickActionsProps) {
  const { t } = useTranslation();
  const drafts = [
    { id: 'send_products', icon: Package, label: t('quickDrafts.productsLabel'), message: t('quickDrafts.productsMessage') },
    { id: 'send_payment_link', icon: CreditCard, label: t('quickDrafts.paymentLabel'), message: t('quickDrafts.paymentMessage') },
    { id: 'book_appointment', icon: Calendar, label: t('quickDrafts.bookingLabel'), message: t('quickDrafts.bookingMessage') },
    { id: 'send_location', icon: MapPin, label: t('quickDrafts.locationLabel'), message: t('quickDrafts.locationMessage') },
    { id: 'send_hours', icon: Clock, label: t('quickDrafts.hoursLabel'), message: t('quickDrafts.hoursMessage') },
    { id: 'transfer_human', icon: UserPlus, label: t('quickDrafts.followupLabel'), message: t('quickDrafts.followupMessage') },
    { id: 'send_order_status', icon: Truck, label: t('quickDrafts.orderLabel'), message: t('quickDrafts.orderMessage') },
    { id: 'send_offer', icon: Gift, label: t('quickDrafts.offerLabel'), message: t('quickDrafts.offerMessage') },
    { id: 'request_review', icon: Star, label: t('quickDrafts.reviewLabel'), message: t('quickDrafts.reviewMessage') },
    { id: 'send_catalog', icon: FileText, label: t('quickDrafts.catalogLabel'), message: t('quickDrafts.catalogMessage') },
  ];
  return (
    <section className={cn('min-w-0 space-y-2', className)} aria-label={t('quickDrafts.title')}>
      <p className="flex items-center gap-2 text-sm font-medium">
        <MessageSquareText className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t('quickDrafts.title')}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">{t('quickDrafts.description')}</p>
      <div className={cn('gap-2', compact ? 'flex flex-wrap' : 'grid grid-cols-1 sm:grid-cols-2')}>
        {drafts.map(({ id, icon: Icon, label, message }) => (
          <Button key={id} type="button" variant="outline" data-quick-draft={id}
            className="min-h-11 h-auto max-w-full gap-2 whitespace-normal px-3 py-2 text-start text-sm"
            disabled={disabled || !onActionComplete}
            onClick={() => onActionComplete?.(id, { message })}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
          </Button>
        ))}
      </div>
    </section>
  );
}
export function QuickActionsBar(props: Omit<QuickActionsProps, 'compact'>) {
  return <QuickActions {...props} compact />;
}
export default QuickActions;
