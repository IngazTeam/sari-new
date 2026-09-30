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
  Upload,
  FileText,
  Download,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileSpreadsheet,
  Link2,
  RefreshCw,
  Clock,
  Table2,
  Plus,
  Sparkles,
  Brain,
} from "lucide-react";
import { useState, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation } from "wouter";

export function ProductImportProviderTools() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"file" | "sheets" | "template">(
    "file"
  );
  const [importType, setImportType] = useState<
    "auto" | "products" | "services"
  >("auto");
  const [smartResult, setSmartResult] = useState<any>(null);

  // GPT Smart Import
  const smartImport = trpc.products.smartImport.useMutation({
    onSuccess: (data: any) => {
      setUploadResult(data);
      setSmartResult(data);
      toast.success(data.message || `تم استيراد ${data.imported} عنصر بنجاح`);
      if (data.sheetCreated && data.spreadsheetUrl) {
        toast.success("تم رفع البيانات على Google Sheet تلقائياً", {
          action: {
            label: "فتح الشيت",
            onClick: () => window.open(data.spreadsheetUrl, "_blank"),
          },
        });
      }
      resetFile();
      sheetStatus.refetch();
    },
    onError: (error: any) => {
      toast.error("فشل الاستيراد الذكي: " + error.message);
    },
  });

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

  const resetFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx"].includes(ext || "")) {
      toast.error(t("uploadProductsPage.invalidFileFormat"));
      return;
    }
    const maxBytes = ext === "csv" ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error(t("errors.fileTooBig"));
      event.target.value = "";
      return;
    }
    setSelectedFile(file);
    setUploadResult(null);
  };

  const handleSmartImport = async () => {
    if (!selectedFile) {
      toast.error(t("uploadProductsPage.selectFileFirst"));
      return;
    }
    if (!selectedFile.name.toLowerCase().endsWith(".xlsx")) {
      toast.error(t("uploadProductsPage.invalidFileFormat"));
      return;
    }
    const arrayBuffer = await selectedFile.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ""
      )
    );
    smartImport.mutate({
      fileBase64: base64,
      fileName: selectedFile.name,
      importType,
    });
  };

  const isUploading = smartImport.isPending;

  const tabs = [
    {
      id: "file" as const,
      label: t("productImportUx.smartTools"),
      icon: <FileSpreadsheet className="h-4 w-4" />,
    },
    {
      id: "sheets" as const,
      label: "Google Sheets",
      icon: <Link2 className="h-4 w-4" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b pb-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setUploadResult(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════ TAB 1: File Upload ════════════ */}
      {activeTab === "file" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                {t("uploadProductsPage.uploadCsvExcel")}
              </CardTitle>
              <CardDescription>
                {t("uploadProductsPage.uploadCsvExcelDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />

                {selectedFile ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <FileText className="h-8 w-8" />
                      <span className="font-medium">{selectedFile.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("uploadProductsPage.fileSize", {
                        size: (selectedFile.size / 1024).toFixed(1),
                      })}
                    </p>
                    {/* Import type selector */}
                    <div className="flex gap-3 justify-center">
                      {(["auto", "products", "services"] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => setImportType(type)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            importType === type
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted text-muted-foreground border-transparent hover:border-muted-foreground/30"
                          }`}
                        >
                          {type === "auto"
                            ? "🤖 تلقائي"
                            : type === "products"
                              ? "📦 منتجات"
                              : "🛎️ خدمات"}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2 justify-center">
                      <Button
                        onClick={handleSmartImport}
                        disabled={
                          isUploading ||
                          !selectedFile.name.toLowerCase().endsWith(".xlsx")
                        }
                        className="bg-primary gap-2"
                      >
                        {smartImport.isPending ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            جاري التحليل بالذكاء الاصطناعي...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            استيراد ذكي بالـ AI
                          </>
                        )}
                      </Button>
                      <Button variant="ghost" onClick={resetFile}>
                        {t("uploadProductsPage.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground" />
                    <div>
                      <p className="text-lg font-medium">
                        {t("uploadProductsPage.selectExcelCsv")}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t("uploadProductsPage.supportedFormats")}
                      </p>
                    </div>
                    <Button onClick={() => fileInputRef.current?.click()}>
                      <Plus className="h-4 w-4 ml-2" />
                      {t("uploadProductsPage.chooseFile")}
                    </Button>
                  </div>
                )}
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{t("uploadProductsPage.supportedColumns")}</strong>{" "}
                  {t("uploadProductsPage.supportedColumnsList")}
                </AlertDescription>
              </Alert>

              {/* Smart Result — AI Analysis */}
              {smartResult && (
                <div className="space-y-3 p-4 rounded-xl bg-accent border border-violet-200">
                  <div className="flex items-center gap-2 text-violet-700 font-semibold">
                    <Brain className="h-5 w-5" />
                    تحليل الذكاء الاصطناعي
                  </div>
                  {smartResult.businessType && (
                    <p className="text-sm">
                      <strong>نوع النشاط:</strong>{" "}
                      {smartResult.businessType === "services"
                        ? "🛎️ خدمات/دورات"
                        : "📦 منتجات"}
                    </p>
                  )}
                  {smartResult.businessSummary && (
                    <p className="text-sm">
                      <strong>الملخص:</strong> {smartResult.businessSummary}
                    </p>
                  )}
                  {smartResult.sellingTips && (
                    <p className="text-sm">
                      <strong>نصائح البيع:</strong> {smartResult.sellingTips}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          {uploadResult && (
            <ResultCard
              result={uploadResult}
              onViewProducts={() => setLocation("/merchant/products")}
            />
          )}
        </div>
      )}

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

// ────────── Shared Result Card ──────────
function ResultCard({
  result,
  onViewProducts,
}: {
  result: any;
  onViewProducts: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <CardTitle className="text-green-900">
            {t("uploadProductsPage.importResult")}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">
              {t("uploadProductsPage.totalRecords")}
            </span>
            <span className="text-sm">{result.total}</span>
          </div>
          <div className="flex justify-between items-center text-green-600">
            <span className="text-sm font-medium">
              {t("uploadProductsPage.importedSuccess")}
            </span>
            <span className="text-sm font-bold">{result.imported}</span>
          </div>
          {result.failed > 0 && (
            <div className="flex justify-between items-center text-red-600">
              <span className="text-sm font-medium">
                {t("uploadProductsPage.importFailed")}
              </span>
              <span className="text-sm font-bold">{result.failed}</span>
            </div>
          )}
          {result.errors?.length > 0 && (
            <div className="mt-2 p-3 rounded bg-red-50 border border-red-200">
              <p className="text-xs font-medium text-red-800 mb-1">
                {t("uploadProductsPage.errorDetails")}
              </p>
              {result.errors.map((err: string, i: number) => (
                <p
                  key={i}
                  className="text-xs text-red-600 flex items-start gap-1"
                >
                  <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  {err}
                </p>
              ))}
            </div>
          )}
        </div>
        {result.sheetCreated && result.spreadsheetUrl && (
          <div className="mt-3 p-3 rounded-lg bg-green-100 border border-green-300">
            <p className="text-sm font-medium text-green-900 mb-1">
              {t("uploadProducts.auto_2")}
            </p>
            <a
              href={result.spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-green-700 underline hover:text-green-900 flex items-center gap-1"
            >
              <Link2 className="h-3 w-3" />
              {t("uploadProducts.auto_3")}
            </a>
            <p className="text-xs text-green-600 mt-1">
              {t("uploadProducts.auto_4")}
            </p>
          </div>
        )}
        <Button className="w-full mt-4" onClick={onViewProducts}>
          {t("uploadProductsPage.viewProducts")}
        </Button>
      </CardContent>
    </Card>
  );
}
