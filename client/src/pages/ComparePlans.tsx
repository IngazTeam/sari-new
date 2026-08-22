import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Loader2 } from 'lucide-react';
import { QueryStateCard } from '@/components/QueryStateCard';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export default function ComparePlans() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  // Fetch all plans
  const {
    data: plans,
    isLoading: plansLoading,
    error: plansError,
    refetch: refetchPlans,
  } = trpc.subscriptionPlans.listPlans.useQuery();

  // Fetch current subscription
  const {
    data: currentSubscription,
    error: subscriptionError,
    refetch: refetchSubscription,
  } = trpc.merchantSubscription.getCurrentSubscription.useQuery();

  // Upgrade/downgrade mutation
  const upgradeMutation = trpc.merchantSubscription.upgradePlan.useMutation({
    onSuccess: () => {
      toast.success(t('merchantUx.comparePlans.updated'));
      setLocation('/merchant/subscription');
    },
    onError: (error: any) => {
      toast.error(error.message || t('merchantUx.comparePlans.updateFailed'));
    },
  });

  const handleSelectPlan = (planId: number) => {
    if (!currentSubscription) {
      toast.error(t('merchantUx.comparePlans.noActiveSubscription'));
      return;
    }

    if (planId === currentSubscription.planId) {
      const currentPlanName = plans?.find((plan) => plan.id === planId)?.name ?? '';
      toast.info(t('merchantUx.comparePlans.currentPlan', { name: currentPlanName }));
      return;
    }

    setSelectedPlanId(planId);
    upgradeMutation.mutate({
      newPlanId: planId,
      newBillingCycle: currentSubscription.billingCycle,
    });
  };

  if (plansLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (plansError || subscriptionError) {
    return (
      <div className="container mx-auto py-8">
        <QueryStateCard
          kind="error"
          title={t('merchantUx.comparePlans.loadFailed')}
          description={(plansError || subscriptionError)?.message}
          retryLabel={t('merchantUx.comparePlans.retry')}
          onRetry={() => void Promise.all([refetchPlans(), refetchSubscription()])}
        />
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <div className="container mx-auto py-8">
        <QueryStateCard
          kind="empty"
          title={t('merchantUx.comparePlans.noPlans')}
          description={t('merchantUx.comparePlans.noPlansDescription')}
          action={(
            <Button type="button" variant="outline" onClick={() => setLocation('/merchant/subscription')}>
              {t('merchantUx.comparePlans.back')}
            </Button>
          )}
        />
      </div>
    );
  }

  // Sort plans by price
  const sortedPlans = [...plans].sort((a, b) => Number(a.monthlyPrice) - Number(b.monthlyPrice));
  type ComparablePlan = (typeof sortedPlans)[number];

  // Define features to compare
  const features = [
    { key: 'maxCustomers', label: t('merchantUx.comparePlans.customers'), value: (plan: ComparablePlan) => plan.maxCustomers, unlimited: 999999 },
    { key: 'maxWhatsAppNumbers', label: t('merchantUx.comparePlans.whatsappNumbers'), value: (plan: ComparablePlan) => plan.maxWhatsAppNumbers, unlimited: 999999 },
    { key: 'conversationLimit', label: t('merchantUx.comparePlans.monthlyConversations'), value: (plan: ComparablePlan) => plan.conversationLimit, unlimited: -1 },
    { key: 'voiceMessageLimit', label: t('merchantUx.comparePlans.voiceMessages'), value: (plan: ComparablePlan) => plan.voiceMessageLimit, unlimited: -1 },
  ];

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">{t('merchantUx.comparePlans.title')}</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{t('merchantUx.comparePlans.subtitle')}</p>
      </div>

      {/* Current Plan Badge */}
      {currentSubscription && (
        <div className="mb-8 text-center">
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {t('merchantUx.comparePlans.currentPlan', {
              name: sortedPlans.find((plan) => plan.id === currentSubscription.planId)?.name ?? '',
            })}
          </Badge>
        </div>
      )}

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2">
              <th className="p-4 text-right font-semibold bg-muted/50 sticky right-0 z-10">{t('merchantUx.comparePlans.feature')}</th>
              {sortedPlans.map((plan) => (
                <th key={plan.id} className="p-4 text-center min-w-[200px]">
                  <Card className={`${
                    currentSubscription?.planId === plan.id 
                      ? 'border-primary border-2 shadow-lg' 
                      : ''
                  }`}>
                    <CardHeader>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        {currentSubscription?.planId === plan.id && (
                          <Badge variant="secondary">{t('merchantUx.comparePlans.currentBadge')}</Badge>
                        )}
                      </div>
                      <CardTitle className="text-2xl">{plan.name}</CardTitle>
                      <CardDescription className="text-sm min-h-[40px]">
                        {plan.description}
                      </CardDescription>
                      <div className="mt-4">
                        <div className="text-3xl font-bold">
                          {Number(plan.monthlyPrice) === 0
                            ? t('merchantUx.comparePlans.free')
                            : `${Number(plan.monthlyPrice).toLocaleString(i18n.language)} ${plan.currency}`}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {t('merchantUx.comparePlans.monthly')}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Button
                        className="w-full"
                        variant={currentSubscription?.planId === plan.id ? 'outline' : 'default'}
                        disabled={
                          currentSubscription?.planId === plan.id ||
                          !plan.isActive ||
                          upgradeMutation.isPending
                        }
                        onClick={() => handleSelectPlan(plan.id)}
                      >
                        {upgradeMutation.isPending && selectedPlanId === plan.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin ml-2" />{t('merchantUx.comparePlans.updating')}
                          </>
                        ) : (
                          <>
                            {t('merchantUx.comparePlans.select')}<ArrowRight className="h-4 w-4 mr-2" />
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((feature, idx) => (
              <tr key={feature.key} className={`border-b ${idx % 2 === 0 ? 'bg-muted/20' : ''}`}>
                <td className="p-4 font-medium sticky right-0 z-10 bg-background">
                  {feature.label}
                </td>
                {sortedPlans.map((plan) => {
                  const value = Number(feature.value(plan) ?? 0);
                  const formattedValue = value === feature.unlimited
                    ? t('merchantUx.comparePlans.unlimited')
                    : value.toLocaleString(i18n.language);
                  
                  return (
                    <td key={plan.id} className="p-4 text-center">
                      <span className="font-medium">{formattedValue}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom CTA */}
      <div className="mt-12 text-center">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="pt-6">
            <h3 className="text-xl font-semibold mb-2">{t('merchantUx.comparePlans.helpTitle')}</h3>
            <p className="text-muted-foreground mb-4">{t('merchantUx.comparePlans.helpDescription')}</p>
            <Button variant="outline" onClick={() => setLocation('/merchant/subscription')}>
              {t('merchantUx.comparePlans.back')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
