import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocation, useParams } from 'wouter';
import { ArrowRight, CheckCircle2, XCircle, Clock, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function CampaignReport() {
  const { t } = useTranslation();
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
          <p className="text-muted-foreground">{t('campaignReportPage.text0')}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('campaignReportPage.text1')}</p>
        <Button onClick={() => setLocation('/merchant/campaigns')} className="mt-4">
          {t('campaignReportPage.text21')}
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
      log.status === 'success' ? 'نجح' : log.status === 'failed' ? t('campaignReportPage.text17') : t('campaignReportPage.text18'),
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
            {t('campaignReportPage.text22')}
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{campaign.name}</h1>
            <p className="text-muted-foreground mt-1">
              {t('campaignReportPage.text23')}
            </p>
          </div>
        </div>
        <Button onClick={exportToCSV} variant="outline">
          <Download className="w-4 h-4 ml-2" />
          {t('campaignReportPage.text32')}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('campaignReportPage.text24')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('campaignReportPage.text25')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.success}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('campaignReportPage.text26')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats.failed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('campaignReportPage.text27')}
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
          <CardTitle>{t('campaignReportPage.text2')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{t('campaignReportPage.text3')}</p>
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
                  ? t('campaignReportPage.text33')
                  : campaign.status === 'failed'
                  ? t('campaignReportPage.text34')
                  : campaign.status === 'sending'
                  ? t('campaignReportPage.text35')
                  : campaign.status === 'scheduled'
                  ? t('campaignReportPage.text19') : t('campaignReportPage.text20')}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('campaignReportPage.text4')}</p>
              <p className="font-medium">
                {new Date(campaign.createdAt).toLocaleDateString('ar-SA')}
              </p>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">{t('campaignReportPage.text5')}</p>
            <div className="bg-gray-50 rounded-lg p-4 border">
              <p className="whitespace-pre-wrap">{campaign.message}</p>
            </div>
          </div>
          {campaign.imageUrl && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">{t('campaignReportPage.text6')}</p>
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
          <CardTitle>{t('campaignReportPage.text7')}</CardTitle>
          <CardDescription>
            {t('campaignReportPage.text28')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('campaignReportPage.text29')}
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t('campaignReportPage.text8')}</TableHead>
                    <TableHead className="text-right">{t('campaignReportPage.text9')}</TableHead>
                    <TableHead className="text-right">{t('campaignReportPage.text10')}</TableHead>
                    <TableHead className="text-right">{t('campaignReportPage.text11')}</TableHead>
                    <TableHead className="text-right">{t('campaignReportPage.text12')}</TableHead>
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
                              <span className="text-green-600">{t('campaignReportPage.text13')}</span>
                            </>
                          ) : log.status === 'failed' ? (
                            <>
                              <XCircle className="w-4 h-4 text-red-600" />
                              <span className="text-red-600">{t('campaignReportPage.text14')}</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-4 h-4 text-yellow-600" />
                              <span className="text-yellow-600">{t('campaignReportPage.text15')}</span>
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
            <CardTitle className="text-red-800">{t('campaignReportPage.text16')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-700">
              {t('campaignReportPage.text36', { var0: stats.failed, var1: stats.total })}
              {t('campaignReportPage.text30')}
            </p>
            <p className="text-sm text-red-600 mt-2">
              {t('campaignReportPage.text31')}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
