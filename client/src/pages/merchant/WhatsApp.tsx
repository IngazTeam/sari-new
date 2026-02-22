import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, CheckCircle2, XCircle, Clock, Smartphone, Send, RefreshCcw, QrCode, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';
import { SubscriptionGuard } from '@/components/SubscriptionGuard';

// Popular country codes
const COUNTRY_CODES = [
  { code: '+966', name: t('whatsAppPage.text45'), flag: '🇸🇦' },
  { code: '+971', name: t('whatsAppPage.text46'), flag: '🇦🇪' },
  { code: '+965', name: t('whatsAppPage.text47'), flag: '🇰🇼' },
  { code: '+974', name: t('whatsAppPage.text48'), flag: '🇶🇦' },
  { code: '+973', name: t('whatsAppPage.text49'), flag: '🇧🇭' },
  { code: '+968', name: t('whatsAppPage.text50'), flag: '🇴🇲' },
  { code: '+962', name: t('whatsAppPage.text51'), flag: '🇯🇴' },
  { code: '+20', name: t('whatsAppPage.text52'), flag: '🇪🇬' },
  { code: '+212', name: t('whatsAppPage.text53'), flag: '🇲🇦' },
  { code: '+213', name: t('whatsAppPage.text54'), flag: '🇩🇿' },
];

