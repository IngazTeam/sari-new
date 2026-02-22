import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Gift, TrendingUp, Send, Clock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import { useTranslation } from 'react-i18next';
// Occasion names in Arabic
const OCCASION_NAMES: Record<string, string> = {
  ramadan: t('occasionCampaignsPagePage.text39'),
  eid_fitr: t('occasionCampaignsPagePage.text40'),
  eid_adha: t('occasionCampaignsPagePage.text41'),
  national_day: t('occasionCampaignsPagePage.text42'),
  new_year: t('occasionCampaignsPagePage.text43'),
  hijri_new_year: t('occasionCampaignsPagePage.text44'),
};

// Occasion emojis
const OCCASION_EMOJIS: Record<string, string> = {
  ramadan: '🌙',
  eid_fitr: '🎉',
  eid_adha: '🐑',
  national_day: '🇸🇦',
  new_year: '🎊',
  hijri_new_year: '🌟',
};

export default function OccasionCampaignsPage() {
  const { t } = useTranslation();

  const { user } = useAuth();

  // Get merchant
  const { data: merchant } = trpc.merchants.getCurrent.useQuery();

  // Get occasion campaigns
  const { data: campaigns = [], refetch: refetchCampaigns } = trpc.occasionCampaigns.list.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Get statistics
  const { data: stats } = trpc.occasionCampaigns.getStats.useQuery(
    { merchantId: merchant?.id || 0 },
    { enabled: !!merchant }
  );

  // Get upcoming occasions
  const { data: upcomingOccasions = [] } = trpc.occasionCampaigns.getUpcoming.useQuery();

  // Toggle mutation
  const toggleMutation = trpc.occasionCampaigns.toggle.useMutation({
    onSuccess: () => {
      toast.success(t('toast.common.msg1'));
      refetchCampaigns();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleToggle = (campaignId: number, enabled: boolean) => {
    toggleMutation.mutate({ campaignId, enabled });
  };

  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle2 className="h-3 w-3 ml-1" />
            {t('occasionCampaignsPagePage.text29')}
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 ml-1" />
            {t('occasionCampaignsPagePage.text30')}
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            {t('occasionCampaignsPagePage.text31')}
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('occasionCampaignsPagePage.text0')}</h1>
        <p className="text-muted-foreground">
          {t('occasionCampaignsPagePage.text32')}
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('occasionCampaignsPagePage.text1')}</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCampaigns || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('occasionCampaignsPagePage.text2')}</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.sentCampaigns || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('occasionCampaignsPagePage.text3')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalRecipients || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Occasions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('occasionCampaignsPagePage.text33')}
          </CardTitle>
          <CardDescription>
            {t('occasionCampaignsPagePage.text34')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingOccasions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('occasionCampaignsPagePage.text4')}</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingOccasions.map((occasion) => (
                <Card key={occasion.type} className="border-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <span className="text-2xl">{OCCASION_EMOJIS[occasion.type]}</span>
                      {occasion.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('occasionCampaignsPagePage.text5')}</span>
                        <span className="font-medium">{formatDate(new Date(occasion.date))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('occasionCampaignsPagePage.text6')}</span>
                        <Badge variant="outline">{occasion.daysUntil} يوم</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaigns History */}
      <Card>
        <CardHeader>
          <CardTitle>{t('occasionCampaignsPagePage.text8')}</CardTitle>
          <CardDescription>
            {t('occasionCampaignsPagePage.text35')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Gift className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('occasionCampaignsPagePage.text9')}</p>
              <p className="text-sm mt-2">{t('occasionCampaignsPagePage.text10')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('occasionCampaignsPagePage.text11')}</TableHead>
                  <TableHead>{t('occasionCampaignsPagePage.text12')}</TableHead>
                  <TableHead>{t('occasionCampaignsPagePage.text13')}</TableHead>
                  <TableHead>{t('occasionCampaignsPagePage.text14')}</TableHead>
                  <TableHead>{t('occasionCampaignsPagePage.text15')}</TableHead>
                  <TableHead>{t('occasionCampaignsPagePage.text16')}</TableHead>
                  <TableHead>{t('occasionCampaignsPagePage.text17')}</TableHead>
                  <TableHead>{t('occasionCampaignsPagePage.text18')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{OCCASION_EMOJIS[campaign.occasionType]}</span>
                        {OCCASION_NAMES[campaign.occasionType]}
                      </div>
                    </TableCell>
                    <TableCell>{campaign.year}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{campaign.discountPercentage}%</Badge>
                    </TableCell>
                    <TableCell>
                      {campaign.discountCode ? (
                        <code className="bg-muted px-2 py-1 rounded text-sm">
                          {campaign.discountCode}
                        </code>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{campaign.recipientCount}</TableCell>
                    <TableCell className="text-sm">{formatDate(campaign.sentAt)}</TableCell>
                    <TableCell>{getStatusBadge(campaign.status)}</TableCell>
                    <TableCell>
                      <Switch
                        checked={campaign.enabled}
                        onCheckedChange={(checked) => handleToggle(campaign.id, checked)}
                        disabled={campaign.status === 'sent' || toggleMutation.isPending}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* How It Works Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('occasionCampaignsPagePage.text19')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="bg-primary/20 text-primary rounded-full p-2 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium">{t('occasionCampaignsPagePage.text20')}</p>
              <p className="text-sm text-muted-foreground">
                {t('occasionCampaignsPagePage.text36')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-primary/20 text-primary rounded-full p-2 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium">{t('occasionCampaignsPagePage.text21')}</p>
              <p className="text-sm text-muted-foreground">
                {t('occasionCampaignsPagePage.text45')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-primary/20 text-primary rounded-full p-2 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium">{t('occasionCampaignsPagePage.text22')}</p>
              <p className="text-sm text-muted-foreground">
                {t('occasionCampaignsPagePage.text37')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-primary/20 text-primary rounded-full p-2 mt-0.5">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium">{t('occasionCampaignsPagePage.text23')}</p>
              <p className="text-sm text-muted-foreground">
                {t('occasionCampaignsPagePage.text38')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tips Section */}
      <Card className="border-primary/30 bg-primary/10/50">
        <CardHeader>
          <CardTitle className="text-primary">{t('occasionCampaignsPagePage.text24')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-primary">
          <div className="flex items-start gap-2">
            <span className="text-primary font-bold">•</span>
            <p className="text-sm">
              <strong>{t('occasionCampaignsPagePage.text25')}</strong> {t('occasionCampaignsPagePage.text46')}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary font-bold">•</span>
            <p className="text-sm">
              <strong>{t('occasionCampaignsPagePage.text26')}</strong> {t('occasionCampaignsPagePage.text47')}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary font-bold">•</span>
            <p className="text-sm">
              <strong>{t('occasionCampaignsPagePage.text27')}</strong> {t('occasionCampaignsPagePage.text48')}
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary font-bold">•</span>
            <p className="text-sm">
              <strong>{t('occasionCampaignsPagePage.text28')}</strong> {t('occasionCampaignsPagePage.text49')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
