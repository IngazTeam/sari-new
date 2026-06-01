// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, User, Mail, Shield, Loader2, UserPlus, Copy, Crown, Eye, Briefcase, Clock } from "lucide-react";
import { toast } from "sonner";

const ROLE_OPTIONS = [
  { value: 'manager', label: 'مدير', description: 'كل شيء عدا الاشتراك', color: 'bg-blue-100 text-blue-800' },
  { value: 'sales_supervisor', label: 'مشرف مبيعات', description: 'محادثات، عملاء، منتجات', color: 'bg-green-100 text-green-800' },
  { value: 'viewer', label: 'مشاهد فقط', description: 'عرض بدون تعديل', color: 'bg-gray-100 text-gray-800' },
];

const ROLE_ICONS: Record<string, any> = {
  owner: Crown,
  manager: Shield,
  sales_supervisor: Briefcase,
  viewer: Eye,
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-amber-100 text-amber-800 border-amber-200',
  manager: 'bg-blue-100 text-blue-800 border-blue-200',
  sales_supervisor: 'bg-green-100 text-green-800 border-green-200',
  viewer: 'bg-gray-100 text-gray-700 border-gray-200',
};

export default function TeamManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('viewer');

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.team.list.useQuery();

  const inviteMutation = trpc.team.invite.useMutation({
    onSuccess: (result) => {
      toast.success("تم إرسال الدعوة بنجاح ✅");
      setIsDialogOpen(false);
      setInviteEmail('');
      setInviteRole('viewer');
      utils.team.list.invalidate();

      // Copy invite link
      if (result.inviteLink) {
        navigator.clipboard.writeText(result.inviteLink).then(() => {
          toast.info("تم نسخ رابط الدعوة 📋");
        }).catch(() => {});
      }
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const removeMutation = trpc.team.remove.useMutation({
    onSuccess: () => {
      toast.success("تم حذف العضو");
      utils.team.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const revokeInviteMutation = trpc.team.revokeInvite.useMutation({
    onSuccess: () => {
      toast.success("تم إلغاء الدعوة");
      utils.team.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole as any });
  };

  const handleRemove = (memberId: number, memberName: string) => {
    if (confirm(`هل أنت متأكد من حذف "${memberName}" من الفريق؟`)) {
      removeMutation.mutate({ memberId });
    }
  };

  const members = data?.members || [];
  const invitations = data?.invitations || [];

  return (
    <div className="container max-w-5xl py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">إدارة الفريق</h1>
          <p className="text-muted-foreground">
            أضف أعضاء فريقك وحدد صلاحياتهم للوصول إلى لوحة التحكم
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />دعوة عضو جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle>دعوة عضو جديد</DialogTitle>
              <DialogDescription>
                أدخل البريد الإلكتروني واختر الصلاحية — سيستلم رابط دعوة صالح لمدة 7 أيام
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">البريد الإلكتروني *</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="member@example.com"
                  required
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label>الصلاحية *</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الصلاحية" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map(role => (
                      <SelectItem key={role.value} value={role.value}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{role.label}</span>
                          <span className="text-xs text-muted-foreground">— {role.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Role description card */}
              <div className="rounded-lg border p-3 bg-muted/50">
                <p className="text-sm font-medium mb-1">
                  {ROLE_OPTIONS.find(r => r.value === inviteRole)?.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ROLE_OPTIONS.find(r => r.value === inviteRole)?.description}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  إلغاء
                </Button>
                <Button type="submit" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />جاري الإرسال...</>
                  ) : (
                    <><Mail className="h-4 w-4 mr-2" />إرسال الدعوة</>
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">أعضاء الفريق</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">دعوات معلقة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{invitations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">المالكون</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {members.filter((m: any) => m.role === 'owner').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Members Table */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>الأعضاء</CardTitle>
          <CardDescription>جميع أعضاء الفريق الذين لديهم صلاحية الوصول للوحة التحكم</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>لا يوجد أعضاء بعد — ستكون أنت المالك الوحيد</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العضو</TableHead>
                  <TableHead>الصلاحية</TableHead>
                  <TableHead>تاريخ الانضمام</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member: any) => {
                  const RoleIcon = ROLE_ICONS[member.role] || User;
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <RoleIcon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="font-medium">{member.userName || 'بدون اسم'}</div>
                            <div className="text-sm text-muted-foreground">{member.userEmail || ''}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${ROLE_COLORS[member.role] || ''} border`} variant="outline">
                          {member.roleInfo?.label || member.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {member.acceptedAt ? new Date(member.acceptedAt).toLocaleDateString('ar-SA') : '—'}
                      </TableCell>
                      <TableCell className="text-left">
                        {member.role !== 'owner' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemove(member.id, member.userName)}
                            disabled={removeMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              دعوات معلقة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>الصلاحية</TableHead>
                  <TableHead>تنتهي في</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {ROLE_OPTIONS.find(r => r.value === inv.role)?.label || inv.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(inv.expiresAt).toLocaleDateString('ar-SA')}
                    </TableCell>
                    <TableCell className="text-left">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeInviteMutation.mutate({ invitationId: inv.id })}
                        disabled={revokeInviteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
