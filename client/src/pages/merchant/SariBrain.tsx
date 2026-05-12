import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Brain, Trash2, RotateCcw, FileText, Package, Globe, Settings, Clock, AlertTriangle, CheckCircle2, XCircle, Upload, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'wouter';

const ACTION_ICONS: Record<string, string> = {
  document_deleted: '🗑️',
  products_deleted: '🗑️',
  website_deleted: '🗑️',
  brain_reset: '⚠️',
  file_uploaded: '📁',
  file_approved: '✅',
  website_analyzed: '🌐',
  products_imported: '🛍️',
  settings_changed: '⚙️',
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  document: <FileText className="h-5 w-5 text-blue-500" />,
  products: <Package className="h-5 w-5 text-green-500" />,
  website: <Globe className="h-5 w-5 text-purple-500" />,
  settings: <Settings className="h-5 w-5 text-gray-500" />,
};

export default function SariBrain() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: sources, isLoading } = trpc.sariBrain.getSources.useQuery();
  const { data: activityLog } = trpc.sariBrain.getActivityLog.useQuery({ limit: 30 });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteSourceMutation = trpc.sariBrain.deleteSource.useMutation({
    onSuccess: () => {
      toast.success('تم حذف المصدر بنجاح');
      utils.sariBrain.getSources.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
      setDeletingId(null);
    },
    onError: (error) => {
      toast.error('فشل الحذف: ' + error.message);
    },
  });

  const resetBrainMutation = trpc.sariBrain.resetBrain.useMutation({
    onSuccess: (data) => {
      toast.success(`تم إعادة ضبط عقل ساري — حذف ${data.deletedSources.length} مصادر`);
      utils.sariBrain.getSources.invalidate();
      utils.sariBrain.getActivityLog.invalidate();
    },
    onError: (error) => {
      toast.error('فشل إعادة الضبط: ' + error.message);
    },
  });

  const handleDeleteSource = (sourceId: string, sourceType: string) => {
    deleteSourceMutation.mutate({
      sourceId,
      sourceType: sourceType as any,
    });
  };

  const deletableSources = sources?.filter(s => s.deletable) || [];
  const totalSources = sources?.filter(s => s.hasContent && s.type !== 'settings').length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            عقل ساري
          </h1>
          <p className="text-muted-foreground mt-2">
            إدارة مصادر المعرفة التي يستخدمها ساري للرد على عملائك
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation('/merchant/settings')}>
            <Upload className="h-4 w-4 ml-2" />
            رفع ملف جديد
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={totalSources === 0}>
                <RotateCcw className="h-4 w-4 ml-2" />
                إعادة ضبط كاملة
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-right">⚠️ إعادة ضبط عقل ساري بالكامل</AlertDialogTitle>
                <AlertDialogDescription className="text-right">
                  سيتم حذف جميع مصادر المعرفة (الملفات، المنتجات، تحليل الموقع).
                  <br />
                  <strong className="text-destructive">هذا الإجراء لا يمكن التراجع عنه!</strong>
                  <br />
                  سيعود ساري للرد بالمعلومات الأساسية فقط (اسم المتجر والإعدادات).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => resetBrainMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {resetBrainMutation.isPending ? 'جاري الحذف...' : 'نعم، أعد الضبط'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">مصادر المعرفة</CardTitle>
            <Brain className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{totalSources}</div>
            <p className="text-xs text-muted-foreground mt-1">مصدر نشط يغذي ساري</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الملفات المرفقة</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {sources?.filter(s => s.type === 'document').length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">ملف تعريفي</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المنتجات</CardTitle>
            <Package className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {sources?.find(s => s.type === 'products')?.contentLength || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">منتج في ذاكرة ساري</p>
          </CardContent>
        </Card>
      </div>

      {/* Knowledge Sources */}
      <Card>
        <CardHeader>
          <CardTitle>📦 مصادر المعرفة</CardTitle>
          <CardDescription>
            كل مصدر يؤثر على ردود ساري — يمكنك حذف أي مصدر بشكل مستقل
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : sources && sources.length > 0 ? (
            <div className="space-y-3">
              {sources.map((source: any) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
                      {SOURCE_ICONS[source.type] || <FileText className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {source.name}
                        <Badge variant={source.status === 'active' || source.status === 'completed' ? 'default' : source.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px]">
                          {source.status === 'active' || source.status === 'completed' ? 'نشط' : source.status === 'failed' ? 'فشل' : source.status === 'pending' ? 'قيد المعالجة' : source.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {source.type === 'products' ? `${source.contentLength} منتج` : source.type === 'document' ? `${Math.round((source.contentLength || 0) / 1000)}K حرف` : ''}
                        {source.date && ` • ${new Date(source.date).toLocaleDateString('ar-SA')}`}
                      </p>
                    </div>
                  </div>

                  {source.deletable ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-right">حذف "{source.name}"</AlertDialogTitle>
                          <AlertDialogDescription className="text-right">
                            سيتم حذف هذا المصدر من ذاكرة ساري. لن يستطيع ساري الرد على أسئلة متعلقة بهذه البيانات بعد الحذف.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="flex-row-reverse gap-2">
                          <AlertDialogCancel>إلغاء</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteSource(source.id, source.type)}
                            className="bg-destructive text-destructive-foreground"
                          >
                            حذف
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Badge variant="outline" className="text-xs">أساسي</Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Brain className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-lg font-medium">لا توجد مصادر معرفة</p>
              <p className="text-sm text-muted-foreground mt-1">
                ارفع ملف تعريفي أو أضف منتجات ليتعلم ساري عن متجرك
              </p>
              <Button className="mt-4" onClick={() => setLocation('/merchant/settings')}>
                <Upload className="h-4 w-4 ml-2" />
                رفع ملف تعريفي
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle>📋 مسار ساري</CardTitle>
          <CardDescription>
            سجل بكل التغييرات التي أثرت على ذاكرة ساري
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activityLog && activityLog.length > 0 ? (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute right-5 top-0 bottom-0 w-px bg-border" />

              <div className="space-y-4">
                {activityLog.map((entry: any) => (
                  <div key={entry.id} className="flex items-start gap-4 relative">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted border-2 border-background z-10 text-lg">
                      {ACTION_ICONS[entry.actionType] || '📝'}
                    </div>
                    <div className="flex-1 pt-1.5">
                      <p className="text-sm font-medium">{entry.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(entry.createdAt).toLocaleDateString('ar-SA', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p>لا توجد أنشطة مسجلة بعد</p>
              <p className="text-xs mt-1">ستظهر هنا كل التغييرات على مصادر معرفة ساري</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
