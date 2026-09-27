import { Button } from '@/components/ui/button';
import { WorkspaceState } from '@/components/merchant/WorkspaceState';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';

export default function PaymentCancel() {
  const { t } = useTranslation();
  return <WorkspaceState kind="payment" title={t('paymentCancelPage.text0')}
    description={t('workspacePages.paymentCancelled')}
    action={<Button asChild><Link href="/merchant/subscriptions">{t('workspacePages.paymentReview')}</Link></Button>} />;
}
