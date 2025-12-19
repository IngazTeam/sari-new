import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Link as LinkIcon, 
  Plus, 
  Copy, 
  ExternalLink,
  Ban,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function PaymentLinks() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newLink, setNewLink] = useState({
    title: '',
    description: '',
    amount: '',
    maxUsageCount: '',
  });

  // جلب قائمة الروابط
  const { data: links, isLoading, refetch } = trpc.payments.listLinks.useQuery({
    limit: 100,
  });

  // إنشاء رابط جديد
  const createLinkMutation = trpc.payments.createLink.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'تم إنشاء الرابط بنجاح',
        description: 'يمكنك الآن مشاركة رابط الدفع مع العملاء',
      });
      setIsCreateDialogOpen(false);
      setNewLink({ title: '', description: '', amount: '', maxUsageCount: '' });
      refetch();
      
      // نسخ الرابط تلقائياً
      if (data.paymentUrl) {
        navigator.clipboard.writeText(data.paymentUrl);
        toast({
          title: 'تم نسخ الرابط',
          description: 'تم نسخ رابط الدفع إلى الحافظة',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'خطأ',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // تعطيل رابط
  const disableLinkMutation = trpc.payments.disableLink.useMutation({
    onSuccess: () => {
      toast({
        title: 'تم تعطيل الرابط',
        description: 'لن يتمكن العملاء من استخدام هذا الرابط بعد الآن',
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'خطأ',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // نسخ الرابط
  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({
      title: 'تم نسخ الرابط',
      description: 'تم نسخ رابط الدفع إلى الحافظة',
    });
  };

  // إنشاء رابط جديد
  const handleCreateLink = () => {
    if (!newLink.title || !newLink.amount) {
      toast({
        title: 'خطأ',
        description: 'يرجى ملء جميع الحقول المطلوبة',
        variant: 'destructive',
      });
      return;
    }

    const amountInHalalas = Math.round(parseFloat(newLink.amount) * 100);
    
    createLinkMutation.mutate({
      title: newLink.title,
      description: newLink.description || undefined,
      amount: amountInHalalas,
      currency: 'SAR',
      isFixedAmount: true,
      maxUsageCount: newLink.maxUsageCount ? parseInt(newLink.maxUsageCount) : undefined,
    });
  };

  // تنسيق المبلغ
  const formatAmount = (amount: number, currency: string = 'SAR') => {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  };

  // تنسيق التاريخ
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // الحصول على badge للحالة
  const getStatusBadge = (link: any) => {
    if (!link.isActive) {
      return (
        <Badge variant="outline" className="flex items-center gap-1 w-fit">
          <Ban className="h-3 w-3" />
          معطل
        </Badge>
      );
    }

    if (link.status === 'completed') {
      return (
        <Badge variant="default" className="flex items-center gap-1 w-fit">
          <CheckCircle className="h-3 w-3" />
          مكتمل
        </Badge>
      );
    }

    if (link.status === 'expired') {
      return (
        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
          <XCircle className="h-3 w-3" />
          منتهي
        </Badge>
      );
    }

    return (
      <Badge variant="secondary" className="flex items-center gap-1 w-fit">
        <Clock className="h-3 w-3" />
        نشط
      </Badge>
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>روابط الدفع</CardTitle>
              <CardDescription>
                إنشاء وإدارة روابط الدفع السريعة لمشاركتها مع العملاء
              </CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 ml-2" />
                  إنشاء رابط جديد
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>إنشاء رابط دفع جديد</DialogTitle>
                  <DialogDescription>
                    أنشئ رابط دفع سريع لمشاركته مع العملاء عبر واتساب أو أي قناة أخرى
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title">عنوان الرابط *</Label>
                    <Input
                      id="title"
                      placeholder="مثال: دفعة الاشتراك الشهري"
                      value={newLink.title}
                      onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">الوصف</Label>
                    <Textarea
                      id="description"
                      placeholder="وصف اختياري للرابط"
                      value={newLink.description}
                      onChange={(e) => setNewLink({ ...newLink, description: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="amount">المبلغ (ريال سعودي) *</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      placeholder="100.00"
                      value={newLink.amount}
                      onChange={(e) => setNewLink({ ...newLink, amount: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="maxUsage">الحد الأقصى للاستخدام (اختياري)</Label>
                    <Input
                      id="maxUsage"
                      type="number"
                      placeholder="اتركه فارغاً لاستخدام غير محدود"
                      value={newLink.maxUsageCount}
                      onChange={(e) => setNewLink({ ...newLink, maxUsageCount: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    إلغاء
                  </Button>
                  <Button
                    onClick={handleCreateLink}
                    disabled={createLinkMutation.isPending}
                  >
                    {createLinkMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء الرابط'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              جاري التحميل...
            </div>
          ) : links && links.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>العنوان</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>الاستخدام</TableHead>
                    <TableHead>المدفوعات</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((link) => (
                    <TableRow key={link.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{link.title}</div>
                          {link.description && (
                            <div className="text-sm text-muted-foreground">
                              {link.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatAmount(link.amount, link.currency)}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {link.usageCount}
                          {link.maxUsageCount && ` / ${link.maxUsageCount}`}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="text-green-600 font-medium">
                            ✓ {link.successfulPayments}
                          </div>
                          <div className="text-red-600">
                            ✗ {link.failedPayments}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(link)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(link.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyLink(link.tapPaymentUrl)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(link.tapPaymentUrl, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          {link.isActive && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => disableLinkMutation.mutate({ id: link.id })}
                              disabled={disableLinkMutation.isPending}
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <LinkIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">لا توجد روابط دفع</h3>
              <p className="text-muted-foreground mb-4">
                ابدأ بإنشاء رابط دفع لمشاركته مع عملائك
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 ml-2" />
                إنشاء أول رابط
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
