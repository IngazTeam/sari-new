import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  Upload, FileText, Download, ArrowRight, CheckCircle2, XCircle,
  AlertCircle, FileSpreadsheet, Link2, RefreshCw, Clock, Table2, Plus, Sparkles, Brain
} from 'lucide-react';
import { useState, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useLocation } from 'wouter';

export default function UploadProducts() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'file' | 'sheets' | 'template'>('file');
  const [createSheet, setCreateSheet] = useState(true);
  const [importType, setImportType] = useState<'auto' | 'products' | 'services'>('auto');
  const [smartResult, setSmartResult] = useState<any>(null);

  // Mutations
  const uploadCSV = trpc.products.uploadCSV.useMutation({
    onSuccess: (data: any) => {
      setUploadResult(data);
      toast.success(t('uploadProductsPage.importSuccess', { count: data.imported }));
      resetFile();
    },
    onError: (error: any) => {
      toast.error(t('uploadProductsPage.uploadFailed') + error.message);
    },
  });

  const uploadExcel = trpc.products.uploadExcel.useMutation({
    onSuccess: (data: any) => {
      setUploadResult(data);
      if (data.autoDetected) {
        toast.success(data.message || `تم التعرف تلقائياً على الأعمدة واستيراد ${data.imported} عنصر`);
      } else {
        toast.success(data.message || t('uploadProductsPage.importSuccess', { count: data.imported }));
      }
      if (data.sheetCreated && data.spreadsheetUrl) {
        toast.success('تم رفع البيانات على Google Sheet تلقائياً', {
          action: {
            label: 'فتح الشيت',
            onClick: () => window.open(data.spreadsheetUrl, '_blank'),
          },
        });
      }
      if (data.existingSheetWarning) {
        toast.info(data.existingSheetWarning);
      }
      resetFile();
      sheetStatus.refetch();
    },
    onError: (error: any) => {
      toast.error(t('uploadProductsPage.uploadFailed') + error.message);
    },
  });

  // GPT Smart Import
  const smartImport = trpc.products.smartImport.useMutation({
    onSuccess: (data: any) => {
      setUploadResult(data);
      setSmartResult(data);
      toast.success(data.message || `تم استيراد ${data.imported} عنصر بنجاح`);
      if (data.sheetCreated && data.spreadsheetUrl) {
        toast.success('تم رفع البيانات على Google Sheet تلقائياً', {
          action: {
            label: 'فتح الشيت',
            onClick: () => window.open(data.spreadsheetUrl, '_blank'),
          },
        });
      }
      resetFile();
      sheetStatus.refetch();
    },
    onError: (error: any) => {
      toast.error('فشل الاستيراد الذكي: ' + error.message);
    },
  });

  const syncSheets = trpc.products.syncFromGoogleSheets.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.message);
      setUploadResult({
        imported: data.created,
        updated: data.updated,
        skipped: data.skipped,
        total: data.total,
      });
      sheetStatus.refetch();
    },
    onError: (error: any) => {
      toast.error(t('uploadProductsPage.syncFailed') + error.message);
    },
  });

  const sheetStatus = trpc.products.getSheetSyncStatus.useQuery();

  const resetFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      toast.error(t('uploadProductsPage.invalidFileFormat'));
      return;
    }
    setSelectedFile(file);
    setUploadResult(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error(t('uploadProductsPage.selectFileFirst'));
      return;
    }

    const ext = selectedFile.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      const text = await selectedFile.text();
      uploadCSV.mutate({ csvData: text });
    } else {
      // Excel file — read as base64 (auto-creates Google Sheet if connected)
      const arrayBuffer = await selectedFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      uploadExcel.mutate({ fileBase64: base64, fileName: selectedFile.name });
    }
  };

  const handleSmartImport = async () => {
    if (!selectedFile) {
      toast.error(t('uploadProductsPage.selectFileFirst'));
      return;
    }
    const arrayBuffer = await selectedFile.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    smartImport.mutate({ fileBase64: base64, fileName: selectedFile.name, importType });
  };

  const downloadTemplate = (type: 'products' | 'services') => {
    const csvContent = type === 'products'
      ? '\uFEFFالاسم,الوصف,السعر,رابط الصورة,الكمية,التصنيف\nمنتج تجريبي,وصف المنتج هنا,99.99,https://example.com/image.jpg,10,إلكترونيات\nعطر فاخر,عطر رجالي بتركيبة فرنسية,250,,50,عطور'
      : '\uFEFFاسم الخدمة,الوصف,السعر,المدة (بالساعات),المدرب,الموقع,التصنيف,معتمد\nدورة التسويق الرقمي,دورة شاملة في التسويق عبر السوشال ميديا,1500,10,أحمد محمد,الرياض,تسويق,نعم\nورشة القيادة,ورشة عمل في المهارات القيادية,800,6,سارة أحمد,جدة,إدارة,نعم';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = type === 'products' ? 'نموذج_المنتجات.csv' : 'نموذج_الخدمات.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const isUploading = uploadCSV.isPending || uploadExcel.isPending || smartImport.isPending;

  const tabs = [
    { id: 'file' as const, label: t('uploadProductsPage.tabFile'), icon: <FileSpreadsheet className="h-4 w-4" /> },
    { id: 'sheets' as const, label: 'Google Sheets', icon: <Link2 className="h-4 w-4" /> },
    { id: 'template' as const, label: t('uploadProductsPage.tabTemplate'), icon: <Table2 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('uploadProductsPage.title')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('uploadProductsPage.subtitle')}
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation('/merchant/products')}>
          <ArrowRight className="h-4 w-4 ml-2" />
          {t('uploadProductsPage.backToProducts')}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setUploadResult(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === tab.id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
              }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════ TAB 1: File Upload ════════════ */}
      {activeTab === 'file' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                {t('uploadProductsPage.uploadCsvExcel')}
              </CardTitle>
              <CardDescription>
                {t('uploadProductsPage.uploadCsvExcelDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />

                {selectedFile ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <FileText className="h-8 w-8" />
                      <span className="font-medium">{selectedFile.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('uploadProductsPage.fileSize', { size: (selectedFile.size / 1024).toFixed(1) })}
                    </p>
                    {/* Import type selector */}
                    <div className="flex gap-3 justify-center">
                      {(['auto', 'products', 'services'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => setImportType(type)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            importType === type
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-muted text-muted-foreground border-transparent hover:border-muted-foreground/30'
                          }`}
                        >
                          {type === 'auto' ? '🤖 تلقائي' : type === 'products' ? '📦 منتجات' : '🛎️ خدمات'}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2 justify-center">
                      <Button
                        onClick={handleSmartImport}
                        disabled={isUploading}
                        className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 gap-2"
                      >
                        {smartImport.isPending ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            جاري التحليل بالذكاء الاصطناعي...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            استيراد ذكي بالـ AI
                          </>
                        )}
                      </Button>
                      <Button onClick={handleUpload} variant="outline" disabled={isUploading}>
                        {(uploadCSV.isPending || uploadExcel.isPending) ? (
                          <>
                            <RefreshCw className="h-4 w-4 ml-2 animate-spin" />
                            {t('uploadProductsPage.importing')}
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 ml-2" />
                            استيراد عادي
                          </>
                        )}
                      </Button>
                      <Button variant="ghost" onClick={resetFile}>{t('uploadProductsPage.cancel')}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground" />
                    <div>
                      <p className="text-lg font-medium">{t('uploadProductsPage.selectExcelCsv')}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('uploadProductsPage.supportedFormats')}
                      </p>
                    </div>
                    <Button onClick={() => fileInputRef.current?.click()}>
                      <Plus className="h-4 w-4 ml-2" />
                      {t('uploadProductsPage.chooseFile')}
                    </Button>
                  </div>
                )}
              </div>

              {/* Auto-create Google Sheet checkbox */}
              {selectedFile && !selectedFile.name.endsWith('.csv') && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                  <Checkbox
                    id="create-sheet"
                    checked={createSheet}
                    onCheckedChange={(v) => setCreateSheet(!!v)}
                  />
                  <Label htmlFor="create-sheet" className="cursor-pointer text-sm">
                    <span className="font-medium">{t('uploadProducts.auto_0')}</span>
                    <span className="text-muted-foreground block text-xs mt-0.5">{t('uploadProducts.auto_1')}</span>
                  </Label>
                </div>
              )}

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{t('uploadProductsPage.supportedColumns')}</strong> {t('uploadProductsPage.supportedColumnsList')}
                </AlertDescription>
              </Alert>

              {/* Smart Result — AI Analysis */}
              {smartResult && (
                <div className="space-y-3 p-4 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200">
                  <div className="flex items-center gap-2 text-violet-700 font-semibold">
                    <Brain className="h-5 w-5" />
                    تحليل الذكاء الاصطناعي
                  </div>
                  {smartResult.businessType && (
                    <p className="text-sm"><strong>نوع النشاط:</strong> {smartResult.businessType === 'services' ? '🛎️ خدمات/دورات' : '📦 منتجات'}</p>
                  )}
                  {smartResult.businessSummary && (
                    <p className="text-sm"><strong>الملخص:</strong> {smartResult.businessSummary}</p>
                  )}
                  {smartResult.sellingTips && (
                    <p className="text-sm"><strong>نصائح البيع:</strong> {smartResult.sellingTips}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          {uploadResult && <ResultCard result={uploadResult} onViewProducts={() => setLocation('/merchant/products')} />}
        </div>
      )}

      {/* ════════════ TAB 2: Google Sheets ════════════ */}
      {activeTab === 'sheets' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-green-600" />
                {t('uploadProductsPage.syncGoogleSheets')}
              </CardTitle>
              <CardDescription>
                {t('uploadProductsPage.syncGoogleSheetsDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sheetStatus.data?.connected ? (
                <div className="space-y-4">
                  {/* Connected status */}
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
                    <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-green-900">{t('uploadProductsPage.connectedSheets')}</p>
                      {sheetStatus.data.lastSync && (
                        <p className="text-sm text-green-700 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t('uploadProductsPage.lastSync')} {new Date(sheetStatus.data.lastSync).toLocaleString('ar-SA')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Sync instructions */}
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t('uploadProductsPage.sheetInstructions')}
                    </AlertDescription>
                  </Alert>

                  {/* Sync buttons */}
                  <div className="flex gap-3">
                    <Button
                      onClick={() => syncSheets.mutate()}
                      disabled={syncSheets.isPending}
                      className="flex-1"
                    >
                      {syncSheets.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 ml-2 animate-spin" />
                          {t('uploadProductsPage.syncing')}
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 ml-2" />
                          {t('uploadProductsPage.syncNow')}
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Smart sync note */}
                  <p className="text-xs text-muted-foreground text-center">
                    {t('uploadProductsPage.smartSyncNote')}
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <Link2 className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <p className="text-lg font-medium">{t('uploadProductsPage.sheetsNotLinked')}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('uploadProductsPage.linkFromIntegrations')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setLocation('/merchant/sheets/settings')}
                  >
                    {t('uploadProductsPage.goToIntegrations')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          {uploadResult && (
            <Card className="border-green-200 bg-green-50/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <CardTitle className="text-green-900">{t('uploadProductsPage.syncResult')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 rounded-lg bg-white/60">
                    <p className="text-2xl font-bold text-green-600">{uploadResult.imported || 0}</p>
                    <p className="text-xs text-muted-foreground">{t('uploadProductsPage.newProduct')}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/60">
                    <p className="text-2xl font-bold text-blue-600">{uploadResult.updated || 0}</p>
                    <p className="text-xs text-muted-foreground">{t('uploadProductsPage.updated')}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/60">
                    <p className="text-2xl font-bold text-gray-500">{uploadResult.skipped || 0}</p>
                    <p className="text-xs text-muted-foreground">{t('uploadProductsPage.skipped')}</p>
                  </div>
                </div>
                <Button className="w-full mt-4" onClick={() => setLocation('/merchant/products')}>
                  {t('uploadProductsPage.viewProducts')}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ════════════ TAB 3: Template ════════════ */}
      {activeTab === 'template' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Table2 className="h-5 w-5 text-purple-600" />
                {t('uploadProductsPage.downloadTemplate')}
              </CardTitle>
              <CardDescription>
                {t('uploadProductsPage.downloadTemplateDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Steps */}
              <div className="grid gap-4">
                <div className="flex gap-3 items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-purple-700">1</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium">{t('uploadProductsPage.step1Download')}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('uploadProductsPage.step1DownloadDesc')}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" size="sm" onClick={() => downloadTemplate('products')}>
                        <Download className="h-4 w-4 ml-2" />
                        📦 نموذج المنتجات
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => downloadTemplate('services')}>
                        <Download className="h-4 w-4 ml-2" />
                        🛎️ نموذج الخدمات
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-purple-700">2</span>
                  </div>
                  <div>
                    <h3 className="font-medium">{t('uploadProductsPage.step2Fill')}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('uploadProductsPage.step2FillDesc')}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-purple-700">3</span>
                  </div>
                  <div>
                    <h3 className="font-medium">{t('uploadProductsPage.step3Upload')}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('uploadProductsPage.step3UploadDesc')}
                    </p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => setActiveTab('file')}>
                      <ArrowRight className="h-4 w-4 ml-2" />
                      {t('uploadProductsPage.goToFileUpload')}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Column reference */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-medium mb-3">{t('uploadProductsPage.availableColumns')}</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right border-b">
                        <th className="p-2 font-medium">{t('uploadProductsPage.column')}</th>
                        <th className="p-2 font-medium">{t('uploadProductsPage.required')}</th>
                        <th className="p-2 font-medium">{t('uploadProductsPage.example')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { name: t('uploadProductsPage.colName'), required: true, example: t('uploadProductsPage.exName') },
                        { name: t('uploadProductsPage.colPrice'), required: false, example: '1999.99' },
                        { name: t('uploadProductsPage.colDesc'), required: false, example: t('uploadProductsPage.exDesc') },
                        { name: t('uploadProductsPage.colQty'), required: false, example: '50' },
                        { name: t('uploadProductsPage.colCategory'), required: false, example: t('uploadProductsPage.exCategory') },
                        { name: t('uploadProductsPage.colImage'), required: false, example: 'https://...' },
                      ].map(col => (
                        <tr key={col.name} className="border-b last:border-0">
                          <td className="p-2 font-medium">{col.name}</td>
                          <td className="p-2">
                            {col.required ? (
                              <span className="text-red-500 text-xs font-medium">{t('uploadProductsPage.required')}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">{t('uploadProductsPage.optional')}</span>
                            )}
                          </td>
                          <td className="p-2 text-muted-foreground font-mono text-xs">{col.example}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ────────── Shared Result Card ──────────
function ResultCard({ result, onViewProducts }: { result: any; onViewProducts: () => void }) {
  const { t } = useTranslation();
  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <CardTitle className="text-green-900">{t('uploadProductsPage.importResult')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">{t('uploadProductsPage.totalRecords')}</span>
            <span className="text-sm">{result.total}</span>
          </div>
          <div className="flex justify-between items-center text-green-600">
            <span className="text-sm font-medium">{t('uploadProductsPage.importedSuccess')}</span>
            <span className="text-sm font-bold">{result.imported}</span>
          </div>
          {result.failed > 0 && (
            <div className="flex justify-between items-center text-red-600">
              <span className="text-sm font-medium">{t('uploadProductsPage.importFailed')}</span>
              <span className="text-sm font-bold">{result.failed}</span>
            </div>
          )}
          {result.errors?.length > 0 && (
            <div className="mt-2 p-3 rounded bg-red-50 border border-red-200">
              <p className="text-xs font-medium text-red-800 mb-1">{t('uploadProductsPage.errorDetails')}</p>
              {result.errors.map((err: string, i: number) => (
                <p key={i} className="text-xs text-red-600 flex items-start gap-1">
                  <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  {err}
                </p>
              ))}
            </div>
          )}
        </div>
        {result.sheetCreated && result.spreadsheetUrl && (
          <div className="mt-3 p-3 rounded-lg bg-green-100 border border-green-300">
            <p className="text-sm font-medium text-green-900 mb-1">{t('uploadProducts.auto_2')}</p>
            <a href={result.spreadsheetUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-green-700 underline hover:text-green-900 flex items-center gap-1">
              <Link2 className="h-3 w-3" />{t('uploadProducts.auto_3')}</a>
            <p className="text-xs text-green-600 mt-1">{t('uploadProducts.auto_4')}</p>
          </div>
        )}
        <Button className="w-full mt-4" onClick={onViewProducts}>
          {t('uploadProductsPage.viewProducts')}
        </Button>
      </CardContent>
    </Card>
  );
}
