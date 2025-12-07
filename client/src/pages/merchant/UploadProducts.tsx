import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Upload, FileText, Download, ArrowRight, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useState, useRef } from 'react';
import { useLocation } from 'wouter';

import { useTranslation } from 'react-i18next';
export default function UploadProducts() {
  const { t } = useTranslation();

  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const uploadMutation = trpc.products.uploadCSV.useMutation({
    onSuccess: (data) => {
      setUploadResult(data);
      toast.success(`t('toast.upload.msg1')} ${data.imported} منتج بنجاح`);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (error) => {
      toast.error(t('toast.upload.msg2') + ': ' + error.message);
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        toast.error(t('toast.upload.msg3'));
        return;
      }
      setSelectedFile(file);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error(t('toast.upload.msg4'));
      return;
    }

    try {
      const text = await selectedFile.text();
      uploadMutation.mutate({ csvData: text });
    } catch (error) {
      toast.error(t('toast.common.msg9'));
    }
  };

  const downloadTemplate = () => {
    const csvContent = 'name,description,price,imageUrl,stock\nمنتج تجريبي,وصف المنتج,99.99,https://example.com/image.jpg,10';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'products_template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">رفع المنتجات من CSV</h1>
          <p className="text-muted-foreground mt-2">
            استيراد المنتجات بشكل جماعي من ملف CSV
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation('/merchant/products')}>
          <ArrowRight className="h-4 w-4 ml-2" />
          العودة للمنتجات
        </Button>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>تعليمات الاستخدام</CardTitle>
          <CardDescription>
            اتبع هذه الخطوات لاستيراد المنتجات بنجاح
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">1</span>
              </div>
              <div>
                <h3 className="font-medium">تحميل القالب</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  قم بتحميل ملف CSV النموذجي الذي يحتوي على التنسيق الصحيح
                </p>
                <Button variant="outline" size="sm" className="mt-2" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 ml-2" />
                  تحميل القالب
                </Button>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">2</span>
              </div>
              <div>
                <h3 className="font-medium">تعبئة البيانات</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  افتح الملف في Excel أو Google Sheets وأدخل بيانات منتجاتك
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">3</span>
              </div>
              <div>
                <h3 className="font-medium">رفع الملف</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  احفظ الملف بصيغة CSV وارفعه هنا
                </p>
              </div>
            </div>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>ملاحظة:</strong> الحقول المطلوبة هي: name (الاسم) و price (السعر). الحقول الأخرى اختيارية.
            </AlertDescription>
          </Alert>

          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">تنسيق الملف:</h4>
            <code className="text-sm block">
              name,description,price,imageUrl,stock<br />
              هاتف ذكي,هاتف بمواصفات عالية,1999.99,https://example.com/phone.jpg,50<br />
              سماعات,سماعات لاسلكية,299.99,https://example.com/headphones.jpg,100
            </code>
          </div>
        </CardContent>
      </Card>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>رفع ملف CSV</CardTitle>
          <CardDescription>
            اختر ملف CSV من جهازك
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id="csv-upload"
            />
            
            {selectedFile ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <FileText className="h-8 w-8" />
                  <span className="font-medium">{selectedFile.name}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  الحجم: {(selectedFile.size / 1024).toFixed(2)} KB
                </p>
                <div className="flex gap-2 justify-center">
                  <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
                    {uploadMutation.isPending ? (
                      'جاري الرفع...'
                    ) : (
                      <>
                        <Upload className="h-4 w-4 ml-2" />
                        رفع الملف
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-lg font-medium">اختر ملف CSV</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    أو اسحب الملف وأفلته هنا
                  </p>
                </div>
                <Button onClick={() => fileInputRef.current?.click()}>
                  اختيار ملف
                </Button>
              </div>
            )}
          </div>

          {/* Upload Result */}
          {uploadResult && (
            <Card className="border-green-200 bg-green-50">
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
                    <span className="text-sm">{uploadResult.total}</span>
                  </div>
                  <div className="flex justify-between items-center text-green-600">
                    <span className="text-sm font-medium">تم الاستيراد بنجاح:</span>
                    <span className="text-sm font-bold">{uploadResult.imported}</span>
                  </div>
                  {uploadResult.failed > 0 && (
                    <div className="flex justify-between items-center text-red-600">
                      <span className="text-sm font-medium">فشل الاستيراد:</span>
                      <span className="text-sm font-bold">{uploadResult.failed}</span>
                    </div>
                  )}
                </div>
                <Button 
                  className="w-full mt-4" 
                  onClick={() => setLocation('/merchant/products')}
                >
                  عرض المنتجات
                </Button>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle>نصائح مهمة</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span>•</span>
              <span>تأكد من أن الملف محفوظ بصيغة CSV وليس Excel (.xlsx)</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>يجب أن يحتوي السطر الأول على أسماء الأعمدة (headers)</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>استخدم الفاصلة (,) لفصل القيم وليس الفاصلة المنقوطة (;)</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>السعر يجب أن يكون رقماً موجباً (مثال: 99.99)</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>الكمية يجب أن تكون رقماً صحيحاً (مثال: 10)</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>رابط الصورة يجب أن يبدأ بـ http:// أو https://</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
