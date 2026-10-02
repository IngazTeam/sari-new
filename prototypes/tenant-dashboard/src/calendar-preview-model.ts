import {
  calendarWorkspaceInput,
  calendarWorkspaceSchema,
  calendarDetailsInput,
  calendarDetailsSchema,
  calendarDetailRow,
  calendarWorkspaceRow,
  calendarStatuses,
  calendarSyncStates,
  type CalendarDetails,
} from "../../../shared/calendar-workspace";
import {
  calendarSettingsView,
  calendarDisconnectInput,
} from "../../../shared/calendar-settings";
import {
  appointmentCommandSchema,
  appointmentRequestLookupSchema,
} from "../../../shared/appointment-request";
import {
  appointmentAvailabilitySchema,
  appointmentCancellationSchema,
} from "../../../shared/appointment-creation";
import {
  appointmentReceiptView,
  appointmentRequestView,
  appointmentSlotsView,
} from "../../../shared/appointment-workspace";
import {
  appointmentIdSchema,
  reconcileAppointmentSchema,
} from "../../../shared/appointment-reconciliation";
export const calendarPreviewQueries = [
  "calendar.workspace",
  "calendar.details",
  "calendar.settings",
  "calendar.getSyncReview",
  "calendar.getReminderReview",
  "calendar.getAvailableSlots",
  "calendar.getBookingRequest",
] as const;
export const calendarPreviewMutations = [
  "calendar.bookAppointment",
  "calendar.cancelAppointment",
  "calendar.reconcileSync",
  "calendar.beginOAuth",
  "calendar.disconnect",
] as const;
type Appointment = CalendarDetails["appointment"];
type Context = {
  actorId: number;
  merchantId: number;
  now: string;
  mode: () => string;
  reference: (
    kind: "service" | "staff",
    id: number
  ) => { name: string; isActive: boolean; durationMinutes?: number } | null;
};
const fault = (code = "CONFLICT") => ({
  message: "Local calendar simulation",
  data: { code },
});
/** Disposable calendar examples; never calls Google, messaging providers or a database. */
export class CalendarPreviewStore {
  writes = 0;
  private nextId = 106;
  private revision = 0;
  private connected = true;
  private reconnected = false;
  private records = new Map<
    number,
    { appointment: Appointment; history: any[]; revision: number }
  >();
  private requests = new Map<string, { command: string; id: number }>();
  private reviews = new Map<string, { command: string; result: any }>();
  constructor(private ctx: Context) {
    this.connected = !["empty", "unlinked"].includes(ctx.mode());
    if (ctx.mode() === "empty") return;
    const month = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Riyadh",
        year: "numeric",
        month: "2-digit",
      }).formatToParts(new Date(ctx.now)),
      ym =
        month.find(p => p.type === "year")!.value +
        "-" +
        month.find(p => p.type === "month")!.value;
    for (let id = 1; id <= 105; id++) {
      const sync =
        (
          {
            1: "none",
            2: "synced",
            3: "create_unknown",
            4: "cancel_unknown",
            5: "legacy",
            11: "creating",
            12: "cancelling",
          } as const
        )[id] ?? "none";
      const appointment = calendarDetailRow.parse({
        id,
        merchantId: ctx.merchantId,
        service: { id: 1, name: "", isActive: true },
        staff: id % 2 ? null : { id: 1, name: "", isActive: true },
        customerName: `${ctx.merchantId === 269 ? "نواة · Nawa" : "مدار · Madar"} · مثال موعد ${id}`,
        customerPhone: "966500000000",
        date: ym + "-" + String(2 + (id % 20)).padStart(2, "0"),
        startTime: "10:00",
        endTime: "10:45",
        status:
          id === 4
            ? "cancelled"
            : id === 8
              ? "cancelled"
              : id === 9
                ? "completed"
                : id === 10
                  ? "no_show"
                  : id > 12 && id % 3 === 0
                    ? "pending"
                    : "confirmed",
        sync,
        issues: [],
        notes: "مثال محلي · Local sample",
        cancellationReason:
          id === 4 || id === 8 ? "طلب العميل · Customer request" : null,
        googleEventId:
          sync === "synced" || sync === "cancel_unknown"
            ? `local-event-${id}`
            : null,
        integrationId: sync === "none" || sync === "legacy" ? null : 1,
        calendarTargetId:
          sync === "none" || sync === "legacy"
            ? null
            : "local-calendar@example.test",
        eventReference:
          sync === "none" || sync === "legacy" ? null : `local-event-${id}`,
        reviewRevision: 0,
        reminder24hSent: false,
        reminder1hSent: false,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      });
      this.records.set(id, { appointment, history: [], revision: 0 });
    }
  }
  private scope() {
    return {
      actorId: this.ctx.actorId,
      merchantId: this.ctx.merchantId,
      checkedAt: this.ctx.now,
    };
  }
  private access() {
    return {
      ...this.scope(),
      canManage: this.ctx.mode() !== "readonly",
      canManageIntegration: this.ctx.mode() !== "readonly",
    };
  }
  private digest(id = 0, revision = this.revision) {
    return [this.ctx.merchantId, id, revision, 285, 0, 0, 0, 0]
      .map(n => n.toString(16).padStart(8, "0"))
      .join("");
  }
  private owned(id: number) {
    const r = this.records.get(id);
    if (!r) throw fault("NOT_FOUND");
    return r;
  }
  private visible(row: ReturnType<CalendarPreviewStore["owned"]>) {
    const a = structuredClone(row.appointment);
    for (const kind of ["service", "staff"] as const) {
      const ref = a[kind];
      if (!ref) continue;
      const value =
        this.ctx.mode() === "unavailable-reference"
          ? null
          : this.ctx.reference(kind, ref.id);
      a[kind] = {
        id: ref.id,
        name: value?.name ?? null,
        isActive: value?.isActive ?? null,
      };
      if (!value) a.issues.push(kind + "Reference");
    }
    if (this.ctx.mode() === "legacy") {
      a.status = "unknown";
      a.sync = "unknown";
      a.customerPhone = null;
      a.issues.push("status", "sync");
    }
    return calendarDetailRow.parse(a);
  }
  private receipt(requestId: string) {
    const request = this.requests.get(requestId);
    if (!request)
      return appointmentRequestView.parse({
        ...this.scope(),
        requestId,
        state: "not_found",
      });
    const a = this.records.get(request.id)?.appointment;
    return appointmentRequestView.parse(
      a
        ? {
            ...this.scope(),
            requestId,
            state: "recorded",
            appointmentId: a.id,
            appointmentStatus: a.status,
            calendarSyncState: a.sync,
          }
        : {
            ...this.scope(),
            requestId,
            state: "appointment_unavailable",
            appointmentId: request.id,
          }
    );
  }
  private settings() {
    const mode = this.reconnected ? "normal" : this.ctx.mode(),
      oauthReady = mode !== "oauth-disabled";
    return calendarSettingsView.parse({
      actorId: this.ctx.actorId,
      merchantId: this.ctx.merchantId,
      digest: this.digest(),
      hasIntegration: true,
      active: this.connected,
      oauthReady,
      state: !this.connected
        ? "unlinked"
        : mode === "credentials-invalid"
          ? "credentials_invalid"
          : !oauthReady
            ? "oauth_disabled"
            : mode === "destination-missing"
              ? "needs_destination"
              : "configured",
      calendarId:
        mode === "destination-missing" ? null : "local-calendar@example.test",
      lastSync: null,
      retainedAppointments: this.records.size,
    });
  }
  private conflicts(
    serviceId: number,
    staffId: number | undefined,
    date: string,
    start: string,
    end: string
  ) {
    return Array.from(this.records.values()).some(
      ({ appointment: a }) =>
        !["cancelled", "no_show"].includes(a.status) &&
        a.date === date &&
        (a.service.id === serviceId ||
          (staffId !== undefined && a.staff?.id === staffId)) &&
        a.startTime! < end &&
        a.endTime! > start
    );
  }
  read(name: string, input: any = {}) {
    if (name === "calendar.settings") {
      if (this.ctx.mode() === "readonly") throw fault("FORBIDDEN");
      return this.settings();
    }
    if (name === "calendar.getBookingRequest")
      return this.receipt(
        appointmentRequestLookupSchema.parse(input).requestId
      );
    if (name === "calendar.getAvailableSlots") {
      const selection = appointmentAvailabilitySchema.parse(input),
        ref = this.ctx.reference("service", selection.serviceId);
      if (!ref?.isActive) throw fault("NOT_FOUND");
      const slots = ["09:00", "11:00", "13:00", "15:00"].filter(
        start =>
          !this.conflicts(
            selection.serviceId,
            selection.staffId,
            selection.date,
            start,
            this.end(start, ref.durationMinutes ?? 45)
          )
      );
      return appointmentSlotsView.parse({ ...this.scope(), selection, slots });
    }
    if (name === "calendar.workspace") {
      const selection = calendarWorkspaceInput.parse(input),
        all = Array.from(this.records.values())
          .map(r => this.visible(r))
          .filter(
            a =>
              a.date! >= selection.startDate &&
              a.date! <= selection.endDate &&
              (selection.status === "all" || selection.status === a.status) &&
              (selection.sync === "all" || selection.sync === a.sync) &&
              (!selection.serviceId || selection.serviceId === a.service.id) &&
              (!selection.staffId || selection.staffId === a.staff?.id) &&
              (!selection.search ||
                String(a.id) === selection.search ||
                [a.customerName, a.customerPhone, a.service.name, a.staff?.name]
                  .join(" ")
                  .toLowerCase()
                  .includes(selection.search.toLowerCase()))
          )
          .sort(
            (a, b) =>
              a.date!.localeCompare(b.date!) ||
              a.startTime!.localeCompare(b.startTime!) ||
              a.id - b.id
          );
      const counts = Object.fromEntries(calendarStatuses.map(k => [k, 0])),
        sync = Object.fromEntries(calendarSyncStates.map(k => [k, 0])),
        days = new Map<string, number>();
      for (const a of all) {
        counts[a.status]++;
        sync[a.sync]++;
        days.set(a.date!, 1 + (days.get(a.date!) ?? 0));
      }
      return calendarWorkspaceSchema.parse({
        ...this.access(),
        selection,
        summary: { total: all.length, counts, sync },
        days: Array.from(days, ([date, total]) => ({ date, total })),
        pagination: {
          page: selection.page,
          pageSize: 25,
          total: all.length,
          pages: Math.ceil(all.length / 25),
        },
        rows: all
          .slice((selection.page - 1) * 25, selection.page * 25)
          .map(a =>
            calendarWorkspaceRow.parse(
              Object.fromEntries(
                Object.keys(calendarWorkspaceRow.shape).map(k => [
                  k,
                  a[k as keyof Appointment],
                ])
              )
            )
          ),
      });
    }
    if (name === "calendar.details") {
      const selection = calendarDetailsInput.parse(input);
      return calendarDetailsSchema.parse({
        ...this.access(),
        selection,
        appointment: this.visible(this.owned(selection.appointmentId)),
      });
    }
    const { appointmentId } = appointmentIdSchema.parse(input),
      r = this.owned(appointmentId),
      a = r.appointment;
    if (name === "calendar.getReminderReview")
      return {
        appointmentId,
        reminders:
          appointmentId === 6 || appointmentId === 7
            ? [
                {
                  id: appointmentId,
                  hours: 24,
                  state: appointmentId === 6 ? "accepted" : "unknown",
                  delivery: appointmentId === 6 ? "delivered" : "none",
                  dueAt: this.ctx.now,
                  expiresAt: this.ctx.now,
                  cancelled: a.status === "cancelled",
                  attention: appointmentId === 7,
                  sourceText:
                    "أذكرني قبل الموعد بيوم · Remind me one day before",
                },
              ]
            : [],
      };
    if (name === "calendar.getSyncReview") {
      const canRestore =
          this.connected && ["create_unknown", "legacy"].includes(a.sync),
        canCancel = this.connected && a.sync === "cancel_unknown";
      return {
        appointmentId,
        evidence: this.digest(a.id, r.revision),
        syncState: a.sync,
        status: a.status,
        eventId: a.googleEventId ?? a.eventReference ?? "",
        needsManualBinding: a.sync === "legacy",
        canBind: this.ctx.mode() !== "readonly",
        canRestore,
        canCancel,
        blocked:
          canRestore || canCancel
            ? null
            : ["creating", "cancelling"].includes(a.sync)
              ? "in_flight"
              : "ineligible",
        history: structuredClone(r.history),
      };
    }
    throw Error("Unmapped calendar query " + name);
  }
  private end(start: string, duration: number) {
    const [h, m] = start.split(":").map(Number),
      end = h * 60 + m + duration;
    if (end >= 1440) throw fault();
    return (
      String(Math.floor(end / 60)).padStart(2, "0") +
      ":" +
      String(end % 60).padStart(2, "0")
    );
  }
  mutate(name: string, input: any) {
    if (name === "calendar.beginOAuth") {
      if (this.ctx.mode() === "oauth-disabled")
        throw Error("calendar_oauth:configuration");
      this.connected = true;
      this.reconnected = true;
      this.revision++;
      this.writes++;
      return {
        authorizationUrl:
          "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&state=" +
          "P".repeat(43),
      };
    }
    if (name === "calendar.disconnect") {
      const v = calendarDisconnectInput.parse(input);
      if (v.expectedDigest !== this.digest() || !this.connected) throw fault();
      this.connected = false;
      this.revision++;
      this.writes++;
      return { success: true, ...this.settings() };
    }
    if (name === "calendar.bookAppointment") {
      const v = appointmentCommandSchema.parse(input),
        command = JSON.stringify(v),
        prior = this.requests.get(v.requestId);
      if (prior) {
        if (prior.command !== command) throw fault();
        return appointmentReceiptView.parse({
          ...this.receipt(v.requestId),
          success: true,
          replayed: true,
        });
      }
      const service = this.ctx.reference("service", v.serviceId),
        staff = v.staffId ? this.ctx.reference("staff", v.staffId) : null;
      if (!service?.isActive || (v.staffId && !staff?.isActive)) throw fault();
      const endTime = this.end(v.startTime, service.durationMinutes ?? 45);
      if (
        this.conflicts(
          v.serviceId,
          v.staffId,
          v.appointmentDate,
          v.startTime,
          endTime
        )
      )
        throw fault();
      const id = this.nextId++;
      const a = calendarDetailRow.parse({
        id,
        merchantId: this.ctx.merchantId,
        service: {
          id: v.serviceId,
          name: service.name,
          isActive: service.isActive,
        },
        staff: v.staffId
          ? { id: v.staffId, name: staff!.name, isActive: staff!.isActive }
          : null,
        customerName: v.customerName ?? null,
        customerPhone: v.customerPhone,
        date: v.appointmentDate,
        startTime: v.startTime,
        endTime,
        status: "confirmed",
        sync: this.connected ? "synced" : "none",
        issues: [],
        notes: v.notes ?? null,
        cancellationReason: null,
        googleEventId: this.connected ? "local-event-" + id : null,
        integrationId: this.connected ? 1 : null,
        calendarTargetId: this.connected ? "local-calendar@example.test" : null,
        eventReference: this.connected ? "local-event-" + id : null,
        reviewRevision: 0,
        reminder24hSent: false,
        reminder1hSent: false,
        createdAt: this.ctx.now,
        updatedAt: this.ctx.now,
      });
      this.records.set(id, { appointment: a, history: [], revision: 0 });
      this.requests.set(v.requestId, { command, id });
      this.writes++;
      return appointmentReceiptView.parse({
        ...this.receipt(v.requestId),
        success: true,
        replayed: false,
      });
    }
    if (name === "calendar.cancelAppointment") {
      const v = appointmentCancellationSchema.parse(input),
        r = this.owned(v.appointmentId);
      if (!["pending", "confirmed"].includes(r.appointment.status))
        throw fault();
      r.appointment.status = "cancelled";
      r.appointment.cancellationReason = v.reason ?? null;
      if (r.appointment.sync !== "none") r.appointment.sync = "cancelled";
      r.revision++;
      this.writes++;
      return { success: true };
    }
    if (name === "calendar.reconcileSync") {
      const v = reconcileAppointmentSchema.parse(input),
        command = JSON.stringify(v),
        prior = this.reviews.get(v.requestId);
      if (prior) {
        if (prior.command !== command) throw fault();
        return prior.result;
      }
      const r = this.owned(v.appointmentId),
        view = this.read("calendar.getSyncReview", {
          appointmentId: v.appointmentId,
        }) as any;
      if (
        v.evidence !== view.evidence ||
        !(v.action === "restore_sync" ? view.canRestore : view.canCancel) ||
        (view.needsManualBinding && !v.bindingReviewed)
      )
        throw fault();
      const cancelled = v.action === "confirm_cancellation",
        outcome = cancelled ? "verified_cancelled" : "verified_active";
      r.appointment.sync = cancelled ? "cancelled" : "synced";
      if (cancelled) r.appointment.status = "cancelled";
      r.appointment.googleEventId = v.eventId;
      r.appointment.integrationId = 1;
      r.appointment.calendarTargetId = "local-calendar@example.test";
      r.revision++;
      r.history.unshift({
        actorUserId: this.ctx.actorId,
        action: v.action,
        outcome,
        failureCode: null,
        reason: v.reason,
        manualBinding: view.needsManualBinding,
        revision: r.revision,
        at: this.ctx.now,
      });
      const result = { outcome, failureCode: null };
      this.reviews.set(v.requestId, { command, result });
      this.writes++;
      return result;
    }
    throw Error("Unmapped calendar mutation " + name);
  }
}
