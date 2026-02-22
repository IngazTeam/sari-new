import { trpc } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Store, MessageSquare, TrendingUp, DollarSign } from 'lucide-react';

export default function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const { data: merchants } = trpc.merchants.list.useQuery();
  const { data: campaigns } = trpc.campaigns.listAll.useQuery();

  const stats = [
    {
      title: t('dashboardPage.totalMerchants'),
      value: merchants?.length || 0,
      icon: Store,
      description: t('dashboardPage.totalMerchantsDesc'),
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: t('dashboardPage.activeMerchants'),
      value: merchants?.filter(m => m.status === 'active').length || 0,
      icon: Users,
      description: t('dashboardPage.activeMerchantsDesc'),
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: t('dashboardPage.campaignsCount'),
      value: campaigns?.length || 0,
      icon: MessageSquare,
      description: t('dashboardPage.campaignsCountDesc'),
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: t('dashboardPage.completedCampaigns'),
      value: campaigns?.filter(c => c.status === 'completed').length || 0,
      icon: TrendingUp,
      description: t('dashboardPage.completedCampaignsDesc'),
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t('dashboardPage.adminDashboardTitle')}</h1>
        <p className="text-muted-foreground mt-2">
          {t('dashboardPage.adminDashboardDesc')}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Activity */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Merchants */}
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboardPage.recentMerchants')}</CardTitle>
            <CardDescription>{t('dashboardPage.recentMerchantsDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {merchants && merchants.length > 0 ? (
              <div className="space-y-4">
                {merchants.slice(0, 5).map((merchant: any) => (
                  <div key={merchant.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{merchant.businessName}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(merchant.createdAt).toLocaleDateString(i18n.language === 'ar' ? 'ar-SA' : i18n.language)}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs ${merchant.status === 'active' ? 'bg-green-100 text-green-700' :
                        merchant.status === 'suspended' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                      }`}>
                      {merchant.status === 'active' ? t('dashboardPage.statusActive') :
                        merchant.status === 'suspended' ? t('dashboardPage.statusSuspended') : t('dashboardPage.statusPendingReview')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {t('dashboardPage.noMerchantsYet')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Campaigns */}
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboardPage.recentCampaigns')}</CardTitle>
            <CardDescription>{t('dashboardPage.recentCampaignsDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {campaigns && campaigns.length > 0 ? (
              <div className="space-y-4">
                {campaigns.slice(0, 5).map((campaign) => (
                  <div key={campaign.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{campaign.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {campaign.sentCount} / {campaign.totalRecipients} {t('dashboardPage.sentLabel')}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs ${campaign.status === 'completed' ? 'bg-green-100 text-green-700' :
                        campaign.status === 'sending' ? 'bg-primary/20 text-primary' :
                          campaign.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                            'bg-yellow-100 text-yellow-700'
                      }`}>
                      {campaign.status === 'completed' ? t('dashboardPage.statusCompleted') :
                        campaign.status === 'sending' ? t('dashboardPage.statusSending') :
                          campaign.status === 'draft' ? t('dashboardPage.statusDraft') : t('dashboardPage.statusScheduled')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {t('dashboardPage.noCampaignsYet')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Merchants Status Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboardPage.merchantStatusDistribution')}</CardTitle>
          <CardDescription>{t('dashboardPage.merchantStatusDistributionDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboardPage.statusActive')}</p>
                  <p className="text-2xl font-bold text-green-700">
                    {merchants?.filter((m: any) => m.status === 'active').length || 0}
                  </p>
                </div>
                <Users className="w-8 h-8 text-green-600" />
              </div>
            </div>

            <div className="p-4 bg-yellow-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboardPage.statusPendingReview')}</p>
                  <p className="text-2xl font-bold text-yellow-700">
                    {merchants?.filter((m: any) => m.status === 'pending').length || 0}
                  </p>
                </div>
                <Users className="w-8 h-8 text-yellow-600" />
              </div>
            </div>

            <div className="p-4 bg-red-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('dashboardPage.statusSuspended')}</p>
                  <p className="text-2xl font-bold text-red-700">
                    {merchants?.filter((m: any) => m.status === 'suspended').length || 0}
                  </p>
                </div>
                <Users className="w-8 h-8 text-red-600" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
