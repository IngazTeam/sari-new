import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Send, Users, TrendingUp } from 'lucide-react';

export default function MerchantDashboard() {
  const { data: merchant } = trpc.merchants.getCurrent.useQuery();
  const { data: subscription } = trpc.subscriptions.getCurrent.useQuery();
  const { data: conversations } = trpc.conversations.list.useQuery();
  const { data: campaigns } = trpc.campaigns.list.useQuery();

  const stats = [
    {
      title: 'المحادثات',
      value: conversations?.length || 0,
      icon: MessageSquare,
      description: 'إجمالي المحادثات',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'الحملات',
      value: campaigns?.length || 0,
      icon: Send,
      description: 'إجمالي الحملات',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'الاستخدام',
      value: subscription ? `${subscription.conversationsUsed}/${subscription.conversationsUsed + 100}` : '0/0',
      icon: TrendingUp,
      description: 'المحادثات المستخدمة',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'العملاء',
      value: conversations?.length || 0,
      icon: Users,
      description: 'عدد العملاء',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">مرحباً، {merchant?.businessName || 'التاجر'}</h1>
        <p className="text-muted-foreground mt-2">
          إليك نظرة سريعة على نشاط متجرك
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
        {/* Recent Conversations */}
        <Card>
          <CardHeader>
            <CardTitle>آخر المحادثات</CardTitle>
            <CardDescription>المحادثات الأخيرة مع العملاء</CardDescription>
          </CardHeader>
          <CardContent>
            {conversations && conversations.length > 0 ? (
              <div className="space-y-4">
                {conversations.slice(0, 5).map((conv) => (
                  <div key={conv.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{conv.customerName || conv.customerPhone}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(conv.lastMessageAt).toLocaleDateString('ar-SA')}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      conv.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {conv.status === 'active' ? 'نشط' : 'مغلق'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                لا توجد محادثات بعد
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Campaigns */}
        <Card>
          <CardHeader>
            <CardTitle>آخر الحملات</CardTitle>
            <CardDescription>الحملات التسويقية الأخيرة</CardDescription>
          </CardHeader>
          <CardContent>
            {campaigns && campaigns.length > 0 ? (
              <div className="space-y-4">
                {campaigns.slice(0, 5).map((campaign) => (
                  <div key={campaign.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{campaign.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {campaign.sentCount} / {campaign.totalRecipients} مرسل
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      campaign.status === 'completed' ? 'bg-green-100 text-green-700' :
                      campaign.status === 'sending' ? 'bg-blue-100 text-blue-700' :
                      campaign.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {campaign.status === 'completed' ? 'مكتمل' :
                       campaign.status === 'sending' ? 'جاري الإرسال' :
                       campaign.status === 'draft' ? 'مسودة' : 'مجدول'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                لا توجد حملات بعد
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Subscription Info */}
      {subscription && (
        <Card>
          <CardHeader>
            <CardTitle>معلومات الاشتراك</CardTitle>
            <CardDescription>تفاصيل باقتك الحالية</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">الحالة</p>
                <p className="text-lg font-semibold">
                  {subscription.status === 'active' ? 'نشط' : 'غير نشط'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">تاريخ الانتهاء</p>
                <p className="text-lg font-semibold">
                  {new Date(subscription.endDate).toLocaleDateString('ar-SA')}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">التجديد التلقائي</p>
                <p className="text-lg font-semibold">
                  {subscription.autoRenew ? 'مفعّل' : 'معطّل'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
