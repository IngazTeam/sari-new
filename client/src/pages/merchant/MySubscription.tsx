import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, CreditCard, AlertCircle, Check, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';

export default function MySubscription() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  
  const { data: subscription, isLoading, refetch } = trpc.merchantSubscription.getCurrentSubscription.useQuery();
  const { data: daysRemaining } = trpc.merchantSubscription.getDaysRemaining.useQuery();
  const { data: transactions } = trpc.payment.listTransactions.useQuery({ limit: 10 });
  const cancelSubscription = trpc.merchantSubscription.cancelSubscription.useMutation();

  const handleCancel = async () => {
    if (!confirm(t('mySubscriptionPage.text34'))) {
      return;
    }

    try {
      await cancelSubscription.mutateAsync();
      toast.success(t('mySubscriptionPage.text0'));
      refetch();
    } catch (error: any) {
      toast.error(error.message || t('mySubscriptionPage.text23'));
    }
  };

  const handleUpgrade = () => {
    setLocation('/merchant/subscription/plans');
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>{t('mySubscriptionPage.text1')}</CardTitle>
            <CardDescription>{t('mySubscriptionPage.text2')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleUpgrade}>
              {t('mySubscriptionPage.text24')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      trial: { variant: 'secondary', label: t('mySubscriptionPage.text30') },
      active: { variant: 'default', label: t('mySubscriptionPage.text31') },
      expired: { variant: 'destructive', label: t('mySubscriptionPage.text32') },
      cancelled: { variant: 'outline', label: t('mySubscriptionPage.text33') },
    };
    const config = variants[status] || { variant: 'outline', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const isExpiringSoon = daysRemaining && daysRemaining <= 7;
  const isExpired = subscription.status === 'expired';

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('mySubscriptionPage.text3')}</h1>
        <p className="text-muted-foreground mt-1">{t('mySubscriptionPage.text4')}</p>
      </div>

      {/* Expiry Warning */}
      {isExpiringSoon && !isExpired && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('mySubscriptionPage.text35', { var0: daysRemaining })}
            <Button size="sm" className="mr-4" onClick={handleUpgrade}>
              {t('mySubscriptionPage.text25')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isExpired && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('mySubscriptionPage.text26')}
            <Button size="sm" className="mr-4" onClick={handleUpgrade}>
              {t('mySubscriptionPage.text27')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">{subscription.plan?.name}</CardTitle>
              <CardDescription>{subscription.plan?.description}</CardDescription>
            </div>
            {getStatusBadge(subscription.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('mySubscriptionPage.text5')}</p>
              </div>
              <p className="text-3xl font-bold">{daysRemaining || 0}</p>
            </div>

            <div className="p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-2 mb-2">
                <Check className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('mySubscriptionPage.text6')}</p>
              </div>
              <p className="text-3xl font-bold">{subscription.plan?.maxCustomers.toLocaleString()}</p>
            </div>

            <div className="p-4 rounded-lg bg-muted">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('mySubscriptionPage.text7')}</p>
              </div>
              <p className="text-2xl font-bold">
                {subscription.billingCycle === 'monthly' ? t('mySubscriptionPage.text17') : t('mySubscriptionPage.text18')}
              </p>
            </div>
          </div>

          {/* Dates */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t('mySubscriptionPage.text8')}</p>
              <p className="font-semibold">
                {new Date(subscription.startDate).toLocaleDateString('ar-SA', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t('mySubscriptionPage.text9')}</p>
              <p className="font-semibold">
                {new Date(subscription.endDate).toLocaleDateString('ar-SA', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button onClick={handleUpgrade} className="flex-1">
              <TrendingUp className="ml-2 h-4 w-4" />
              {t('mySubscriptionPage.text28')}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setLocation('/merchant/subscription/compare')}
              className="flex-1"
            >
              {t('mySubscriptionPage.text29')}
            </Button>
            {subscription.status === 'active' && (
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={cancelSubscription.isPending}
              >
                {cancelSubscription.isPending ? t('mySubscriptionPage.text19') : t('mySubscriptionPage.text20')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle>{t('mySubscriptionPage.text10')}</CardTitle>
          <CardDescription>{t('mySubscriptionPage.text11')}</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions && transactions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('mySubscriptionPage.text12')}</TableHead>
                  <TableHead>{t('mySubscriptionPage.text13')}</TableHead>
                  <TableHead>{t('mySubscriptionPage.text14')}</TableHead>
                  <TableHead>{t('mySubscriptionPage.text15')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      {new Date(transaction.createdAt).toLocaleDateString('ar-SA')}
                    </TableCell>
                    <TableCell>{transaction.description}</TableCell>
                    <TableCell className="font-semibold">
                      {transaction.amount} {transaction.currency}
                    </TableCell>
                    <TableCell>
                      <Badge variant={transaction.status === 'completed' ? 'default' : 'secondary'}>
                        {transaction.status === 'completed' ? 'مكتمل' : 
                         transaction.status === 'pending' ? t('mySubscriptionPage.text21') : t('mySubscriptionPage.text22')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">{t('mySubscriptionPage.text16')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
