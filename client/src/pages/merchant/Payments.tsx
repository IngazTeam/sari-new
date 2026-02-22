import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Input } from '@/components/ui/input';
import {
  CreditCard,
  TrendingUp,
  DollarSign,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  ExternalLink
} from 'lucide-react';
import { Link } from 'wouter';

export default function Payments() {
  const { t, i18n } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // جلب قائمة المعاملات
  const { data: payments, isLoading, refetch } = trpc.payments.list.useQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 100,
  });

  // جلب الإحصائيات
  const { data: stats } = trpc.payments.getStats.useQuery({});

  // تنسيق المبلغ
  const formatAmount = (amount: number, currency: string = 'SAR') => {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  };

  // تنسيق التاريخ
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // الحصول على badge للحالة
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: any; label: string; icon: any }> = {
      pending: { variant: 'secondary', label: t('paymentsPage.statusPending'), icon: Clock },
      authorized: { variant: 'default', label: t('paymentsPage.statusAuthorized'), icon: CheckCircle },
      captured: { variant: 'default', label: t('paymentsPage.statusCaptured'), icon: CheckCircle },
      failed: { variant: 'destructive', label: t('paymentsPage.statusFailed'), icon: XCircle },
      cancelled: { variant: 'outline', label: t('paymentsPage.statusCancelled'), icon: XCircle },
      refunded: { variant: 'outline', label: t('paymentsPage.statusRefunded'), icon: RefreshCw },
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  // فلترة المعاملات حسب البحث
  const filteredPayments = payments?.filter(payment => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      payment.customerName.toLowerCase().includes(query) ||
      payment.customerPhone.includes(query) ||
      payment.tapChargeId?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* الإحصائيات */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('paymentsPage.totalTransactions')}</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalPayments || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatAmount(stats?.totalAmount || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('paymentsPage.successfulTransactions')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats?.successfulPayments || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatAmount(stats?.successfulAmount || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('paymentsPage.pendingPayments')}</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {stats?.pendingPayments || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('paymentsPage.failedPayments')}</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {stats?.failedPayments || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* جدول المعاملات */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('paymentsPage.paymentTransactions')}</CardTitle>
              <CardDescription>{t('paymentsPage.paymentTransactionsDesc')}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
              >
                <RefreshCw className="h-4 w-4 ml-2" />
                {t('paymentsPage.refresh')}
              </Button>
              <Link href="/merchant/payment-links">
                <Button size="sm">
                  <ExternalLink className="h-4 w-4 ml-2" />
                  {t('paymentsPage.paymentLinks')}
                </Button>
              </Link>
            </div>
          </div>

          {/* الفلاتر */}
          <div className="flex items-center gap-4 mt-4">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('paymentsPage.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 ml-2" />
                <SelectValue placeholder={t('paymentsPage.statusFilter')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('paymentsPage.allStatuses')}</SelectItem>
                <SelectItem value="pending">{t('paymentsPage.statusPending')}</SelectItem>
                <SelectItem value="captured">{t('paymentsPage.statusCaptured')}</SelectItem>
                <SelectItem value="authorized">{t('paymentsPage.statusAuthorized')}</SelectItem>
                <SelectItem value="failed">{t('paymentsPage.statusFailed')}</SelectItem>
                <SelectItem value="cancelled">{t('paymentsPage.statusCancelled')}</SelectItem>
                <SelectItem value="refunded">{t('paymentsPage.statusRefunded')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('paymentsPage.loading')}
            </div>
          ) : filteredPayments && filteredPayments.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('paymentsPage.transactionId')}</TableHead>
                    <TableHead>{t('paymentsPage.customer')}</TableHead>
                    <TableHead>{t('paymentsPage.amount')}</TableHead>
                    <TableHead>{t('paymentsPage.status')}</TableHead>
                    <TableHead>{t('paymentsPage.paymentMethod')}</TableHead>
                    <TableHead>{t('paymentsPage.date')}</TableHead>
                    <TableHead>{t('paymentsPage.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-mono text-sm">
                        #{payment.id}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{payment.customerName}</div>
                          <div className="text-sm text-muted-foreground">
                            {payment.customerPhone}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatAmount(payment.amount, payment.currency)}
                      </TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      <TableCell>
                        {payment.paymentMethod || t('paymentsPage.notSpecified')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(payment.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Link href={`/merchant/payments/${payment.id}`}>
                          <Button variant="ghost" size="sm">
                            {t('paymentsPage.details')}
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {t('paymentsPage.noTransactions')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
