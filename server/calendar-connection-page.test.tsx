// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  calendarConnectionAr as ar,
  calendarConnectionEn as en,
} from "../client/src/locales/calendar-connection";
const m = vi.hoisted(() => ({
  actor: 7,
  merchant: 20,
  language: "en",
  query: {} as any,
  connect: vi.fn(),
  disconnect: vi.fn(),
  refresh: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: { id: m.actor } }) } },
    merchants: {
      getCurrent: { useQuery: () => ({ data: { id: m.merchant } }) },
    },
    calendar: {
      settings: { useQuery: () => m.query },
      beginOAuth: { useMutation: () => ({ mutateAsync: m.connect }) },
      disconnect: { useMutation: () => ({ mutateAsync: m.disconnect }) },
    },
  },
}));
vi.mock("@/lib/calendar-connection", async importOriginal => ({
  ...(await importOriginal<any>()),
  navigateCalendarAuthorization: m.navigate,
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
      <button onClick={onRetry}>retry</button>
    </div>
  ),
  workspaceFailureKind: (error: any) =>
    error?.data?.code === "FORBIDDEN" ? "forbidden" : "error",
}));
import CalendarSettings from "../client/src/pages/CalendarSettings";
import {
  calendarAuthorizationUrl,
  calendarCallbackResult,
  scopedCalendarSettings,
} from "../client/src/lib/calendar-connection";
const saved = () => ({
  actorId: 7,
  merchantId: 20,
  digest: "a".repeat(64),
  hasIntegration: true,
  active: true,
  oauthReady: true,
  state: "configured",
  calendarId: "primary",
  lastSync: null,
  retainedAppointments: 42,
});
const inactive = () => ({
  ...saved(),
  active: false,
  state: "unlinked",
  digest: "b".repeat(64),
});
const authorization =
  "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&state=" +
  "s".repeat(43);
let root: Root,
  container: HTMLDivElement,
  memory: ReturnType<typeof memoryLocation>;
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
  m.actor = 7;
  m.merchant = 20;
  m.language = "en";
  m.query = { data: saved(), refetch: m.refresh };
  m.refresh.mockImplementation(async () => ({ data: m.query.data }));
  m.connect.mockResolvedValue({ authorizationUrl: authorization });
  m.disconnect.mockResolvedValue({ success: true, ...inactive() });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  memory = memoryLocation({
    path: "/merchant/calendar/settings",
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
        <CalendarSettings />
      </Router>
    )
  );
const button = (name: string) =>
  Array.from(document.querySelectorAll("button")).find(
    b => b.textContent === name
  )!;
