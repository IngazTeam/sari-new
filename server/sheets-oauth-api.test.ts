import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  complete: vi.fn(),
  begin: vi.fn(),
  access: vi.fn(),
}));
vi.mock("./_core/auth", () => ({ authenticateSessionRequest: m.auth }));
vi.mock("./sheets-oauth", async original => ({
  ...(await original<typeof import("./sheets-oauth")>()),
  completeSheetsOAuth: m.complete,
  beginSheetsOAuth: m.begin,
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
import { sheetsOAuthCallback, guardSheetsOAuth } from "./sheets-oauth-api";
import { SheetsOAuthError } from "./sheets-oauth";
import { sheetsRouter } from "./routers-sheets";
const state = "x".repeat(43),
  sessionId = "a".repeat(64);
const response = () => ({ setHeader: vi.fn(), redirect: vi.fn() });
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ user: { id: 9 }, session: { sessionId } });
  m.complete.mockResolvedValue({ cancelled: false });
  m.access.mockResolvedValue({ merchantId: 7, role: "owner" });
  m.begin.mockResolvedValue({
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  });
});
describe("Sheets OAuth callback and RPC", () => {
  it.each([
    { state: "7", code: "x" },
    { state: [state], code: "x" },
    { state, code: ["x"] },
    { state, error: "<script>secret</script>" },
  ])(
    "rejects malformed callbacks before authentication or exchange",
    async query => {
      const res = response();
      await sheetsOAuthCallback({ query } as any, res as any);
      expect(res.redirect).toHaveBeenCalledWith(
        "/merchant/sheets/settings?oauth=invalid"
      );
      expect(m.auth).not.toHaveBeenCalled();
      expect(m.complete).not.toHaveBeenCalled();
    }
  );
  it("uses the active session and never reflects the code or provider text", async () => {
    const res = response();
    await sheetsOAuthCallback(
      { query: { state, code: "private-code" } } as any,
      res as any
    );
    expect(m.complete).toHaveBeenCalledWith({
      userId: 9,
      sessionId,
      state,
      code: "private-code",
      denied: false,
    });
    expect(res.redirect).toHaveBeenCalledWith(
      "/merchant/sheets/settings?oauth=connected"
    );
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Referrer-Policy",
      "no-referrer"
    );
  });
  it("consumes denied attempts without accepting an unverified cancellation", async () => {
    m.complete.mockResolvedValue({ cancelled: true });
    const res = response();
    await sheetsOAuthCallback(
      { query: { state, error: "access_denied" } } as any,
      res as any
    );
    expect(m.complete).toHaveBeenCalledWith({
      userId: 9,
      sessionId,
      state,
      code: undefined,
      denied: true,
    });
    expect(res.redirect).toHaveBeenCalledWith(
      "/merchant/sheets/settings?oauth=cancelled"
    );
  });
  it.each(["auth", "complete"])("redacts %s failure", async part => {
    m[part].mockRejectedValue(Error("private-secret"));
    const res = response();
    await sheetsOAuthCallback(
      { query: { state, code: "x" } } as any,
      res as any
    );
    expect(res.redirect).toHaveBeenCalledWith(
      `/merchant/sheets/settings?oauth=${part === "auth" ? "session" : "failed"}`
    );
  });
  it.each([
    "forbidden",
    "configuration",
    "invalid_state",
    "rate_limit",
    "changed",
    "exchange",
  ] as const)("maps %s to a safe API error", async reason => {
    await expect(
      guardSheetsOAuth(() => Promise.reject(new SheetsOAuthError(reason)))
    ).rejects.toMatchObject({ message: `sheets_oauth:${reason}` });
  });
  it("maps unknown database detail to unavailable", async () => {
    await expect(
      guardSheetsOAuth(() => Promise.reject(Error("password=private")))
    ).rejects.toMatchObject({ message: "sheets_oauth:unavailable" });
  });
  const caller = (user: any = { id: 9 }, session: any = { sessionId }) =>
    sheetsRouter.createCaller({
      user,
      session,
      req: { headers: { "x-merchant-id": "7" } },
      res: {},
    } as any);
  it("begins only as a mutation with server-resolved scope and a session", async () => {
    await caller().beginOAuth();
    expect(m.begin).toHaveBeenCalledWith({
      merchantId: 7,
      userId: 9,
      sessionId,
    });
    expect(sheetsRouter._def.procedures.beginOAuth._def.type).toBe("mutation");
  });
  it.each(["viewer", "sales_supervisor"])(
    "blocks %s before beginning a grant",
    async role => {
      m.access.mockResolvedValue({ merchantId: 7, role });
      await expect(caller().beginOAuth()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(m.begin).not.toHaveBeenCalled();
    }
  );
  it("blocks absent session", async () => {
    await expect(caller({ id: 9 }, null).beginOAuth()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(m.begin).not.toHaveBeenCalled();
  });
  it.each(["getAuthUrl", "handleCallback"])(
    "retires unsafe entry %s",
    async name => {
      await expect(
        (caller() as any)[name]({ code: "x" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(m.begin).not.toHaveBeenCalled();
      expect(m.complete).not.toHaveBeenCalled();
    }
  );
});
