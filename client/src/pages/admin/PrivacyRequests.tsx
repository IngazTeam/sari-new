import { useState } from 'react';
import { CheckCircle2, Clock3, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Decision = 'completed' | 'rejected' | 'requires_review';

function dateText(value: unknown): string {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ar-SA');
}

export default function PrivacyRequests() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<string>('open');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [decision, setDecision] = useState<Decision>('completed');
  const [notes, setNotes] = useState('');
  const queryStatus = status === 'all' || status === 'open' ? undefined : status as any;
  const { data = [], isLoading } = trpc.accountData.adminListRequests.useQuery(
    queryStatus ? { status: queryStatus } : undefined,
  );
  const visible = status === 'open'
    ? data.filter((request: any) => ['pending', 'processing', 'requires_review'].includes(request.status))
    : data;

  const resolveMutation = trpc.accountData.adminResolveRequest.useMutation({
    onSuccess: async () => {
      setSelectedId(null);
      setNotes('');
      await utils.accountData.adminListRequests.invalidate();
      toast({ title: 'تم تحديث طلب الخصوصية' });
    },
    onError: error => toast({ title: 'تعذر تحديث الطلب', description: error.message, variant: 'destructive' }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><ShieldCheck className="h-8 w-8 text-primary" /> طلبات الخصوصية</h1>
          <p className="mt-2 text-muted-foreground">طابور موثق لطلبات أصحاب البيانات ومواعيد الاستحقاق.</p>
        </div>
        <div className="w-56 space-y-2">
          <Label htmlFor="privacyStatus">الحالة</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="privacyStatus"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">المفتوحة</SelectItem>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="pending">قيد الانتظار</SelectItem>
              <SelectItem value="processing">تحت المعالجة</SelectItem>
              <SelectItem value="requires_review">تحتاج مراجعة</SelectItem>
              <SelectItem value="completed">مكتملة</SelectItem>
              <SelectItem value="rejected">مرفوضة</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : visible.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد طلبات ضمن هذا الفلتر.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {visible.map((request: any) => {
            const due = new Date(String(request.dueAt));
            const overdue = ['pending', 'processing', 'requires_review'].includes(request.status) && due.getTime() < Date.now();
            return (
              <Card key={request.id} className={overdue ? 'border-destructive' : ''}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">طلب #{request.id} — {request.requestType}</CardTitle>
                      <CardDescription>{request.subject?.name || 'حساب محذوف'} — {request.subject?.email || 'هوية مستعارة محفوظة'}</CardDescription>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs ${overdue ? 'bg-destructive/10 text-destructive' : 'bg-muted'}`}>
                      {request.status}{overdue ? ' — متأخر' : ''}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid gap-2 text-muted-foreground md:grid-cols-3">
                    <span>الاستلام: {dateText(request.requestedAt)}</span>
                    <span>الاستحقاق: {dateText(request.dueAt)}</span>
                    <span>الإكمال: {dateText(request.completedAt)}</span>
                  </div>
                  {request.details && <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3">{request.details}</p>}
                  {request.resolutionNotes && <p className="text-muted-foreground">ملاحظات القرار: {request.resolutionNotes}</p>}
                  {['pending', 'processing', 'requires_review'].includes(request.status) && (
                    <Button variant="outline" onClick={() => { setSelectedId(Number(request.id)); setDecision('completed'); setNotes(''); }}>
                      معالجة الطلب
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={selectedId !== null} onOpenChange={open => { if (!open) setSelectedId(null); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>قرار الطلب #{selectedId}</DialogTitle>
            <DialogDescription>وثّق ما تم تنفيذه أو سبب الرفض. لا تضع كلمات مرور أو أسراراً في الملاحظات.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="decision">القرار</Label>
              <Select value={decision} onValueChange={value => setDecision(value as Decision)}>
                <SelectTrigger id="decision"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">مكتمل</SelectItem>
                  <SelectItem value="requires_review">يحتاج مراجعة إضافية</SelectItem>
                  <SelectItem value="rejected">مرفوض مع السبب</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resolutionNotes">ملاحظات القرار</Label>
              <Textarea id="resolutionNotes" value={notes} onChange={event => setNotes(event.target.value)} maxLength={2_000} rows={5} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant={decision === 'rejected' ? 'destructive' : 'default'}
              disabled={!selectedId || notes.trim().length < 3 || resolveMutation.isPending}
              onClick={() => selectedId && resolveMutation.mutate({ requestId: selectedId, decision, notes })}
            >
              {resolveMutation.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : decision === 'completed' ? <CheckCircle2 className="ml-2 h-4 w-4" /> : decision === 'rejected' ? <XCircle className="ml-2 h-4 w-4" /> : <Clock3 className="ml-2 h-4 w-4" />}
              حفظ القرار
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
