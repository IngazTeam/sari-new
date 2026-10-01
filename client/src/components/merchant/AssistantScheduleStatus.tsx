import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

/** A sampled scheduling decision is not proof of connection, delivery, or sales quality. */
export function AssistantScheduleStatus({
  merchantId,
  data,
  failed,
  loading,
  onRefresh,
}: {
  merchantId: number;
  data?: {
    merchantId: number;
    shouldRespond: boolean;
    reason?: string;
    checkedAt: string;
  };
  failed?: boolean;
  loading?: boolean;
  onRefresh: () => void;
}) {
  const { t, i18n } = useTranslation();
  const valid =
    !failed &&
    !loading &&
    data?.merchantId === merchantId &&
    typeof data.shouldRespond === "boolean" &&
    Number.isFinite(Date.parse(data.checkedAt));
  const reason =
    data?.reason === "Auto-reply is disabled"
      ? t("botSettingsPage.reasonDisabled")
      : data?.reason === "Outside working hours"
        ? t("botSettingsPage.reasonOutsideHours")
        : data?.reason === "Outside working days"
          ? t("botSettingsPage.reasonOutsideDays")
          : t("assistantScheduleStatusUx.unknownReason");
  return (
    <section
      aria-label={t("assistantScheduleStatusUx.title")}
      className="mb-6 space-y-3 rounded-xl border bg-card p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          {t("assistantScheduleStatusUx.title")}
        </h2>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={onRefresh}
        >
          {t("assistantScheduleStatusUx.refresh")}
        </Button>
      </div>
      <p aria-live="polite">
        {loading
          ? t("assistantScheduleStatusUx.loading")
          : !valid
            ? t("assistantScheduleStatusUx.unavailable")
            : data.shouldRespond
              ? t("botSettingsPage.botActive")
              : `${t("botSettingsPage.botStopped")} — ${reason}`}
      </p>
      {valid && (
        <p className="text-xs text-muted-foreground">
          {t("assistantScheduleStatusUx.checked")}{" "}
          <time dateTime={data.checkedAt}>
            {new Date(data.checkedAt).toLocaleString(
              i18n.language.startsWith("ar") ? "ar-SA" : "en-GB",
              { dateStyle: "short", timeStyle: "short" }
            )}
          </time>
        </p>
      )}
      <p className="text-muted-foreground leading-6">
        {t("assistantScheduleStatusUx.scope")}
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Link
          className="inline-flex min-h-11 items-center underline underline-offset-4"
          href="/merchant/whatsapp"
        >
          {t("assistantScheduleStatusUx.connection")}
        </Link>
        <Link
          className="inline-flex min-h-11 items-center underline underline-offset-4"
          href="/merchant/test-sari"
        >
          {t("assistantScheduleStatusUx.preview")}
        </Link>
      </div>
    </section>
  );
}
