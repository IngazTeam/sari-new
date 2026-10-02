import { describe, it, expect } from "vitest";
import {
  ServicePreviewModel,
  serviceModes,
} from "../prototypes/tenant-dashboard/src/service-preview-model";
import {
  calendarPreviewQueries,
  calendarPreviewMutations,
} from "../prototypes/tenant-dashboard/src/calendar-preview-model";
import {
  calendarWorkspaceSchema,
  calendarDetailsSchema,
} from "../shared/calendar-workspace";
import { scopedCalendarSettings } from "../client/src/lib/calendar-connection";
import {
  servicePreviewHref,
  previewNavigation,
} from "../prototypes/tenant-dashboard/src/service-preview-router";
const now = "2026-10-02T10:00:00Z",
  range = { startDate: "2026-10-01", endDate: "2026-10-31" };
const read = (m: ServicePreviewModel, name: string, input?: any) => {
  const r = m.read("calendar." + name, input);
  expect(r.error).toBeNull();
  return r.data;
};
const create = {
  serviceId: 1,
  customerPhone: "966500000000",
  appointmentDate: "2026-12-20",
  startTime: "10:00",
  requestId: "00000000-0000-4000-8000-000000000285",
};
describe("calendar prototype uses actual contracts and isolated in-memory records", () => {
  it.each(serviceModes)("models calendar scenario %s", mode => {
    const m = new ServicePreviewModel(269, mode, now),
      r = m.read("calendar.workspace", range);
    if (["failure", "stale-error"].includes(mode)) expect(r.error).toBeTruthy();
    else if (mode === "loading") expect(r.isLoading).toBe(true);
    else {
      expect(r.error).toBeNull();
      expect(r.data.merchantId).toBe(mode === "foreign" ? 999 : 269);
      expect(r.data.summary.total).toBe(mode === "empty" ? 0 : 105);
    }
  });
  it("pages all 105 records and searches beyond the first page", () => {
    const m = new ServicePreviewModel(269, "normal", now),
      r = read(m, "workspace", range);
    expect(calendarWorkspaceSchema.safeParse(r).success).toBe(true);
    expect(r.rows).toHaveLength(25);
    expect(r.days.reduce((n: number, d: any) => n + d.total, 0)).toBe(105);
    expect(read(m, "workspace", { ...range, page: 5 }).rows).toHaveLength(5);
    expect(
      read(m, "workspace", { ...range, search: "105" }).rows.map(
        (r: any) => r.id
      )
    ).toEqual([105]);
    expect(
      read(m, "workspace", { ...range, sync: "create_unknown" }).rows.map(
        (r: any) => r.id
      )
    ).toEqual([3]);
  });
  it.each(Array.from({ length: 12 }, (_, i) => i + 1))(
    "exposes all actual details/review tools for example %s",
    appointmentId => {
      const m = new ServicePreviewModel(269, "normal", now);
      expect(
        calendarDetailsSchema.safeParse(read(m, "details", { appointmentId }))
          .success
      ).toBe(true);
      expect(read(m, "getSyncReview", { appointmentId }).appointmentId).toBe(
        appointmentId
      );
      expect(
        read(m, "getReminderReview", { appointmentId }).reminders.length
      ).toBe([6, 7].includes(appointmentId) ? 1 : 0);
    }
  );
  it("keeps tenant mutations isolated and enforces replay identity", async () => {
    const a = new ServicePreviewModel(269, "normal", now),
      b = new ServicePreviewModel(270, "normal", now),
      result = await a.mutate("calendar.bookAppointment", create);
    expect(result).toMatchObject({
      success: true,
      appointmentId: 106,
      replayed: false,
      calendarSyncState: "synced",
    });
    expect(
      read(a, "getBookingRequest", { requestId: create.requestId })
    ).toMatchObject({ state: "recorded", appointmentId: 106 });
    expect(
      read(b, "getBookingRequest", { requestId: create.requestId }).state
    ).toBe("not_found");
    expect((await a.mutate("calendar.bookAppointment", create)).replayed).toBe(
      true
    );
    expect(a.operations).toBe(1);
    await expect(
      a.mutate("calendar.bookAppointment", {
        ...create,
        customerPhone: "966511111111",
      })
    ).rejects.toBeTruthy();
    expect(a.operations).toBe(1);
  });
  it("filters conflicting slots and rejects inactive references or overlap", async () => {
    const m = new ServicePreviewModel(269, "normal", now);
    await m.mutate("calendar.bookAppointment", {
      ...create,
      startTime: "09:00",
    });
    expect(
      read(m, "getAvailableSlots", {
        serviceId: 1,
        date: create.appointmentDate,
      }).slots
    ).not.toContain("09:00");
    await expect(
      m.mutate("calendar.bookAppointment", {
        ...create,
        requestId: "00000000-0000-4000-8000-000000000286",
        startTime: "09:30",
      })
    ).rejects.toBeTruthy();
    await expect(
      m.mutate("calendar.bookAppointment", { ...create, serviceId: 5 })
    ).rejects.toBeTruthy();
  });
  it("disconnects only after current review and retains all appointments; simulated reconnect is local", async () => {
    const m = new ServicePreviewModel(269, "normal", now),
      before = read(m, "settings");
    expect(scopedCalendarSettings(before, 1269, 269)).toBeTruthy();
    await expect(
      m.mutate("calendar.disconnect", {
        expectedDigest: "0".repeat(64),
        reviewed: true,
      })
    ).rejects.toBeTruthy();
    await m.mutate("calendar.disconnect", {
      expectedDigest: before.digest,
      reviewed: true,
    });
    expect(read(m, "settings")).toMatchObject({
      active: false,
      state: "unlinked",
      retainedAppointments: 105,
    });
    expect(read(m, "workspace", range).summary.total).toBe(105);
    const receipt = await m.mutate("calendar.bookAppointment", create);
    expect(receipt.calendarSyncState).toBe("none");
    await m.mutate("calendar.beginOAuth", undefined);
    expect(read(m, "settings").state).toBe("configured");
  });
  it.each([
    ["unlinked", "unlinked"],
    ["oauth-disabled", "oauth_disabled"],
    ["destination-missing", "needs_destination"],
    ["credentials-invalid", "credentials_invalid"],
  ] as const)("renders truthful connection fixture %s", (mode, state) => {
    const m = new ServicePreviewModel(269, mode, now),
      r = read(m, "settings");
    expect(r.state).toBe(state);
    expect(scopedCalendarSettings(r, 1269, 269)).toBeTruthy();
  });
  it.each([
    "readonly",
    "forbidden",
    "session",
    "foreign",
    "failure",
    "stale-error",
  ] as const)("blocks writes for %s", async mode => {
    const m = new ServicePreviewModel(269, mode, now);
    for (const method of calendarPreviewMutations)
      await expect(m.mutate(method, create)).rejects.toBeTruthy();
    expect(m.operations).toBe(0);
  });
  it("verifies legacy, uncertain create and cancellation with review/history and rejects stale evidence", async () => {
    for (const appointmentId of [3, 4, 5]) {
      const m = new ServicePreviewModel(269, "normal", now),
        v = read(m, "getSyncReview", { appointmentId }),
        command = {
          appointmentId,
          requestId: create.requestId,
          evidence: v.evidence,
          eventId: v.eventId || "local-legacy-event",
          action: appointmentId === 4 ? "confirm_cancellation" : "restore_sync",
          reviewed: true,
          bindingReviewed: appointmentId === 5,
          reason: "Reviewed local appointment evidence",
        };
      const result = await m.mutate("calendar.reconcileSync", command);
      expect(result.outcome).toBe(
        appointmentId === 4 ? "verified_cancelled" : "verified_active"
      );
      expect(read(m, "getSyncReview", { appointmentId }).history).toHaveLength(
        1
      );
      expect(read(m, "details", { appointmentId }).appointment.sync).toBe(
        appointmentId === 4 ? "cancelled" : "synced"
      );
      await expect(
        m.mutate("calendar.reconcileSync", {
          ...command,
          requestId: "00000000-0000-4000-8000-000000000286",
        })
      ).rejects.toBeTruthy();
    }
  });
  it("keeps unknown writes recoverable and pending writes bound to the live model", async () => {
    const m = new ServicePreviewModel(269, "uncertain-save", now);
    await expect(
      m.mutate("calendar.bookAppointment", create)
    ).rejects.toBeTruthy();
    expect(
      read(m, "getBookingRequest", { requestId: create.requestId }).state
    ).toBe("recorded");
    expect(m.operations).toBe(1);
    const p = new ServicePreviewModel(270, "pending-save", now),
      pending = p.mutate("calendar.bookAppointment", create),
      check = expect(pending).rejects.toBeTruthy();
    p.dispose();
    await check;
    expect(p.operations).toBe(0);
  });
  it("cancels locally without touching another tenant", async () => {
    const m = new ServicePreviewModel(269, "normal", now),
      b = new ServicePreviewModel(270, "normal", now);
    await m.mutate("calendar.cancelAppointment", {
      appointmentId: 1,
      reason: "Local review",
    });
    expect(read(m, "details", { appointmentId: 1 }).appointment.status).toBe(
      "cancelled"
    );
    expect(read(b, "details", { appointmentId: 1 }).appointment.status).toBe(
      "confirmed"
    );
  });
  it("preserves calendar routes and context and rejects external navigation", () => {
    const href = servicePreviewHref(
      "/merchant/calendar?view=day&date=2026-10-03&appointment=3",
      "?lang=en&tenant=270&embed=brain"
    );
    expect(previewNavigation(href!)).toMatchObject({
      path: "/merchant/calendar",
      search: "view=day&date=2026-10-03&appointment=3",
    });
    expect(
      servicePreviewHref(
        "/merchant/calendar/settings?oauth=connected",
        "?lang=en"
      )
    ).toContain("oauth=connected");
    expect(servicePreviewHref("https://accounts.google.com", "")).toBeNull();
    expect(calendarPreviewQueries).toHaveLength(7);
  });
});
