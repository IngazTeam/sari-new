import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  start: vi.fn(),
  read: vi.fn(),
  recover: vi.fn(),
  acknowledge: vi.fn(),
  access: vi.fn(),
}));
vi.mock("./sheets-setup-attempts", async original => ({
  ...(await original<typeof import("./sheets-setup-attempts")>()),
  startSheetsSetup: m.start,
  readSheetsSetup: m.read,
  recoverSheetsSetup: m.recover,
  acknowledgeSheetsSetup: m.acknowledge,
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
import { sheetsRouter } from "./routers-sheets";
import { guardSheetsSetup } from "./sheets-setup-api";
import { SheetsSetupError } from "./sheets-setup-attempts";
const sessionId = "a".repeat(64),
  requestId = "a73d82f5-1338-436e-87f7-88c971b22b89";
const caller = (session: any = { sessionId }) =>
  sheetsRouter.createCaller({
    user: { id: 9 },
    session,
    req: { headers: { "x-merchant-id": "7" } },
    res: {},
  } as any);
const run = (name: string, c = caller()) =>
  name === "start"
    ? c.setup.start({
        requestId,
        reviewed: true,
        expectedDigest: "b".repeat(64),
      })
    : name === "read"
      ? c.setup.read({ requestId })
      : name === "recover"
        ? c.setup.recover({ requestId })
        : c.setup.acknowledge({ requestId, reviewed: true });
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 7, role: "manager" });
});
describe("Sheets creation API", () => {
  it.each(["start", "read", "recover", "acknowledge"])(
    "scopes %s to the authenticated merchant and session",
    async name => {
      await run(name);
      expect((m as any)[name].mock.calls[0][0]).toEqual({
        merchantId: 7,
        userId: 9,
        sessionId,
      });
    }
  );
  it.each(["start", "read", "recover", "acknowledge"])(
    "blocks viewer %s before store/provider access",
    async name => {
      m.access.mockResolvedValue({ merchantId: 7, role: "viewer" });
      await expect(run(name)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((m as any)[name]).not.toHaveBeenCalled();
    }
  );
  it.each(["start", "read", "recover", "acknowledge"])(
    "blocks absent session for %s",
    async name => {
      await expect(run(name, caller(null))).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      expect((m as any)[name]).not.toHaveBeenCalled();
    }
  );
  it.each([
    "pending",
    "changed",
    "configuration",
    "rate_limit",
    "unconfirmed",
    "missing",
  ] as const)("redacts %s", async reason => {
    await expect(
      guardSheetsSetup(() => Promise.reject(new SheetsSetupError(reason)))
    ).rejects.toMatchObject({ message: `sheets_setup:${reason}` });
  });
  it("redacts unknown database detail", async () => {
    await expect(
      guardSheetsSetup(() => Promise.reject(Error("private-secret")))
    ).rejects.toMatchObject({ message: "sheets_setup:unavailable" });
  });
  it("does not accept an unreviewed start or acknowledgement", async () => {
    await expect(
      (caller().setup as any).start({ requestId })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      (caller().setup as any).acknowledge({ requestId, reviewed: false })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.start).not.toHaveBeenCalled();
    expect(m.acknowledge).not.toHaveBeenCalled();
  });
});
