import { useTranslation } from "react-i18next";
import type { BookingNoticeReview } from "../../../shared/booking-reschedule";
import { BookingNotificationReview } from "./BookingNotificationReview";
export function BookingNotification({
  bookingId,
  notice,
  fetching,
  refresh,
}: {
  bookingId: number;
  notice: BookingNoticeReview;
  fetching: boolean;
  refresh: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const format = (at: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(at));
  const notificationStates: Record<string, string> = {
    pending: t("merchantUx.bookingReschedule.noticePending"),
    dispatching: t("merchantUx.bookingReschedule.noticeDispatching"),
    accepted: t("merchantUx.bookingReschedule.noticeAccepted"),
    unknown: t("merchantUx.bookingReschedule.noticeUnknown"),
    failed: t("merchantUx.bookingReschedule.noticeFailed"),
    suppressed: t("merchantUx.bookingReschedule.noticeSuppressed"),
    manual_review: t("merchantUx.bookingReschedule.noticeManual"),
  };
  const deliveryStates: Record<string, string> = {
    sent: t("merchantUx.bookingReschedule.noticeSent"),
    delivered: t("merchantUx.bookingReschedule.noticeDelivered"),
    read: t("merchantUx.bookingReschedule.noticeRead"),
    failed: t("merchantUx.bookingReschedule.noticeDeliveryFailed"),
  };
  return (
    <div
      data-booking-notification
      className="min-w-0 space-y-2 rounded border p-3"
    >
      <h4 className="font-medium">
        {notice.kind === "confirmation"
          ? t("merchantUx.bookingCalendar.noticeTitle")
          : notice.kind === "cancellation"
            ? t("merchantUx.bookingCancellation.noticeTitle")
            : t("merchantUx.bookingReschedule.noticeTitle")}
      </h4>
      <p role="status">
        {notificationStates[notice.state] || notificationStates.unknown}
      </p>
      <p>
        {deliveryStates[notice.delivery] ||
          t("merchantUx.bookingReschedule.noticeUnverified")}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("merchantUx.bookingReschedule.noticeScope")}
      </p>
      {notice.acceptedAt && (
        <time dateTime={notice.acceptedAt}>{format(notice.acceptedAt)}</time>
      )}
      {notice.state === "accepted" && !notice.projected && (
        <p>{t("merchantUx.bookingReschedule.noticeProjection")}</p>
      )}
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center">
          {notice.kind === "confirmation"
            ? t("merchantUx.bookingCalendar.noticeText")
            : notice.kind === "cancellation"
              ? t("merchantUx.bookingCancellation.noticeText")
              : t("merchantUx.bookingReschedule.noticeText")}
        </summary>
        <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          {notice.text}
        </p>
      </details>
      <BookingNotificationReview
        key={`${bookingId}:${notice.id}`}
        bookingId={bookingId}
        notice={notice}
        fetching={fetching}
        states={notificationStates}
        deliveries={deliveryStates}
        refresh={refresh}
      />
    </div>
  );
}
