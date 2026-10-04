// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calendarWorkspaceAr as ar,
  calendarWorkspaceEn as en,
} from "../client/src/locales/calendar-workspace";
import { calendarWorkspaceInput } from "../shared/calendar-workspace";
const m = vi.hoisted(() => ({
  language: "en",
  actor: 7,
  merchant: 20,
  query: {} as any,
  detail: {} as any,
  cancel: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
  inputs: [] as any[],
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: { id: m.actor } }) } },
    merchants: {
      workspaceIdentity: { useQuery: () => ({ data: { id: m.merchant, actorId:m.actor } }) },
    },
    useUtils: () => ({
      calendar: {
        workspace: { invalidate: m.invalidate },
        getSyncReview: { invalidate: m.invalidate },
        getReminderReview: { invalidate: m.invalidate },
      },
    }),
    calendar: {
      workspace: {
        useQuery: (input: any) => {
          m.inputs.push(input);
          return m.query;
        },
      },
      details: { useQuery: () => m.detail },
      cancelAppointment: { useMutation: () => ({ mutateAsync: m.cancel }) },
    },
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: m.language },
    t: (key: string, vars: any = {}) => {
      let value =
        (m.language === "ar" ? ar : en)[
          key.split(".").at(-1) as keyof typeof en
        ] ?? key;
      for (const [k, v] of Object.entries(vars))
        value = value.replaceAll(`{{${k}}}`, String(v));
      return value;
    },
  }),
}));
vi.mock("@/components/merchant/WorkspaceState", () => ({
  WorkspaceState: ({ kind, onRetry }: any) => (
    <div data-state={kind}>
      {kind}
      <button onClick={onRetry}>retry</button>
    </div>
  ),
  workspaceFailureKind: (error: any) =>
    error?.data?.code === "FORBIDDEN"
      ? "forbidden"
      : error?.data?.code === "NOT_FOUND"
        ? "missing"
        : "error",
}));
vi.mock("@/components/AppointmentSyncReview", () => ({
  AppointmentSyncReview: ({ appointmentId }: any) => (
    <div data-sync={appointmentId} />
  ),
}));
vi.mock("@/components/AppointmentReminderReview", () => ({
  AppointmentReminderReview: ({ appointmentId }: any) => (
    <div data-reminders={appointmentId} />
  ),
}));
import CalendarPage from "../client/src/pages/CalendarPage";
vi.mock('@/components/merchant/AppointmentCreateWorkspace',()=>({AppointmentCreateWorkspace:({actorId,merchantId,requestId,canManage,retainRequest,openAppointment}:any)=><div data-create-scope={`${actorId}:${merchantId}`} data-create-request={requestId} data-create-manage={String(canManage)}><button onClick={()=>retainRequest('d4d3fd6f-bf97-435f-9562-25e527589490')}>retain request</button><button onClick={()=>openAppointment(31)}>open created</button></div>}));
import {
  calendarNavigation,
  calendarPeriod,
  calendarDays,
  calendarShift,
  riyadhDay,
} from "../client/src/lib/calendar-workspace";
const row = {
  id: 31,
  merchantId: 20,
  service: { id: 11, name: "Service fixture", isActive: true },
  staff: { id: 12, name: "Provider fixture", isActive: true },
  customerName: "Customer fixture",
  customerPhone: "966500987654",
  date: "2026-10-02",
  startTime: "10:00",
  endTime: "11:00",
  status: "pending",
  sync: "none",
  issues: [],
};
const scope = {
  actorId: 7,
  merchantId: 20,
  canManage: true,
  canManageIntegration: true,
  checkedAt: "2026-10-02T10:00:00Z",
};
const snapshot = () => ({
  ...scope,
  selection: calendarWorkspaceInput.parse({
    startDate: "2026-10-01",
    endDate: "2026-10-31",
  }),
  summary: {
    total: 1,
    counts: {
      pending: 1,
      confirmed: 0,
      cancelled: 0,
      completed: 0,
      no_show: 0,
      unknown: 0,
    },
    sync: {
      none: 1,
      creating: 0,
      create_unknown: 0,
      synced: 0,
      cancelling: 0,
      cancel_unknown: 0,
      cancelled: 0,
      legacy: 0,
      unknown: 0,
    },
  },
  days: [{ date: "2026-10-02", total: 1 }],
  pagination: { page: 1, pageSize: 25, total: 1, pages: 1 },
  rows: [{ ...row }],
});
const details = () => ({
  ...scope,
  selection: { appointmentId: 31 },
  appointment: {
    ...row,
    notes: "Saved note",
    cancellationReason: "Saved reason",
    googleEventId: "saved-event",
    integrationId: 4,
    calendarTargetId: "calendar@example.test",
    eventReference: "local-event",
    reviewRevision: 3,
    reminder24hSent: true,
    reminder1hSent: false,
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-02T10:00:00Z",
  },
});
let container: HTMLDivElement,
  root: Root,
  memory: ReturnType<typeof memoryLocation>;
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
  m.language = "en";
  m.actor = 7;
  m.merchant = 20;
  m.inputs = [];
  m.query = { data: snapshot(), refetch: m.refresh };
  m.detail = { data: details(), refetch: m.refresh };
  m.refresh.mockImplementation(async () => ({ data: m.detail.data }));
  m.cancel.mockResolvedValue({ success: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  memory = memoryLocation({
    path: "/merchant/calendar?date=2026-10-02",
    record: true,
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const render = () =>
  act(async () =>
    root.render(
      <Router hook={memory.hook} searchHook={memory.searchHook}>
        <CalendarPage />
      </Router>
    )
  );
const button = (text: string) =>
  Array.from(container.querySelectorAll("button")).find(
    b => b.textContent === text
  )!;
const click = (el: HTMLElement) => act(async () => el.click());
const detail = async () => {
  memory.navigate("/merchant/calendar?date=2026-10-02&appointment=31");
  await render();
};
const tools = async () => {
  await detail();
  await act(async () => {
    const d = container.querySelector("details")!;
    d.open = true;
    d.dispatchEvent(new Event("toggle"));
  });
};
describe("calendar workspace interface", () => {
  it('opens creation in the same scope and preserves its request until opening the result',async()=>{
    memory.navigate('/merchant/calendar?date=2026-10-02&create=1');await render();
    expect(container.querySelector('[data-create-scope]')?.getAttribute('data-create-scope')).toBe('7:20');
    await click(button('retain request'));expect(container.querySelector('[data-create-request]')?.getAttribute('data-create-request')).toBe('d4d3fd6f-bf97-435f-9562-25e527589490');
    await click(button('open created'));expect(container.querySelector('[data-create-scope]')).toBeNull();expect(container.textContent).toContain('Customer fixture');
  });
  it("renders scoped counts, rows, links and complete daily counts", async () => {
    await render();
    expect(container.textContent).toContain("Customer fixture");
    expect(
      container.querySelector('a[href="/merchant/calendar/settings"]')
    ).toBeTruthy();
    expect(container.querySelectorAll(".cw-days button")).toHaveLength(31);
    expect(
      container
        .querySelector(".cw-days button[data-active=true] time")
        ?.getAttribute("datetime")
    ).toBe("2026-10-02");
  });
  it.each(["actor", "merchant", "selection", "error", "loading", "scope-row"])(
    "fails closed for %s data",
    async kind => {
      if (kind === "actor") m.query.data.actorId = 8;
      if (kind === "merchant") m.query.data.merchantId = 21;
      if (kind === "selection") m.query.data.selection.search = "other";
      if (kind === "error") m.query.error = Error("PRIVATE");
      if (kind === "loading") {
        m.query.data = null;
        m.query.isFetching = true;
      }
      if (kind === "scope-row") m.query.data.rows[0].merchantId = 21;
      await render();
      expect(container.querySelector("[data-state]")).toBeTruthy();
      expect(container.textContent).not.toContain("Customer fixture");
      expect(container.textContent).not.toContain("PRIVATE");
    }
  );
  it("supports view switching, day selection and complete paging links", async () => {
    await render();
    await click(button(en.week));
    expect(memory.history?.at(-1)).toContain("view=week");
    memory.navigate("/merchant/calendar?date=2026-10-02");
    await render();
    await click(container.querySelector(".cw-days button[data-active=true]")!);
    expect(memory.history?.at(-1)).toContain("view=day");
    expect(memory.history?.at(-1)).toContain("date=2026-10-02");
  });
  it("shows every saved detail and retains review tools", async () => {
    await tools();
    for (const value of [
      "Saved note",
      "Saved reason",
      "saved-event",
      "calendar@example.test",
      "local-event",
    ])
      expect(container.textContent).toContain(value);
    expect(
      container.querySelector("[data-sync]")?.getAttribute("data-sync")
    ).toBe("31");
    expect(
      container
        .querySelector("[data-reminders]")
        ?.getAttribute("data-reminders")
    ).toBe("31");
  });
  it("hides management and integration controls from a viewer", async () => {
    m.query.data.canManage = false;
    m.query.data.canManageIntegration = false;
    await render();
    expect(
      container.querySelector('a[href="/merchant/calendar/settings"]')
    ).toBeNull();
    m.detail.data.canManage = false;
    await detail();
    expect(container.querySelector("[data-calendar-cancel]")).toBeNull();
    expect(container.querySelector("[data-sync]")).toBeNull();
    expect(container.textContent).toContain(en.readOnly);
  });
  it("requires attestation and verifies fresh cancellation state", async () => {
    await tools();
    const save = container.querySelector<HTMLButtonElement>(
      "[data-calendar-cancel]"
    )!;
    expect(save.disabled).toBe(true);
    await click(container.querySelector("[data-calendar-cancel-attest]")!);
    m.refresh.mockImplementation(async () => ({
      data: {
        ...details(),
        appointment: { ...details().appointment, status: "cancelled" },
      },
    }));
    await click(save);
    expect(m.cancel).toHaveBeenCalledExactlyOnceWith({
      appointmentId: 31,
      reason: undefined,
    });
    expect(container.textContent).toContain(en.cancelledSuccess);
  });
  it.each(["transport", "stale", "foreign"])(
    "blocks repeating an uncertain %s cancellation",
    async kind => {
      await tools();
      await click(container.querySelector("[data-calendar-cancel-attest]")!);
      if (kind === "transport") m.cancel.mockRejectedValue(Error("PRIVATE"));
      if (kind === "foreign")
        m.refresh.mockResolvedValue({
          data: { ...details(), merchantId: 999 },
        });
      await click(container.querySelector("[data-calendar-cancel]")!);
      expect(container.textContent).toContain(en.uncertain);
      expect(container.textContent).not.toContain("PRIVATE");
      expect(
        container.querySelector<HTMLButtonElement>("[data-calendar-cancel]")!
          .disabled
      ).toBe(true);
      expect(m.cancel).toHaveBeenCalledOnce();
    }
  );
  it("ignores a late cancellation result after tenant identity changes", async () => {
    let finish!: (value: any) => void;
    m.cancel.mockReturnValue(new Promise(resolve => (finish = resolve)));
    await tools();
    await click(container.querySelector("[data-calendar-cancel-attest]")!);
    await click(container.querySelector("[data-calendar-cancel]")!);
    m.actor = 8;
    await render();
    await act(async () => finish({ success: true }));
    expect(container.textContent).not.toContain(en.cancelledSuccess);
    expect(container.textContent).not.toContain("Customer fixture");
  });
  it.each(["ar", "en"])(
    "renders matching translations in %s",
    async language => {
      m.language = language;
      await render();
      expect(
        container.querySelector(`[dir=${language === "ar" ? "rtl" : "ltr"}]`)
      ).toBeTruthy();
      expect(container.textContent).not.toContain("merchantUx.");
      expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    }
  );
});
describe("calendar navigation and wall-time dates", () => {
  it("keeps Riyadh day independent of the browser timezone", () =>
    expect(riyadhDay(new Date("2026-10-01T21:30:00Z"))).toBe("2026-10-02"));
  it("handles leap months, weeks crossing years and monthly shifts", () => {
    expect(calendarPeriod("2028-02-29", "month")).toEqual({
      startDate: "2028-02-01",
      endDate: "2028-02-29",
    });
    expect(calendarPeriod("2026-01-01", "week")).toEqual({
      startDate: "2025-12-28",
      endDate: "2026-01-03",
    });
    expect(calendarShift("2026-01-31", "month", 1)).toBe("2026-02-01");
    expect(calendarDays("2028-02-28", "2028-03-01")).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });
  it.each([
    "date=2026-02-30",
    "view=broken",
    "view=range&from=2026-10-01&to=2027-10-01",
    "page=1.5",
    "service=0",
    "q=a&q=b",
    "date=2026-01-01&date=2026-02-01",
  ])("rejects invalid or duplicate navigation %s", search =>
    expect(calendarNavigation(search).selection).toBeNull()
  );
  it("retains deep-linked identity, filters and custom range", () =>
    expect(
      calendarNavigation(
        "view=range&from=2026-10-01&to=2026-10-03&date=2026-10-01&q=needle&status=pending&sync=none&page=3&appointment=31"
      )
    ).toMatchObject({
      appointment: 31,
      selection: {
        search: "needle",
        status: "pending",
        sync: "none",
        page: 3,
        startDate: "2026-10-01",
        endDate: "2026-10-03",
      },
    }));
});
