// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import en from "../client/src/locales/merchant-ux.en";
import ar from "../client/src/locales/merchant-ux.ar";
const m = vi.hoisted(() => ({ language: "en" }));
vi.mock(
  "@/lib/trpc",
  () => import("../prototypes/tenant-dashboard/src/service-preview-api")
);
vi.mock(
  "wouter",
  () => import("../prototypes/tenant-dashboard/src/service-preview-router")
);
vi.mock("@/lib/calendar-connection", async importOriginal => {
  const original = await importOriginal<any>();
  return {
    ...original,
    navigateCalendarAuthorization: async () => {
      const { navigate } =
        await import("../prototypes/tenant-dashboard/src/service-preview-router");
      navigate("/merchant/calendar/settings?oauth=connected");
    },
  };
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: m.language },
    t: (key: string, vars: any = {}) => {
      const keys = key.split(".").slice(1);
      let value: any = m.language === "ar" ? ar : en;
      for (const k of keys) value = value?.[k];
      return typeof value === "string"
        ? value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""))
        : key;
    },
  }),
}));
import CalendarPage from "../client/src/pages/CalendarPage";
import CalendarSettings from "../client/src/pages/CalendarSettings";
import { ServicePreviewContext } from "../prototypes/tenant-dashboard/src/service-preview-api";
import { ServicePreviewModel } from "../prototypes/tenant-dashboard/src/service-preview-model";
let root: Root, container: HTMLDivElement, model: ServicePreviewModel;
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
  sessionStorage.clear();
  m.language = "en";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  model = new ServicePreviewModel(269);
});
afterEach(async () => {
  await act(async () => root.unmount());
  model.dispose();
  container.remove();
  sessionStorage.clear();
});
const render = async (query = "", settings = false) => {
  history.replaceState(
    null,
    "",
    "/?path=" +
      encodeURIComponent(
        settings ? "/merchant/calendar/settings" : "/merchant/calendar"
      ) +
      "&tenant=269" +
      query
  );
  await act(async () =>
    root.render(
      <ServicePreviewContext.Provider value={model}>
        {settings ? <CalendarSettings /> : <CalendarPage />}
      </ServicePreviewContext.Provider>
    )
  );
};
const set = async (id: string, value: string) =>
  act(async () => {
    const el = document.getElementById(id) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const click = async (text: string) =>
  act(async () => {
    const button = Array.from(document.querySelectorAll("button")).find(
      b => b.textContent?.trim() === text
    );
    expect(button, "button " + text).toBeTruthy();
    button!.click();
  });
const tools = async () => {
  const details = container.querySelector("details");
  expect(details).toBeTruthy();
  await act(async () => {
    details!.open = true;
    details!.dispatchEvent(new Event("toggle"));
  });
};
const fill = async () => {
  await render("&create=1");
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".se-choice>button")!.click()
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>(".se-options button")!.click()
  );
  await set("ac-customerPhone", "966500000000");
  await set("ac-appointmentDate", "2026-12-20");
  await set("ac-startTime", "10:00");
};
it.each(["ar", "en"])(
  "renders calendar list and all 105 records in %s",
  async lang => {
    m.language = lang;
    await render();
    expect(container.textContent).toContain("105");
    expect(container.textContent).not.toContain("merchantUx.");
  }
);
it.each(Array.from({ length: 12 }, (_, i) => i + 1))(
  "mounts actual calendar review and reminder components for example %s",
  async appointmentId => {
    await render("&appointment=" + appointmentId);
    await tools();
    expect(container.querySelector("[data-appointment-review]")).toBeTruthy();
    expect(
      container.querySelector("[data-appointment-reminders]")
    ).toBeTruthy();
    if ([6, 7].includes(appointmentId))
      expect(container.querySelectorAll("[data-reminder-row]")).toHaveLength(1);
    expect(container.textContent).not.toContain("merchantUx.");
  }
);
it("creates through the actual picker, review and verified request receipt", async () => {
  await fill();
  await click(en.appointmentCreate.review);
  expect(model.operations).toBe(0);
  await click(en.appointmentCreate.confirm);
  expect(model.operations).toBe(1);
  expect(container.textContent).toContain(en.appointmentCreate.recorded);
  const requestId = new URLSearchParams(location.search).get("request");
  expect(
    model.read("calendar.getBookingRequest", { requestId }).data.state
  ).toBe("recorded");
  expect(sessionStorage.length).toBe(0);
  await click(en.appointmentCreate.open);
  expect(new URLSearchParams(location.search).get("appointment")).toBe("106");
});
it("loads suggestions only on demand and drops them after changing date", async () => {
  await fill();
  expect(container.querySelector(".ac-slots button")).toBeNull();
  await click(en.appointmentCreate.check);
  expect(container.querySelectorAll(".ac-slots button")).toHaveLength(4);
  await click("09:00");
  expect(
    (document.getElementById("ac-startTime") as HTMLInputElement).value
  ).toBe("09:00");
  await set("ac-appointmentDate", "2026-12-21");
  expect(container.querySelector(".ac-slots button")).toBeNull();
  expect(model.operations).toBe(0);
});
it("recovers an uncertain save without replaying the create", async () => {
  model = new ServicePreviewModel(269, "uncertain-save");
  await fill();
  await click(en.appointmentCreate.review);
  await click(en.appointmentCreate.confirm);
  expect(model.operations).toBe(1);
  expect(container.textContent).toContain(en.appointmentCreate.uncertain);
  await click(en.appointmentCreate.refresh);
  expect(container.textContent).toContain(en.appointmentCreate.recorded);
  expect(model.operations).toBe(1);
});
it.each(["ar", "en"])(
  "keeps readonly %s details free of management controls",
  async lang => {
    m.language = lang;
    model = new ServicePreviewModel(269, "readonly");
    await render("&appointment=3");
    expect(container.textContent).toContain(
      (lang === "ar" ? ar : en).calendarWorkspace.readOnly
    );
    expect(container.querySelector("[data-appointment-review]")).toBeNull();
  }
);
it("disconnects through the actual reviewed dialog and preserves appointments", async () => {
  await render("", true);
  await click(en.calendarConnection.disconnect);
  const checkbox = document.querySelector<HTMLInputElement>(
    '[role="dialog"] input[type="checkbox"]'
  );
  expect(checkbox).toBeTruthy();
  await act(async () => checkbox!.click());
  await click(en.calendarConnection.confirm);
  expect(model.read("calendar.settings").data).toMatchObject({
    active: false,
    retainedAppointments: 105,
  });
  expect(container.textContent).toContain(en.calendarConnection.disconnected);
  expect(model.operations).toBe(1);
});
it("simulates OAuth without external navigation and renders callback state", async () => {
  model = new ServicePreviewModel(269, "unlinked");
  await render("", true);
  await click(en.calendarConnection.connect);
  expect(location.origin).toContain("localhost");
  expect(new URLSearchParams(location.search).get("oauth")).toBe("connected");
  expect(model.read("calendar.settings").data.state).toBe("configured");
});
