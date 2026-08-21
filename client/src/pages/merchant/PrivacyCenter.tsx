import { useState } from 'react';
import { useLocation } from 'wouter';
import { Download, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const DELETION_CONFIRMATION = 'DELETE_MY_ACCOUNT';

function formatDate(value: unknown): string {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ar-SA');
}

export default function PrivacyCenter() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.accountData.getState.useQuery();
  const [exportPassword, setExportPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [requestType, setRequestType] = useState<'access' | 'correction' | 'objection'>('access');
  const [requestDetails, setRequestDetails] = useState('');

  const marketingMutation = trpc.accountData.setMarketingConsent.useMutation({
    onSuccess: async () => {
      await utils.accountData.getState.invalidate();
      toast({ title: 'تم حفظ تفضيل الرسائل التسويقية' });
    },
    onError: error => toast({ title: 'تعذر حفظ التفضيل', description: error.message, variant: 'destructive' }),
  });

  const exportMutation = trpc.accountData.exportPersonalData.useMutation({
    onSuccess: payload => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sari-personal-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportPassword('');
      void utils.accountData.getState.invalidate();
      toast({ title: 'تم تجهيز نسخة بياناتك وتنزيلها' });
    },
    onError: error => toast({ title: 'تعذر تصدير البيانات', description: error.message, variant: 'destructive' }),
  });

  const deletionMutation = trpc.accountData.requestDeletion.useMutation({
    onSuccess: () => {
      toast({ title: 'تم تسجيل طلب الحذف وإيقاف الحساب' });
      setLocation('/');
      window.location.reload();
    },
    onError: error => toast({ title: 'تعذر تسجيل طلب الحذف', description: error.message, variant: 'destructive' }),
  });

  const requestMutation = trpc.accountData.submitRequest.useMutation({
    onSuccess: async () => {
      setRequestDetails('');
      await utils.accountData.getState.invalidate();
      toast({ title: 'تم تسجيل طلبك', description: `سيُعالج خلال ${data?.responseDays ?? 30} يوماً.` });
    },
    onError: error => toast({ title: 'تعذر تسجيل الطلب', description: error.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold"><ShieldCheck className="h-8 w-8 text-primary" /> مركز الخصوصية</h1>
        <p className="mt-2 text-muted-foreground">إدارة موافقاتك وحقوق بيانات حسابك من مكان واحد.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>التواصل التسويقي</CardTitle>
          <CardDescription>موافقة اختيارية، ويمكن تغييرها في أي وقت دون التأثير في الخدمة.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <Label htmlFor="marketingConsent">استلام تحديثات وعروض ساري</Label>
          <Switch
            id="marketingConsent"
            checked={data?.marketingConsent ?? false}
            disabled={marketingMutation.isPending}
            onCheckedChange={granted => marketingMutation.mutate({ granted })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>تنزيل بيانات الحساب</CardTitle>
          <CardDescription>
            نسخة JSON من بيانات صاحب الحساب، المتاجر والعضويات والاشتراكات والمدفوعات والموافقات. لا تتضمن كلمات المرور أو الرموز السرية أو محتوى محادثات العملاء.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="exportPassword">أكد هويتك بكلمة المرور</Label>
            <Input
              id="exportPassword"
              type="password"
              autoComplete="current-password"
              value={exportPassword}
              onChange={event => setExportPassword(event.target.value)}
              minLength={8}
              maxLength={128}
            />
          </div>
          <Button
            onClick={() => exportMutation.mutate({ password: exportPassword })}
            disabled={exportMutation.isPending || exportPassword.length < 8}
          >
            {exportMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Download className="ml-2 h-4 w-4" />}
            تنزيل نسخة البيانات
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>طلب وصول أو تصحيح أو اعتراض</CardTitle>
          <CardDescription>اختر الحق المطلوب واشرح النطاق بدقة. قد نتواصل للتحقق من تفاصيل إضافية.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="requestType">نوع الطلب</Label>
            <Select value={requestType} onValueChange={value => setRequestType(value as typeof requestType)}>
              <SelectTrigger id="requestType"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="access">الوصول إلى البيانات</SelectItem>
                <SelectItem value="correction">تصحيح البيانات</SelectItem>
                <SelectItem value="objection">الاعتراض على معالجة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="requestDetails">تفاصيل الطلب</Label>
            <Textarea
              id="requestDetails"
              value={requestDetails}
              onChange={event => setRequestDetails(event.target.value)}
              maxLength={1_000}
              rows={4}
              placeholder="حدد البيانات أو المعالجة المقصودة، والتصحيح المطلوب إن وجد"
            />
            <p className="text-xs text-muted-foreground">{requestDetails.length}/1000</p>
          </div>
          <Button
            variant="outline"
            disabled={requestMutation.isPending || requestDetails.trim().length < 3}
            onClick={() => requestMutation.mutate({ requestType, details: requestDetails })}
          >
            {requestMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            إرسال الطلب
          </Button>
        </CardContent>
      </Card>

      {Boolean(data?.requests?.length) && (
        <Card>
          <CardHeader>
            <CardTitle>سجل الطلبات</CardTitle>
            <CardDescription>المدة التنظيمية الأساسية للرد: {data?.responseDays ?? 30} يوماً.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-md border">
              {data?.requests.map((request: any) => (
                <div key={request.id} className="grid gap-1 p-3 text-sm md:grid-cols-3">
                  <span>{request.requestType}</span>
                  <span>{request.status}</span>
                  <span className="text-muted-foreground">{formatDate(request.requestedAt)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">حذف الحساب</CardTitle>
          <CardDescription>
            يُوقف الحساب والرد الآلي واتصال واتساب فور اعتماد الطلب، وتبدأ المعالجة الآلية بعد 24 ساعة. قد نحتفظ بحد أدنى مشفّر من السجلات المالية عند وجود التزام نظامي أو مطالبة قائمة.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>إجراء عالي التأثير</AlertTitle>
            <AlertDescription>لن تتمكن من تسجيل الدخول بعد تأكيد الطلب. انقل ملكية أي متجر مشترك قبل الحذف.</AlertDescription>
          </Alert>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="destructive"><Trash2 className="ml-2 h-4 w-4" /> طلب حذف الحساب</Button></AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد حذف الحساب</AlertDialogTitle>
                <AlertDialogDescription>
                  أكد هويتك، ثم اكتب العبارة الإنجليزية التالية حرفياً: <code dir="ltr">{DELETION_CONFIRMATION}</code>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="deletePassword">كلمة المرور</Label>
                  <Input id="deletePassword" type="password" autoComplete="current-password" value={deletePassword} onChange={event => setDeletePassword(event.target.value)} maxLength={128} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deleteConfirmation">عبارة التأكيد</Label>
                  <Input id="deleteConfirmation" dir="ltr" autoComplete="off" value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} />
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>تراجع</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deletionMutation.isPending || deletePassword.length < 8 || deleteConfirmation !== DELETION_CONFIRMATION}
                  onClick={event => {
                    event.preventDefault();
                    deletionMutation.mutate({ password: deletePassword, confirmation: DELETION_CONFIRMATION });
                  }}
                >
                  {deletionMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  إيقاف الحساب وتسجيل الطلب
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
