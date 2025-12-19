import { useParams, useLocation, Link } from 'wouter';
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  Download, 
  Printer, 
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  FileJson,
  Receipt
} from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

export default function PaymentDetails() {
  const params = useParams();
  const [, navigate] = useLocation();
  const paymentId = parseInt(params.id || '0');

  const { data: payment, isLoading } = trpc.payments.getById.useQuery({ id: paymentId });

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

  if (!payment) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="py-8 text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">المعاملة غير موجودة</h2>
            <p className="text-muted-foreground mb-4">لم يتم العثور على المعاملة المطلوبة</p>
            <Button onClick={() => navigate('/merchant/payments')}>
              <ArrowLeft className="ml-2 h-4 w-4" />
              العودة للمعاملات
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      pending: { label: 'قيد الانتظار', variant: 'outline' },
      authorized: { label: 'مصرح', variant: 'secondary' },
      captured: { label: 'مكتمل', variant: 'default' },
      failed: { label: 'فاشل', variant: 'destructive' },
      cancelled: { label: 'ملغي', variant: 'outline' },
      refunded: { label: 'مسترجع', variant: 'secondary' },
    };

    const config = statusConfig[status] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'captured':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'refunded':
        return <RefreshCw className="h-5 w-5 text-blue-600" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    // سيتم تنفيذها لاحقاً
    alert('سيتم إضافة تصدير PDF قريباً');
  };

  const handleDownloadJSON = () => {
    const dataStr = JSON.stringify(payment, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payment-${payment.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSendViaWhatsApp = async () => {
    // سيتم تنفيذها لاحقاً
    alert('سيتم إضافة إرسال عبر واتساب قريباً');
  };

  return (
    <div className="container py-8 print:py-4">
      {/* Header - Hidden on print */}
      <div className="mb-6 print:hidden">
        <Button variant="ghost" onClick={() => navigate('/merchant/payments')}>
          <ArrowLeft className="ml-2 h-4 w-4" />
          العودة للمعاملات
        </Button>
      </div>

      {/* Actions Bar - Hidden on print */}
      <div className="flex flex-wrap gap-2 mb-6 print:hidden">
        <Button onClick={handlePrint} variant="outline">
          <Printer className="ml-2 h-4 w-4" />
          طباعة
        </Button>
        <Button onClick={handleDownloadPDF} variant="outline">
          <Download className="ml-2 h-4 w-4" />
          تصدير PDF
        </Button>
        <Button onClick={handleDownloadJSON} variant="outline">
          <FileJson className="ml-2 h-4 w-4" />
          تصدير JSON
        </Button>
        <Button onClick={handleSendViaWhatsApp} variant="outline">
          <MessageSquare className="ml-2 h-4 w-4" />
          إرسال عبر واتساب
        </Button>
      </div>

      {/* Payment Details */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Receipt className="h-6 w-6" />
                تفاصيل المعاملة #{payment.id}
              </CardTitle>
              <CardDescription>
                {payment.createdAt && format(new Date(payment.createdAt), 'dd MMMM yyyy - hh:mm a', { locale: ar })}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(payment.status)}
              {getStatusBadge(payment.status)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Amount Section */}
          <div className="bg-muted/50 rounded-lg p-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">المبلغ الإجمالي</p>
            <p className="text-4xl font-bold text-primary">
              {payment.amount.toFixed(2)} {payment.currency}
            </p>
          </div>

          <Separator />

          {/* Customer Information */}
          <div>
            <h3 className="font-semibold text-lg mb-4">معلومات العميل</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">الاسم</p>
                <p className="font-medium">{payment.customerName || 'غير محدد'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">رقم الجوال</p>
                <p className="font-medium" dir="ltr">{payment.customerPhone}</p>
              </div>
              {payment.customerEmail && (
                <div>
                  <p className="text-sm text-muted-foreground">البريد الإلكتروني</p>
                  <p className="font-medium">{payment.customerEmail}</p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Payment Information */}
          <div>
            <h3 className="font-semibold text-lg mb-4">معلومات الدفع</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">معرف المعاملة</p>
                <p className="font-medium font-mono text-sm">{payment.tapChargeId || 'غير متوفر'}</p>
              </div>
              {payment.paymentMethod && (
                <div>
                  <p className="text-sm text-muted-foreground">طريقة الدفع</p>
                  <p className="font-medium">{payment.paymentMethod}</p>
                </div>
              )}
              {payment.description && (
                <div className="md:col-span-2">
                  <p className="text-sm text-muted-foreground">الوصف</p>
                  <p className="font-medium">{payment.description}</p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Timeline */}
          <div>
            <h3 className="font-semibold text-lg mb-4">سجل التحديثات</h3>
            <div className="space-y-3">
              {payment.createdAt && (
                <div className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground mt-2"></div>
                  <div>
                    <p className="font-medium">تم إنشاء المعاملة</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(payment.createdAt), 'dd MMMM yyyy - hh:mm a', { locale: ar })}
                    </p>
                  </div>
                </div>
              )}
              
              {payment.authorizedAt && (
                <div className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-blue-600 mt-2"></div>
                  <div>
                    <p className="font-medium">تم التصريح بالدفع</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(payment.authorizedAt), 'dd MMMM yyyy - hh:mm a', { locale: ar })}
                    </p>
                  </div>
                </div>
              )}
              
              {payment.capturedAt && (
                <div className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-green-600 mt-2"></div>
                  <div>
                    <p className="font-medium">تم إتمام الدفع بنجاح</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(payment.capturedAt), 'dd MMMM yyyy - hh:mm a', { locale: ar })}
                    </p>
                  </div>
                </div>
              )}
              
              {payment.failedAt && (
                <div className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-destructive mt-2"></div>
                  <div>
                    <p className="font-medium">فشلت المعاملة</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(payment.failedAt), 'dd MMMM yyyy - hh:mm a', { locale: ar })}
                    </p>
                    {payment.errorMessage && (
                      <p className="text-sm text-destructive mt-1">السبب: {payment.errorMessage}</p>
                    )}
                  </div>
                </div>
              )}
              
              {payment.refundedAt && (
                <div className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-blue-600 mt-2"></div>
                  <div>
                    <p className="font-medium">تم استرجاع المبلغ</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(payment.refundedAt), 'dd MMMM yyyy - hh:mm a', { locale: ar })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Related Order/Booking */}
          {(payment.orderId || payment.bookingId) && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold text-lg mb-4">معلومات إضافية</h3>
                <div className="space-y-2">
                  {payment.orderId && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">رقم الطلب</span>
                      <Link href={`/merchant/orders/${payment.orderId}`}>
                        <Button variant="link" className="h-auto p-0">
                          #{payment.orderId}
                        </Button>
                      </Link>
                    </div>
                  )}
                  {payment.bookingId && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">رقم الحجز</span>
                      <Link href={`/merchant/bookings/${payment.bookingId}`}>
                        <Button variant="link" className="h-auto p-0">
                          #{payment.bookingId}
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Print Footer */}
      <div className="hidden print:block text-center text-sm text-muted-foreground mt-8">
        <p>تم الطباعة في {format(new Date(), 'dd MMMM yyyy - hh:mm a', { locale: ar })}</p>
        <p className="mt-2">نظام ساري - إدارة المبيعات عبر واتساب</p>
      </div>
    </div>
  );
}
