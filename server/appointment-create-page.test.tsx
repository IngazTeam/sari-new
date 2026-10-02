// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi, describe } from "vitest";
import {
  appointmentCreateEn as en,
  appointmentCreateAr as ar,
} from "../client/src/locales/appointment-create";
import { calendarWorkspaceEn } from "../client/src/locales/calendar-workspace";
const m = vi.hoisted(() => ({
  actor: 7,
  merchant: 20,
  language: "en",
  canManage: true,
  current: true,
  initialRequest: null as string | null,
  service: {} as any,
  slots: {} as any,
  lookup: {} as any,
  create: vi.fn(),
  read: vi.fn(),
  check: vi.fn(),
  refresh: vi.fn(),
  leave: vi.fn(),
  open: vi.fn(),
  inputs: [] as any[],
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ calendar: { getBookingRequest: { fetch: m.read } } }),
    services: {
      catalogEditor: {
        useQuery: () => ({ data: m.service, refetch: m.refresh }),
      },
    },
    calendar: {
      bookAppointment: { useMutation: () => ({ mutateAsync: m.create }) },
      getBookingRequest: { useQuery: () => m.lookup },
      getAvailableSlots: {
        useQuery: (input: any) => {
          m.inputs.push(input);
          return { ...m.slots, refetch: m.check };
        },
      },
    },
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: m.language },
    t: (key: string) =>
      (
        (key.includes("appointmentCreate")
          ? m.language === "ar"
            ? ar
            : en
          : calendarWorkspaceEn) as Record<string, string>
      )[key.split(".").at(-1)!] ?? key,
  }),
}));
vi.mock("@/components/merchant/CatalogChoicePicker", () => ({
  CatalogChoicePicker: ({ kind, onChange, onNames, disabled }: any) => (
    <button
      type="button"
      data-picker={kind}
      disabled={disabled}
      onClick={() => {
        onNames([
          {
            id: kind === "service" ? 11 : 12,
            name: kind === "service" ? "Example service" : "Example provider",
          },
        ]);
        onChange([kind === "service" ? 11 : 12]);
      }}
    >
      {kind}
    </button>
  ),
}));
import { AppointmentCreateWorkspace } from "../client/src/components/merchant/AppointmentCreateWorkspace";
import {
  parseAppointmentDraft,
  emptyAppointmentDraft,
  rememberAppointmentRequest,
  pendingAppointmentRequest,
  clearAppointmentRequest,
  scopedAppointmentRequest,
  scopedAppointmentSlots,
} from "../client/src/lib/appointment-create";
import { calendarNavigation } from "../client/src/lib/calendar-workspace";
const requestId = "d4d3fd6f-bf97-435f-9562-25e527589490";
const record = (request = requestId) => ({
  actorId: 7,
  merchantId: 20,
  checkedAt: "2026-10-02T10:00:00Z",
  requestId: request,
  state: "recorded",
  appointmentId: 31,
  appointmentStatus: "confirmed",
  calendarSyncState: "none",
});
const context = () => ({
  actorId: 7,
  merchantId: 20,
  canManage: true,
  checkedAt: "2026-10-02T10:00:00Z",
  selection: { entity: "service", id: 11 },
  record: {
    entity: "service",
    id: 11,
    definition: "a".repeat(64),
    issues: [],
    unavailableReferences: 0,
    categoryName: null,
    references: [],
    fields: {
      name: "Example service",
      description: null,
      isActive: true,
      category: null,
      categoryId: null,
      priceType: "fixed",
      basePrice: 10000,
      minPrice: null,
      maxPrice: null,
      durationMinutes: 60,
      bufferTimeMinutes: 0,
      requiresAppointment: true,
      maxBookingsPerDay: null,
      advanceBookingDays: 30,
      staffIds: [],
      displayOrder: 0,
    },
  },
});
let root: Root, container: HTMLDivElement;
function Harness() {
  const [id, setId] = useState<string | null>(m.initialRequest);
  return (
    <AppointmentCreateWorkspace
      key={`${m.actor}:${m.merchant}`}
      actorId={m.actor}
      merchantId={m.merchant}
      canManage={m.canManage}
      current={m.current}
      requestId={id}
      retainRequest={setId}
      refresh={m.refresh}
      leave={m.leave}
      openAppointment={m.open}
    />
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
  sessionStorage.clear();
  Object.assign(m, {
    actor: 7,
    merchant: 20,
    language: "en",
    canManage: true,
    current: true,
    initialRequest: null,
    service: context(),
    slots: {},
    lookup: {},
    inputs: [],
  });
  m.create.mockImplementation(async (input: any) => ({
    success: true,
    replayed: false,
    ...record(input.requestId),
  }));
  m.read.mockImplementation(async (input: any) => record(input.requestId));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  sessionStorage.clear();
});
const render = () => act(async () => root.render(<Harness />));
const button = (name: string) =>
  Array.from(document.querySelectorAll("button")).find(
    b => b.textContent === name
  )!;
