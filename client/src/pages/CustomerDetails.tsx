import { useParams, Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User,
  Phone,
  ShoppingBag,
  MessageSquare,
  Award,
  ArrowLeft,
  Calendar,
  TrendingUp,
  Package,
  Clock,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function CustomerDetails() {
  const { t } = useTranslation();
  const params = useParams();
  const customerPhone = decodeURIComponent(params.phone || '');

  // Fetch customer details
  const { data: customer, isLoading } = trpc.customers.getByPhone.useQuery({
    customerPhone,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">{t('customerDetailsPage.text0')}</div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="text-center py-12">
            <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t('customerDetailsPage.text1')}</p>
            <Link href="/merchant/customers">
              <Button className="mt-4" variant="outline">
                العودة للقائمة
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500">{t('customerDetailsPage.text2')}</Badge>;
      case 'new':
        return <Badge className="bg-blue-500">{t('customerDetailsPage.text3')}</Badge>;
      case 'inactive':
        return <Badge className="bg-gray-500">{t('customerDetailsPage.text4')}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getOrderStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      pending: { label: 'قيد الانتظار', className: 'bg-yellow-500' },
      confirmed: { label: 'مؤكد', className: 'bg-blue-500' },
      processing: { label: 'جاري التحضير', className: 'bg-purple-500' },
      shipped: { label: 'تم الشحن', className: 'bg-indigo-500' },
      delivered: { label: 'تم التوصيل', className: 'bg-green-500' },
      cancelled: { label: 'ملغي', className: 'bg-red-500' },
    };

    const statusInfo = statusMap[status] || { label: status, className: '' };
    return <Badge className={statusInfo.className}>{statusInfo.label}</Badge>;
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/merchant/customers">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <User className="w-8 h-8" />
            {customer.customerName || 'عميل غير معروف'}
          </h1>
          <p className="text-muted-foreground mt-1">
            تفاصيل العميل الكاملة
          </p>
        </div>
        {getStatusBadge(customer.status)}
      </div>

      {/* Customer Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('customerDetailsPage.text5')}</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{customer.customerPhone}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('customerDetailsPage.text6')}</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customer.orderCount}</div>
            <p className="text-xs text-muted-foreground">{t('customerDetailsPage.text7')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('customerDetailsPage.text8')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {customer.totalSpent.toFixed(2)} ريال
            </div>
            <p className="text-xs text-muted-foreground">{t('customerDetailsPage.text9')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('customerDetailsPage.text10')}</CardTitle>
            <Award className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {customer.loyaltyPoints}
            </div>
            <p className="text-xs text-muted-foreground">{t('customerDetailsPage.text11')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline Info */}
      <Card>
        <CardHeader>
          <CardTitle>{t('customerDetailsPage.text12')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t('customerDetailsPage.text13')}</p>
                <p className="font-medium">
                  {new Date(customer.firstMessageAt).toLocaleDateString('ar-SA', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t('customerDetailsPage.text14')}</p>
                <p className="font-medium">
                  {new Date(customer.lastMessageAt).toLocaleDateString('ar-SA', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Orders & Conversations */}
      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="orders">
            <ShoppingBag className="w-4 h-4 mr-2" />
            الطلبات ({customer.orders?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="conversations">
            <MessageSquare className="w-4 h-4 mr-2" />
            المحادثات ({customer.conversations?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Orders Tab */}
        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>{t('customerDetailsPage.text15')}</CardTitle>
              <CardDescription>{t('customerDetailsPage.text16')}</CardDescription>
            </CardHeader>
            <CardContent>
              {customer.orders && customer.orders.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('customerDetailsPage.text17')}</TableHead>
                        <TableHead>{t('customerDetailsPage.text18')}</TableHead>
                        <TableHead>{t('customerDetailsPage.text19')}</TableHead>
                        <TableHead>{t('customerDetailsPage.text20')}</TableHead>
                        <TableHead>{t('customerDetailsPage.text21')}</TableHead>
                        <TableHead>{t('customerDetailsPage.text22')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customer.orders.map((order: any) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">#{order.id}</TableCell>
                          <TableCell>
                            {new Date(order.createdAt).toLocaleDateString('ar-SA')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4 text-muted-foreground" />
                              {JSON.parse(order.items || '[]').length} منتج
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold">
                            {order.totalAmount.toFixed(2)} ريال
                          </TableCell>
                          <TableCell>{getOrderStatusBadge(order.status)}</TableCell>
                          <TableCell>
                            <Link href={`/merchant/orders`}>
                              <Button variant="ghost" size="sm">
                                عرض
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
                  <ShoppingBag className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">{t('customerDetailsPage.text23')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conversations Tab */}
        <TabsContent value="conversations">
          <Card>
            <CardHeader>
              <CardTitle>{t('customerDetailsPage.text24')}</CardTitle>
              <CardDescription>{t('customerDetailsPage.text25')}</CardDescription>
            </CardHeader>
            <CardContent>
              {customer.conversations && customer.conversations.length > 0 ? (
                <div className="space-y-4">
                  {customer.conversations.map((conv: any) => (
                    <Card key={conv.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <MessageSquare className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium">محادثة #{conv.id}</span>
                              <Badge variant="outline">
                                {conv.messageCount || 0} رسالة
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              آخر رسالة: {conv.lastMessage || 'لا توجد رسائل'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(conv.lastMessageAt).toLocaleString('ar-SA')}
                            </p>
                          </div>
                          <Link href={`/merchant/conversations`}>
                            <Button variant="ghost" size="sm">
                              عرض المحادثة
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">{t('customerDetailsPage.text26')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
