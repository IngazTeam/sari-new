import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  FileSpreadsheet,
  Settings,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import ProductSheetPolicyNotice from "@/components/merchant/ProductSheetPolicyNotice";
import {
  WorkspaceState,
  workspaceFailureKind,
} from "@/components/merchant/WorkspaceState";

export default function SheetsSettings() {
  const { t } = useTranslation();
  const [isConnecting, setIsConnecting] = useState(false);
  const connectLock = useRef(false);
  const connectMutation = trpc.sheets.beginOAuth.useMutation();

  // الحصول على حالة الاتصال
  const {
    data: status,
    isLoading: statusLoading,
    error: statusError,
    isFetching: statusFetching,
    refetch: refetchStatus,
  } = trpc.sheets.getStatus.useQuery();

  // الحصول على إعدادات التقارير
  const {
    data: reportSettings,
    error: reportError,
    isLoading: reportLoading,
    refetch: refetchSettings,
  } = trpc.sheets.getReportSettings.useQuery();

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("oauth");
    if (!result) return;
    url.searchParams.delete("oauth");
    window.history.replaceState(window.history.state, "", url);
    if (result === "connected") toast.success(t("sheetsOAuth.connected"));
    else if (result === "cancelled") toast.info(t("sheetsOAuth.cancelled"));
    else toast.error(t("sheetsOAuth.failed"));
  }, [t]);

  // إعداد Spreadsheet
  const setupMutation = trpc.sheets.setupSpreadsheet.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success("نجح الإعداد", { description: data.message });
        refetchStatus();
      } else {
        toast.error("فشل الإعداد", { description: data.message });
      }
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  // تحديث إعدادات التقارير
  const updateSettingsMutation = trpc.sheets.updateReportSettings.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success("تم التحديث", { description: data.message });
        refetchSettings();
        refetchStatus();
      } else {
        toast.error("فشل التحديث", { description: data.message });
      }
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  // فصل الاتصال
  const disconnectMutation = trpc.sheets.disconnect.useMutation({
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success("تم الفصل", { description: data.message });
        refetchStatus();
      } else {
        toast.error("فشل الفصل", { description: data.message });
      }
    },
    onError: error => {
      toast.error(error.message);
    },
  });

  const handleConnect = async () => {
    if (connectLock.current) return;
    connectLock.current = true;
    setIsConnecting(true);
    try {
      const result = await connectMutation.mutateAsync();
      const target = new URL(result.authorizationUrl);
      if (
        target.origin !== "https://accounts.google.com" ||
        target.pathname !== "/o/oauth2/v2/auth" ||
        target.username ||
        target.password
      )
        throw Error();
      window.location.assign(target.href);
    } catch {
      connectLock.current = false;
      setIsConnecting(false);
      toast.error(t("sheetsOAuth.failed"));
    }
  };

  const handleSetup = () => {
    setupMutation.mutate();
  };

  const handleDisconnect = () => {
    if (!status || statusFetching) return;
    if (confirm(t("sheetsConnectionUx.disconnectConfirm"))) {
      disconnectMutation.mutate({
        expectedDigest: status.digest,
        reviewed: true,
      });
    }
  };

  const handleToggleSetting = (
    setting: "sendDailyReports" | "sendWeeklyReports" | "sendMonthlyReports",
    value: boolean
  ) => {
    if (!status || statusFetching || reportError || reportLoading) return;
    if (value && !confirm(t("sheetsConnectionUx.reportConfirm"))) return;
    updateSettingsMutation.mutate({
      expectedDigest: status.digest,
      reviewed: true,
      changes: { [setting]: value },
    });
  };

  if (statusError || reportError)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(statusError || reportError)}
        onRetry={() => {
          void refetchStatus();
          void refetchSettings();
        }}
      />
    );
  if (statusLoading || reportLoading) {
    return (
      <>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="container max-w-4xl py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            {t("workspacePages.sheets")}
          </h1>
          <p className="text-muted-foreground">{t("sheetsSettings.auto_0")}</p>
        </div>

        <ProductSheetPolicyNotice />
        {/* حالة الاتصال */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-6 h-6 text-green-600" />
              <div>
                <h2 className="text-xl font-semibold">
                  {t("sheetsSettingsPage.text8")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {status?.isConnected ? "متصل" : "غير متصل"}
                </p>
              </div>
            </div>
            <div>
              {status?.isConnected ? (
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              ) : (
                <XCircle className="w-8 h-8 text-gray-400" />
              )}
            </div>
          </div>

          {status?.isConnected ? (
            <div className="space-y-4">
              {status.spreadsheetId && (
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Spreadsheet ID</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {status.spreadsheetId}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `https://docs.google.com/spreadsheets/d/${status.spreadsheetId}`,
                        "_blank"
                      )
                    }
                  >
                    <ExternalLink className="w-4 h-4 ml-2" />
                    {t("sheetsSettings.auto_1")}
                  </Button>
                </div>
              )}

              {status.lastSync && (
                <p className="text-sm text-muted-foreground">
                  آخر مزامنة:{" "}
                  {new Date(status.lastSync).toLocaleString("ar-SA")}
                </p>
              )}

              <div className="flex gap-3">
                {!status.spreadsheetId && (
                  <Button
                    onClick={handleSetup}
                    disabled={setupMutation.isPending}
                  >
                    {setupMutation.isPending && (
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    )}
                    إعداد Spreadsheet
                  </Button>
                )}

                <Button variant="outline" onClick={() => refetchStatus()}>
                  <RefreshCw className="w-4 h-4 ml-2" />
                  {t("sheetsSettings.auto_2")}
                </Button>

                <Button
                  variant="destructive"
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending && (
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  )}
                  فصل الاتصال
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("sheetsSettings.auto_3")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("sheetsOAuth.notice")}
              </p>
              <Button onClick={handleConnect} disabled={isConnecting} size="lg">
                {isConnecting && (
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                )}
                <FileSpreadsheet className="w-5 h-5 ml-2" />
                {t("sheetsSettings.auto_4")}
              </Button>
            </div>
          )}
        </Card>

        {/* إعدادات التقارير التلقائية */}
        {status?.isConnected && (
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Settings className="w-6 h-6 text-primary" />
              <div>
                <h2 className="text-xl font-semibold">
                  {t("sheetsSettingsPage.text10")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("sheetsSettings.auto_5")}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label
                    htmlFor="daily-reports"
                    className="text-base font-medium"
                  >
                    {t("sheetsSettings.auto_6")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("sheetsSettings.auto_7")}
                  </p>
                </div>
                <Switch
                  id="daily-reports"
                  checked={reportSettings?.sendDailyReports || false}
                  onCheckedChange={checked =>
                    handleToggleSetting("sendDailyReports", checked)
                  }
                  disabled={updateSettingsMutation.isPending}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label
                    htmlFor="weekly-reports"
                    className="text-base font-medium"
                  >
                    {t("sheetsSettings.auto_8")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("sheetsSettings.auto_9")}
                  </p>
                </div>
                <Switch
                  id="weekly-reports"
                  checked={reportSettings?.sendWeeklyReports || false}
                  onCheckedChange={checked =>
                    handleToggleSetting("sendWeeklyReports", checked)
                  }
                  disabled={updateSettingsMutation.isPending}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label
                    htmlFor="monthly-reports"
                    className="text-base font-medium"
                  >
                    {t("sheetsSettings.auto_10")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("sheetsSettings.auto_11")}
                  </p>
                </div>
                <Switch
                  id="monthly-reports"
                  checked={reportSettings?.sendMonthlyReports || false}
                  onCheckedChange={checked =>
                    handleToggleSetting("sendMonthlyReports", checked)
                  }
                  disabled={updateSettingsMutation.isPending}
                />
              </div>
            </div>
          </Card>
        )}

        {/* معلومات إضافية */}
        {status?.isConnected && (
          <Card className="p-6 mt-6 bg-blue-50 border-blue-200">
            <h3 className="font-semibold mb-2 text-blue-900">
              {t("sheetsSettingsPage.text11")}
            </h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>{t("sheetsSettingsPage.text12")}</li>
              <li>{t("sheetsSettingsPage.text13")}</li>
              <li>{t("sheetsSettingsPage.text14")}</li>
              <li>{t("sheetsSettingsPage.text15")}</li>
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
