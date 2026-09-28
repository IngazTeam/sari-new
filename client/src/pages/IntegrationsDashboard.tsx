import { useState } from "react";
import { WorkspaceState } from "@/components/merchant/WorkspaceState";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Settings,
  Link as LinkIcon,
  Calendar,
  ShoppingBag,
  MessageSquare,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const platformIcons: Record<string, React.ReactNode> = {
  zid: <ShoppingBag className="h-5 w-5" />,
  calendly: <Calendar className="h-5 w-5" />,
  salla: <ShoppingBag className="h-5 w-5" />,
  byaan: <Activity className="h-5 w-5" />,
  google: <LinkIcon className="h-5 w-5" />,
  whatsapp: <MessageSquare className="h-5 w-5" />,
};

export default function IntegrationsDashboard() {
  const { t, i18n } = useTranslation();
  const platformNames: Record<string, string> = {zid:t("notificationWorkspace.platforms.zid"),salla:t("notificationWorkspace.platforms.salla"),byaan:t("notificationWorkspace.platforms.byaan"),calendly:"Calendly",google:"Google",whatsapp:"WhatsApp"};
  const capabilities = trpc.advancedNotifications.workspaceCapabilities.useQuery();
  const canManage = capabilities.data?.integrationsManage === true;
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  const {
    data: dashboardData,
    isLoading,
    isError,
    refetch,
  } = trpc.advancedNotifications.getIntegrationsDashboard.useQuery();
  const resolveErrorMutation =
    trpc.advancedNotifications.resolveError.useMutation({
      onSuccess: () => {
        toast.success(t("tenantFormsUx.IntegrationsDashboard.resolved"));
        refetch();
      },
      onError: () => toast.error(t("tenantFormsUx.failed")),
    });

  if (isError)
    return <WorkspaceState kind="error" onRetry={() => void refetch()} />;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { integrations = [], stats = [], errors = [] } = dashboardData || {};
  const totalSyncs = stats.reduce(
    (acc: number, s: any) => acc + (s.sync_count || 0),
    0
  );
  const totalSuccess = stats.reduce(
    (acc: number, s: any) => acc + (s.success_count || 0),
    0
  );
  const successRate =
    totalSyncs > 0 ? Math.round((totalSuccess / totalSyncs) * 100) : null;

  const settingsLinks: Record<string, string> = {
    zid: "/merchant/integrations/zid",
    salla: "/merchant/salla",
    byaan: "/merchant/integrations/byaan",
    calendly: "/merchant/integrations/calendly",
    google: "/merchant/calendar/settings",
    whatsapp: "/merchant/whatsapp-instances",
  };
  return (
    <div className="container mx-auto py-6 space-y-6" dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {t("workspacePages.integrations")}
          </h1>
          <p className="text-muted-foreground">
            {t("tenantFormsUx.IntegrationsDashboard.description")}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 ml-2" />
          {t("tenantFormsUx.IntegrationsDashboard.refresh")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("tenantFormsUx.IntegrationsDashboard.active")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {integrations.filter((i: any) => i.isActive).length}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("notificationWorkspace.integrationTotal", {count: integrations.length})}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("tenantFormsUx.IntegrationsDashboard.syncs")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSyncs}</div>
            <p className="text-xs text-muted-foreground">
              {t("integrationsDashboard.auto_0")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("tenantFormsUx.IntegrationsDashboard.successRate")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {successRate === null ? "—" : `${successRate}%`}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("notificationWorkspace.successful", {count: totalSuccess})}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("tenantFormsUx.IntegrationsDashboard.errors")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {errors.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("integrationsDashboard.auto_1")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            {t("tenantFormsUx.IntegrationsDashboard.overview")}
          </TabsTrigger>
          <TabsTrigger value="stats">
            {t("integrationsDashboard.auto_2")}
          </TabsTrigger>
          <TabsTrigger value="errors">
            {t("integrationsDashboard.auto_3")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {!integrations.length && <p>{t("tenantFormsUx.noIntegrations")}</p>}
            {integrations.map((integration: any) => (
              <Card key={integration.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg">
                        {platformIcons[integration.platformType] || (
                          <LinkIcon className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          {platformNames[integration.platformType] ||
                            integration.platformType}
                        </CardTitle>
                        <CardDescription>
                          {integration.lastSyncAt
                            ? t("notificationWorkspace.lastSync", {date: new Date(integration.lastSyncAt).toLocaleString(i18n.language)})
                            : t("notificationWorkspace.neverSynced")}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge
                      variant={integration.isActive ? "default" : "secondary"}
                    >
                      {integration.isActive ? t("notificationWorkspace.active") : t("notificationWorkspace.inactive")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {integration.isActive && (
                        <>
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            {t("tenantFormsUx.IntegrationsDashboard.connected")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Activity className="h-4 w-4" />
                            {t("integrationsDashboard.auto_4")}
                          </span>
                        </>
                      )}
                    </div>
                    <Link
                      href={
                        settingsLinks[integration.platformType] ||
                        "/merchant/platform-integrations"
                      }
                    >
                      <Button variant="ghost" size="sm">
                        <Settings className="h-4 w-4 ml-1" />
                        {t("tenantFormsUx.IntegrationsDashboard.settings")}
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {t("tenantFormsUx.IntegrationsDashboard.stats")}
              </CardTitle>
              <CardDescription>
                {t("integrationsDashboard.auto_5")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-y-auto [overflow-wrap:anywhere]">
                <div className="space-y-4">
                  {stats.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      {t("tenantFormsUx.IntegrationsDashboard.emptyStats")}
                    </p>
                  ) : (
                    stats.map((stat: any, index: number) => (
                      <div
                        key={index}
                        className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {platformIcons[stat.platform] || (
                            <LinkIcon className="h-5 w-5" />
                          )}
                          <div>
                            <p className="font-medium">
                              {platformNames[stat.platform] || stat.platform}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(stat.stat_date).toLocaleDateString(
                                i18n.language
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          <span className="flex items-center gap-1">
                            <Activity className="h-4 w-4" />
                            {t("notificationWorkspace.syncs",{count:stat.sync_count})}
                          </span>
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                            {t("notificationWorkspace.successful",{count:stat.success_count})}
                          </span>
                          {stat.error_count > 0 && (
                            <span className="flex items-center gap-1 text-red-600">
                              <AlertCircle className="h-4 w-4" />
                              {t("notificationWorkspace.errors",{count:stat.error_count})}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {t("tenantFormsUx.IntegrationsDashboard.unresolved")}
              </CardTitle>
              <CardDescription>
                {t("integrationsDashboard.auto_6")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-y-auto [overflow-wrap:anywhere]">
                <div className="space-y-4">
                  {errors.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                      <p className="text-muted-foreground">
                        {t("tenantFormsUx.IntegrationsDashboard.emptyErrors")}
                      </p>
                    </div>
                  ) : (
                    errors.map((error: any) => (
                      <div
                        key={error.id}
                        className="p-4 border border-red-200 bg-red-50 rounded-lg"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3 break-words">
                            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                            <div className="min-w-0">
                              <p className="font-medium text-red-800">
                                {platformNames[error.platform] ||
                                  error.platform}{" "}
                                - {error.error_type}
                              </p>
                              <p className="text-sm text-red-600 mt-1">
                                {error.error_message}
                              </p>
                              <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(error.created_at).toLocaleString(
                                  i18n.language
                                )}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              resolveErrorMutation.mutate({ id: error.id })
                            }
                            disabled={!canManage || resolveErrorMutation.isPending}
                          >
                            {t("tenantFormsUx.IntegrationsDashboard.resolve")}
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