const click = (el: HTMLElement) => act(async () => el.click());
async function review() {
  await click(button(en.disconnect));
  await click(document.querySelector(".cc-review input")!);
}
describe("Calendar connection workspace", () => {
  it.each(["en", "ar"])(
    "shows truthful connection and reminder meaning in %s",
    async lang => {
      m.language = lang;
      await render();
      const copy = lang === "ar" ? ar : en;
      expect(container.textContent).toContain(copy.configured);
      expect(container.textContent).toContain(copy.remindersHint);
      expect(container.textContent).toContain(copy.unavailable);
      expect(container.textContent).not.toContain("undefined");
      expect(
        container
          .querySelector("[data-calendar-connection]")
          ?.getAttribute("dir")
      ).toBe(lang === "ar" ? "rtl" : "ltr");
    }
  );
  it.each([
    "unlinked",
    "credentials_invalid",
    "oauth_disabled",
    "needs_destination",
  ])("renders %s state", async state => {
    Object.assign(m.query.data, {
      state,
      active: state !== "unlinked",
      oauthReady: state !== "oauth_disabled",
      calendarId: state === "needs_destination" ? null : "primary",
    });
    await render();
    expect(container.textContent).toContain(en[state as keyof typeof en]);
    expect(m.connect).not.toHaveBeenCalled();
  });
  it.each([
    "actor",
    "merchant",
    "malformed",
    "contradiction",
    "error",
    "loading",
  ])("does not expose mismatched %s snapshot", async kind => {
    if (kind === "actor") m.query.data.actorId = 8;
    if (kind === "merchant") m.query.data.merchantId = 21;
    if (kind === "malformed") m.query.data.digest = "bad";
    if (kind === "contradiction") m.query.data.active = false;
    if (kind === "error")
      m.query.error = { data: { code: "FORBIDDEN" }, message: "PRIVATE" };
    if (kind === "loading") {
      m.query.data = null;
      m.query.isFetching = true;
    }
    await render();
    expect(container.querySelector("[data-calendar-connection]")).toBeNull();
    expect(container.querySelector("[data-state]")).toBeTruthy();
    expect(container.textContent).not.toContain("PRIVATE");
  });
  it("starts once on explicit click and navigates in the current tab", async () => {
    await render();
    expect(m.connect).not.toHaveBeenCalled();
    await act(async () => {
      button(en.reconnect).click();
      button(en.reconnect)?.click();
    });
    expect(m.connect).toHaveBeenCalledTimes(1);
    expect(m.navigate).toHaveBeenCalledWith(authorization);
  });
  it.each([
    "https://evil.test/a",
    "javascript:alert(1)",
    "https://accounts.google.com@evil.test/o/oauth2/v2/auth",
    authorization + "#fragment",
  ])("rejects an untrusted redirect %s", async url => {
    m.connect.mockResolvedValue({ authorizationUrl: url });
    await render();
    await click(button(en.reconnect));
    expect(m.navigate).not.toHaveBeenCalled();
    expect(container.textContent).toContain(en.connectFailed);
    expect(button(en.reconnect).disabled).toBe(true);
  });
  it.each([
    "calendar_oauth:rate_limit",
    "calendar_oauth:configuration",
    "PRIVATE credential",
  ])("redacts failed start %s", async message => {
    m.connect.mockRejectedValue(Error(message));
    await render();
    await click(button(en.reconnect));
    expect(m.navigate).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain(message);
    expect(button(en.reconnect).disabled).toBe(true);
    await click(button(en.refresh));
    expect(button(en.reconnect).disabled).toBe(false);
  });
  it("keeps disconnect available when provider is disabled", async () => {
    Object.assign(m.query.data, { state: "oauth_disabled", oauthReady: false });
    await render();
    expect(button(en.reconnect).disabled).toBe(true);
    expect(button(en.disconnect).disabled).toBe(false);
  });
  it("requires review, preserves appointments in copy, and verifies a fresh read", async () => {
    await render();
    await click(button(en.disconnect));
    expect(document.body.textContent).toContain(en.disconnectHint);
    expect(document.body.textContent).toContain("42 appointments will remain");
    expect(button(en.confirm).disabled).toBe(true);
    await click(document.querySelector(".cc-review input")!);
    m.refresh.mockImplementation(async () => {
      m.query.data = inactive();
      return { data: m.query.data };
    });
    await click(button(en.confirm));
    expect(m.disconnect).toHaveBeenCalledWith({
      expectedDigest: "a".repeat(64),
      reviewed: true,
    });
    expect(m.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(en.disconnected);
    expect(button(en.connect)).toBeTruthy();
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });
  it("does not disconnect when the user keeps the connection", async () => {
    await render();
    await review();
    await click(button(en.cancel));
    expect(m.disconnect).not.toHaveBeenCalled();
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });
  it("requires a new review if the digest changed", async () => {
    await render();
    await review();
    m.query.data.digest = "c".repeat(64);
    await render();
    expect(button(en.confirm).disabled).toBe(true);
    expect(document.body.textContent).toContain(en.changed);
    expect(m.disconnect).not.toHaveBeenCalled();
  });
  it.each(["network", "active", "scope", "read-error"])(
    "blocks duplicate disconnect after uncertain %s",
    async kind => {
      if (kind === "network") m.disconnect.mockRejectedValue(Error("PRIVATE"));
      if (kind === "scope")
        m.disconnect.mockResolvedValue({
          success: true,
          ...inactive(),
          merchantId: 99,
        });
      if (kind === "read-error")
        m.refresh.mockResolvedValue({ error: Error("PRIVATE") });
      await render();
      await review();
      await click(button(en.confirm));
      expect(container.textContent).toContain(en.uncertain);
      expect(container.textContent).not.toContain("PRIVATE");
      expect(button(en.disconnect).disabled).toBe(true);
      m.refresh.mockResolvedValue({ data: saved() });
      await click(button(en.refresh));
      expect(button(en.disconnect).disabled).toBe(false);
    }
  );
  it("suppresses duplicate submission while disconnect is pending", async () => {
    let finish!: (v: any) => void;
    m.disconnect.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    await render();
    await review();
    await act(async () => {
      button(en.confirm).click();
      button(en.confirm)?.click();
    });
    expect(m.disconnect).toHaveBeenCalledTimes(1);
    await act(async () => finish({ success: true, ...inactive() }));
  });
  it.each(["connect", "disconnect"])(
    "ignores %s result after identity changes",
    async kind => {
      let finish!: (v: any) => void;
      (kind === "connect" ? m.connect : m.disconnect).mockReturnValue(
        new Promise(resolve => {
          finish = resolve;
        })
      );
      await render();
      if (kind === "connect") await click(button(en.reconnect));
      else {
        await review();
        await click(button(en.confirm));
      }
      m.actor = 8;
      m.query.data = { ...saved(), actorId: 8 };
      await render();
      await act(async () =>
        finish(
          kind === "connect"
            ? { authorizationUrl: authorization }
            : { success: true, ...inactive() }
        )
      );
      expect(m.navigate).not.toHaveBeenCalled();
      expect(m.refresh).not.toHaveBeenCalled();
      expect(container.textContent).not.toContain(en.disconnected);
    }
  );
  it("does not treat a callback parameter as proof of connection", async () => {
    memory.navigate("/merchant/calendar/settings?oauth=connected");
    m.query.data = inactive();
    await render();
    expect(container.textContent).toContain(en.callbackConnected);
    expect(container.textContent).toContain(en.unlinked);
    expect(m.connect).not.toHaveBeenCalled();
  });
});
describe("Calendar connection boundaries", () => {
  it.each([
    "?oauth=bad",
    "?oauth=connected&oauth=connected",
    "?oauth=%3Cscript%3E",
  ])("bounds callback %s", value =>
    expect(calendarCallbackResult(value)).toBe("failed")
  );
  it("accepts only the expected Google navigation and matching snapshot", () => {
    expect(calendarAuthorizationUrl(authorization)).toBe(authorization);
    expect(calendarAuthorizationUrl(authorization + "&state=x")).toBeNull();
    expect(scopedCalendarSettings(saved(), 7, 20)).not.toBeNull();
    expect(
      scopedCalendarSettings({ ...saved(), hasIntegration: false }, 7, 20)
    ).toBeNull();
    expect(
      scopedCalendarSettings({ ...saved(), oauthReady: false }, 7, 20)
    ).toBeNull();
  });
});
