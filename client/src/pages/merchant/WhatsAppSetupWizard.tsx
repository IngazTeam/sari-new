import { useState, useEffect } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Clock, Smartphone, QrCode, Loader2, ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';

import { useTranslation } from 'react-i18next';
export default function WhatsAppSetupWizard() {
  const { t } = useTranslation();

  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [qrCodeDialogOpen, setQrCodeDialogOpen] = useState(false);
  const [currentRequest, setCurrentRequest] = useState<any>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');

  const { data: merchant } = trpc.merchants.getCurrent.useQuery();

  const { data: requests, refetch: refetchRequests } = trpc.whatsappRequests.listMine.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  const createRequestMutation = trpc.whatsappRequests.create.useMutation();
  const { data: qrCode, refetch: refetchQRCode } = trpc.whatsappRequests.getQRCode.useQuery(
    { requestId: currentRequest?.id || 0 },
    { enabled: !!currentRequest && currentRequest.status === 'approved', refetchInterval: false }
  );

  const { data: connectionCheck } = trpc.whatsappRequests.checkConnection.useQuery(
    { requestId: currentRequest?.id || 0 },
    {
      enabled: !!currentRequest && currentRequest.status === 'approved',
      refetchInterval: connectionStatus === 'checking' ? 3000 : false,
    }
  );

  const pendingRequest = requests?.find(r => r.status === 'pending');
  const approvedRequest = requests?.find(r => r.status === 'approved');
  const completedRequest = requests?.find(r => r.status === 'completed');

  useEffect(() => {
    if (connectionCheck?.connected) {
      setConnectionStatus('connected');
      toast.success(t('whatsAppSetupWizardPage.text0'));
      setTimeout(() => {
        navigate('/merchant/whatsapp-instances');
      }, 2000);
    }
  }, [connectionCheck, navigate]);

  useEffect(() => {
    if (qrCode?.qrCodeUrl) {
      setQrCodeUrl(qrCode.qrCodeUrl);
    }
  }, [qrCode]);

  const handleCreateRequest = () => {
    if (!merchant) return;

    createRequestMutation.mutate(
      {
        merchantId: merchant.id,
        phoneNumber,
        businessName: merchant.businessName,
      },
      {
        onSuccess: () => {
          toast.success(t('toast.common.msg6'));
          setPhoneNumber('');
          refetchRequests();
        },
        onError: (error) => {
          toast.error(error.message || t('whatsAppSetupWizardPage.text24'));
        },
      }
    );
  };

  const handleShowQRCode = async (request: any) => {
    setCurrentRequest(request);
    setQrCodeDialogOpen(true);
    setConnectionStatus('idle');
    
    // Fetch QR code
    await refetchQRCode();
  };

  const handleStartChecking = () => {
    setConnectionStatus('checking');
  };

  const handleRefreshQRCode = async () => {
    await refetchQRCode();
    toast.success(t('toast.common.msg7'));
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      pending: { variant: 'secondary', icon: Clock, label: t('whatsAppSetupWizardPage.text33') },
      approved: { variant: 'default', icon: CheckCircle2, label: t('whatsAppSetupWizardPage.text34') },
      rejected: { variant: 'destructive', icon: XCircle, label: t('whatsAppSetupWizardPage.text35') },
      completed: { variant: 'outline', icon: CheckCircle2, label: t('whatsAppSetupWizardPage.text36') },
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  if (!merchant) {
    return (
      <div className="container py-8">
        <div className="text-center">{t('whatsAppSetupWizardPage.text1')}</div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('whatsAppSetupWizardPage.text2')}</h1>
        <p className="text-muted-foreground">{t('whatsAppSetupWizardPage.text3')}</p>
      </div>

      {/* Completed Request */}
      {completedRequest && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <CardTitle className="text-green-900">{t('whatsAppSetupWizardPage.text4')}</CardTitle>
            </div>
            <CardDescription className="text-green-700">
              {t('whatsAppSetupWizardPage.text37', { var0: completedRequest.phoneNumber })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/merchant/whatsapp-instances')}>
              {t('whatsAppSetupWizardPage.text25')}
              <ArrowRight className="mr-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pending Request */}
      {pendingRequest && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <CardTitle className="text-yellow-900">{t('whatsAppSetupWizardPage.text5')}</CardTitle>
            </div>
            <CardDescription className="text-yellow-700">
              {t('whatsAppSetupWizardPage.text26')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                {getStatusBadge(pendingRequest.status)}
              </div>
              <div className="text-sm text-muted-foreground">
                {t('whatsAppSetupWizardPage.text38', { var0: new Date(pendingRequest.createdAt).toLocaleDateString('ar-SA') })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approved Request */}
      {approvedRequest && !completedRequest && (
        <Card className="border-primary/30 bg-primary/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <CardTitle className="text-primary">{t('whatsAppSetupWizardPage.text6')}</CardTitle>
            </div>
            <CardDescription className="text-primary">
              {t('whatsAppSetupWizardPage.text39')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handleShowQRCode(approvedRequest)} size="lg" className="w-full">
              <QrCode className="mr-2 h-5 w-5" />
              {t('whatsAppSetupWizardPage.text40')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* New Request Form */}
      {!pendingRequest && !approvedRequest && !completedRequest && (
        <Card>
          <CardHeader>
            <CardTitle>{t('whatsAppSetupWizardPage.text7')}</CardTitle>
            <CardDescription>
              {t('whatsAppSetupWizardPage.text27')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">{t('whatsAppSetupWizardPage.text8')}</Label>
              <Input
                id="phoneNumber"
                placeholder="+966501234567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>
            <Button
              onClick={handleCreateRequest}
              disabled={createRequestMutation.isPending}
              size="lg"
              className="w-full"
            >
              {createRequestMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('whatsAppSetupWizardPage.text28')}
                </>
              ) : (
                <>
                  <Smartphone className="mr-2 h-4 w-4" />
                  {t('whatsAppSetupWizardPage.text29')}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle>{t('whatsAppSetupWizardPage.text9')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                1
              </span>
              <span>{t('whatsAppSetupWizardPage.text10')}</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                2
              </span>
              <span>{t('whatsAppSetupWizardPage.text11')}</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                3
              </span>
              <span>{t('whatsAppSetupWizardPage.text12')}</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                4
              </span>
              <span>{t('whatsAppSetupWizardPage.text13')}</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                5
              </span>
              <span>{t('whatsAppSetupWizardPage.text14')}</span>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* QR Code Dialog */}
      <Dialog open={qrCodeDialogOpen} onOpenChange={setQrCodeDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('whatsAppSetupWizardPage.text15')}</DialogTitle>
            <DialogDescription>
              {t('whatsAppSetupWizardPage.text30')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* QR Code */}
            {qrCodeUrl ? (
              <div className="flex flex-col items-center gap-4">
                <div className="border-4 border-primary rounded-lg p-4 bg-white">
                  <img
                    src={qrCodeUrl}
                    alt="QR Code"
                    className="w-64 h-64"
                  />
                </div>
                
                {/* Status */}
                {connectionStatus === 'idle' && (
                  <Button onClick={handleStartChecking} size="lg" className="w-full">
                    <Smartphone className="mr-2 h-4 w-4" />
                    {t('whatsAppSetupWizardPage.text31')}
                  </Button>
                )}
                
                {connectionStatus === 'checking' && (
                  <div className="flex items-center gap-2 text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('whatsAppSetupWizardPage.text16')}</span>
                  </div>
                )}
                
                {connectionStatus === 'connected' && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">{t('whatsAppSetupWizardPage.text17')}</span>
                  </div>
                )}
                
                {connectionStatus === 'error' && (
                  <div className="flex items-center gap-2 text-red-600">
                    <XCircle className="h-5 w-5" />
                    <span>{t('whatsAppSetupWizardPage.text18')}</span>
                  </div>
                )}
                
                <Button
                  variant="outline"
                  onClick={handleRefreshQRCode}
                  size="sm"
                >
                  {t('whatsAppSetupWizardPage.text32')}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            
            {/* Instructions */}
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium">{t('whatsAppSetupWizardPage.text19')}</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>{t('whatsAppSetupWizardPage.text20')}</li>
                <li>{t('whatsAppSetupWizardPage.text21')}</li>
                <li>{t('whatsAppSetupWizardPage.text22')}</li>
                <li>{t('whatsAppSetupWizardPage.text23')}</li>
              </ol>
              <p className="text-xs text-yellow-600">
                {t('whatsAppSetupWizardPage.text41')}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
