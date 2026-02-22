import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, Package, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';

export default function ZidProducts() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Get Zid status
  const { data: status, isLoading: statusLoading } = trpc.zid.getStatus.useQuery();

  // Sync products mutation
  const syncProductsMutation = trpc.zid.syncProducts.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'نجحت المزامنة',
        description: data.message,
      });
    },
    onError: (error) => {
      toast({
        title: 'فشلت المزامنة',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSync = () => {
    syncProductsMutation.mutate();
  };

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="container mx-auto py-16">
        <div className="max-w-md mx-auto">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              يجب ربط حسابك على Zid أولاً قبل مزامنة المنتجات
            </AlertDescription>
          </Alert>
          <Button
            onClick={() => navigate('/merchant/zid/settings')}
            className="w-full mt-4"
          >
            الذهاب إلى الإعدادات
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('zidProductsPage.text0')}</h1>
        <p className="text-muted-foreground mt-2">
          مزامنة المنتجات من متجرك على زد إلى ساري
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            مزامنة المنتجات
          </CardTitle>
          <CardDescription>
            سيتم جلب جميع المنتجات من متجرك على زد ومزامنتها مع ساري
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.lastProductSync && (
            <div>
              <p className="text-sm text-muted-foreground">
                آخر مزامنة: {new Date(status.lastProductSync).toLocaleString('ar-SA')}
              </p>
            </div>
          )}

          <Button
            onClick={handleSync}
            disabled={syncProductsMutation.isPending}
            className="w-full"
            size="lg"
          >
            {syncProductsMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                جاري المزامنة...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 ml-2" />
                بدء المزامنة
              </>
            )}
          </Button>

          {syncProductsMutation.isSuccess && (
            <Alert>
              <AlertDescription>
                تمت مزامنة {syncProductsMutation.data.productsCount} منتج بنجاح
              </AlertDescription>
            </Alert>
          )}

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-2">{t('zidProductsPage.text1')}</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>{t('zidProductsPage.text2')}</li>
              <li>{t('zidProductsPage.text3')}</li>
              <li>{t('zidProductsPage.text4')}</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
