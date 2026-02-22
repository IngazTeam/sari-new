import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Calendar,
  Clock,
  DollarSign,
  Users,
  Star,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  BarChart3,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useTranslation } from 'react-i18next';

export default function ServiceDetails() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const serviceId = parseInt(id || "0");

  const { data, isLoading } = trpc.services.getById.useQuery(
    { serviceId },
    { enabled: !!serviceId }
  );

  if (isLoading) {
    return (
      <div className="container py-8">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid gap-6 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96 mt-6" />
      </div>
    );
  }

  if (!data?.service) {
    return (
      <div className="container py-8">
        <Card className="p-8 text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">{t('serviceDetailsPage.text0')}</h2>
          <Button onClick={() => setLocation("/merchant/services")} className="mt-4">
            العودة للخدمات
          </Button>
        </Card>
      </div>
    );
  }

  const { service, bookingStats, recentBookings, ratingStats } = data;

  const formatPrice = (price: number) => {
    return `${(price / 100).toFixed(2)} ريال`;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "قيد الانتظار", variant: "secondary" },
      confirmed: { label: "مؤكد", variant: "default" },
      in_progress: { label: "جاري التنفيذ", variant: "outline" },
      completed: { label: "مكتمل", variant: "default" },
      cancelled: { label: "ملغي", variant: "destructive" },
      no_show: { label: "لم يحضر", variant: "destructive" },
    };
    const config = statusConfig[status] || statusConfig.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/merchant/services")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{service.name}</h1>
            <p className="text-muted-foreground mt-1">{service.description}</p>
          </div>
        </div>
        <Badge variant={service.isActive ? "default" : "secondary"}>
          {service.isActive ? "نشط" : "غير نشط"}
        </Badge>
      </div>

      {/* Service Info Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-lg">
              <DollarSign className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('serviceDetailsPage.text1')}</p>
              <p className="text-2xl font-bold">
                {service.priceType === "fixed"
                  ? formatPrice(service.basePrice || 0)
                  : `${formatPrice(service.minPrice || 0)} - ${formatPrice(service.maxPrice || 0)}`}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Clock className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('serviceDetailsPage.text2')}</p>
              <p className="text-2xl font-bold">{service.durationMinutes} دقيقة</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-500/10 rounded-lg">
              <Calendar className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('serviceDetailsPage.text3')}</p>
              <p className="text-2xl font-bold">
                {service.maxBookingsPerDay || "غير محدود"}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-500/10 rounded-lg">
              <Star className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('serviceDetailsPage.text4')}</p>
              <p className="text-2xl font-bold">
                {ratingStats.averageRating > 0
                  ? ratingStats.averageRating.toFixed(1)
                  : "لا يوجد"}
              </p>
              {ratingStats.totalReviews > 0 && (
                <p className="text-xs text-muted-foreground">
                  ({ratingStats.totalReviews} تقييم)
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Booking Statistics */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="w-5 h-5" />
          <h2 className="text-xl font-semibold">{t('serviceDetailsPage.text5')}</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-7">
          <Card className="p-4 bg-muted/50">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('serviceDetailsPage.text6')}</p>
            </div>
            <p className="text-2xl font-bold">{bookingStats.total}</p>
          </Card>

          <Card className="p-4 bg-yellow-50 dark:bg-yellow-950/20">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-yellow-600" />
              <p className="text-sm text-yellow-600">{t('serviceDetailsPage.text7')}</p>
            </div>
            <p className="text-2xl font-bold text-yellow-600">{bookingStats.pending}</p>
          </Card>

          <Card className="p-4 bg-blue-50 dark:bg-blue-950/20">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-blue-600" />
              <p className="text-sm text-blue-600">{t('serviceDetailsPage.text8')}</p>
            </div>
            <p className="text-2xl font-bold text-blue-600">{bookingStats.confirmed}</p>
          </Card>

          <Card className="p-4 bg-purple-50 dark:bg-purple-950/20">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <p className="text-sm text-purple-600">{t('serviceDetailsPage.text9')}</p>
            </div>
            <p className="text-2xl font-bold text-purple-600">{bookingStats.inProgress}</p>
          </Card>

          <Card className="p-4 bg-green-50 dark:bg-green-950/20">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <p className="text-sm text-green-600">{t('serviceDetailsPage.text10')}</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{bookingStats.completed}</p>
          </Card>

          <Card className="p-4 bg-red-50 dark:bg-red-950/20">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-4 h-4 text-red-600" />
              <p className="text-sm text-red-600">{t('serviceDetailsPage.text11')}</p>
            </div>
            <p className="text-2xl font-bold text-red-600">{bookingStats.cancelled}</p>
          </Card>

          <Card className="p-4 bg-gray-50 dark:bg-gray-950/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-gray-600" />
              <p className="text-sm text-gray-600">{t('serviceDetailsPage.text12')}</p>
            </div>
            <p className="text-2xl font-bold text-gray-600">{bookingStats.noShow}</p>
          </Card>
        </div>

        <div className="mt-6 p-4 bg-primary/5 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('serviceDetailsPage.text13')}</p>
              <p className="text-2xl font-bold text-primary">
                {formatPrice(bookingStats.totalRevenue)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">{t('serviceDetailsPage.text14')}</p>
              <p className="text-2xl font-bold">
                {bookingStats.total > 0
                  ? ((bookingStats.completed / bookingStats.total) * 100).toFixed(1)
                  : 0}
                %
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Recent Bookings */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">{t('serviceDetailsPage.text15')}</h2>
        {recentBookings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{t('serviceDetailsPage.text16')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentBookings.map((booking: any) => (
              <Card key={booking.id} className="p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <p className="font-semibold">{booking.customerName || booking.customerPhone}</p>
                      {getStatusBadge(booking.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(booking.bookingDate), "dd MMMM yyyy", { locale: ar })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {booking.startTime} - {booking.endTime}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">{formatPrice(booking.finalPrice)}</p>
                    <p className="text-xs text-muted-foreground">
                      {booking.durationMinutes} دقيقة
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Rating Distribution */}
      {ratingStats.totalReviews > 0 && (
        <Card className="p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4">{t('serviceDetailsPage.text17')}</h2>
          <div className="space-y-3">
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = ratingStats.ratingDistribution[rating as keyof typeof ratingStats.ratingDistribution] || 0;
              const percentage = ratingStats.totalReviews > 0
                ? (count / ratingStats.totalReviews) * 100
                : 0;

              return (
                <div key={rating} className="flex items-center gap-3">
                  <div className="flex items-center gap-1 w-20">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-medium">{rating}</span>
                  </div>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-400 transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-16 text-right">
                    {count} ({percentage.toFixed(0)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
