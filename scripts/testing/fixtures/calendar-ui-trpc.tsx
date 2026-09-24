import { useEffect, useState } from "react";
const mode = new URL(location.href).searchParams.get("case") || "";
const win = window as any;
const reference = "sariappt" + "a".repeat(32);
export const calendarFixture = {
  getReminderReview: {
    useQuery: () => {
      const [busy,setBusy]=useState(false), [recovered,setRecovered]=useState(false);
      const state=mode.startsWith('appointment-reminders-') ? mode.slice('appointment-reminders-'.length) : 'empty';
      const data={appointmentId:501,reminders:state==='empty'?[]:[{id:7,hours:1,requestedAt:'2026-09-24T09:00:00Z',dueAt:'2026-09-24T10:00:00Z',expiresAt:'2026-09-24T10:15:00Z',
        state:['pending','dispatching','unknown','accepted','failed','suppressed'].includes(state)?state:'accepted',
        delivery:state==='read'?'read':state==='delivered'?'delivered':state==='failed'?'failed':state==='pending'?'none':'sent',
        cancelled:state==='cancelled',attention:state==='unknown',sourceText:state==='xss'?'<img src=x onerror="window.__reminderXss=1">'+'long'.repeat(160):'ذكرني بالموعد A501 قبل ساعة',sourceId:53,conversationId:44}]};
      return {data:state==='loading'?undefined:data,isLoading:state==='loading',isError:state==='error'&&!recovered,isFetching:busy||state==='fetching',
        refetch:async()=>{win.__reminderRefreshCount=(win.__reminderRefreshCount||0)+1;setBusy(true);await new Promise(resolve=>setTimeout(resolve,180));setBusy(false);setRecovered(true);return {data,isError:state==='refresh-error'};}};
    },
  },
  getSyncReview: {
    useQuery: () => {
      const [version, setVersion] = useState(0),
        [recovered, setRecovered] = useState(false);
      useEffect(() => {
        win.__changeCalendarEvidence = () => setVersion(v => v + 1);
      }, []);
      const saved = win.__calendarReviewed,
        legacy = mode.includes("legacy"),
        cancelled = mode === "calendar-review-cancel";
      const blocked =
        mode === "calendar-review-waiting"
          ? "in_flight"
          : mode === "calendar-review-target"
            ? "target_unavailable"
            : mode === "calendar-review-complete"
              ? "ineligible"
              : null;
      const data = {
        appointmentId: 501,
        evidence: (version % 2 ? "b" : "a").repeat(64),
        syncState: legacy
          ? "legacy"
          : cancelled
            ? "cancel_unknown"
            : "create_unknown",
        status: "confirmed",
        eventId: legacy ? "" : reference,
        needsManualBinding: legacy,
        canBind: mode !== "calendar-review-legacy-denied",
        canRestore:
          !blocked &&
          !cancelled &&
          (!saved || mode === "calendar-review-unverified"),
        canCancel: !blocked && cancelled && !saved,
        blocked,
        history:
          saved || mode === "calendar-review-xss"
            ? [
                {
                  actorUserId: 7,
                  action: "restore_sync",
                  outcome:
                    mode === "calendar-review-unverified"
                      ? "unverified"
                      : "verified_active",
                  failureCode:
                    mode === "calendar-review-unverified"
                      ? "provider_unavailable"
                      : null,
                  reason:
                    mode === "calendar-review-xss"
                      ? '<img src=x onerror="window.__calendarXss=1">' +
                        "long".repeat(50)
                      : "Operator reviewed appointment",
                  manualBinding: legacy,
                  revision: 1,
                  at: "2026-09-24T09:00:00Z",
                },
              ]
            : [],
      };
      return {
        data: mode === "calendar-review-loading" ? undefined : data,
        isLoading: mode === "calendar-review-loading",
        isError: mode === "calendar-review-error" && !recovered,
        isFetching: mode === "calendar-review-fetching",
        refetch: async () => {
          setRecovered(true);
          setVersion(v => v + 1);
          return { data, isError: mode === "calendar-review-refresh-error" };
        },
      };
    },
  },
  reconcileSync: {
    useMutation: () => {
      const [isPending, setPending] = useState(false);
      return {
        isPending,
        mutateAsync: async (input: any) => {
          setPending(true);
          win.__calendarReviewInput = input;
          win.__calendarReviewCount = (win.__calendarReviewCount || 0) + 1;
          await new Promise(r => setTimeout(r, 200));
          setPending(false);
          if (mode === "calendar-review-write-error")
            throw Error("private calendar credential");
          win.__calendarReviewed = true;
          return {
            outcome:
              mode === "calendar-review-cancel"
                ? "verified_cancelled"
                : mode === "calendar-review-unverified"
                  ? "unverified"
                  : "verified_active",
            failureCode: null,
          };
        },
      };
    },
  },
  listAppointments: {
    useQuery: (input: any) => {
      const [, bump] = useState(0),
        [recovered, setRecovered] = useState(false);
      win.__calendarListInput = input;
      const day = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
      const rows = [
        {
          id: 501,
          customerName: "عميل الاختبار / Test customer",
          customerPhone: "966500987654",
          serviceName: "استشارة / Consultation",
          staffName: "سارة / Sara",
          appointmentDate: day,
          startTime: "10:00",
          endTime: "11:00",
          status: win.__calendarCancelled ? "cancelled" : "confirmed",
          calendarSyncState: "none",
        },
        {
          id: 502,
          customerName: "مزامنة تحتاج مراجعة / Review",
          customerPhone: "966500987655",
          serviceName: "استشارة / Consultation",
          staffName: null,
          appointmentDate: day,
          startTime: "12:00",
          endTime: "13:00",
          status: "confirmed",
          calendarSyncState: "create_unknown",
        },
        {
          id: 503,
          customerName: "موعد مكتمل / Completed",
          customerPhone: "966500987656",
          serviceName: "استشارة / Consultation",
          staffName: null,
          appointmentDate: day,
          startTime: "14:00",
          endTime: "15:00",
          status: "completed",
          calendarSyncState: "none",
        },
      ];
      const data = {
        appointments: mode === "calendar-page-empty" ? [] : rows,
        truncated: mode === "calendar-page-truncated",
        stats: {
          total: mode === "calendar-page-empty" ? 0 : 3,
          confirmed: 2,
          pending: 0,
          cancelled: win.__calendarCancelled ? 1 : 0,
        },
        canManage: mode !== "calendar-page-viewer",
        canManageIntegration: mode !== "calendar-page-viewer",
      };
      return {
        data: mode === "calendar-page-loading" ? undefined : data,
        isLoading: mode === "calendar-page-loading",
        isError: mode === "calendar-page-error" && !recovered,
        isFetching: false,
        refetch: async () => {
          setRecovered(true);
          bump(v => v + 1);
          return { data, isError: false };
        },
      };
    },
  },
  getStatus: {
    useQuery: () => ({
      data: { connected: mode !== "calendar-page-disconnected" },
      isError: false,
    }),
  },
  cancelAppointment: {
    useMutation: () => {
      const [isPending, setPending] = useState(false);
      return {
        isPending,
        mutateAsync: async (input: any) => {
          win.__calendarCancelInput = input;
          win.__calendarCancelCount = (win.__calendarCancelCount || 0) + 1;
          setPending(true);
          await new Promise(r => setTimeout(r, 150));
          setPending(false);
          if (mode === "calendar-page-write-error")
            throw Error("private provider failure");
          win.__calendarCancelled = true;
          return { success: true };
        },
      };
    },
  },
};
