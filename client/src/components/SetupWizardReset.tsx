import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RefreshCw, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function SetupWizardReset() {
  const { t } = useTranslation(),
    [, setLocation] = useLocation(),
    utils = trpc.useUtils();
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const progress = trpc.setupWizard.getProgress.useQuery(undefined, {
    enabled: open,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const reset = trpc.setupWizard.resetWizard.useMutation();
  const confirm = async () => {
    if (
      !progress.data ||
      progress.isFetching ||
      progress.error ||
      reset.isPending
    )
      return;
    setError("");
    try {
      await reset.mutateAsync({
        expectedDigest: progress.data.digest,
        reviewed: true,
      });
      await Promise.allSettled([
        utils.setupWizard.getProgress.invalidate(),
        utils.merchants.getCurrent.invalidate(),
        utils.merchants.getOnboardingStatus.invalidate(),
      ]);
      setOpen(false);
      setLocation("/merchant/setup-wizard");
    } catch (e) {
      setError(
        t(
          (e as any)?.data?.code === "CONFLICT"
            ? "setupApprovalUx.resetConflict"
            : "setupApprovalUx.resetFailed"
        )
      );
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw aria-hidden="true" />
          {t("setupApprovalUx.resetTitle")}
        </CardTitle>
        <CardDescription>
          {t("setupApprovalUx.resetDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog
          open={open}
          onOpenChange={value => {
            if (!reset.isPending) {
              setOpen(value);
              setError("");
            }
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="outline">{t("setupApprovalUx.resetOpen")}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("setupApprovalUx.resetTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("setupApprovalUx.resetDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {progress.isFetching && (
              <p role="status">{t("setupWorkspace.loading")}</p>
            )}
            {(progress.error || error) && (
              <div role="alert">
                <p>{error || t("setupWorkspace.loadFailed")}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setError("");
                    void progress.refetch();
                  }}
                  disabled={reset.isPending}
                >
                  {t("setupWorkspace.retry")}
                </Button>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={reset.isPending}>
                {t("compSetupWizardResetPage.text9")}
              </AlertDialogCancel>
              <Button
                onClick={confirm}
                disabled={
                  !progress.data ||
                  progress.isFetching ||
                  Boolean(progress.error) ||
                  reset.isPending ||
                  Boolean(error)
                }
              >
                {reset.isPending && (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                )}
                {t("setupApprovalUx.resetConfirm")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
