import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, Search, Package, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function WooCommerceProducts() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  // Queries
  const { data: productsData, isLoading, refetch } = trpc.woocommerce.getProducts.useQuery({
    page,
    limit: 50,
  });

  const { data: searchResults, isLoading: isSearching } = trpc.woocommerce.searchProducts.useQuery(
    { search: searchTerm, limit: 20 },
    { enabled: searchTerm.length > 2 }
  );

  // Mutations
  const syncProducts = trpc.woocommerce.syncProducts.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'تمت المزامنة',
        description: data.message,
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

  const handleSync = () => {
    if (confirm('هل تريد مزامنة المنتجات من WooCommerce؟ قد تستغرق هذه العملية بعض الوقت.')) {
      syncProducts.mutate();
    }
  };

  const products = searchTerm.length > 2 ? searchResults : productsData?.products;
  const stats = productsData?.stats;

  const getStockStatusBadge = (status: string) => {
    switch (status) {
      case 'instock':
        return <Badge className="bg-green-500">متوفر</Badge>;
      case 'outofstock':
        return <Badge variant="destructive">غير متوفر</Badge>;
      case 'onbackorder':
        return <Badge className="bg-yellow-500">متوفر قريباً</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">منتجات WooCommerce</h1>
          <p className="text-muted-foreground mt-2">
            عرض وإدارة المنتجات المزامنة من متجر WooCommerce
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncProducts.isPending}>
          {syncProducts.isPending ? (
            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 ml-2" />
          )}
          مزامنة المنتجات
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي المنتجات</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">متوفر</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.inStock}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">غير متوفر</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.outOfStock}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">متوفر قريباً</CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.onBackorder}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>بحث عن منتج</CardTitle>
          <CardDescription>
            ابحث بالاسم أو SKU
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ابحث عن منتج..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة المنتجات</CardTitle>
          <CardDescription>
            {products?.length || 0} منتج
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSearching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : products && products.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الصورة</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>المخزون</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>آخر مزامنة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-12 h-12 object-cover rounded"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                            <Package className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium max-w-xs truncate">
                        {product.name}
                      </TableCell>
                      <TableCell>{product.sku || '-'}</TableCell>
                      <TableCell>
                        {product.salePrice && parseFloat(product.salePrice) > 0 ? (
                          <div className="flex flex-col">
                            <span className="line-through text-muted-foreground text-sm">
                              {parseFloat(product.regularPrice || '0').toFixed(2)}
                            </span>
                            <span className="text-green-600 font-medium">
                              {parseFloat(product.salePrice).toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <span>{parseFloat(product.price).toFixed(2)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {product.manageStock ? product.stockQuantity || 0 : '-'}
                      </TableCell>
                      <TableCell>{getStockStatusBadge(product.stockStatus)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(product.lastSyncAt).toLocaleString('ar-SA', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد منتجات. قم بمزامنة المنتجات من WooCommerce أولاً.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {productsData && productsData.pagination.total > productsData.pagination.limit && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
          >
            السابق
          </Button>
          <span className="text-sm text-muted-foreground">
            صفحة {page} من {Math.ceil(productsData.pagination.total / productsData.pagination.limit)}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage(page + 1)}
            disabled={page >= Math.ceil(productsData.pagination.total / productsData.pagination.limit)}
          >
            التالي
          </Button>
        </div>
      )}
    </div>
  );
}
