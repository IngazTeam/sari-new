import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, UserPlus, Gift, Trophy } from "lucide-react";

export default function Referrals() {
  const { user } = useAuth();
  const merchantId = 1; // TODO: Get from merchant context

  // Queries
  const { data: referralCodes, isLoading } = trpc.referrals.list.useQuery({ merchantId });
  const { data: stats } = trpc.referrals.getStats.useQuery({ merchantId });
  const { data: topReferrers } = trpc.referrals.getTopReferrers.useQuery({ 
    merchantId, 
    limit: 5 
  });

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("ar-SA");
  };

  const getReferralProgress = (count: number) => {
    return Math.min((count / 5) * 100, 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">نظام الإحالة</h1>
        <p className="text-muted-foreground">تتبع وإدارة إحالات العملاء والمكافآت</p>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الإحالات</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalReferrals || 0}</div>
            <p className="text-xs text-muted-foreground">جميع الإحالات المسجلة</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الإحالات الناجحة</CardTitle>
            <UserPlus className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.successfulReferrals || 0}</div>
            <p className="text-xs text-muted-foreground">إحالات أتمت عملية شراء</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المكافآت الممنوحة</CardTitle>
            <Gift className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.rewardsGiven || 0}</div>
            <p className="text-xs text-muted-foreground">عملاء حصلوا على خصم 15%</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Referrers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-600" />
            أفضل 5 عملاء إحالة
          </CardTitle>
          <CardDescription>العملاء الأكثر نشاطاً في دعوة الأصدقاء</CardDescription>
        </CardHeader>
        <CardContent>
          {!topReferrers || topReferrers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Trophy className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>لا توجد إحالات بعد</p>
              <p className="text-sm">سيظهر هنا العملاء الأكثر إحالة</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topReferrers.map((referrer, index) => (
                <div key={referrer.id} className="flex items-center gap-4 p-4 rounded-lg border">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{referrer.referrerName}</p>
                      {referrer.rewardGiven && (
                        <Badge variant="default" className="bg-green-600">
                          <Gift className="ml-1 h-3 w-3" />
                          حصل على المكافأة
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{referrer.referrerPhone}</p>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">التقدم</span>
                        <span className="font-medium">{referrer.referralCount} / 5</span>
                      </div>
                      <Progress value={getReferralProgress(referrer.referralCount)} className="h-2" />
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-2xl font-bold text-primary">{referrer.referralCount}</div>
                    <p className="text-xs text-muted-foreground">إحالة</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Referral Codes */}
      <Card>
        <CardHeader>
          <CardTitle>جميع كودات الإحالة</CardTitle>
          <CardDescription>قائمة بجميع العملاء وكودات الإحالة الخاصة بهم</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : !referralCodes || referralCodes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>لا توجد كودات إحالة حالياً</p>
              <p className="text-sm">سيتم إنشاء كود إحالة تلقائياً لكل عميل جديد</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم العميل</TableHead>
                  <TableHead>رقم الهاتف</TableHead>
                  <TableHead>كود الإحالة</TableHead>
                  <TableHead>عدد الإحالات</TableHead>
                  <TableHead>التقدم</TableHead>
                  <TableHead>المكافأة</TableHead>
                  <TableHead>تاريخ الإنشاء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referralCodes.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell className="font-medium">{code.referrerName}</TableCell>
                    <TableCell className="font-mono">{code.referrerPhone}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono font-bold">
                        {code.code}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{code.referralCount}</span> / 5
                    </TableCell>
                    <TableCell>
                      <div className="w-24">
                        <Progress value={getReferralProgress(code.referralCount)} className="h-2" />
                      </div>
                    </TableCell>
                    <TableCell>
                      {code.rewardGiven ? (
                        <Badge variant="default" className="bg-green-600">
                          <Gift className="ml-1 h-3 w-3" />
                          تم المنح
                        </Badge>
                      ) : code.referralCount >= 5 ? (
                        <Badge variant="default" className="bg-yellow-600">
                          <Gift className="ml-1 h-3 w-3" />
                          جاهز
                        </Badge>
                      ) : (
                        <Badge variant="secondary">قيد التقدم</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(code.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
