import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Star, MessageSquare, Calendar, Filter } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useTranslation } from 'react-i18next';

export default function Reviews() {
  const { t } = useTranslation();
  const [starFilter, setStarFilter] = useState<string>("all");
  const [replyDialog, setReplyDialog] = useState<{ open: boolean; reviewId: number | null }>({
    open: false,
    reviewId: null,
  });
  const [replyText, setReplyText] = useState("");

  const { data: reviews, isLoading, refetch } = trpc.reviews.list.useQuery({ merchantId: 1 }); // TODO: Get from context
  const { data: stats } = trpc.reviews.getStats.useQuery({ merchantId: 1 }); // TODO: Get from context
  const replyMutation = trpc.reviews.reply.useMutation({
    onSuccess: () => {
      refetch();
      setReplyDialog({ open: false, reviewId: null });
      setReplyText("");
    },
  });

  const filteredReviews = reviews?.filter((review) => {
    if (starFilter === "all") return true;
    return review.rating === parseInt(starFilter);
  });

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
            }`}
          />
        ))}
      </div>
    );
  };

  const handleReply = (reviewId: number) => {
    setReplyDialog({ open: true, reviewId });
  };

  const submitReply = () => {
    if (replyDialog.reviewId && replyText.trim()) {
      replyMutation.mutate({
        reviewId: replyDialog.reviewId,
        reply: replyText.trim(),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">{t('reviewsPage.text0')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('reviewsPage.text1')}</h1>
        <p className="text-muted-foreground">
          {t('reviewsPage.text22')}
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t('reviewsPage.text2')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalReviews}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t('reviewsPage.text3')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">{stats.averageRating.toFixed(1)}</div>
                <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t('reviewsPage.text4')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.ratingDistribution[5] || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalReviews > 0 ? `${(((stats.ratingDistribution[5] || 0) / stats.totalReviews) * 100).toFixed(0)}%` : "0%"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">{t('reviewsPage.text5')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{(stats.ratingDistribution[1] || 0) + (stats.ratingDistribution[2] || 0)}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalReviews > 0 ? `${((((stats.ratingDistribution[1] || 0) + (stats.ratingDistribution[2] || 0)) / stats.totalReviews) * 100).toFixed(0)}%` : "0%"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {t('reviewsPage.text23')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">{t('reviewsPage.text6')}</label>
              <Select value={starFilter} onValueChange={setStarFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t('reviewsPage.text7')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('reviewsPage.text8')}</SelectItem>
                  <SelectItem value="5">{t('reviewsPage.text9')}</SelectItem>
                  <SelectItem value="4">{t('reviewsPage.text10')}</SelectItem>
                  <SelectItem value="3">{t('reviewsPage.text11')}</SelectItem>
                  <SelectItem value="2">{t('reviewsPage.text12')}</SelectItem>
                  <SelectItem value="1">{t('reviewsPage.text13')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reviews List */}
      <div className="space-y-4">
        {filteredReviews && filteredReviews.length > 0 ? (
          filteredReviews.map((review) => (
            <Card key={review.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {renderStars(review.rating)}
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(review.createdAt), "d MMMM yyyy", { locale: ar })}
                      </span>
                    </div>
                    <CardTitle className="text-lg">{review.customerName}</CardTitle>
                    <CardDescription>{review.customerPhone}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Review Text */}
                  {review.comment && (
                    <div className="bg-muted/50 p-4 rounded-lg">
                      <p className="text-sm">{review.comment}</p>
                    </div>
                  )}

                  {/* Merchant Reply */}
                  {review.merchantReply && (
                    <div className="bg-primary/5 p-4 rounded-lg border-r-4 border-primary">
                      <p className="text-sm font-medium mb-1">{t('reviewsPage.text14')}</p>
                      <p className="text-sm">{review.merchantReply}</p>
                      {review.repliedAt && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {format(new Date(review.repliedAt), "d MMMM yyyy - HH:mm", { locale: ar })}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Reply Button */}
                  {!review.merchantReply && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReply(review.id)}
                      className="gap-2"
                    >
                      <MessageSquare className="h-4 w-4" />
                      {t('reviewsPage.text24')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">{t('reviewsPage.text15')}</h3>
                <p className="text-muted-foreground">
                  {starFilter !== "all"
                    ? t('reviewsPage.text18') : t('reviewsPage.text19')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Reply Dialog */}
      <Dialog open={replyDialog.open} onOpenChange={(open) => setReplyDialog({ open, reviewId: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('reviewsPage.text16')}</DialogTitle>
            <DialogDescription>
              {t('reviewsPage.text26')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder={t('reviewsPage.text17')}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReplyDialog({ open: false, reviewId: null })}
            >
              {t('reviewsPage.text25')}
            </Button>
            <Button
              onClick={submitReply}
              disabled={!replyText.trim() || replyMutation.isPending}
            >
              {replyMutation.isPending ? t('reviewsPage.text20') : t('reviewsPage.text21')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