function WhatsAppConnectionContent() {
  const { t } = useTranslation();

  const [countryCode, setCountryCode] = useState('+966');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Get current request status
  const { data: requestStatus, refetch: refetchRequest } = trpc.whatsapp.getRequestStatus.useQuery();

  // Get connection status
  const { data: connectionStatus, refetch: refetchStatus } = trpc.whatsapp.getStatus.useQuery(undefined, {
    enabled: requestStatus?.status === 'approved' || requestStatus?.status === 'connected',
    refetchInterval: showQRDialog ? 3000 : false, // Poll every 3 seconds when QR dialog is open
  });

  // Initialize form with existing request data
  useEffect(() => {
    if (requestStatus) {
      setCountryCode(requestStatus.countryCode);
      setPhoneNumber(requestStatus.phoneNumber);
    }
  }, [requestStatus]);

  // Check if connected and close dialog
  useEffect(() => {
    if (connectionStatus?.connected && showQRDialog) {
      setShowQRDialog(false);
      setQrCode(null);
      toast.success(t('whatsAppPage.text0'));
      refetchRequest();
    }
  }, [connectionStatus?.connected, showQRDialog, refetchRequest]);

  // Request connection mutation
  const requestConnectionMutation = trpc.whatsapp.requestConnection.useMutation({
    onSuccess: () => {
      toast.success(t('toast.common.msg2'));
      refetchRequest();
      setPhoneNumber('');
    },
    onError: (error) => {
      toast.error(error.message || t('whatsAppPage.text25'));
    },
  });

  // Get QR Code mutation
  const getQRCodeMutation = trpc.whatsapp.getQRCode.useMutation({
    onSuccess: (data) => {
      if (data.alreadyConnected) {
        toast.success(t('whatsAppPage.text1'));
        refetchRequest();
        refetchStatus();
      } else if (data.qrCode) {
        setQrCode(data.qrCode);
        setShowQRDialog(true);
      }
    },
    onError: (error) => {
      toast.error(error.message || t('whatsAppPage.text26'));
    },
  });

  // Disconnect mutation
  const disconnectMutation = trpc.whatsapp.disconnect.useMutation({
    onSuccess: () => {
      toast.success(t('whatsAppPage.text2'));
      refetchRequest();
      setPhoneNumber('');
      setCountryCode('+966');
      setQrCode(null);
    },
    onError: (error) => {
      toast.error(error.message || t('whatsAppPage.text27'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!phoneNumber.trim()) {
      toast.error(t('toast.common.msg4'));
      return;
    }

    // Validate phone number (basic validation)
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanNumber.length < 8 || cleanNumber.length > 15) {
      toast.error(t('toast.common.msg5'));
      return;
    }

    requestConnectionMutation.mutate({
      countryCode,
      phoneNumber: cleanNumber,
    });
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate();
  };

  const handleGetQRCode = () => {
    getQRCodeMutation.mutate();
  };

  const handleRefreshQRCode = () => {
    getQRCodeMutation.mutate();
  };

  const handleCheckStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    await refetchStatus();
    setIsCheckingStatus(false);
  }, [refetchStatus]);

  const getStatusBadge = () => {
    if (!requestStatus) return null;

    // If connected, show connected status
    if (requestStatus.status === 'connected' || connectionStatus?.connected) {
      return (
        <Alert className="border-green-500 bg-green-50">
          <Wifi className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <div className="font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {t('whatsAppPage.text28')}
            </div>
            <div className="text-sm mt-1">
              {t('whatsAppPage.text29')}
            </div>
            <div className="text-sm mt-2 font-mono">
              {t('whatsAppPage.text55', { var0: requestStatus.fullNumber })}
            </div>
            {connectionStatus?.phoneNumber && (
              <div className="text-sm mt-1 font-mono text-green-700">
                {t('whatsAppPage.text56', { var0: connectionStatus.phoneNumber })}
              </div>
            )}
          </AlertDescription>
        </Alert>
      );
    }

    switch (requestStatus.status) {
      case 'pending':
        return (
          <Alert className="border-yellow-500 bg-yellow-50">
            <Clock className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              <div className="font-semibold">{t('whatsAppPage.text3')}</div>
              <div className="text-sm mt-1">
                {t('whatsAppPage.text30')}
              </div>
              <div className="text-sm mt-2 font-mono">
                {t('whatsAppPage.text57', { var0: requestStatus.fullNumber })}
              </div>
            </AlertDescription>
          </Alert>
        );
      case 'approved':
        return (
          <Alert className="border-blue-500 bg-blue-50">
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <div className="font-semibold">{t('whatsAppPage.text4')}</div>
              <div className="text-sm mt-1">
                {t('whatsAppPage.text58')}
              </div>
              <div className="text-sm mt-2 font-mono">
                {t('whatsAppPage.text59', { var0: requestStatus.fullNumber })}
              </div>
            </AlertDescription>
          </Alert>
        );
      case 'rejected':
        return (
          <Alert className="border-red-500 bg-red-50">
            <XCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <div className="font-semibold">{t('whatsAppPage.text5')}</div>
              <div className="text-sm mt-1">
                {requestStatus.rejectionReason || 'تم رفض طلب الربط'}
              </div>
              <div className="text-sm mt-2 text-muted-foreground">
                {t('whatsAppPage.text31')}
              </div>
            </AlertDescription>
          </Alert>
        );
    }
  };

  const canSubmitNewRequest = !requestStatus || requestStatus.status === 'rejected';
  const canDisconnect = requestStatus && (requestStatus.status === 'pending' || requestStatus.status === 'approved' || requestStatus.status === 'connected');
  const canConnectWhatsApp = requestStatus?.status === 'approved' && !connectionStatus?.connected;
  const isConnected = requestStatus?.status === 'connected' || connectionStatus?.connected;

  return (
    <div className="container py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Smartphone className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">{t('whatsAppPage.text6')}</h1>
            <p className="text-muted-foreground">
              {t('whatsAppPage.text32')}
            </p>
          </div>
        </div>

        {/* Current Status */}
        {requestStatus && (
          <div className="space-y-4">
            {getStatusBadge()}
            
            {/* Connect WhatsApp Button - Only show when approved but not connected */}
            {canConnectWhatsApp && (
              <Button
                onClick={handleGetQRCode}
                className="w-full bg-green-600 hover:bg-green-700"
                size="lg"
                disabled={getQRCodeMutation.isPending}
              >
                {getQRCodeMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                    {t('whatsAppPage.text60')}
                  </>
                ) : (
                  <>
                    <QrCode className="w-5 h-5 ml-2" />
                    {t('whatsAppPage.text33')}
                  </>
                )}
              </Button>
            )}

            {/* Check Status Button - Show when connected */}
            {isConnected && (
              <Button
                onClick={handleCheckStatus}
                variant="outline"
                className="w-full"
                disabled={isCheckingStatus}
              >
                {isCheckingStatus ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    {t('whatsAppPage.text34')}
                  </>
                ) : (
                  <>
                    <RefreshCcw className="w-4 h-4 ml-2" />
                    {t('whatsAppPage.text35')}
                  </>
                )}
              </Button>
            )}
            
            {/* Disconnect Button */}
            {canDisconnect && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                        {t('whatsAppPage.text36')}
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-4 h-4 ml-2" />
                        {t('whatsAppPage.text37')}
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('whatsAppPage.text7')}</AlertDialogTitle>
                    <AlertDialogDescription className="text-right">
                      <div className="space-y-2">
                        <p>{t('whatsAppPage.text8')}</p>
                        <p className="font-mono text-sm bg-muted p-2 rounded">
                          {requestStatus.fullNumber}
                        </p>
                        <p className="text-red-600">
                          {t('whatsAppPage.text38')}
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-row-reverse gap-2">
                    <AlertDialogCancel>{t('whatsAppPage.text9')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDisconnect}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {t('whatsAppPage.text39')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}

        {/* Connection Request Form */}
        <Card>
          <CardHeader>
            <CardTitle>{t('whatsAppPage.text10')}</CardTitle>
            <CardDescription>
              {t('whatsAppPage.text40')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="country-code">{t('whatsAppPage.text11')}</Label>
                <Select
                  value={countryCode}
                  onValueChange={setCountryCode}
                  disabled={!canSubmitNewRequest}
                >
                  <SelectTrigger id="country-code">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        <span className="flex items-center gap-2">
                          <span>{country.flag}</span>
                          <span>{country.name}</span>
                          <span className="text-muted-foreground">({country.code})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone-number">{t('whatsAppPage.text12')}</Label>
                <div className="flex gap-2">
                  <div className="w-24 flex items-center justify-center border rounded-md bg-muted px-3 font-mono">
                    {countryCode}
                  </div>
                  <Input
                    id="phone-number"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="5XXXXXXXX"
                    disabled={!canSubmitNewRequest}
                    dir="ltr"
                    className="flex-1 font-mono"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('whatsAppPage.text41')}
                </p>
              </div>

              {canSubmitNewRequest && (
                <Button
                  type="submit"
                  className="w-full"
                  disabled={requestConnectionMutation.isPending}
                >
                  {requestConnectionMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                      {t('whatsAppPage.text42')}
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 ml-2" />
                      {t('whatsAppPage.text43')}
                    </>
                  )}
                </Button>
              )}

              {requestStatus?.status === 'pending' && (
                <Alert>
                  <AlertDescription className="text-sm">
                    {t('whatsAppPage.text44')}
                  </AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>{t('whatsAppPage.text13')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{t('whatsAppPage.text14')}</p>
            <p>{t('whatsAppPage.text15')}</p>
            <p>{t('whatsAppPage.text16')}</p>
            <p>{t('whatsAppPage.text17')}</p>
            <p>{t('whatsAppPage.text18')}</p>
            <p>{t('whatsAppPage.text19')}</p>
          </CardContent>
        </Card>

        {/* QR Code Dialog */}
        <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center">{t('whatsAppPage.text20')}</DialogTitle>
              <DialogDescription className="text-center">
                {t('whatsAppPage.text61')}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center space-y-4 py-4">
              {qrCode ? (
                <div className="bg-white p-4 rounded-lg shadow-inner">
                  <img
                    src={`data:image/png;base64,${qrCode}`}
                    alt="WhatsApp QR Code"
                    className="w-64 h-64"
                  />
                </div>
              ) : (
                <div className="w-64 h-64 bg-muted rounded-lg flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              )}
              
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t('whatsAppPage.text62')}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshQRCode}
                  disabled={getQRCodeMutation.isPending}
                >
                  {getQRCodeMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCcw className="w-4 h-4 ml-2" />
                      {t('whatsAppPage.text63')}
                    </>
                  )}
                </Button>
              </div>

              {/* Connection Status Indicator */}
              <div className="flex items-center gap-2 text-sm">
                {connectionStatus?.connected ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-green-600">{t('whatsAppPage.text21')}</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span className="text-blue-600">{t('whatsAppPage.text22')}</span>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default function WhatsAppConnection() {
  return (
    <SubscriptionGuard 
      feature={t('whatsAppPage.text23')}
      fallbackMessage={t('whatsAppPage.text24')}
    >
      <WhatsAppConnectionContent />
    </SubscriptionGuard>
  );
}
