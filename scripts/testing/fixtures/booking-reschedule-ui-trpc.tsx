import { useEffect, useState } from "react";
import type { BookingRescheduleReview } from "../../../shared/booking-reschedule";
const mode = new URL(location.href).searchParams.get("case") || "";
export const bookingRescheduleFixture = {
  query: {
    useQuery: () => {
      const [revision, setRevision] = useState(0),
        [recovered, setRecovered] = useState(false);
      useEffect(() => {
        const changed = () => setRevision(n => n + 1);
        window.addEventListener("reschedule-change", changed);
        (window as any).__changeReschedule = () =>
          window.dispatchEvent(new Event("reschedule-change"));
        return () => window.removeEventListener("reschedule-change", changed);
      }, []);
      const active = mode.startsWith("booking-reschedule-");
      const saved = (window as any).__rescheduleSaved as string | undefined,
        unknown = mode === "booking-reschedule-unknown";
      const blocker =
        [
          "binding",
          "financial",
          "changed",
          "consent",
          "booking",
          "inFlight",
        ].find(x => mode === `booking-reschedule-${x}`) || null;
      const xss = mode === "booking-reschedule-xss";
      const notice = mode.startsWith("booking-reschedule-notice-")
        ? mode.slice("booking-reschedule-notice-".length)
        : null;
      const source = {
        id: 81,
        text: xss
          ? '<img src=x onerror="window.__rescheduleXss=1">' +
            "long-customer-request-".repeat(40)
          : "نعم، موافق على ملخص النقل",
        at: "2026-09-24T09:00:00Z",
      };
      const data: BookingRescheduleReview = {
        state: saved
          ? saved
          : mode === "booking-reschedule-applied" || notice
            ? "applied"
            : unknown
              ? "move_unknown"
              : blocker === "inFlight"
                ? "moving"
                : "pending",
        evidence: (revision ? "b" : "a").repeat(64),
        canMove:
          active &&
          !notice &&
          !saved &&
          !unknown &&
          !blocker &&
          mode !== "booking-reschedule-applied",
        canVerify: active && !saved && unknown,
        blocker,
        before: {
          date: "2026-10-01",
          startTime: "10:00",
          endTime: "11:00",
        },
        after: { date: "2026-10-01", startTime: "12:00", endTime: "13:00" },
        consent: blocker === "consent" ? null : source,
        offerText: xss
          ? source.text
          : "ملخص نقل موعد الاستشارة من الساعة 10 إلى 12 بتوقيت الرياض. لم يثبت النقل بعد.",
        canAbandon:
          active &&
          !notice &&
          !saved &&
          !unknown &&
          !blocker &&
          mode !== "booking-reschedule-applied",
        history:
          saved || xss
            ? [
                {
                  action: "move",
                  outcome: "applied",
                  reason: xss ? source.text : "Reviewed customer request",
                  at: source.at,
                },
              ]
            : [],
        notification: notice
          ? {
              state: ["sent", "delivered", "read", "xss"].includes(notice)
                ? "accepted"
                : notice,
              delivery: ["sent", "delivered", "read"].includes(notice)
                ? notice
                : "none",
              projected: notice !== "sent",
              acceptedAt: notice === "sent" ? source.at : null,
              text:
                notice === "xss"
                  ? '<img src=x onerror="window.__noticeXss=1">' +
                    "long-text-".repeat(60)
                  : "تم نقل حجزك #321 وتأكيد الموعد الجديد لدى النشاط.\n2026-10-01، من 12:00 إلى 13:00 بتوقيت الرياض.",
            }
          : null,
      };
      return {
        data: active && mode !== "booking-reschedule-empty" ? data : null,
        isLoading: mode === "booking-reschedule-loading",
        isError: mode === "booking-reschedule-error" && !recovered,
        isFetching: mode === "booking-reschedule-fetching",
        refetch: async () => {
          setRecovered(true);
          setRevision(n => n + 1);
          return {
            data,
            isError: mode === "booking-reschedule-refresh-error",
          };
        },
      };
    },
  },
  mutation: {
    useMutation: () => ({
      mutateAsync: async (input: any) => {
        (window as any).__rescheduleInput = input;
        (window as any).__rescheduleCalls =
          ((window as any).__rescheduleCalls || 0) + 1;
        await new Promise(resolve => setTimeout(resolve, 200));
        if (mode === "booking-reschedule-write-error")
          throw Error("private calendar credential");
        (window as any).__rescheduleSaved =
          input.action === "abandon" ? "abandoned" : "applied";
        return { state: "applied", replayed: false };
      },
    }),
  },
};
