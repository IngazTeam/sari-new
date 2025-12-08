import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocation, useParams } from 'wouter';
import { ArrowRight, CheckCircle2, XCircle, Clock, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function CampaignReport() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const campaignId = parseInt(params.id || '0');

  const { data, isLoading } = trpc.campaigns.getReport.useQuery(
    { id: campaignId },
    { enabled: campaignId > 0 }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري تحميل التقرير...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">لم يتم العثور على الحملة</p>
        <Button onClick={() => setLocation('/merchant/campaigns')} className="mt-4">
          العودة للحملات
        </Button>
      </div>
    );
  }

  const { campaign, logs, stats } = data;

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['رقم الهاتف', 'اسم العميل', 'الحالة', 'رسالة الخطأ', 'وقت الإرسال'];
    const rows = logs.map(log => [
      log.customerPhone,
      log.customerName || '-',
      log.status === 'success' ? 'نجح' : log.status === 'failed' ? 'فشل' : 'قيد الإرسال',
      log.errorMessage || '-',
      new Date(log.sentAt).toLocaleString('ar-SA')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `campaign_${campaign.id}_report.csv`;
    link.click();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/merchant/campaigns')}
          >
            <ArrowRight className="w-4 h-4 ml-2" />
            رجوع
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{campaign.name}</h1>
            <p className="text-muted-foreground mt-1">
              تقرير تفصيلي لنتائج الحملة
            </p>
          </div>
        </div>
        <Button onClick={exportToCSV} variant="outline">
          <Download className="w-4 h-4 ml-2" />
          تصدير CSV
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              إجمالي الرسائل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              نجح الإرسال
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.success}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              فشل الإرسال
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats.failed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              نسبة النجاح
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.successRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Info */}
      <Card>
        <CardHeader>
          <CardTitle>معلومات الحملة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">الحالة</p>
              <Badge
                variant={
                  campaign.status === 'completed'
                    ? 'default'
                    : campaign.status === 'failed'
                    ? 'destructive'
                    : campaign.status === 'sending'
                    ? 'secondary'
                    : 'outline'
                }
              >
                {campaign.status === 'completed'
                  ? 'مكتملة'
                  : campaign.status === 'failed'
                  ? 'فشلت'
                  : campaign.status === 'sending'
                  ? 'جاري الإرسال'
                  : campaign.status === 'scheduled'
                  ? 'مجدولة'
                  : 'مسودة'}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">تاريخ الإنشاء</p>
              <p className="font-medium">
                {new Date(campaign.createdAt).toLocaleDateString('ar-SA')}
              </p>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">نص الرسالة</p>
            <div className="bg-gray-50 rounded-lg p-4 border">
              <p className="whitespace-pre-wrap">{campaign.message}</p>
            </div>
          </div>
          {campaign.imageUrl && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">الصورة المرفقة</p>
              <img
                src={campaign.imageUrl}
                alt="Campaign"
                className="max-w-xs rounded-lg border"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>سجل الإرسال التفصيلي</CardTitle>
          <CardDescription>
            قائمة بجميع العملاء الذين تم إرسال الحملة لهم
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد سجلات إرسال بعد
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم الهاتف</TableHead>
                    <TableHead className="text-right">اسم العميل</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">رسالة الخطأ</TableHead>
                    <TableHead className="text-right">وقت الإرسال</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono">{log.customerPhone}</TableCell>
                      <TableCell>{log.customerName || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {log.status === 'success' ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                              <span className="text-green-600">نجح</span>
                            </>
                          ) : log.status === 'failed' ? (
                            <>
                              <XCircle className="w-4 h-4 text-red-600" />
                              <span className="text-red-600">فشل</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-4 h-4 text-yellow-600" />
                              <span className="text-yellow-600">قيد الإرسال</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {log.errorMessage ? (
                          <span className="text-red-600 text-sm">{log.errorMessage}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(log.sentAt).toLocaleString('ar-SA')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {stats.failed > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800">ملخص الأخطاء</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">
              فشل إرسال {stats.failed} رسالة من أصل {stats.total}. 
              يرجى مراجعة سجل الأخطاء أعلاه لمعرفة الأسباب.
            </p>
            <p className="text-sm text-red-600 mt-2">
              الأسباب الشائعة: رقم غير صحيح، رقم محظور، مشكلة في الاتصال بالواتساب
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
