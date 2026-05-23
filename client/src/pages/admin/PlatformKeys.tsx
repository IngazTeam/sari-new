import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Key, Copy, RefreshCw, Trash2, Plus, Check, Shield, Link } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const PLATFORMS = [
  { id: 'byaan', name: 'بيان', nameEn: 'Byaan', description: 'منصة التدريب الأكاديمية', color: 'bg-blue-600' },
  { id: 'custom', name: 'منصة مخصصة', nameEn: 'Custom', description: 'أي منصة خارجية أخرى', color: 'bg-gray-600' },
] as const;

export default function PlatformKeys() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();

  const [generatedKey, setGeneratedKey] = useState<{ platform: string; key: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keys, isLoading } = trpc.merchants.listPlatformKeys.useQuery();

  const generateMutation = trpc.merchants.generatePlatformKey.useMutation({
    onSuccess: (data: any) => {
      setGeneratedKey(data);
      utils.merchants.listPlatformKeys.invalidate();
      toast.success(`تم إنشاء مفتاح ${data.platform} بنجاح`);
    },
    onError: (err) => toast.error('فشل الإنشاء: ' + err.message),
  });

  const regenerateMutation = trpc.merchants.regeneratePlatformKey.useMutation({
    onSuccess: (data: any) => {
      setGeneratedKey(data);
      utils.merchants.listPlatformKeys.invalidate();
      toast.success(`تم تجديد مفتاح ${data.platform}`);
    },
    onError: (err) => toast.error('فشل التجديد: ' + err.message),
  });

  const deleteMutation = trpc.merchants.deletePlatformKey.useMutation({
    onSuccess: () => {
      utils.merchants.listPlatformKeys.invalidate();
      setDeleteTarget(null);
      toast.success('تم حذف المفتاح');
    },
    onError: (err) => toast.error('فشل الحذف: ' + err.message),
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('تم النسخ!');
    setTimeout(() => setCopied(false), 2000);
  };

  const existingPlatforms = keys?.map(k => k.platform) || [];
  const availablePlatforms = PLATFORMS.filter(p => !existingPlatforms.includes(p.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Key className="h-8 w-8 text-purple-600" />
          مفاتيح المنصات
        </h1>
        <p className="text-muted-foreground mt-2">
          إنشاء وإدارة مفاتيح الربط مع المنصات الخارجية (بيان، إلخ)
        </p>
      </div>

      {/* Info Banner */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-blue-800 dark:text-blue-300">كيف يعمل ربط المنصات؟</p>
              <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-400">
                <li>أنشئ مفتاح المنصة من هنا</li>
                <li>انسخ المفتاح وضعه في ملف <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">.env</code> بالمنصة الأخرى</li>
                <li>المنصة ترسل المفتاح مع كل طلب في header: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">X-Platform-Key</code></li>
              </ol>
              <p className="text-blue-600 dark:text-blue-500 text-xs mt-2">
                المفتاح يظهر مرة واحدة فقط عند الإنشاء — احفظه فوراً.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generated Key Display */}
      {generatedKey && (
        <Card className="border-green-300 bg-green-50 dark:bg-green-950/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-400 flex items-center gap-2">
              <Check className="h-5 w-5" />
              مفتاح {generatedKey.platform} — انسخه الآن!
            </CardTitle>
            <CardDescription className="text-green-600">
              هذا المفتاح لن يظهر مرة أخرى. انسخه وضعه في ملف .env بالمنصة.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Platform Key */}
            <div>
              <label className="text-xs font-medium text-green-700 mb-1 block">
                SARI_PLATFORM_KEY (ضعه في .env بيان)
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-green-100 dark:bg-green-900 p-3 rounded-lg text-sm font-mono break-all border border-green-300">
                  {generatedKey.key}
                </code>
                <Button
                  size="icon"
                  variant="outline"
                  className="flex-shrink-0 border-green-400 hover:bg-green-100"
                  onClick={() => handleCopy(generatedKey.key)}
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Quick copy for .env */}
            <div>
              <label className="text-xs font-medium text-green-700 mb-1 block">
                نسخة جاهزة لملف .env
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white dark:bg-gray-900 p-3 rounded-lg text-sm font-mono break-all border">
                  SARI_PLATFORM_KEY={generatedKey.key}
                </code>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handleCopy(`SARI_PLATFORM_KEY=${generatedKey.key}`)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-green-600"
              onClick={() => setGeneratedKey(null)}
            >
              فهمت، أخفِ المفتاح
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Keys Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Link className="h-5 w-5" />
                المفاتيح النشطة
              </CardTitle>
              <CardDescription>المفاتيح المُنشأة للمنصات المربوطة</CardDescription>
            </div>
            {availablePlatforms.length > 0 && (
              <Button
                onClick={() => {
                  const platform = availablePlatforms[0];
                  generateMutation.mutate({ platform: platform.id, label: platform.name });
                }}
                disabled={generateMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Plus className="h-4 w-4 ml-2" />
                إنشاء مفتاح {availablePlatforms[0]?.name}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : keys && keys.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المنصة</TableHead>
                    <TableHead>المفتاح (مخفي)</TableHead>
                    <TableHead>الوصف</TableHead>
                    <TableHead>تاريخ الإنشاء</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => {
                    const platformInfo = PLATFORMS.find(p => p.id === key.platform);
                    return (
                      <TableRow key={key.platform}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg ${platformInfo?.color || 'bg-gray-600'} flex items-center justify-center`}>
                              <Key className="h-4 w-4 text-white" />
                            </div>
                            <div>
                              <p className="font-medium">{platformInfo?.name || key.platform}</p>
                              <p className="text-xs text-muted-foreground">{platformInfo?.nameEn || ''}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
                            {key.keyPrefix}
                          </code>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{key.label}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {new Date(key.createdAt).toLocaleDateString('ar-SA')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="تجديد المفتاح"
                              onClick={() => {
                                if (confirm('تجديد المفتاح سيُبطل المفتاح القديم. متأكد؟')) {
                                  regenerateMutation.mutate({ platform: key.platform });
                                }
                              }}
                              disabled={regenerateMutation.isPending}
                            >
                              <RefreshCw className="h-4 w-4 text-orange-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="حذف المفتاح"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteTarget(key.platform)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Key className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-lg font-medium">لا توجد مفاتيح</p>
              <p className="text-sm text-muted-foreground mt-1">أنشئ مفتاح لربط ساري بمنصة خارجية</p>
              {availablePlatforms.length > 0 && (
                <Button
                  className="mt-4 bg-purple-600 hover:bg-purple-700"
                  onClick={() => {
                    const platform = availablePlatforms[0];
                    generateMutation.mutate({ platform: platform.id, label: platform.name });
                  }}
                  disabled={generateMutation.isPending}
                >
                  <Plus className="h-4 w-4 ml-2" />
                  إنشاء مفتاح {availablePlatforms[0]?.name}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">حذف مفتاح المنصة</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              سيتم إلغاء تنشيط مفتاح <strong>{deleteTarget}</strong>. 
              المنصة لن تستطيع الاتصال بساري حتى تنشئ مفتاحاً جديداً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate({ platform: deleteTarget })}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
