import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Search, Download, TrendingUp, UserCheck, UserPlus, UserX, Phone, ShoppingBag, Award } from 'lucide-react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export default function CustomersManagement() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'new' | 'inactive'>('all');

  // Fetch customers
  const { data: customers, isLoading } = trpc.customers.list.useQuery({
    search: searchQuery,
    status: statusFilter,
  });

  // Fetch stats
  const { data: stats } = trpc.customers.getStats.useQuery();

  // Export customers
  const exportMutation = trpc.customers.export.useQuery(undefined, {
    enabled: false,
  });

  const handleExport = async () => {
    try {
      const data = await exportMutation.refetch();
      if (data.data) {
        // Convert to CSV
        const headers = Object.keys(data.data[0]);
        const csv = [
          headers.join(','),
          ...data.data.map((row: any) => headers.map(h => row[h]).join(','))
        ].join('\n');

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `customers_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();

        toast.success(t('customersManagementPage.text0'));
      }
    } catch (error) {
      toast.error(t('customersManagementPage.text1'));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500">{t('customersManagementPage.text2')}</Badge>;
      case 'new':
        return <Badge className="bg-blue-500">{t('customersManagementPage.text3')}</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-500">{t('customersManagementPage.text4')}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="w-8 h-8" />
            إدارة العملاء
          </h1>
          <p className="text-muted-foreground mt-2">
            عرض وإدارة جميع عملائك في مكان واحد
          </p>
        </div>
        <Button onClick={handleExport} variant="outline">
          <Download className="w-4 h-4 mr-2" />
          تصدير البيانات
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('customersManagementPage.text5')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">{t('customersManagementPage.text6')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('customersManagementPage.text7')}</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.active || 0}</div>
            <p className="text-xs text-muted-foreground">{t('customersManagementPage.text8')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('customersManagementPage.text9')}</CardTitle>
            <UserPlus className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.new || 0}</div>
            <p className="text-xs text-muted-foreground">{t('customersManagementPage.text10')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('customersManagementPage.text11')}</CardTitle>
            <UserX className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{stats?.inactive || 0}</div>
            <p className="text-xs text-muted-foreground">{t('customersManagementPage.text12')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t('customersManagementPage.text13')}</CardTitle>
          <CardDescription>{t('customersManagementPage.text14')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('customersManagementPage.text15')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t('customersManagementPage.text16')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('customersManagementPage.text17')}</SelectItem>
                <SelectItem value="active">{t('customersManagementPage.text18')}</SelectItem>
                <SelectItem value="new">{t('customersManagementPage.text19')}</SelectItem>
                <SelectItem value="inactive">{t('customersManagementPage.text20')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('customersManagementPage.text21')}</CardTitle>
          <CardDescription>
            {customers?.length || 0} عميل
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">{t('customersManagementPage.text22')}</div>
          ) : customers && customers.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('customersManagementPage.text23')}</TableHead>
                    <TableHead>{t('customersManagementPage.text24')}</TableHead>
                    <TableHead>{t('customersManagementPage.text25')}</TableHead>
                    <TableHead>{t('customersManagementPage.text26')}</TableHead>
                    <TableHead>{t('customersManagementPage.text27')}</TableHead>
                    <TableHead>{t('customersManagementPage.text28')}</TableHead>
                    <TableHead>{t('customersManagementPage.text29')}</TableHead>
                    <TableHead>{t('customersManagementPage.text30')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer: any) => (
                    <TableRow key={customer.customerPhone}>
                      <TableCell className="font-medium">
                        {customer.customerName || 'غير معروف'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          {customer.customerPhone}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                          {customer.orderCount}
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {customer.totalSpent.toFixed(2)} ريال
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Award className="w-4 h-4 text-yellow-500" />
                          {customer.loyaltyPoints}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(customer.status)}</TableCell>
                      <TableCell>
                        {new Date(customer.lastMessageAt).toLocaleDateString('ar-SA')}
                      </TableCell>
                      <TableCell>
                        <Link href={`/merchant/customers/${encodeURIComponent(customer.customerPhone)}`}>
                          <Button variant="ghost" size="sm">
                            عرض التفاصيل
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('customersManagementPage.text31')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
