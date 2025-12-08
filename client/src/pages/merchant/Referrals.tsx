import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Copy, Check, Gift, Users, TrendingUp, Award } from 'lucide-react';
import { toast } from 'sonner';

export default function Referrals() {
  const [copied, setCopied] = useState(false);
  
  // Fetch referral data
  const { data: referralCode, isLoading: loadingCode } = trpc.referrals.getMyCode.useQuery();
  const { data: referrals, isLoading: loadingReferrals } = trpc.referrals.getMyReferrals.useQuery();
  const { data: rewards, isLoading: loadingRewards } = trpc.referrals.getMyRewards.useQuery();
  const { data: stats, isLoading: loadingStats } = trpc.referrals.getStats.useQuery();
  
  const claimRewardMutation = trpc.referrals.claimReward.useMutation({
    onSuccess: () => {
      toast.success('تم استخدام المكافأة بنجاح');
    },
    onError: (error) => {
      toast.error(error.message || 'فشل استخدام المكافأة');
    },
  });

  const referralLink = referralCode 
    ? `${window.location.origin}/signup?ref=${referralCode.code}`
    : '';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success('تم نسخ الرابط');
    setTimeout(() => setCopied(false), 2000);
  };

  const getRewardTypeLabel = (type: string) => {
    switch (type) {
      case 'discount_10':
        return 'خصم 10% على الاشتراك';
      case 'free_month':
        return 'شهر مجاني إضافي';
      case 'analytics_upgrade':
        return 'تحليلات متقدمة لمدة شهر';
      default:
        return type;
    }
  };

  const getRewardStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">قيد الانتظار</Badge>;
      case 'claimed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">مستخدمة</Badge>;
      case 'expired':
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">منتهية</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">نظام الإحالة والمكافآت</h1>
        <p className="text-muted-foreground mt-2">
          ادعُ أصدقاءك واحصل على مكافآت رائعة عند اشتراكهم
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإحالات</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats?.totalReferrals || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الإحالات الناجحة</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-green-600">{stats?.completedReferrals || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المكافآت المكتسبة</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{stats?.totalRewards || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المكافآت المستخدمة</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-blue-600">{stats?.claimedRewards || 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Referral Code Section */}
      <Card>
        <CardHeader>
          <CardTitle>رمز الإحالة الخاص بك</CardTitle>
          <CardDescription>
            شارك هذا الرابط مع أصدقائك للحصول على مكافآت عند اشتراكهم
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingCode ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <>
              <div className="flex gap-2">
                <div className="flex-1 p-3 bg-muted rounded-md font-mono text-sm break-all">
                  {referralLink}
                </div>
                <Button onClick={copyToClipboard} variant="outline" size="icon">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                رمز الإحالة: <span className="font-bold text-foreground">{referralCode?.code}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Rewards Section */}
      <Card>
        <CardHeader>
          <CardTitle>المكافآت المتاحة</CardTitle>
          <CardDescription>
            المكافآت التي حصلت عليها من الإحالات الناجحة
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRewards ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : rewards && rewards.length > 0 ? (
            <div className="space-y-3">
              {rewards.map((reward) => (
                <div
                  key={reward.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium">{getRewardTypeLabel(reward.rewardType)}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {reward.description || 'مكافأة من برنامج الإحالة'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      تنتهي في: {new Date(reward.expiresAt).toLocaleDateString('ar-SA')}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getRewardStatusBadge(reward.status)}
                    {reward.status === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => claimRewardMutation.mutate({ rewardId: reward.id })}
                        disabled={claimRewardMutation.isPending}
                      >
                        استخدام
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Gift className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>لا توجد مكافآت حتى الآن</p>
              <p className="text-sm mt-1">ابدأ بدعوة أصدقائك للحصول على مكافآت</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Referrals List */}
      <Card>
        <CardHeader>
          <CardTitle>الإحالات</CardTitle>
          <CardDescription>
            قائمة الأشخاص الذين قاموا بالتسجيل باستخدام رمز الإحالة الخاص بك
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingReferrals ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : referrals && referrals.length > 0 ? (
            <div className="space-y-2">
              {referrals.map((referral) => (
                <div
                  key={referral.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="font-medium">{referral.referredName}</div>
                    <div className="text-sm text-muted-foreground">{referral.referredPhone}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-muted-foreground">
                      {new Date(referral.createdAt).toLocaleDateString('ar-SA')}
                    </div>
                    {referral.orderCompleted ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        مكتمل
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                        قيد الانتظار
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>لا توجد إحالات حتى الآن</p>
              <p className="text-sm mt-1">شارك رابط الإحالة الخاص بك مع أصدقائك</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it Works */}
      <Card>
        <CardHeader>
          <CardTitle>كيف يعمل نظام الإحالة؟</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                1
              </div>
              <div>
                <div className="font-medium">شارك رابط الإحالة</div>
                <div className="text-sm text-muted-foreground">
                  انسخ رابط الإحالة الخاص بك وشاركه مع أصدقائك
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <div className="font-medium">صديقك يسجل ويشترك</div>
                <div className="text-sm text-muted-foreground">
                  عندما يسجل صديقك باستخدام رابطك ويشترك في أي باقة
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                3
              </div>
              <div>
                <div className="font-medium">احصل على مكافأتك</div>
                <div className="text-sm text-muted-foreground">
                  ستحصل على مكافأة فورية يمكنك استخدامها (خصم 10%، شهر مجاني، أو تحليلات متقدمة)
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
