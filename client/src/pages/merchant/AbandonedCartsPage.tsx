import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShoppingCart, TrendingUp, Send, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';
export default function AbandonedCartsPage() {
  const { t } = useTranslation();

  const { user } = useAuth();
  const [selectedCart, setSelectedCart] = useState<number | null>(null);

  // Get merchant
  const { data: merchant } = trpc.merchants.getCurrent.useQuery();

  // Get abandoned carts
  const { data: carts = [], refetch: refetchCarts } = trpc.abandonedCarts.list.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Get statistics
  const { data: stats } = trpc.abandonedCarts.getStats.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Send reminder mutation
  const sendReminderMutation = trpc.abandonedCarts.sendReminder.useMutation({
    onSuccess: () => {
      toast.success(t('toast.carts.msg1'));
      refetchCarts();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Mark as recovered mutation
  const markRecoveredMutation = trpc.abandonedCarts.markRecovered.useMutation({
    onSuccess: () => {
      toast.success(t('toast.common.msg1'));
      refetchCarts();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSendReminder = (cartId: number) => {
    setSelectedCart(cartId);
    sendReminderMutation.mutate({ cartId });
  };

  const handleMarkRecovered = (cartId: number) => {
    markRecoveredMutation.mutate({ cartId });
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('abandonedCartsPagePage.text0')}</h1>
        <p className="text-muted-foreground">
          {t('abandonedCartsPagePage.text23')}
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('abandonedCartsPagePage.text1')}</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalAbandoned || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('abandonedCartsPagePage.text2')}</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.remindersSent || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('abandonedCartsPagePage.text3')}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.recovered || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('abandonedCartsPagePage.text29', { var0: stats?.recoveryRate || 0 })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('abandonedCartsPagePage.text4')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalRecoveredValue || 0} ريال</div>
          </CardContent>
        </Card>
      </div>

      {/* Abandoned Carts Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('abandonedCartsPagePage.text6')}</CardTitle>
          <CardDescription>
            {t('abandonedCartsPagePage.text24')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {carts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('abandonedCartsPagePage.text7')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('abandonedCartsPagePage.text8')}</TableHead>
                  <TableHead>{t('abandonedCartsPagePage.text9')}</TableHead>
                  <TableHead>{t('abandonedCartsPagePage.text10')}</TableHead>
                  <TableHead>{t('abandonedCartsPagePage.text11')}</TableHead>
                  <TableHead>{t('abandonedCartsPagePage.text12')}</TableHead>
                  <TableHead>{t('abandonedCartsPagePage.text13')}</TableHead>
                  <TableHead>{t('abandonedCartsPagePage.text14')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carts.map((cart) => {
                  const items = JSON.parse(cart.items);
                  return (
                    <TableRow key={cart.id}>
                      <TableCell className="font-medium">{cart.customerPhone}</TableCell>
                      <TableCell>{cart.customerName || '-'}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {items.map((item: any, idx: number) => (
                            <div key={idx}>
                              {item.productName} (x{item.quantity})
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{cart.totalAmount} ريال</TableCell>
                      <TableCell className="text-sm">{formatDate(cart.createdAt)}</TableCell>
                      <TableCell>
                        {cart.recovered ? (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle2 className="h-3 w-3 ml-1" />
                            {t('abandonedCartsPagePage.text25')}
                          </Badge>
                        ) : cart.reminderSent ? (
                          <Badge variant="secondary">
                            <Send className="h-3 w-3 ml-1" />
                            {t('abandonedCartsPagePage.text26')}
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Clock className="h-3 w-3 ml-1" />
                            {t('abandonedCartsPagePage.text27')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {!cart.recovered && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSendReminder(cart.id)}
                                disabled={sendReminderMutation.isPending && selectedCart === cart.id}
                              >
                                <Send className="h-4 w-4 ml-1" />
                                {cart.reminderSent ? t('abandonedCartsPagePage.text21') : t('abandonedCartsPagePage.text22')}
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleMarkRecovered(cart.id)}
                                disabled={markRecoveredMutation.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4 ml-1" />
                                {t('abandonedCartsPagePage.text28')}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tips Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('abandonedCartsPagePage.text16')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="bg-primary/20 text-primary rounded-full p-1 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <p className="text-sm">
              <strong>{t('abandonedCartsPagePage.text17')}</strong> {t('abandonedCartsPagePage.text30')}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className="bg-primary/20 text-primary rounded-full p-1 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <p className="text-sm">
              <strong>{t('abandonedCartsPagePage.text18')}</strong> {t('abandonedCartsPagePage.text31')}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className="bg-primary/20 text-primary rounded-full p-1 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <p className="text-sm">
              <strong>{t('abandonedCartsPagePage.text19')}</strong> {t('abandonedCartsPagePage.text32')}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className="bg-primary/20 text-primary rounded-full p-1 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <p className="text-sm">
              <strong>{t('abandonedCartsPagePage.text20')}</strong> {t('abandonedCartsPagePage.text33')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
