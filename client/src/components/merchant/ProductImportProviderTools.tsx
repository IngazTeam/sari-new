import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Link2,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
export function ProductImportProviderTools() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [uploadResult, setUploadResult] = useState<any>(null);
  const activeTab = "sheets";
  const syncSheets = trpc.products.syncFromGoogleSheets.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.message);
      setUploadResult({
        imported: data.created,
        updated: data.updated,
        skipped: data.skipped,
        total: data.total,
      });
      sheetStatus.refetch();
    },
    onError: (error: any) => {
      toast.error(t("uploadProductsPage.syncFailed") + error.message);
    },
  });

  const sheetStatus = trpc.products.getSheetSyncStatus.useQuery();

  return (
    <div className="space-y-4">
      {/* ════════════ TAB 2: Google Sheets ════════════ */}
      {activeTab === "sheets" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-green-600" />
                {t("uploadProductsPage.syncGoogleSheets")}
              </CardTitle>
              <CardDescription>
                {t("uploadProductsPage.syncGoogleSheetsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sheetStatus.data?.connected ? (
                <div className="space-y-4">
                  {/* Connected status */}
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
                    <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-green-900">
                        {t("uploadProductsPage.connectedSheets")}
                      </p>
                      {sheetStatus.data.lastSync && (
                        <p className="text-sm text-green-700 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t("uploadProductsPage.lastSync")}{" "}
                          {new Date(sheetStatus.data.lastSync).toLocaleString(
                            "ar-SA"
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Sync instructions */}
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t("uploadProductsPage.sheetInstructions")}
                    </AlertDescription>
                  </Alert>

                  {/* Sync buttons */}
                  <div className="flex gap-3">
                    <Button
                      onClick={() => syncSheets.mutate()}
                      disabled={syncSheets.isPending}
                      className="flex-1"
                    >
                      {syncSheets.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 ml-2 animate-spin" />
                          {t("uploadProductsPage.syncing")}
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 ml-2" />
                          {t("uploadProductsPage.syncNow")}
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Smart sync note */}
                  <p className="text-xs text-muted-foreground text-center">
                    {t("uploadProductsPage.smartSyncNote")}
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 space-y-4">
                  <Link2 className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <p className="text-lg font-medium">
                      {t("uploadProductsPage.sheetsNotLinked")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("uploadProductsPage.linkFromIntegrations")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/merchant/sheets/settings")}
                  >
                    {t("uploadProductsPage.goToIntegrations")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          {uploadResult && (
            <Card className="border-green-200 bg-green-50/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <CardTitle className="text-green-900">
                    {t("uploadProductsPage.syncResult")}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 rounded-lg bg-white/60">
                    <p className="text-2xl font-bold text-green-600">
                      {uploadResult.imported || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("uploadProductsPage.newProduct")}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/60">
                    <p className="text-2xl font-bold text-blue-600">
                      {uploadResult.updated || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("uploadProductsPage.updated")}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/60">
                    <p className="text-2xl font-bold text-gray-500">
                      {uploadResult.skipped || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("uploadProductsPage.skipped")}
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full mt-4"
                  onClick={() => setLocation("/merchant/products")}
                >
                  {t("uploadProductsPage.viewProducts")}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
