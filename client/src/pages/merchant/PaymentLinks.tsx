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
import { useTranslation } from 'react-i18next';

export default function PaymentLinks() {
  const { t } = useTranslation();
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
        title: t('paymentLinksPage.text30'),
        description: t('paymentLinksPage.text31'),
      });
      setIsCreateDialogOpen(false);
      setNewLink({ title: '', description: '', amount: '', maxUsageCount: '' });
      refetch();
      
      // نسخ الرابط تلقائياً
      if (data.paymentUrl) {
        navigator.clipboard.writeText(data.paymentUrl);
        toast({
          title: t('paymentLinksPage.text32'),
          description: t('paymentLinksPage.text33'),
        });
      }
    },
    onError: (error) => {
      toast({
        title: t('paymentLinksPage.text34'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // تعطيل رابط
  const disableLinkMutation = trpc.payments.disableLink.useMutation({
    onSuccess: () => {
      toast({
        title: t('paymentLinksPage.text35'),
        description: t('paymentLinksPage.text36'),
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: t('paymentLinksPage.text37'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // نسخ الرابط
  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({
      title: t('paymentLinksPage.text38'),
      description: t('paymentLinksPage.text39'),
    });
  };

  // إنشاء رابط جديد
  const handleCreateLink = () => {
    if (!newLink.title || !newLink.amount) {
      toast({
        title: t('paymentLinksPage.text40'),
        description: t('paymentLinksPage.text41'),
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
          {t('paymentLinksPage.text19')}
        </Badge>
      );
    }

    if (link.status === 'completed') {
      return (
        <Badge variant="default" className="flex items-center gap-1 w-fit">
          <CheckCircle className="h-3 w-3" />
          {t('paymentLinksPage.text20')}
        </Badge>
      );
    }

    if (link.status === 'expired') {
      return (
        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
          <XCircle className="h-3 w-3" />
          {t('paymentLinksPage.text21')}
        </Badge>
      );
    }

    return (
      <Badge variant="secondary" className="flex items-center gap-1 w-fit">
        <Clock className="h-3 w-3" />
        {t('paymentLinksPage.text22')}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('paymentLinksPage.text0')}</CardTitle>
              <CardDescription>
                {t('paymentLinksPage.text23')}
              </CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 ml-2" />
                  {t('paymentLinksPage.text24')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>{t('paymentLinksPage.text1')}</DialogTitle>
                  <DialogDescription>
                    {t('paymentLinksPage.text25')}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title">{t('paymentLinksPage.text2')}</Label>
                    <Input
                      id="title"
                      placeholder={t('paymentLinksPage.text3')}
                      value={newLink.title}
                      onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">{t('paymentLinksPage.text4')}</Label>
                    <Textarea
                      id="description"
                      placeholder={t('paymentLinksPage.text5')}
                      value={newLink.description}
                      onChange={(e) => setNewLink({ ...newLink, description: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="amount">{t('paymentLinksPage.text6')}</Label>
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
                    <Label htmlFor="maxUsage">{t('paymentLinksPage.text7')}</Label>
                    <Input
                      id="maxUsage"
                      type="number"
                      placeholder={t('paymentLinksPage.text8')}
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
                    {t('paymentLinksPage.text26')}
                  </Button>
                  <Button
                    onClick={handleCreateLink}
                    disabled={createLinkMutation.isPending}
                  >
                    {createLinkMutation.isPending ? t('paymentLinksPage.text17') : t('paymentLinksPage.text18')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('paymentLinksPage.text27')}
            </div>
          ) : links && links.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('paymentLinksPage.text9')}</TableHead>
                    <TableHead>{t('paymentLinksPage.text10')}</TableHead>
                    <TableHead>{t('paymentLinksPage.text11')}</TableHead>
                    <TableHead>{t('paymentLinksPage.text12')}</TableHead>
                    <TableHead>{t('paymentLinksPage.text13')}</TableHead>
                    <TableHead>{t('paymentLinksPage.text14')}</TableHead>
                    <TableHead>{t('paymentLinksPage.text15')}</TableHead>
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
              <h3 className="text-lg font-semibold mb-2">{t('paymentLinksPage.text16')}</h3>
              <p className="text-muted-foreground mb-4">
                {t('paymentLinksPage.text28')}
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 ml-2" />
                {t('paymentLinksPage.text29')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
