import { useState, useEffect, useRef } from "react";
import { WorkspaceState } from "@/components/merchant/WorkspaceState";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { DollarSign, Loader2, Save, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { type Currency } from "@shared/currency";
import { useTranslation } from "react-i18next";

export default function CurrencySettings() {
  const { t } = useTranslation();
  const initialized = useRef(false);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>("SAR");

  // Get current merchant
  const {
    data: merchant,
    isLoading: merchantLoading,
    isError,
    refetch,
  } = trpc.merchants.getCurrent.useQuery();

  // Update merchant mutation
  const updateMutation = trpc.merchants.update.useMutation({
    onSuccess: () => {
      toast.success(t("tenantFormsUx.CurrencySettings.saved"));
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || t("tenantFormsUx.failed"));
    },
  });

  // Set initial currency when merchant data loads
  useEffect(() => {
    if (merchant?.currency && !initialized.current) {
      initialized.current = true;
      setSelectedCurrency(merchant.currency as Currency);
    }
  }, [merchant]);

  const handleSave = () => {
    if (!selectedCurrency) {
      toast.error(t("tenantFormsUx.CurrencySettings.required"));
      return;
    }

    updateMutation.mutate({
      currency: selectedCurrency,
    });
  };

  if (isError)
    return <WorkspaceState kind="error" onRetry={() => void refetch()} />;
  if (merchantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          {t("tenantFormsUx.CurrencySettings.title")}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t("tenantFormsUx.CurrencySettings.description")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            {t("currencySettings.auto_1")}
          </CardTitle>
          <CardDescription>{t("currencySettings.auto_2")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription>
              {t("currencySettings.auto_3")}
              <strong>
                {merchant?.currency
                  ? merchant.currency === "SAR"
                    ? "ريال سعودي"
                    : "دولار أمريكي"
                  : "غير محدد"}
              </strong>
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currency">
                {t("tenantFormsUx.CurrencySettings.select")}
              </Label>
              <Select
                value={selectedCurrency}
                onValueChange={value => setSelectedCurrency(value as Currency)}
              >
                <SelectTrigger id="currency" className="w-full">
                  <SelectValue
                    placeholder={t("tenantFormsUx.CurrencySettings.select")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SAR">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">﷼</span>
                      <span>{t("tenantFormsUx.CurrencySettings.sar")}</span>
                      <span className="text-muted-foreground text-sm">
                        (SAR)
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="USD">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">$</span>
                      <span>{t("tenantFormsUx.CurrencySettings.usd")}</span>
                      <span className="text-muted-foreground text-sm">
                        (USD)
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <h4 className="font-semibold text-sm">
                {t("tenantFormsUx.CurrencySettings.details")}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">
                    {t("tenantFormsUx.CurrencySettings.symbol")}
                  </span>
                  <span className="font-medium mr-2">
                    {selectedCurrency === "SAR" ? "﷼" : "$"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {t("tenantFormsUx.CurrencySettings.code")}
                  </span>
                  <span className="font-medium mr-2">{selectedCurrency}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">
                    {t("tenantFormsUx.CurrencySettings.name")}
                  </span>
                  <span className="font-medium mr-2">
                    {selectedCurrency === "SAR" ? "ريال سعودي" : "دولار أمريكي"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              onClick={handleSave}
              disabled={
                !merchant ||
                updateMutation.isPending ||
                selectedCurrency === merchant?.currency
              }
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  {t("currencySettings.auto_4")}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 ml-2" />
                  {t("currencySettings.auto_5")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("tenantFormsUx.CurrencySettings.notes")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-2">
            <span>•</span>
            <p>{t("tenantFormsUx.CurrencySettings.newPrices")}</p>
          </div>
          <div className="flex gap-2">
            <span>•</span>
            <p>{t("tenantFormsUx.CurrencySettings.existingPrices")}</p>
          </div>
          <div className="flex gap-2">
            <span>•</span>
            <p>{t("tenantFormsUx.CurrencySettings.changeAnytime")}</p>
          </div>
          <div className="flex gap-2">
            <span>•</span>
            <p>{t("tenantFormsUx.CurrencySettings.perProduct")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
