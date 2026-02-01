import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Star,
    Search,
    Filter,
    Calendar,
    MessageSquare,
    User,
    Send,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BookingReview {
    id: number;
    merchantId: number;
    bookingId: number;
    serviceId: number;
    staffId: number | null;
    customerPhone: string;
    customerName: string | null;
    overallRating: number;
    serviceQuality: number | null;
    professionalism: number | null;
    valueForMoney: number | null;
    comment: string | null;
    reply: string | null;
    repliedAt: string | null;
    isPublic: number;
    createdAt: string;
    updatedAt: string;
}

export default function BookingReviews() {
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [ratingFilter, setRatingFilter] = useState<string>('all');
    const [selectedReview, setSelectedReview] = useState<BookingReview | null>(null);
    const [showReplyDialog, setShowReplyDialog] = useState(false);
    const [replyText, setReplyText] = useState('');

    // tRPC queries
    const { data: reviewsData, isLoading, refetch } = trpc.bookingReviews.list.useQuery({
        minRating: ratingFilter !== 'all' ? parseInt(ratingFilter) : undefined,
    });

    const replyMutation = trpc.bookingReviews.reply.useMutation({
        onSuccess: () => {
            toast({
                title: 'تم إرسال الرد',
                description: 'تم الرد على التقييم بنجاح',
                variant: 'success',
            });
            refetch();
            setShowReplyDialog(false);
            setReplyText('');
            setSelectedReview(null);
        },
        onError: (error) => {
            toast({
                title: 'خطأ',
                description: error.message,
                variant: 'destructive',
            });
        },
    });

    const reviews = reviewsData?.reviews || [];

    // Filter by search query
    const filteredReviews = reviews.filter((review) => {
        const matchesSearch =
            (review.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
            review.customerPhone.includes(searchQuery);
        return matchesSearch;
    });

    // Calculate stats
    const stats = {
        total: reviews.length,
        averageRating:
            reviews.length > 0
                ? reviews.reduce((sum, r) => sum + r.overallRating, 0) / reviews.length
                : 0,
        fiveStars: reviews.filter((r) => r.overallRating === 5).length,
        needsReply: reviews.filter((r) => !r.reply).length,
    };

    const handleReply = () => {
        if (!replyText.trim() || !selectedReview) return;

        replyMutation.mutate({
            reviewId: selectedReview.id,
            reply: replyText.trim(),
        });
    };

    const renderStars = (rating: number) => {
        return (
            <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                        key={star}
                        className={`h-4 w-4 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                            }`}
                    />
                ))}
            </div>
        );
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold">تقييمات الحجوزات</h1>
                    <p className="text-muted-foreground mt-2">
                        إدارة تقييمات العملاء للخدمات والحجوزات
                    </p>
                </div>
                <Button variant="outline" onClick={() => refetch()}>
                    <RefreshCw className="h-4 w-4 ml-2" />
                    تحديث
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">إجمالي التقييمات</CardTitle>
                        <Star className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total}</div>
                        <p className="text-xs text-muted-foreground">تقييم</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">متوسط التقييم</CardTitle>
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.averageRating.toFixed(1)}</div>
                        <p className="text-xs text-muted-foreground">من 5 نجوم</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">5 نجوم</CardTitle>
                        <div className="flex">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            ))}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{stats.fiveStars}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats.total > 0 ? `${((stats.fiveStars / stats.total) * 100).toFixed(0)}%` : '0%'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">بانتظار الرد</CardTitle>
                        <MessageSquare className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-500">{stats.needsReply}</div>
                        <p className="text-xs text-muted-foreground">تقييم بحاجة للرد</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters and Table */}
            <Card>
                <CardHeader>
                    <CardTitle>قائمة التقييمات</CardTitle>
                    <CardDescription>جميع تقييمات العملاء للحجوزات والخدمات</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="بحث بالاسم أو رقم الجوال..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pr-10"
                            />
                        </div>
                        <Select value={ratingFilter} onValueChange={setRatingFilter}>
                            <SelectTrigger className="w-full md:w-[180px]">
                                <Filter className="h-4 w-4 ml-2" />
                                <SelectValue placeholder="التقييم" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">جميع التقييمات</SelectItem>
                                <SelectItem value="5">5 نجوم</SelectItem>
                                <SelectItem value="4">4 نجوم</SelectItem>
                                <SelectItem value="3">3 نجوم</SelectItem>
                                <SelectItem value="2">2 نجوم</SelectItem>
                                <SelectItem value="1">نجمة واحدة</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Reviews Table */}
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-right">العميل</TableHead>
                                    <TableHead className="text-right">التاريخ</TableHead>
                                    <TableHead className="text-right">التقييم</TableHead>
                                    <TableHead className="text-right">التعليق</TableHead>
                                    <TableHead className="text-right">الحالة</TableHead>
                                    <TableHead className="text-right">الإجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredReviews.length > 0 ? (
                                    filteredReviews.map((review) => (
                                        <TableRow key={review.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <User className="h-4 w-4 text-muted-foreground" />
                                                    <div>
                                                        <div className="font-medium">
                                                            {review.customerName || 'عميل'}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {review.customerPhone}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1 text-sm">
                                                    <Calendar className="h-3 w-3" />
                                                    {new Date(review.createdAt).toLocaleDateString('ar-SA')}
                                                </div>
                                            </TableCell>
                                            <TableCell>{renderStars(review.overallRating)}</TableCell>
                                            <TableCell className="max-w-xs truncate">
                                                {review.comment || '-'}
                                            </TableCell>
                                            <TableCell>
                                                {review.reply ? (
                                                    <Badge variant="default">تم الرد</Badge>
                                                ) : (
                                                    <Badge variant="secondary">بانتظار الرد</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedReview(review);
                                                        setReplyText(review.reply || '');
                                                        setShowReplyDialog(true);
                                                    }}
                                                >
                                                    <MessageSquare className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            لا توجد تقييمات
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Reply Dialog */}
            <Dialog open={showReplyDialog} onOpenChange={(open) => {
                setShowReplyDialog(open);
                if (!open) {
                    setSelectedReview(null);
                    setReplyText('');
                }
            }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>تفاصيل التقييم والرد</DialogTitle>
                        <DialogDescription>
                            {selectedReview?.customerName || 'عميل'} - {selectedReview?.customerPhone}
                        </DialogDescription>
                    </DialogHeader>
                    {selectedReview && (
                        <div className="space-y-4">
                            {/* Review Details */}
                            <div className="p-4 bg-muted rounded-lg space-y-2">
                                <div className="flex items-center justify-between">
                                    {renderStars(selectedReview.overallRating)}
                                    <span className="text-sm text-muted-foreground">
                                        {new Date(selectedReview.createdAt).toLocaleDateString('ar-SA')}
                                    </span>
                                </div>
                                <p className="text-sm">{selectedReview.comment || 'لا يوجد تعليق'}</p>
                            </div>

                            {/* Reply Section */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">الرد على التقييم</label>
                                <Textarea
                                    placeholder="اكتب ردك هنا..."
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    rows={4}
                                    disabled={!!selectedReview.reply}
                                />
                                {selectedReview.reply && (
                                    <p className="text-xs text-muted-foreground">
                                        تم الرد بتاريخ {new Date(selectedReview.repliedAt || '').toLocaleDateString('ar-SA')}
                                    </p>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setShowReplyDialog(false)}>
                                    إغلاق
                                </Button>
                                {!selectedReview.reply && (
                                    <Button
                                        onClick={handleReply}
                                        disabled={!replyText.trim() || replyMutation.isPending}
                                    >
                                        {replyMutation.isPending ? (
                                            <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                                        ) : (
                                            <Send className="h-4 w-4 ml-2" />
                                        )}
                                        إرسال الرد
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
