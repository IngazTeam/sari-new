import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Lightbulb, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  TrendingUp,
  Zap
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const priorityColors = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const statusColors = {
  pending: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  dismissed: 'bg-red-100 text-red-800',
};

const statusIcons = {
  pending: <Clock className="w-4 h-4" />,
  in_progress: <Zap className="w-4 h-4" />,
  completed: <CheckCircle2 className="w-4 h-4" />,
  dismissed: <AlertCircle className="w-4 h-4" />,
};

const statusLabels = {
  pending: 'قيد الانتظار',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتملة',
  dismissed: 'مرفوضة',
};

export default function AdminRecommendations() {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  // Fetch recommendations
  const { data: recommendations, isLoading, refetch } = trpc.seo.getAllRecommendations.useQuery();
  const updateMutation = trpc.seo.updateRecommendation.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  // Filter recommendations
  const filteredRecommendations = useMemo(() => {
    if (!recommendations) return [];
    
    return recommendations.filter((rec: any) => {
      if (filterStatus !== 'all' && rec.status !== filterStatus) return false;
      if (filterPriority !== 'all' && rec.priority !== filterPriority) return false;
      return true;
    });
  }, [recommendations, filterStatus, filterPriority]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!recommendations) return { total: 0, pending: 0, completed: 0, critical: 0 };
    
    return {
      total: recommendations.length,
      pending: recommendations.filter((r: any) => r.status === 'pending').length,
      completed: recommendations.filter((r: any) => r.status === 'completed').length,
      critical: recommendations.filter((r: any) => r.priority === 'critical').length,
    };
  }, [recommendations]);

  const handleStatusChange = async (recId: number, newStatus: string) => {
    await updateMutation.mutateAsync({
      id: recId,
      status: newStatus as any,
      completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Lightbulb className="w-8 h-8 text-yellow-500" />
          إدارة التوصيات
        </h1>
        <p className="text-muted-foreground mt-2">
          عرض وإدارة توصيات تحسين SEO لجميع الصفحات
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي التوصيات</CardTitle>
            <Lightbulb className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              جميع التوصيات المسجلة
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">قيد الانتظار</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
            <p className="text-xs text-muted-foreground mt-1">
              تحتاج إلى معالجة
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">مكتملة</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completed}</div>
            <p className="text-xs text-muted-foreground mt-1">
              تم تنفيذها
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">حرجة</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.critical}</div>
            <p className="text-xs text-muted-foreground mt-1">
              توصيات حرجة
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">الفلاتر</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium mb-2 block">الحالة</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="pending">قيد الانتظار</SelectItem>
                  <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                  <SelectItem value="completed">مكتملة</SelectItem>
                  <SelectItem value="dismissed">مرفوضة</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">الأولوية</label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="low">منخفضة</SelectItem>
                  <SelectItem value="medium">متوسطة</SelectItem>
                  <SelectItem value="high">عالية</SelectItem>
                  <SelectItem value="critical">حرجة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations List */}
      <div className="space-y-4">
        {isLoading ? (
          <>
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-24 w-full" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : filteredRecommendations.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">لا توجد توصيات</p>
            </CardContent>
          </Card>
        ) : (
          filteredRecommendations.map((rec: any) => (
            <Card key={rec.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{rec.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {rec.description}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Badge className={priorityColors[rec.priority as keyof typeof priorityColors] || 'bg-gray-100'}>
                        {rec.priority === 'low' && 'منخفضة'}
                        {rec.priority === 'medium' && 'متوسطة'}
                        {rec.priority === 'high' && 'عالية'}
                        {rec.priority === 'critical' && 'حرجة'}
                      </Badge>
                      <Badge className={statusColors[rec.status as keyof typeof statusColors] || 'bg-gray-100'}>
                        {statusIcons[rec.status as keyof typeof statusIcons]}
                        <span className="mr-1">
                          {statusLabels[rec.status as keyof typeof statusLabels]}
                        </span>
                      </Badge>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="grid gap-2 md:grid-cols-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">النوع</p>
                      <p className="font-medium">
                        {rec.recommendationType === 'keyword_optimization' && 'تحسين الكلمات المفتاحية'}
                        {rec.recommendationType === 'content_improvement' && 'تحسين المحتوى'}
                        {rec.recommendationType === 'technical_seo' && 'تحسين تقني'}
                        {rec.recommendationType === 'link_building' && 'بناء الروابط'}
                        {rec.recommendationType === 'user_experience' && 'تحسين تجربة المستخدم'}
                        {rec.recommendationType === 'performance' && 'تحسين الأداء'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">التأثير المتوقع</p>
                      <p className="font-medium flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" />
                        {rec.estimatedImpact || 'غير محدد'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">صعوبة التنفيذ</p>
                      <p className="font-medium">
                        {rec.implementationDifficulty === 'easy' && 'سهلة'}
                        {rec.implementationDifficulty === 'medium' && 'متوسطة'}
                        {rec.implementationDifficulty === 'hard' && 'صعبة'}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t">
                    <Select 
                      value={rec.status} 
                      onValueChange={(value) => handleStatusChange(rec.id, value)}
                      disabled={updateMutation.isPending}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">قيد الانتظار</SelectItem>
                        <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                        <SelectItem value="completed">مكتملة</SelectItem>
                        <SelectItem value="dismissed">مرفوضة</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {rec.completedAt && (
                      <div className="text-xs text-muted-foreground flex items-center">
                        تم الإكمال: {new Date(rec.completedAt).toLocaleDateString('ar-SA')}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Summary */}
      {filteredRecommendations.length > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-900">
              <strong>ملخص:</strong> عرض {filteredRecommendations.length} من {stats.total} توصية
              {filterStatus !== 'all' && ` (الحالة: ${filterStatus})`}
              {filterPriority !== 'all' && ` (الأولوية: ${filterPriority})`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
