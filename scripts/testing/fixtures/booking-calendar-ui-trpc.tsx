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
        mode === "booking-ops-calendar-unknown"
          ? "create_unknown"
          : mode.startsWith("booking-ops-calendar-")
            ? "synced"
            : null;
      const state =
        managed ||
        (saved
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
        eventId: saved || unknown ? "saribook" + "a".repeat(32) : null,
        calendarId: xss
          ? '<img src=x onerror="window.__calendarXss=1">' + "x".repeat(450)
          : "primary",
        canCreate: active && !blocked && !unknown && !saved,
        canVerify: active && !blocked && (!!saved || unknown),
        canRelease: mode === "booking-ops-calendar-ended",
        blocked,
        checkedAt: saved ? "2026-09-24T09:00:00Z" : null,
        history:
          saved || xss
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
          return { data, isError: mode === "booking-calendar-refresh-error" };
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
