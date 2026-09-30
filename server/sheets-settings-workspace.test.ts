// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const m = vi.hoisted(() => ({
  data: {} as any,
  attempt: null as any,
  error: null as any,
  attemptError: null as any,
  loading: false,
  fetching: false,
  paused: false,
  language: "en",
  start: vi.fn(),
  connect: vi.fn(),
  recover: vi.fn(),
  ack: vi.fn(),
  save: vi.fn(),
  disconnect: vi.fn(),
  refresh: vi.fn(),
  refreshAttempt: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    sheets: {
      getStatus: {
        useQuery: () => ({
          data: m.data,
          error: m.error,
          isLoading: m.loading,
          isFetching: m.fetching,
          fetchStatus: m.paused ? "paused" : "idle",
          refetch: m.refresh,
        }),
      },
      beginOAuth: { useMutation: () => ({ mutateAsync: m.connect }) },
      updateReportSettings: { useMutation: () => ({ mutateAsync: m.save }) },
      disconnect: { useMutation: () => ({ mutateAsync: m.disconnect }) },
      setup: {
        read: {
          useQuery: () => ({
            data: m.attempt,
            error: m.attemptError,
            isLoading: m.loading,
            isFetching: m.fetching,
            fetchStatus: m.paused ? "paused" : "idle",
            refetch: m.refreshAttempt,
          }),
        },
        start: { useMutation: () => ({ mutateAsync: m.start }) },
        recover: { useMutation: () => ({ mutateAsync: m.recover }) },
        acknowledge: { useMutation: () => ({ mutateAsync: m.ack }) },
      },
    },
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: m.language },
    t: (key: string, values: any = {}) =>
      String(
        key
          .split(".")
          .reduce((v: any, k) => v?.[k], m.language === "ar" ? ar : en) ?? key
      ).replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? "")),
  }),
}));
vi.mock("../client/src/components/merchant/WorkspaceState", () => ({
  WorkspaceState: ({ kind, onRetry }: any) =>
    React.createElement(
      "div",
      { "data-state": kind },
      React.createElement("button", { onClick: onRetry }, "Retry")
    ),
  workspaceFailureKind: (e: any) =>
    e?.data?.code === "FORBIDDEN"
      ? "forbidden"
      : e?.data?.code === "UNAUTHORIZED"
        ? "session"
        : "error",
}));
import { SheetsSettingsWorkspace } from "../client/src/components/merchant/SheetsSettingsWorkspace";
import { clearKnowledgeWorkspace } from "../client/src/lib/knowledge-workspace-cache";
let host: HTMLDivElement, root: Root;
const scope = "9:7:sheets-settings",
  requestId = "a73d82f5-1338-436e-87f7-88c971b22b89";
const copy = (key: keyof typeof en.sheetsSettingsUx) =>
  (m.language === "ar" ? ar : en).sheetsSettingsUx[key];
const button = (key: keyof typeof en.sheetsSettingsUx) =>
  Array.from(host.querySelectorAll("button")).find(
    b => b.textContent === copy(key)
  )!;
const box = (key: keyof typeof en.sheetsSettingsUx) =>
  Array.from(host.querySelectorAll("label"))
    .find(l => l.textContent === copy(key))!
    .querySelector("input")!;
const click = async (el: HTMLElement) => act(async () => el.click());
const render = async () =>
  act(async () =>
    root.render(
      React.createElement(SheetsSettingsWorkspace, {
        scope,
        navigate: m.navigate,
      })
    )
  );
