import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { scopedCalendarSettings } from "@/lib/calendar-connection";
import { Button } from "@/components/ui/button";
import "@/styles/service-catalog-workspace.css";
import "@/styles/calendar-connection.css";
export function CalendarConnectionCard() {
  const { t } = useTranslation();
  const fresh = {
    retry: false,
    staleTime: 0,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: false,
  };
  const user = trpc.auth.me.useQuery(undefined, fresh);
  const merchant = trpc.merchants.getCurrent.useQuery(undefined, {
    ...fresh,
    enabled: !!user.data?.id && !user.error && !user.isFetching,
  });
  const query = trpc.calendar.settings.useQuery(undefined, {
    ...fresh,
    enabled:
      !!user.data?.id &&
      !!merchant.data?.id &&
      !user.error &&
      !merchant.error &&
      !user.isFetching &&
      !merchant.isFetching,
  });
  const error = user.error || merchant.error || query.error;
  const data =
    !error && user.data?.id && merchant.data?.id
      ? scopedCalendarSettings(query.data, user.data.id, merchant.data.id)
      : null;
  const loading =
    !error &&
    !data &&
    (user.isLoading ||
      user.isFetching ||
      merchant.isLoading ||
      merchant.isFetching ||
      query.isLoading ||
      query.isFetching);
  const forbidden = error?.data?.code === "FORBIDDEN";
  const states = {
    configured: t("merchantUx.calendarConnection.configured"),
    unlinked: t("merchantUx.calendarConnection.unlinked"),
    credentials_invalid: t("merchantUx.calendarConnection.credentials_invalid"),
    oauth_disabled: t("merchantUx.calendarConnection.oauth_disabled"),
    needs_destination: t("merchantUx.calendarConnection.needs_destination"),
  };
  return (
    <section className="service-catalog cc-panel" data-calendar-connection-card>
      <h3>{t("merchantUx.calendarConnection.title")}</h3>
      <p role={error ? "alert" : "status"}>
        {loading
          ? t("merchantUx.calendarConnection.loading")
          : data
            ? states[data.state]
            : forbidden
              ? t("merchantUx.calendarConnection.permission")
              : t("merchantUx.calendarConnection.unknown")}
      </p>
      <p className="sc-muted">
        {t("merchantUx.calendarConnection.configuredHint")}
      </p>
      <div className="sc-actions">
        {data && (
          <Button asChild variant="outline">
            <Link href="/merchant/calendar/settings">
              {t("merchantUx.calendarConnection.manage")}
            </Link>
          </Button>
        )}
        {!data && !loading && (
          <Button
            variant="outline"
            onClick={() => {
              void user.refetch();
              void merchant.refetch();
              void query.refetch();
            }}
          >
            {t("merchantUx.calendarConnection.refresh")}
          </Button>
        )}
      </div>
    </section>
  );
}
