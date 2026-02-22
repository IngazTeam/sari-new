import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, AlertCircle, CheckCircle2, Clock, RefreshCw, Settings, Link as LinkIcon, Calendar, ShoppingBag, MessageSquare } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

const platformIcons: Record<string, React.ReactNode> = {
  zid: <ShoppingBag className="h-5 w-5" />,
  calendly: <Calendar className="h-5 w-5" />,
  salla: <ShoppingBag className="h-5 w-5" />,
  google: <LinkIcon className="h-5 w-5" />,
  whatsapp: <MessageSquare className="h-5 w-5" />
};

const platformNames: Record<string, string> = {
  zid: "زد",
  calendly: "Calendly",
  salla: "سلة",
  google: "Google",
  whatsapp: "WhatsApp"
};

export default function IntegrationsDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  
  const { data: dashboardData, isLoading, refetch } = trpc.advancedNotifications.getIntegrationsDashboard.useQuery();
  const resolveErrorMutation = trpc.advancedNotifications.resolveError.useMutation({
    onSuccess: () => { toast.success(t('integrationsDashboardPage.text0')); refetch(); }
  });

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[400px]"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const { integrations = [], stats = [], errors = [] } = dashboardData || {};
  const totalSyncs = stats.reduce((acc: number, s: any) => acc + (s.sync_count || 0), 0);
  const totalSuccess = stats.reduce((acc: number, s: any) => acc + (s.success_count || 0), 0);
  const successRate = totalSyncs > 0 ? Math.round((totalSuccess / totalSyncs) * 100) : 100;

  return (
    <div className="container mx-auto py-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('integrationsDashboardPage.text1')}</h1>
          <p className="text-muted-foreground">{t('integrationsDashboardPage.text2')}</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4 ml-2" />{t('integrationsDashboardPage.text3')}</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t('integrationsDashboardPage.text4')}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{integrations.filter((i: any) => i.is_active).length}</div><p className="text-xs text-muted-foreground">من {integrations.length} تكامل</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t('integrationsDashboardPage.text5')}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totalSyncs}</div><p className="text-xs text-muted-foreground">آخر 30 يوم</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t('integrationsDashboardPage.text6')}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{successRate}%</div><p className="text-xs text-muted-foreground">{totalSuccess} ناجحة</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t('integrationsDashboardPage.text7')}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">{errors.length}</div><p className="text-xs text-muted-foreground">تحتاج مراجعة</p></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList><TabsTrigger value="overview">{t('integrationsDashboardPage.text8')}</TabsTrigger><TabsTrigger value="stats">الإحصائيات</TabsTrigger><TabsTrigger value="errors">الأخطاء</TabsTrigger></TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {integrations.map((integration: any) => (
              <Card key={integration.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg">{platformIcons[integration.platform] || <LinkIcon className="h-5 w-5" />}</div>
                      <div>
                        <CardTitle className="text-lg">{platformNames[integration.platform] || integration.platform}</CardTitle>
                        <CardDescription>{integration.last_sync_at ? `آخر مزامنة: ${new Date(integration.last_sync_at).toLocaleString('ar-SA')}` : 'لم تتم المزامنة بعد'}</CardDescription>
                      </div>
                    </div>
                    <Badge variant={integration.is_active ? "default" : "secondary"}>{integration.is_active ? "نشط" : "غير نشط"}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {integration.is_active && (<><span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-green-500" />{t('integrationsDashboardPage.text9')}</span><span className="flex items-center gap-1"><Activity className="h-4 w-4" />يعمل</span></>)}
                    </div>
                    <Link href={`/merchant/integrations/${integration.platform}`}><Button variant="ghost" size="sm"><Settings className="h-4 w-4 ml-1" />{t('integrationsDashboardPage.text10')}</Button></Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{t('integrationsDashboardPage.text11')}</CardTitle><CardDescription>آخر 30 يوم</CardDescription></CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {stats.length === 0 ? <p className="text-center text-muted-foreground py-8">{t('integrationsDashboardPage.text12')}</p> : stats.map((stat: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">{platformIcons[stat.platform] || <LinkIcon className="h-5 w-5" />}<div><p className="font-medium">{platformNames[stat.platform] || stat.platform}</p><p className="text-sm text-muted-foreground">{new Date(stat.stat_date).toLocaleDateString('ar-SA')}</p></div></div>
                      <div className="flex items-center gap-4 text-sm"><span className="flex items-center gap-1"><Activity className="h-4 w-4" />{stat.sync_count} مزامنة</span><span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" />{stat.success_count} ناجحة</span>{stat.error_count > 0 && <span className="flex items-center gap-1 text-red-600"><AlertCircle className="h-4 w-4" />{stat.error_count} خطأ</span>}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{t('integrationsDashboardPage.text13')}</CardTitle><CardDescription>أخطاء تحتاج مراجعة وحل</CardDescription></CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {errors.length === 0 ? <div className="text-center py-8"><CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" /><p className="text-muted-foreground">{t('integrationsDashboardPage.text14')}</p></div> : errors.map((error: any) => (
                    <div key={error.id} className="p-4 border border-red-200 bg-red-50 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3"><AlertCircle className="h-5 w-5 text-red-500 mt-0.5" /><div><p className="font-medium text-red-800">{platformNames[error.platform] || error.platform} - {error.error_type}</p><p className="text-sm text-red-600 mt-1">{error.error_message}</p><p className="text-xs text-red-400 mt-2 flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(error.created_at).toLocaleString('ar-SA')}</p></div></div>
                        <Button variant="outline" size="sm" onClick={() => resolveErrorMutation.mutate({ id: error.id })} disabled={resolveErrorMutation.isPending}>{t('integrationsDashboardPage.text15')}</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
