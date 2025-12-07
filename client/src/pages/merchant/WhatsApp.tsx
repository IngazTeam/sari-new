import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, Clock, Smartphone, Send } from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';
// Popular country codes
const COUNTRY_CODES = [
  { code: '+966', name: 'السعودية', flag: '🇸🇦' },
  { code: '+971', name: 'الإمارات', flag: '🇦🇪' },
  { code: '+965', name: 'الكويت', flag: '🇰🇼' },
  { code: '+974', name: 'قطر', flag: '🇶🇦' },
  { code: '+973', name: 'البحرين', flag: '🇧🇭' },
  { code: '+968', name: 'عمان', flag: '🇴🇲' },
  { code: '+962', name: 'الأردن', flag: '🇯🇴' },
  { code: '+20', name: 'مصر', flag: '🇪🇬' },
  { code: '+212', name: 'المغرب', flag: '🇲🇦' },
  { code: '+213', name: 'الجزائر', flag: '🇩🇿' },
];

export default function WhatsAppConnection() {
  const { t } = useTranslation();

  const [countryCode, setCountryCode] = useState('+966');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Get current request status
  const { data: requestStatus, refetch: refetchRequest } = trpc.whatsapp.getRequestStatus.useQuery();

  // Initialize form with existing request data
  useEffect(() => {
    if (requestStatus) {
      setCountryCode(requestStatus.countryCode);
      setPhoneNumber(requestStatus.phoneNumber);
    }
  }, [requestStatus]);

  // Request connection mutation
  const requestConnectionMutation = trpc.whatsapp.requestConnection.useMutation({
    onSuccess: () => {
      toast.success(t('toast.common.msg2'));
      refetchRequest();
      setPhoneNumber('');
    },
    onError: (error) => {
      toast.error(error.message || 'فشل إرسال الطلب');
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

  const getStatusBadge = () => {
    if (!requestStatus) return null;

    switch (requestStatus.status) {
      case 'pending':
        return (
          <Alert className="border-yellow-500 bg-yellow-50">
            <Clock className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              <div className="font-semibold">قيد المراجعة</div>
              <div className="text-sm mt-1">
                طلبك قيد المراجعة من قبل المدير. سيتم إشعارك بالنتيجة قريباً.
              </div>
              <div className="text-sm mt-2 font-mono">
                الرقم المطلوب: {requestStatus.fullNumber}
              </div>
            </AlertDescription>
          </Alert>
        );
      case 'approved':
        return (
          <Alert className="border-green-500 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <div className="font-semibold">تمت الموافقة!</div>
              <div className="text-sm mt-1">
                تم قبول طلب الربط. يمكنك الآن استخدام رقم الواتساب.
              </div>
              <div className="text-sm mt-2 font-mono">
                الرقم المربوط: {requestStatus.fullNumber}
              </div>
            </AlertDescription>
          </Alert>
        );
      case 'rejected':
        return (
          <Alert className="border-red-500 bg-red-50">
            <XCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <div className="font-semibold">تم الرفض</div>
              <div className="text-sm mt-1">
                {requestStatus.rejectionReason || 'تم رفض طلب الربط'}
              </div>
              <div className="text-sm mt-2 text-muted-foreground">
                يمكنك تقديم طلب جديد برقم مختلف
              </div>
            </AlertDescription>
          </Alert>
        );
    }
  };

  const canSubmitNewRequest = !requestStatus || requestStatus.status === 'rejected';

  return (
    <div className="container py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Smartphone className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">ربط الواتساب</h1>
            <p className="text-muted-foreground">
              قم بربط رقم الواتساب الخاص بمتجرك لبدء استقبال الرسائل
            </p>
          </div>
        </div>

        {/* Current Status */}
        {requestStatus && (
          <div className="space-y-4">
            {getStatusBadge()}
          </div>
        )}

        {/* Connection Request Form */}
        <Card>
          <CardHeader>
            <CardTitle>طلب ربط رقم واتساب</CardTitle>
            <CardDescription>
              أدخل رقم الواتساب الذي تريد ربطه بمتجرك
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="country-code">مفتاح الدولة</Label>
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
                <Label htmlFor="phone-number">رقم الهاتف</Label>
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
                  أدخل رقم الهاتف بدون مفتاح الدولة (مثال: 501234567)
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
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 ml-2" />
                      إرسال طلب الربط
                    </>
                  )}
                </Button>
              )}

              {requestStatus?.status === 'pending' && (
                <Alert>
                  <AlertDescription className="text-sm">
                    لديك طلب قيد المراجعة حالياً. سيتم إشعارك عند معالجة الطلب.
                  </AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>معلومات مهمة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• يجب أن يكون رقم الواتساب نشطاً ومتاحاً للربط</p>
            <p>• سيتم مراجعة طلبك من قبل المدير قبل الموافقة</p>
            <p>• ستتلقى إشعاراً عند معالجة طلبك</p>
            <p>• في حال الرفض، يمكنك تقديم طلب جديد برقم مختلف</p>
            <p>• بعد الموافقة، سيتم الرد التلقائي على جميع الرسائل الواردة</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
