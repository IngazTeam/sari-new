import { useEffect, useState } from "react";
import type { BookingCancellationReview } from "../../../shared/booking-cancellation";
const mode = new URL(location.href).searchParams.get("case") || "";
export const bookingCancellationFixture = {
  query: {
    useQuery: () => {
      const [revision, setRevision] = useState(0),
        [recovered, setRecovered] = useState(false);
      useEffect(() => {
        const changed = () => setRevision(n => n + 1);
        window.addEventListener("cancellation-change", changed);
        (window as any).__changeCancellation = () =>
          window.dispatchEvent(new Event("cancellation-change"));
        return () => window.removeEventListener("cancellation-change", changed);
      }, []);
      const active = mode.startsWith("booking-cancellation-");
      const saved = !!(window as any).__cancellationSaved,
        unknown = mode === "booking-cancellation-unknown";
      const blocker =
        [
          "binding",
          "financial",
          "changed",
          "request",
          "booking",
          "inFlight",
        ].find(x => mode === `booking-cancellation-${x}`) || null;
      const xss = mode === "booking-cancellation-xss";
      const source = {
        id: 81,
        text: xss
          ? '<img src=x onerror="window.__cancellationXss=1">' +
            "long-customer-request-".repeat(40)
          : "أريد إلغاء الحجز #321",
        at: "2026-09-24T09:00:00Z",
      };
      const data: BookingCancellationReview = {
        state:
          saved || mode === "booking-cancellation-cancelled"
            ? "cancelled"
            : unknown
              ? "cancel_unknown"
              : blocker === "inFlight"
                ? "cancelling"
                : "none",
        evidence: (revision ? "b" : "a").repeat(64),
        canCancel:
          active &&
          !saved &&
          !unknown &&
          !blocker &&
          mode !== "booking-cancellation-cancelled",
        canVerify: active && !saved && unknown,
        blocker,
        appointment: {
          serviceName: "استشارة",
          date: "2026-10-01",
          startTime: "10:00",
          endTime: "11:00",
        },
        request: blocker === "request" ? null : source,
        originalRequest: unknown ? source : null,
        history:
          saved || xss
            ? [
                {
                  action: "cancel",
                  outcome: "cancelled",
                  reason: xss ? source.text : "Reviewed customer request",
                  at: source.at,
                },
              ]
            : [],
      };
      return {
        data: active && mode !== "booking-cancellation-empty" ? data : null,
        isLoading: mode === "booking-cancellation-loading",
        isError: mode === "booking-cancellation-error" && !recovered,
        isFetching: mode === "booking-cancellation-fetching",
        refetch: async () => {
          setRecovered(true);
          setRevision(n => n + 1);
          return {
            data,
            isError: mode === "booking-cancellation-refresh-error",
          };
        },
      };
    },
  },
  mutation: {
    useMutation: () => ({
      mutateAsync: async (input: any) => {
        (window as any).__cancellationInput = input;
        (window as any).__cancellationCalls =
          ((window as any).__cancellationCalls || 0) + 1;
        await new Promise(resolve => setTimeout(resolve, 200));
        if (mode === "booking-cancellation-write-error")
          throw Error("private calendar credential");
        (window as any).__cancellationSaved = true;
        return { state: "cancelled", replayed: false };
      },
    }),
  },
};
