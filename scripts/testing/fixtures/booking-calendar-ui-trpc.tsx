import { useEffect, useState } from "react";
import type { BookingCalendarReview } from "../../../shared/booking-calendar";
const mode = new URL(location.href).searchParams.get("case") || "";
export const bookingCalendarFixture = {
  query: {
    useQuery: () => {
      const [revision, setRevision] = useState(0),
        [recovered, setRecovered] = useState(false);
      useEffect(() => {
        const changed = () => setRevision(n => n + 1);
        window.addEventListener("booking-calendar-change", changed);
        (window as any).__changeBookingCalendar = () =>
          window.dispatchEvent(new Event("booking-calendar-change"));
        return () =>
          window.removeEventListener("booking-calendar-change", changed);
      }, []);
      const active = mode.startsWith("booking-calendar-"),
        saved = (window as any).__bookingCalendarSaved;
      const blocked =
        ["account", "binding", "in_flight", "legacy", "consent"].find(
          x => mode === `booking-calendar-${x}`
        ) || null;
      const unknown = mode === "booking-calendar-unknown",
        xss = mode === "booking-calendar-xss";
      const managed =
        mode === "booking-ops-calendar-moving"
          ? "moving"
          : mode === "booking-ops-calendar-move-unknown"
            ? "move_unknown"
            : mode === "booking-ops-calendar-reschedule-pending"
              ? "reschedule_pending"
              : mode === "booking-ops-calendar-cancelling"
                ? "cancelling"
                : mode === "booking-ops-calendar-cancel-unknown"
                  ? "cancel_unknown"
                  : mode === "booking-ops-calendar-cancelled"
                    ? "cancelled"
                    : mode === "booking-ops-calendar-unknown"
                      ? "create_unknown"
                      : mode.startsWith("booking-ops-calendar-")
                        ? "synced"
                        : null;
      const notice = mode.startsWith("booking-calendar-notice-")
        ? mode.slice("booking-calendar-notice-".length)
        : null;
      const state =
        managed ||
        (saved || notice
          ? "synced"
          : unknown
            ? "create_unknown"
            : blocked === "legacy"
              ? "legacy"
              : blocked === "in_flight"
                ? "creating"
                : "none");
      const data: BookingCalendarReview = {
        state,
        evidence: (revision ? "b" : "a").repeat(64),
        eventId:
          saved || unknown || notice ? "saribook" + "a".repeat(32) : null,
        calendarId: xss
          ? '<img src=x onerror="window.__calendarXss=1">' + "x".repeat(450)
          : "primary",
        canCreate: active && !notice && !blocked && !unknown && !saved,
        canVerify: active && !notice && !blocked && (!!saved || unknown),
        canRelease: mode === "booking-ops-calendar-ended",
        blocked,
        checkedAt: saved ? "2026-09-24T09:00:00Z" : null,
        notification: notice
          ? {
              id: 51,
              kind: "confirmation",
              evidence: (revision ? "d" : "c").repeat(64),
              canReview: !["pending", "dispatching"].includes(notice),
              state: ["sent", "delivered", "read", "xss"].includes(notice)
                ? "accepted"
                : notice,
              delivery: ["sent", "delivered", "read"].includes(notice)
                ? notice
                : "unverified",
              projected: !!(window as any).__noticeSaved || notice !== "sent",
              receipt: notice === "sent" ? "confirmation-receipt-51" : null,
              dispatchAt: "2026-09-24T09:00:00Z",
              acceptedAt: notice === "sent" ? "2026-09-24T09:00:00Z" : null,
              issue:
                notice === "unknown"
                  ? "receipt_unverified"
                  : notice === "suppressed"
                    ? "context_changed"
                    : notice === "manual_review"
                      ? "source_channel_missing"
                      : null,
              text:
                notice === "xss"
                  ? '<img src=x onerror="window.__noticeXss=1">' +
                    "text-".repeat(100)
                  : "تم تأكيد حجزك #321 وتسجيل الموعد لدى النشاط. الموعد: 2026-10-01، من 10:00 إلى 11:00 بتوقيت الرياض. هذا تأكيد للموعد، وليس إيصال دفع.",
              history:
                (window as any).__noticeSaved || notice === "xss"
                  ? [
                      {
                        actorUserId: 7,
                        reason:
                          notice === "xss"
                            ? '<img src=x onerror="window.__noticeXss=1">'
                            : "Reviewed confirmation receipt",
                        state: "accepted",
                        delivery: "sent",
                        projected: true,
                        at: "2026-09-24T09:00:00Z",
                      },
                    ]
                  : [],
            }
          : null,
        history:
          mode === "booking-calendar-reschedule-history"
            ? [
                {
                  actorUserId: 7,
                  action: "move",
                  outcome: "applied",
                  failureCode: null,
                  reason: "Approved requested time",
                  at: "2026-09-24T09:00:00Z",
                },
                {
                  actorUserId: 7,
                  action: "verify_move",
                  outcome: "applied",
                  failureCode: null,
                  reason: "Verified the moved event",
                  at: "2026-09-24T09:01:00Z",
                },
                {
                  actorUserId: 7,
                  action: "abandon_move",
                  outcome: "abandoned",
                  failureCode: null,
                  reason: "Closed before dispatch",
                  at: "2026-09-24T09:02:00Z",
                },
              ]
            : saved || xss
              ? [
                  {
                    action: "create",
                    outcome: "synced",
                    failureCode: null,
                    reason: xss
                      ? '<img src=x onerror="window.__calendarXss=1">'
                      : "Operator reviewed consent and calendar",
                    actorUserId: 7,
                    at: "2026-09-24T09:00:00Z",
                  },
                ]
              : [],
      };
      return {
        data,
        isLoading: mode === "booking-calendar-loading",
        isError: mode === "booking-calendar-error" && !recovered,
        isFetching: mode === "booking-calendar-fetching",
        refetch: async () => {
          setRecovered(true);
          setRevision(n => n + 1);
          return {
            data,
            isError: [
              "booking-calendar-refresh-error",
              "booking-calendar-notice-refresh-error",
            ].includes(mode),
          };
        },
      };
    },
  },
  mutation: {
    useMutation: () => ({
      mutateAsync: async (input: any) => {
        (window as any).__bookingCalendarInput = input;
        (window as any).__bookingCalendarCalls =
          ((window as any).__bookingCalendarCalls || 0) + 1;
        await new Promise(resolve => setTimeout(resolve, 200));
        if (mode === "booking-calendar-write-error")
          throw Error("private calendar credential");
        (window as any).__bookingCalendarSaved = true;
        return { state: "synced", replayed: false };
      },
    }),
  },
};
