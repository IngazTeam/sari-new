import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    FileText,
    Download,
    Search,
    Filter,
    Clock,
    CheckCircle,
    XCircle,
    Eye,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';

interface Invoice {
    id: number;
    invoiceNumber: string;
    merchantId: number;
    amount: number;
    currency: string;
    status: InvoiceStatus;
    pdfUrl: string | null;
    createdAt: string;
    updatedAt: string;
}

interface InvoiceDetails extends Invoice {
    merchant?: {
        id: number;
        businessName: string;
        phone: string | null;
    } | null;
    payment?: {
        id: number;
        amount: number;
        status: string;
    } | null;
    plan?: {
        id: number;
        name: string;
        nameAr: string;
    } | null;
}

export default function Invoices() {
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
    const [showDetails, setShowDetails] = useState(false);

    // tRPC queries
    const { data: invoices, isLoading, refetch } = trpc.invoices.list.useQuery({
        status: statusFilter === 'all' ? 'all' : statusFilter as InvoiceStatus,
    });

    const { data: stats } = trpc.invoices.getStats.useQuery();

    const { data: selectedInvoice, isLoading: isLoadingDetails } = trpc.invoices.getById.useQuery(
        { id: selectedInvoiceId! },
        { enabled: !!selectedInvoiceId }
    );

    const generatePDFMutation = trpc.invoices.generatePDF.useMutation({
        onSuccess: (data) => {
            toast({
                title: 'تم إنشاء ملف PDF',
                description: 'يمكنك الآن تحميل الفاتورة',
                variant: 'success',
            });
            refetch();
            if (data.pdfUrl) {
                window.open(data.pdfUrl, '_blank');
            }
        },
        onError: (error) => {
            toast({
                title: 'خطأ في إنشاء PDF',
                description: error.message,
                variant: 'destructive',
            });
        },
    });

    // Filter invoices by search query
    const filteredInvoices = invoices?.filter((invoice) => {
        const matchesSearch =
            invoice.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesSearch;
    }) || [];

    const getStatusBadge = (status: InvoiceStatus) => {
        const statusConfig = {
            paid: { label: 'مدفوعة', variant: 'default' as const, icon: CheckCircle },
            sent: { label: 'مرسلة', variant: 'secondary' as const, icon: Clock },
            draft: { label: 'مسودة', variant: 'outline' as const, icon: FileText },
            cancelled: { label: 'ملغاة', variant: 'destructive' as const, icon: XCircle },
        };
        const config = statusConfig[status];
        const Icon = config.icon;
        return (
            <Badge variant={config.variant} className="flex items-center gap-1">
                <Icon className="h-3 w-3" />
                {config.label}
            </Badge>
        );
    };

    const handleViewDetails = (invoiceId: number) => {
        setSelectedInvoiceId(invoiceId);
        setShowDetails(true);
    };

    const handleDownloadPDF = (invoice: Invoice) => {
        if (invoice.pdfUrl) {
            window.open(invoice.pdfUrl, '_blank');
        } else {
            // Generate PDF first
            generatePDFMutation.mutate({ id: invoice.id });
        }
    };

    const formatAmount = (amount: number) => {
        // Amount is stored in halalas (cents), convert to riyals
        return (amount / 100).toLocaleString('ar-SA', { minimumFractionDigits: 2 });
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
                    <h1 className="text-3xl font-bold">الفواتير</h1>
                    <p className="text-muted-foreground mt-2">
                        إدارة ومتابعة فواتير الاشتراكات
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
                        <CardTitle className="text-sm font-medium">إجمالي الفواتير</CardTitle>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.total || 0}</div>
                        <p className="text-xs text-muted-foreground">فاتورة</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">المدفوعة</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{stats?.paid || 0}</div>
                        <p className="text-xs text-muted-foreground">
                            {formatAmount(stats?.paidAmount || 0)} ر.س
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">المعلقة</CardTitle>
                        <Clock className="h-4 w-4 text-yellow-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-yellow-600">{stats?.pending || 0}</div>
                        <p className="text-xs text-muted-foreground">في انتظار الدفع</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">الملغاة</CardTitle>
                        <XCircle className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{stats?.cancelled || 0}</div>
                        <p className="text-xs text-muted-foreground">فاتورة ملغاة</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>قائمة الفواتير</CardTitle>
                    <CardDescription>جميع فواتير الاشتراكات</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="relative flex-1">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="بحث برقم الفاتورة..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pr-10"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-full md:w-[180px]">
                                <Filter className="h-4 w-4 ml-2" />
                                <SelectValue placeholder="الحالة" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">جميع الحالات</SelectItem>
                                <SelectItem value="paid">مدفوعة</SelectItem>
                                <SelectItem value="sent">مرسلة</SelectItem>
                                <SelectItem value="draft">مسودة</SelectItem>
                                <SelectItem value="cancelled">ملغاة</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Invoices Table */}
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-right">رقم الفاتورة</TableHead>
                                    <TableHead className="text-right">المبلغ</TableHead>
                                    <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                                    <TableHead className="text-right">الحالة</TableHead>
                                    <TableHead className="text-right">الإجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredInvoices.length > 0 ? (
                                    filteredInvoices.map((invoice) => (
                                        <TableRow key={invoice.id}>
                                            <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                                            <TableCell>
                                                {formatAmount(invoice.amount)} {invoice.currency}
                                            </TableCell>
                                            <TableCell>
                                                {new Date(invoice.createdAt).toLocaleDateString('ar-SA')}
                                            </TableCell>
                                            <TableCell>{getStatusBadge(invoice.status as InvoiceStatus)}</TableCell>
                                            <TableCell>
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleViewDetails(invoice.id)}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDownloadPDF(invoice)}
                                                        disabled={generatePDFMutation.isPending}
                                                    >
                                                        {generatePDFMutation.isPending ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Download className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            لا توجد فواتير
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Invoice Details Dialog */}
            <Dialog open={showDetails} onOpenChange={(open) => {
                setShowDetails(open);
                if (!open) setSelectedInvoiceId(null);
            }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>تفاصيل الفاتورة {selectedInvoice?.invoiceNumber}</DialogTitle>
                        <DialogDescription>
                            معلومات الفاتورة الكاملة
                        </DialogDescription>
                    </DialogHeader>
                    {isLoadingDetails ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : selectedInvoice ? (
                        <div className="space-y-6">
                            {/* Invoice Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">التاجر</p>
                                    <p className="font-medium">
                                        {(selectedInvoice as InvoiceDetails).merchant?.businessName || 'غير محدد'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">الحالة</p>
                                    {getStatusBadge(selectedInvoice.status as InvoiceStatus)}
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">تاريخ الإنشاء</p>
                                    <p className="font-medium">
                                        {new Date(selectedInvoice.createdAt).toLocaleDateString('ar-SA')}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">المبلغ</p>
                                    <p className="font-medium text-lg">
                                        {formatAmount(selectedInvoice.amount)} {selectedInvoice.currency}
                                    </p>
                                </div>
                                {(selectedInvoice as InvoiceDetails).plan && (
                                    <div>
                                        <p className="text-sm text-muted-foreground">الباقة</p>
                                        <p className="font-medium">
                                            {(selectedInvoice as InvoiceDetails).plan?.nameAr || (selectedInvoice as InvoiceDetails).plan?.name}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setShowDetails(false)}>
                                    إغلاق
                                </Button>
                                <Button
                                    onClick={() => handleDownloadPDF(selectedInvoice)}
                                    disabled={generatePDFMutation.isPending}
                                >
                                    {generatePDFMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                                    ) : (
                                        <Download className="h-4 w-4 ml-2" />
                                    )}
                                    تحميل PDF
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    );
}
