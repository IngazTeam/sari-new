import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, Filter, Calendar, Users, Send, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

export default function AdminCampaigns() {
  const { t } = useTranslation();
  const { data: campaigns, isLoading } = trpc.campaigns.listAll.useQuery();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [merchantFilter, setMerchantFilter] = useState<string>('all');

  // Get unique merchants for filter
  const merchants = useMemo(() => {
    if (!campaigns) return [];
    const uniqueMerchants = new Map();
    campaigns.forEach((c) => {
      if (c.merchantId && c.merchantName) {
        uniqueMerchants.set(c.merchantId, c.merchantName);
      }
    });
    return Array.from(uniqueMerchants.entries()).map(([id, name]) => ({ id, name }));
  }, [campaigns]);

  // Filter campaigns
  const filteredCampaigns = useMemo(() => {
    if (!campaigns) return [];
    
    return campaigns.filter((campaign) => {
      // Search filter
      const matchesSearch = 
        campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (campaign.merchantName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      
      // Status filter
      const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter;
      
      // Merchant filter
      const matchesMerchant = 
        merchantFilter === 'all' || campaign.merchantId?.toString() === merchantFilter;
      
      return matchesSearch && matchesStatus && matchesMerchant;
    });
  }, [campaigns, searchQuery, statusFilter, merchantFilter]);

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { label: 'مسودة', variant: 'secondary' as const, icon: Clock },
      scheduled: { label: 'مجدولة', variant: 'default' as const, icon: Calendar },
      sending: { label: 'قيد الإرسال', variant: 'default' as const, icon: Send },
      completed: { label: 'مكتملة', variant: 'default' as const, icon: CheckCircle },
      failed: { label: 'فشلت', variant: 'destructive' as const, icon: XCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const stats = useMemo(() => {
    if (!campaigns) return { total: 0, scheduled: 0, completed: 0, sending: 0 };
    
    return {
      total: campaigns.length,
      scheduled: campaigns.filter(c => c.status === 'scheduled').length,
      completed: campaigns.filter(c => c.status === 'completed').length,
      sending: campaigns.filter(c => c.status === 'sending').length,
    };
  }, [campaigns]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('adminCampaignsPage.text0')}</h1>
        <p className="text-muted-foreground mt-2">
          عرض وإدارة جميع حملات التجار
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminCampaignsPage.text1')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              جميع الحملات المسجلة
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminCampaignsPage.text2')}</CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.scheduled}</div>
            <p className="text-xs text-muted-foreground">
              في انتظار الإرسال
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminCampaignsPage.text3')}</CardTitle>
            <Send className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sending}</div>
            <p className="text-xs text-muted-foreground">
              يتم إرسالها الآن
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('adminCampaignsPage.text4')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completed}</div>
            <p className="text-xs text-muted-foreground">
              تم إرسالها بنجاح
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adminCampaignsPage.text5')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('adminCampaignsPage.text6')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10"
                />
              </div>
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <SelectValue placeholder={t('adminCampaignsPage.text7')} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('adminCampaignsPage.text8')}</SelectItem>
                <SelectItem value="draft">{t('adminCampaignsPage.text9')}</SelectItem>
                <SelectItem value="scheduled">{t('adminCampaignsPage.text10')}</SelectItem>
                <SelectItem value="sending">{t('adminCampaignsPage.text11')}</SelectItem>
                <SelectItem value="completed">{t('adminCampaignsPage.text12')}</SelectItem>
                <SelectItem value="failed">{t('adminCampaignsPage.text13')}</SelectItem>
              </SelectContent>
            </Select>

            {/* Merchant Filter */}
            <Select value={merchantFilter} onValueChange={setMerchantFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <SelectValue placeholder={t('adminCampaignsPage.text14')} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('adminCampaignsPage.text15')}</SelectItem>
                {merchants.map((merchant) => (
                  <SelectItem key={merchant.id} value={merchant.id.toString()}>
                    {merchant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Reset Filters */}
            {(searchQuery || statusFilter !== 'all' || merchantFilter !== 'all') && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setMerchantFilter('all');
                }}
              >
                إعادة تعيين
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adminCampaignsPage.text16', { var0: filteredCampaigns.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              جاري التحميل...
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد حملات تطابق معايير البحث
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('adminCampaignsPage.text17')}</TableHead>
                    <TableHead>{t('adminCampaignsPage.text18')}</TableHead>
                    <TableHead>{t('adminCampaignsPage.text19')}</TableHead>
                    <TableHead>{t('adminCampaignsPage.text20')}</TableHead>
                    <TableHead>{t('adminCampaignsPage.text21')}</TableHead>
                    <TableHead>{t('adminCampaignsPage.text22')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCampaigns.map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">
                        {campaign.name}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{t('adminCampaignsPage.text23', { var0: campaign.merchantName || 'غير معروف' })}</div>
                          {campaign.merchantPhone && (
                            <div className="text-sm text-muted-foreground">
                              {campaign.merchantPhone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(campaign.status)}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">
                            {campaign.sentCount} / {campaign.totalRecipients}
                          </div>
                          <div className="text-muted-foreground">
                            {campaign.totalRecipients > 0
                              ? `${Math.round((campaign.sentCount / campaign.totalRecipients) * 100)}%`
                              : '0%'}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {campaign.scheduledAt ? (
                          <div className="text-sm">
                            {format(new Date(campaign.scheduledAt), 'dd MMM yyyy', { locale: ar })}
                            <div className="text-muted-foreground">
                              {format(new Date(campaign.scheduledAt), 'hh:mm a', { locale: ar })}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">{t('adminCampaignsPage.text24')}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {format(new Date(campaign.createdAt), 'dd MMM yyyy', { locale: ar })}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