const click = (element: HTMLElement) => act(async () => element.click());
const fill = (selector: string, value: string) =>
  act(async () => {
    const e = container.querySelector<HTMLInputElement>(selector)!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(e, value);
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
  });
async function valid() {
  await click(container.querySelector("[data-picker=service]")!);
  await fill("#ac-appointmentDate", "2026-10-20");
  await fill("#ac-startTime", "10:00");
  await fill("#ac-customerPhone", "966500987654");
  await fill("#ac-customerName", "Private customer");
}
describe("appointment creation workspace", () => {
  it.each(["en", "ar"])("renders the scoped form in %s", async lang => {
    m.language = lang;
    await render();
    expect(container.textContent).toContain((lang === "ar" ? ar : en).title);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("shows field errors and focuses the first invalid choice", async () => {
    await render();
    await click(button(en.review));
    expect(
      container.querySelectorAll("[aria-invalid=true]").length
    ).toBeGreaterThanOrEqual(4);
    expect(container.textContent).toContain(en.phoneError);
    expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
    expect(m.create).not.toHaveBeenCalled();
  });
  it("requires a review then verifies a fresh receipt and retains no personal fields", async () => {
    await render();
    await valid();
    await click(button(en.review));
    expect(document.body.textContent).toContain(en.reviewHint);
    expect(m.create).not.toHaveBeenCalled();
    await click(button(en.confirm));
    expect(m.create).toHaveBeenCalledTimes(1);
    const command = m.create.mock.calls[0][0];
    expect(command).toMatchObject({
      serviceId: 11,
      startTime: "10:00",
      appointmentDate: "2026-10-20",
      customerPhone: "966500987654",
    });
    expect(command.requestId).toMatch(/^[\da-f-]{36}$/);
    expect(m.read).toHaveBeenCalledWith(
      { requestId: command.requestId },
      { staleTime: 0 }
    );
    expect(container.textContent).toContain(en.recorded);
    expect(sessionStorage.length).toBe(0);
    await click(button(en.open));
    expect(m.open).toHaveBeenCalledWith(31);
  });
  it("keeps ambiguous Google sync visible despite a recorded appointment", async () => {
    m.read.mockImplementation(async input => ({
      ...record(input.requestId),
      calendarSyncState: "create_unknown",
    }));
    await render();
    await valid();
    await click(button(en.review));
    await click(button(en.confirm));
    expect(container.textContent).toContain(en.recorded);
    expect(container.textContent).toContain(en.syncReview);
  });
  it.each(["actor", "merchant", "inactive", "duration", "staff"])(
    "blocks invalid %s selection",
    async kind => {
      await render();
      await valid();
      if (kind === "actor") m.service.actorId = 8;
      if (kind === "merchant") m.service.merchantId = 21;
      if (kind === "inactive") m.service.record.fields.isActive = false;
      if (kind === "duration") m.service.record.fields.durationMinutes = 0;
      if (kind === "staff") {
        m.service.record.fields.staffIds = [99];
        await click(container.querySelector("[data-picker=staff]")!);
      }
      await render();
      await click(button(en.review));
      expect(m.create).not.toHaveBeenCalled();
      expect(document.querySelector("[role=dialog]")).toBeNull();
      expect(container.querySelector("[aria-invalid=true]")).toBeTruthy();
    }
  );
  it("blocks save without management permission or a current source", async () => {
    m.canManage = false;
    await render();
    expect(button(en.review).disabled).toBe(true);
    m.canManage = true;
    m.current = false;
    await render();
    expect(button(en.review).disabled).toBe(true);
  });
  it("keeps the same payload and request ID for an explicitly verified retry", async () => {
    m.create.mockRejectedValueOnce(Error("SECRET"));
    await render();
    await valid();
    await click(button(en.review));
    await click(button(en.confirm));
    expect(container.textContent).toContain(en.uncertain);
    const command = m.create.mock.calls[0][0];
    expect(pendingAppointmentRequest(sessionStorage, 7, 20)).toBe(
      command.requestId
    );
    expect(JSON.stringify(sessionStorage)).not.toContain("Private customer");
    expect(container.querySelector("fieldset")?.disabled).toBe(true);
    m.read.mockResolvedValueOnce({
      actorId: 7,
      merchantId: 20,
      checkedAt: "2026-10-02T10:00:00Z",
      requestId: command.requestId,
      state: "not_found",
    });
    await click(button(en.verify));
    expect(button(en.retry)).toBeTruthy();
    await click(button(en.retry));
    expect(m.create.mock.calls[1][0]).toEqual(command);
    expect(container.textContent).toContain(en.recorded);
  });
  it.each(["scope", "request", "network"])(
    "does not confirm an uncertain %s lookup",
    async kind => {
      m.read.mockImplementation(async input => {
        if (kind === "network") throw Error("SECRET");
        return {
          ...record(input.requestId),
          ...(kind === "scope" ? { merchantId: 21 } : { requestId }),
        };
      });
      await render();
      await valid();
      await click(button(en.review));
      await click(button(en.confirm));
      expect(container.textContent).toContain(en.uncertain);
      expect(container.textContent).not.toContain("SECRET");
      expect(button(en.open)).toBeUndefined();
      expect(sessionStorage.length).toBe(1);
    }
  );
  it("does not dispatch if session storage fails", async () => {
    await render();
    await valid();
    await click(button(en.review));
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw Error("denied");
      });
    await click(button(en.confirm));
    expect(m.create).not.toHaveBeenCalled();
    expect(container.textContent).toContain(en.storage);
    spy.mockRestore();
  });
  it("restores a pending ID without automatically writing or recreating an unavailable appointment", async () => {
    rememberAppointmentRequest(sessionStorage, 7, 20, requestId);
    m.lookup = {
      data: {
        actorId: 7,
        merchantId: 20,
        checkedAt: "2026-10-02T10:00:00Z",
        requestId,
        state: "appointment_unavailable",
        appointmentId: 31,
      },
    };
    await render();
    expect(container.textContent).toContain(en.unavailable);
    expect(container.querySelector("form")).toBeNull();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("blocks repeat clicks and ignores a result after switching tenant", async () => {
    let finish!: (v: any) => void;
    m.create.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    await render();
    await valid();
    await click(button(en.review));
    await act(async () => {
      button(en.confirm).click();
      button(en.confirm)?.click();
    });
    expect(m.create).toHaveBeenCalledTimes(1);
    m.merchant = 21;
    m.service = { ...context(), merchantId: 21 };
    await render();
    await act(async () =>
      finish({
        success: true,
        replayed: false,
        ...record(m.create.mock.calls[0][0].requestId),
      })
    );
    expect(m.read).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain(en.recorded);
    expect(pendingAppointmentRequest(sessionStorage, 7, 20)).toBeTruthy();
  });
  it("does not treat wrong-scope suggestions as available times", async () => {
    await render();
    await valid();
    m.slots = {
      data: {
        actorId: 7,
        merchantId: 21,
        checkedAt: "2026-10-02T10:00:00Z",
        selection: { serviceId: 11, date: "2026-10-20" },
        slots: ["14:00"],
      },
    };
    await render();
    expect(container.querySelector(".ac-slots")).toBeNull();
    expect(container.textContent).toContain(en.availabilityError);
    m.slots.data.merchantId = 20;
    await render();
    expect(button("14:00")).toBeTruthy();
    await click(button("14:00"));
    expect(
      (container.querySelector("#ac-startTime") as HTMLInputElement).value
    ).toBe("14:00");
  });
  it("reviews leaving unsaved fields", async () => {
    await render();
    await valid();
    await click(button(en.back));
    expect(document.body.textContent).toContain(en.leaveHint);
    expect(m.leave).not.toHaveBeenCalled();
    await click(button(en.leave));
    expect(m.leave).toHaveBeenCalledTimes(1);
  });
});
describe("appointment journal and navigation", () => {
  it("isolates pending requests and never replaces another unresolved ID", () => {
    rememberAppointmentRequest(sessionStorage, 7, 20, requestId);
    expect(pendingAppointmentRequest(sessionStorage, 8, 20)).toBeNull();
    expect(pendingAppointmentRequest(sessionStorage, 7, 21)).toBeNull();
    expect(() =>
      rememberAppointmentRequest(
        sessionStorage,
        7,
        20,
        "a419cd8e-5ba0-4314-a261-1ff603e95d1a"
      )
    ).toThrow();
    clearAppointmentRequest(sessionStorage, 7, 20, "other");
    expect(pendingAppointmentRequest(sessionStorage, 7, 20)).toBe(requestId);
    clearAppointmentRequest(sessionStorage, 7, 20, requestId);
    expect(pendingAppointmentRequest(sessionStorage, 7, 20)).toBeNull();
  });
  it.each([
    "?create=bad",
    "?request=" + requestId,
    "?create=1&request=bad",
    "?create=1&create=1",
    "?create=1&appointment=31",
    "?create=1&request=" + requestId + "&request=" + requestId,
  ])("rejects invalid navigation %s", search =>
    expect(calendarNavigation(search).selection).toBeNull()
  );
  it("accepts the create route and canonical request ID", () => {
    expect(
      calendarNavigation("?create=1&request=" + requestId.toUpperCase())
    ).toMatchObject({ create: true, requestId });
  });
  it("validates field errors and scope helpers", () => {
    expect(parseAppointmentDraft(emptyAppointmentDraft).errors).toMatchObject({
      serviceId: true,
      startTime: true,
      appointmentDate: true,
      customerPhone: true,
    });
    expect(scopedAppointmentRequest(record(), 8, 20, requestId)).toBeNull();
    expect(scopedAppointmentSlots({}, 7, 20, {})).toBeNull();
  });
});
