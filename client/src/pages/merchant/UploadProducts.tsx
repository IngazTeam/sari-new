import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  Upload, FileText, Download, ArrowRight, CheckCircle2, XCircle,
  AlertCircle, FileSpreadsheet, Link2, RefreshCw, Clock, Table2, Plus
} from 'lucide-react';
import { useState, useRef } from 'react';
import { useLocation } from 'wouter';

export default function UploadProducts() {
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'file' | 'sheets' | 'template'>('file');

  // Mutations
  const uploadCSV = trpc.products.uploadCSV.useMutation({
    onSuccess: (data) => {
      setUploadResult(data);
      toast.success(`تم استيراد ${data.imported} منتج بنجاح`);
      resetFile();
    },
    onError: (error) => {
      toast.error('فشل الرفع: ' + error.message);
    },
  });

  const uploadExcel = trpc.products.uploadExcel.useMutation({
    onSuccess: (data) => {
      setUploadResult(data);
      toast.success(`تم استيراد ${data.imported} منتج بنجاح`);
      resetFile();
    },
    onError: (error) => {
      toast.error('فشل الرفع: ' + error.message);
    },
  });

  const syncSheets = trpc.products.syncFromGoogleSheets.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setUploadResult({
        imported: data.created,
        updated: data.updated,
        skipped: data.skipped,
        total: data.total,
      });
      sheetStatus.refetch();
    },
    onError: (error) => {
      toast.error('فشلت المزامنة: ' + error.message);
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
      toast.error('الملف يجب أن يكون بصيغة CSV أو Excel (.xlsx)');
      return;
    }
    setSelectedFile(file);
    setUploadResult(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('يرجى اختيار ملف أولاً');
      return;
    }

    const ext = selectedFile.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv') {
      const text = await selectedFile.text();
      uploadCSV.mutate({ csvData: text });
    } else {
      // Excel file — read as base64
      const arrayBuffer = await selectedFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      uploadExcel.mutate({ fileBase64: base64, fileName: selectedFile.name });
    }
  };

  const downloadTemplate = (format: 'csv' | 'xlsx') => {
    if (format === 'csv') {
      const csvContent = '\uFEFFالاسم,الوصف,السعر,رابط الصورة,الكمية,التصنيف\nمنتج تجريبي,وصف المنتج هنا,99.99,https://example.com/image.jpg,10,إلكترونيات';
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'قالب_المنتجات.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    }
  };

  const isUploading = uploadCSV.isPending || uploadExcel.isPending;

  const tabs = [
    { id: 'file' as const, label: 'رفع ملف', icon: <FileSpreadsheet className="h-4 w-4" /> },
    { id: 'sheets' as const, label: 'Google Sheets', icon: <Link2 className="h-4 w-4" /> },
    { id: 'template' as const, label: 'قالب جاهز', icon: <Table2 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">استيراد المنتجات</h1>
          <p className="text-muted-foreground mt-2">
            رفع المنتجات من ملف Excel أو CSV أو مزامنتها من Google Sheets
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation('/merchant/products')}>
          <ArrowRight className="h-4 w-4 ml-2" />
          العودة للمنتجات
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
                رفع ملف CSV أو Excel
              </CardTitle>
              <CardDescription>
                يدعم ملفات .csv و .xlsx — العناوين يمكن أن تكون بالعربي أو الإنجليزي
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
                      الحجم: {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                    <div className="flex gap-2 justify-center">
                      <Button onClick={handleUpload} disabled={isUploading}>
                        {isUploading ? (
                          <>
                            <RefreshCw className="h-4 w-4 ml-2 animate-spin" />
                            جاري الاستيراد...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 ml-2" />
                            رفع واستيراد
                          </>
                        )}
                      </Button>
                      <Button variant="outline" onClick={resetFile}>إلغاء</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground" />
                    <div>
                      <p className="text-lg font-medium">اختر ملف Excel أو CSV</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        صيغ مدعومة: .xlsx, .csv
                      </p>
                    </div>
                    <Button onClick={() => fileInputRef.current?.click()}>
                      <Plus className="h-4 w-4 ml-2" />
                      اختيار ملف
                    </Button>
                  </div>
                )}
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>الأعمدة المدعومة:</strong> الاسم (مطلوب) · السعر · الوصف · الكمية · التصنيف · رابط الصورة
                </AlertDescription>
              </Alert>
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
                مزامنة من Google Sheets
              </CardTitle>
              <CardDescription>
                اربط جدول Google Sheets وزامن منتجاتك تلقائياً
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sheetStatus.data?.connected ? (
                <div className="space-y-4">
                  {/* Connected status */}
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
                    <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-green-900">متصل بـ Google Sheets</p>
                      {sheetStatus.data.lastSync && (
                        <p className="text-sm text-green-700 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          آخر مزامنة: {new Date(sheetStatus.data.lastSync).toLocaleString('ar-SA')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Sync instructions */}
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      تأكد من وجود ورقة باسم <strong>"المنتجات"</strong> أو <strong>"Products"</strong> في الشيت، مع أعمدة: الاسم، السعر، الوصف، الكمية، التصنيف، رابط الصورة
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
                          جاري المزامنة...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 ml-2" />
                          مزامنة الآن
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Smart sync note */}
                  <p className="text-xs text-muted-foreground text-center">
                    المزامنة ذكية — المنتجات الموجودة يتم تحديثها والجديدة تُضاف تلقائياً
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <Link2 className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <p className="text-lg font-medium">Google Sheets غير مربوط</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      اربط حسابك من صفحة التكاملات أولاً
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setLocation('/merchant/integrations')}
                  >
                    الذهاب لصفحة التكاملات
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
                  <CardTitle className="text-green-900">نتيجة المزامنة</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 rounded-lg bg-white/60">
                    <p className="text-2xl font-bold text-green-600">{uploadResult.imported || 0}</p>
                    <p className="text-xs text-muted-foreground">منتج جديد</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/60">
                    <p className="text-2xl font-bold text-blue-600">{uploadResult.updated || 0}</p>
                    <p className="text-xs text-muted-foreground">تم تحديثه</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/60">
                    <p className="text-2xl font-bold text-gray-500">{uploadResult.skipped || 0}</p>
                    <p className="text-xs text-muted-foreground">تم تخطيه</p>
                  </div>
                </div>
                <Button className="w-full mt-4" onClick={() => setLocation('/merchant/products')}>
                  عرض المنتجات
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
                تحميل قالب جاهز
              </CardTitle>
              <CardDescription>
                حمّل القالب، عبّي بيانات منتجاتك، ثم ارفعه من تبويب "رفع ملف"
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
                    <h3 className="font-medium">حمّل القالب</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      اختر صيغة القالب المناسبة لك
                    </p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => downloadTemplate('csv')}>
                      <Download className="h-4 w-4 ml-2" />
                      تحميل قالب CSV
                    </Button>
                  </div>
                </div>

                <div className="flex gap-3 items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-purple-700">2</span>
                  </div>
                  <div>
                    <h3 className="font-medium">أدخل بيانات منتجاتك</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      افتح القالب في Excel أو Google Sheets وأدخل بيانات كل منتج في سطر
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-purple-700">3</span>
                  </div>
                  <div>
                    <h3 className="font-medium">ارفع الملف</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      انتقل لتبويب "رفع ملف" وارفع الملف المعبّأ
                    </p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => setActiveTab('file')}>
                      <ArrowRight className="h-4 w-4 ml-2" />
                      الانتقال لرفع ملف
                    </Button>
                  </div>
                </div>
              </div>

              {/* Column reference */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-medium mb-3">الأعمدة المتوفرة:</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right border-b">
                        <th className="p-2 font-medium">العمود</th>
                        <th className="p-2 font-medium">مطلوب</th>
                        <th className="p-2 font-medium">مثال</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { name: 'الاسم', required: true, example: 'هاتف ذكي' },
                        { name: 'السعر', required: false, example: '1999.99' },
                        { name: 'الوصف', required: false, example: 'هاتف بمواصفات عالية' },
                        { name: 'الكمية', required: false, example: '50' },
                        { name: 'التصنيف', required: false, example: 'إلكترونيات' },
                        { name: 'رابط الصورة', required: false, example: 'https://...' },
                      ].map(col => (
                        <tr key={col.name} className="border-b last:border-0">
                          <td className="p-2 font-medium">{col.name}</td>
                          <td className="p-2">
                            {col.required ? (
                              <span className="text-red-500 text-xs font-medium">مطلوب</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">اختياري</span>
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
  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <CardTitle className="text-green-900">نتيجة الاستيراد</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">إجمالي السجلات:</span>
            <span className="text-sm">{result.total}</span>
          </div>
          <div className="flex justify-between items-center text-green-600">
            <span className="text-sm font-medium">تم الاستيراد بنجاح:</span>
            <span className="text-sm font-bold">{result.imported}</span>
          </div>
          {result.failed > 0 && (
            <div className="flex justify-between items-center text-red-600">
              <span className="text-sm font-medium">فشل الاستيراد:</span>
              <span className="text-sm font-bold">{result.failed}</span>
            </div>
          )}
          {result.errors?.length > 0 && (
            <div className="mt-2 p-3 rounded bg-red-50 border border-red-200">
              <p className="text-xs font-medium text-red-800 mb-1">تفاصيل الأخطاء:</p>
              {result.errors.map((err: string, i: number) => (
                <p key={i} className="text-xs text-red-600 flex items-start gap-1">
                  <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  {err}
                </p>
              ))}
            </div>
          )}
        </div>
        <Button className="w-full mt-4" onClick={onViewProducts}>
          عرض المنتجات
        </Button>
      </CardContent>
    </Card>
  );
}
