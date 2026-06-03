// @ts-nocheck
/**
 * Byaan Integration Dashboard — Shows only when Byaan is connected
 * 
 * Tabs:
 * 1. لوحة التحكم — Stats + Sync status
 * 2. المتدربين — Trainees list
 * 3. الأسئلة الشائعة — FAQs from Byaan
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Users, GraduationCap, HelpCircle, RefreshCw, CheckCircle2,
  AlertCircle, Search, Phone, Mail, BookOpen, Clock, Globe,
  Loader2, Link2, BarChart3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ByaanDashboard() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");

  // === Data Fetching ===
  const { data: status, isLoading: loadingStatus, refetch: refetchStatus } = trpc.byaan.getStatus.useQuery();
  const { data: trainees = [], isLoading: loadingTrainees } = trpc.byaan.getTrainees.useQuery(
    { search: searchQuery || undefined },
    { enabled: activeTab === "trainees" }
  );
  const { data: faqs = [], isLoading: loadingFaqs, refetch: refetchFaqs } = trpc.byaan.getFaqs.useQuery(
    undefined,
    { enabled: activeTab === "faqs" }
  );

  // === Mutations ===
  const resyncMutation = trpc.byaan.triggerResync.useMutation({
    onSuccess: () => {
      toast({ title: "✅ تم طلب المزامنة", description: "سيتم تحديث البيانات خلال لحظات" });
      refetchStatus();
    },
    onError: (err) => {
      toast({ title: "❌ فشل", description: err.message, variant: "destructive" });
    },
  });

  const toggleFaqMutation = trpc.byaan.toggleFaq.useMutation({
    onSuccess: () => {
      refetchFaqs();
      toast({ title: "✅ تم التحديث" });
    },
  });

  if (loadingStatus) {
    return (
      <div className="container py-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="container py-6">
        <Card className="max-w-lg mx-auto text-center py-12">
          <CardContent className="space-y-4">
            <Link2 className="h-16 w-16 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-bold">لم يتم ربط بيان</h2>
            <p className="text-muted-foreground">
              اربط حسابك في بيان لتظهر بيانات المتدربين والدورات هنا
            </p>
            <Button variant="outline" onClick={() => window.location.href = "/merchant/integrations"}>
              اذهب للربط
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = status.stats;
  const conn = status.connection;

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <GraduationCap className="h-8 w-8 text-primary" />
            لوحة بيان
          </h1>
          <p className="text-muted-foreground mt-1">
            إدارة بيانات الأكاديمية المتزامنة من بيان
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={conn?.syncStatus === 'active' ? 'default' : conn?.syncStatus === 'error' ? 'destructive' : 'secondary'}>
            {conn?.syncStatus === 'active' ? (
              <><CheckCircle2 className="h-3 w-3 ml-1" /> متصل</>
            ) : conn?.syncStatus === 'error' ? (
              <><AlertCircle className="h-3 w-3 ml-1" /> خطأ</>
            ) : (
              <><Clock className="h-3 w-3 ml-1" /> {conn?.syncStatus}</>
            )}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => resyncMutation.mutate()}
            disabled={resyncMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 ml-2 ${resyncMutation.isPending ? 'animate-spin' : ''}`} />
            إعادة مزامنة
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            لوحة التحكم
          </TabsTrigger>
          <TabsTrigger value="trainees" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            المتدربين ({stats?.trainees || 0})
          </TabsTrigger>
          <TabsTrigger value="faqs" className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            الأسئلة الشائعة ({stats?.faqs || 0})
          </TabsTrigger>
        </TabsList>

        {/* ═══ Dashboard Tab ═══ */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">المتدربين</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.trainees || 0}</div>
                <p className="text-xs text-muted-foreground">متدرب نشط</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">الدورات</CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.courses || 0}</div>
                <p className="text-xs text-muted-foreground">دورة متزامنة</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">الأسئلة الشائعة</CardTitle>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.faqs || 0}</div>
                <p className="text-xs text-muted-foreground">سؤال نشط</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">صفحات الموقع</CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.sitePages || 0}</div>
                <p className="text-xs text-muted-foreground">صفحة متزامنة</p>
              </CardContent>
            </Card>
          </div>

          {/* Connection Info */}
          <Card>
            <CardHeader>
              <CardTitle>معلومات الربط</CardTitle>
              <CardDescription>تفاصيل اتصال بيان بساري</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">الدومين</p>
                  <p className="font-medium">{conn?.tenantDomain || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">آخر مزامنة</p>
                  <p className="font-medium">
                    {conn?.lastSyncAt
                      ? new Date(conn.lastSyncAt).toLocaleString('ar-SA')
                      : 'لم تتم بعد'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">حالة المزامنة</p>
                  <Badge variant={conn?.syncStatus === 'active' ? 'default' : 'secondary'}>
                    {conn?.syncStatus === 'active' ? 'نشط' : conn?.syncStatus}
                  </Badge>
                </div>
                {conn?.syncErrors && (
                  <div>
                    <p className="text-sm text-muted-foreground">أخطاء</p>
                    <p className="text-sm text-destructive">{conn.syncErrors}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Trainees Tab ═══ */}
        <TabsContent value="trainees" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>قائمة المتدربين</CardTitle>
              <CardDescription>المتدربين المسجلين في الأكاديمية — متزامن من بيان</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Search */}
              <div className="flex gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="ابحث بالاسم أو الجوال أو الإيميل..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-10"
                  />
                </div>
              </div>

              {/* Table */}
              {loadingTrainees ? (
                <div className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                  <p className="text-muted-foreground mt-2">جاري التحميل...</p>
                </div>
              ) : trainees.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? 'لا توجد نتائج للبحث' : 'لا يوجد متدربين بعد — اضغط إعادة مزامنة'}
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الاسم</TableHead>
                        <TableHead>الجوال</TableHead>
                        <TableHead>الإيميل</TableHead>
                        <TableHead>الدورات المسجل فيها</TableHead>
                        <TableHead>تاريخ المزامنة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trainees.map((trainee: any) => (
                        <TableRow key={trainee.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <GraduationCap className="h-4 w-4 text-primary" />
                              {trainee.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            {trainee.phone ? (
                              <div className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                {trainee.phone}
                              </div>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            {trainee.email ? (
                              <div className="flex items-center gap-1 text-sm">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                {trainee.email}
                              </div>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            {trainee.enrolledCourses?.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {trainee.enrolledCourses.slice(0, 3).map((c: string, i: number) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {typeof c === 'string' ? c : c?.name || '—'}
                                  </Badge>
                                ))}
                                {trainee.enrolledCourses.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{trainee.enrolledCourses.length - 3}
                                  </Badge>
                                )}
                              </div>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {trainee.syncedAt
                              ? new Date(trainee.syncedAt).toLocaleDateString('ar-SA')
                              : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ FAQs Tab ═══ */}
        <TabsContent value="faqs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>الأسئلة الشائعة</CardTitle>
              <CardDescription>
                الأسئلة المتزامنة من بيان — البوت يقرأها مباشرة ويستخدمها للرد على العملاء
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingFaqs ? (
                <div className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                </div>
              ) : faqs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  لا توجد أسئلة شائعة — ستظهر بعد المزامنة من بيان
                </div>
              ) : (
                <div className="space-y-3">
                  {faqs.map((faq: any) => (
                    <Card key={faq.id} className={!faq.isActive ? 'opacity-50' : ''}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{faq.category}</Badge>
                              {faq.useInBot && (
                                <Badge variant="default" className="text-xs">🤖 يستخدمه البوت</Badge>
                              )}
                            </div>
                            <p className="font-medium text-sm mt-2">
                              <span className="text-muted-foreground">س: </span>
                              {faq.question}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              <span>ج: </span>
                              {faq.answer}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">يستخدمه البوت</span>
                              <Switch
                                checked={faq.useInBot}
                                onCheckedChange={(val) => toggleFaqMutation.mutate({
                                  faqId: faq.id, field: 'use_in_bot', value: val,
                                })}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">نشط</span>
                              <Switch
                                checked={faq.isActive}
                                onCheckedChange={(val) => toggleFaqMutation.mutate({
                                  faqId: faq.id, field: 'is_active', value: val,
                                })}
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