const makeAttempt = (state = "completed", id = requestId): any => ({
  merchantId: 7,
  actorId: 9,
  createdBy: 9,
  requestId: id,
  state,
  canAcknowledge: false,
  startedAt: "2026-09-30T12:00:00.000Z",
  finishedAt: "2026-09-30T12:00:02.000Z",
  reason: null,
  spreadsheetId: ["created", "completed", "detached"].includes(state)
    ? "local-created"
    : null,
  receipt: ["created", "completed", "detached"].includes(state)
    ? {
        requestId: id,
        spreadsheetId: "local-created",
        templateVersion: 1,
        confirmedAt: "2026-09-30T12:00:02.000Z",
      }
    : null,
});
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  m.language = "en";
  m.error = null;
  m.attemptError = null;
  m.loading = false;
  m.fetching = false;
  m.paused = false;
  m.attempt = null;
  m.data = {
    merchantId: 7,
    actorId: 9,
    digest: "a".repeat(64),
    isConnected: true,
    oauthReady: true,
    hasIntegration: true,
    state: "ready",
    spreadsheetId: "local-current",
    reports: {
      sendDailyReports: false,
      sendWeeklyReports: false,
      sendMonthlyReports: false,
    },
  };
  m.refresh.mockImplementation(async () => ({ data: m.data, error: m.error }));
  m.refreshAttempt.mockImplementation(async () => ({
    data: m.attempt,
    error: m.attemptError,
  }));
  m.connect.mockResolvedValue({
    authorizationUrl:
      "https://accounts.google.com/o/oauth2/v2/auth?state=local-test",
  });
  m.save.mockImplementation(async input => ({
    success: true,
    ...m.data,
    digest: "b".repeat(64),
    reports: { ...input.changes },
  }));
  m.disconnect.mockImplementation(async () => ({
    success: true,
    ...m.data,
    digest: "b".repeat(64),
    isConnected: false,
    state: "unlinked",
    reports: {
      sendDailyReports: false,
      sendWeeklyReports: false,
      sendMonthlyReports: false,
    },
  }));
  m.start.mockImplementation(async input =>
    makeAttempt("completed", input.requestId)
  );
  m.recover.mockResolvedValue(makeAttempt());
  m.ack.mockResolvedValue({
    ...makeAttempt("acknowledged"),
    canAcknowledge: false,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe("Sheets connection workspace", () => {
  it.each(["ar", "en"])(
    "renders %s without starting OAuth, setup, or saving",
    async language => {
      m.language = language;
      await render();
      expect(host.querySelectorAll("h1")).toHaveLength(1);
      expect(host.textContent).toContain(copy("title"));
      expect(host.textContent).not.toContain("sheetsSettingsUx.");
      for (const fn of [m.connect, m.start, m.save, m.disconnect])
        expect(fn).not.toHaveBeenCalled();
    }
  );
  it.each([
    "loading",
    "offline",
    "forbidden",
    "session",
    "error",
    "attemptError",
    "wrongTenant",
    "wrongActor",
    "badSnapshot",
    "badAttempt",
    "missingReceipt",
  ])("blocks controls for %s", async mode => {
    if (mode === "loading") m.loading = true;
    if (mode === "offline") m.paused = true;
    if (["forbidden", "session", "error"].includes(mode))
      m.error = {
        data: {
          code:
            mode === "forbidden"
              ? "FORBIDDEN"
              : mode === "session"
                ? "UNAUTHORIZED"
                : "INTERNAL_SERVER_ERROR",
        },
      };
    if (mode === "attemptError")
      m.attemptError = { data: { code: "INTERNAL_SERVER_ERROR" } };
    if (mode === "wrongTenant") m.data.merchantId = 88;
    if (mode === "wrongActor") m.data.actorId = 88;
    if (mode === "badSnapshot") m.data.digest = "bad";
    if (mode === "badAttempt") m.attempt = { ...makeAttempt(), merchantId: 88 };
    if (mode === "missingReceipt")
      m.attempt = { ...makeAttempt(), receipt: null };
    await render();
    expect(host.querySelector("[data-state]")).toBeTruthy();
    expect(button("save")).toBeUndefined();
    expect(button("createButton")).toBeUndefined();
    expect(m.start).not.toHaveBeenCalled();
  });
  it("does not connect when OAuth is disabled", async () => {
    m.data.oauthReady = false;
    m.data.isConnected = false;
    m.data.state = "oauth_disabled";
    await render();
    expect(button("connect").disabled).toBe(true);
    await click(button("connect"));
    expect(m.connect).not.toHaveBeenCalled();
  });
  it("connects on click and accepts only the expected Google authorization URL", async () => {
    await render();
    await click(button("reconnect"));
    expect(m.connect).toHaveBeenCalledTimes(1);
    expect(m.navigate).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?state=local-test"
    );
  });
  it.each([
    "https://evil.test/",
    "javascript:alert(1)",
    "https://accounts.google.com/other",
  ])("rejects unsafe redirect %s", async authorizationUrl => {
    m.connect.mockResolvedValue({ authorizationUrl });
    await render();
    await click(button("reconnect"));
    expect(m.navigate).not.toHaveBeenCalled();
    expect(host.textContent).toContain(en.sheetsOAuth.failed);
  });
  it("suppresses OAuth redirect after the connection changes", async () => {
    let resolve!: (v: any) => void;
    m.connect.mockImplementation(() => new Promise(r => (resolve = r)));
    await render();
    await click(button("reconnect"));
    m.data = { ...m.data, digest: "c".repeat(64) };
    await render();
    await act(async () =>
      resolve({
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      })
    );
    expect(m.navigate).not.toHaveBeenCalled();
  });
  it("requires explicit consent before creation and sends no client-supplied data rows", async () => {
    m.data.state = "needs_destination";
    delete m.data.spreadsheetId;
    await render();
    expect(button("createButton").disabled).toBe(true);
    await click(box("createReviewed"));
    await click(button("createButton"));
    expect(m.start).toHaveBeenCalledWith({
      requestId: expect.any(String),
      reviewed: true,
      expectedDigest: "a".repeat(64),
    });
    expect(host.textContent).toContain(copy("completed"));
    expect(box("createReviewed").checked).toBe(false);
  });
  it.each(["preparing", "dispatching", "uncertain", "created"])(
    "does not recreate when the saved attempt is %s",
    async state => {
      m.data.state = "needs_destination";
      delete m.data.spreadsheetId;
      m.attempt = makeAttempt(state);
      await render();
      expect(button("createButton").disabled).toBe(true);
      expect(box("createReviewed").disabled).toBe(true);
      expect(host.textContent).toContain(copy("noRetry"));
    }
  );
  it("restores a saved receipt instead of creating a file", async () => {
    m.attempt = makeAttempt("created");
    await render();
    await click(button("recover"));
    expect(m.recover).toHaveBeenCalledWith({ requestId });
    expect(m.start).not.toHaveBeenCalled();
    expect(host.textContent).toContain(copy("completed"));
  });
  it("requires review before acknowledging uncertainty", async () => {
    m.attempt = { ...makeAttempt("uncertain"), canAcknowledge: true };
    await render();
    await click(button("reviewAttempt"));
    expect(button("confirmReview").disabled).toBe(true);
    await click(box("ackChecked"));
    await click(button("confirmReview"));
    expect(m.ack).toHaveBeenCalledWith({ requestId, reviewed: true });
    expect(m.start).not.toHaveBeenCalled();
  });
  it("opens the original attempt destination separately from the current destination", async () => {
    m.attempt = makeAttempt();
    await render();
    expect(host.textContent).toContain(copy("oldReceipt"));
    const links = Array.from(host.querySelectorAll("a"));
    expect(
      links.find(a => a.textContent?.includes(copy("openAttempt")))?.href
    ).toContain("/local-created/");
    expect(
      links.find(a => a.textContent?.includes(copy("openSheet")))?.href
    ).toContain("/local-current/");
  });
  it("uses explicit report save and confirmation instead of writing on toggle", async () => {
    await render();
    await click(box("daily"));
    expect(m.save).not.toHaveBeenCalled();
    expect(button("save").disabled).toBe(true);
    await click(box("reportsReviewed"));
    await click(button("save"));
    expect(m.save).toHaveBeenCalledWith({
      expectedDigest: "a".repeat(64),
      reviewed: true,
      changes: {
        sendDailyReports: true,
        sendWeeklyReports: false,
        sendMonthlyReports: false,
      },
    });
    expect(host.textContent).toContain(copy("saved"));
  });
  it("preserves a draft and blocks stale save when the server snapshot changes", async () => {
    await render();
    await click(box("daily"));
    m.data = { ...m.data, digest: "c".repeat(64) };
    await render();
    expect(box("daily").checked).toBe(true);
    expect(host.textContent).toContain(copy("conflict"));
    expect(button("save").disabled).toBe(true);
    await click(button("reloadOptions"));
    expect(box("daily").checked).toBe(false);
    expect(m.save).not.toHaveBeenCalled();
  });
  it("requires a separate reviewed disconnection", async () => {
    await render();
    await click(button("disconnect"));
    expect(m.disconnect).not.toHaveBeenCalled();
    expect(button("confirmDisconnect").disabled).toBe(true);
    await click(box("disconnectReviewed"));
    await click(button("confirmDisconnect"));
    expect(m.disconnect).toHaveBeenCalledWith({
      expectedDigest: "a".repeat(64),
      reviewed: true,
    });
    expect(host.textContent).toContain(copy("disconnected"));
  });
  it.each(["lost", "false", "foreign", "mismatch"])(
    "does not announce successful settings save for %s",
    async mode => {
      if (mode === "lost") m.save.mockRejectedValue(Error("private-detail"));
      if (mode === "false") m.save.mockResolvedValue({ success: false });
      if (mode === "foreign")
        m.save.mockImplementation(async input => ({
          success: true,
          ...m.data,
          merchantId: 99,
          reports: input.changes,
        }));
      if (mode === "mismatch")
        m.save.mockResolvedValue({ success: true, ...m.data });
      await render();
      await click(box("daily"));
      await click(box("reportsReviewed"));
      await click(button("save"));
      expect(host.textContent).not.toContain(copy("saved"));
      expect(host.textContent).not.toContain("private-detail");
      expect(host.textContent).toContain(copy("checkAfterError"));
      expect(button("save").disabled).toBe(true);
      expect(m.save).toHaveBeenCalledTimes(1);
    }
  );
  it("ignores a late successful response after logout", async () => {
    let resolve!: (v: any) => void;
    m.save.mockImplementation(() => new Promise(r => (resolve = r)));
    await render();
    await click(box("daily"));
    await click(box("reportsReviewed"));
    await click(button("save"));
    clearKnowledgeWorkspace();
    await act(async () =>
      resolve({
        success: true,
        ...m.data,
        reports: { ...m.data.reports, sendDailyReports: true },
      })
    );
    expect(host.textContent).not.toContain(copy("saved"));
    expect(m.refresh).not.toHaveBeenCalled();
  });
});
