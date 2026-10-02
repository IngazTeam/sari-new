import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./calendar-settings", () => ({
  readCalendarSettings: m.read,
  disconnectCalendar: m.disconnect,
}));
import { appRouter } from "./routers";
import { calendarRouter } from "./routers-calendar";
import { calendarDisconnectInput } from "../shared/calendar-settings";
const input = { expectedDigest: "a".repeat(64), reviewed: true as const },
  sessionId = "b".repeat(64);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.read.mockResolvedValue({ actorId: 7, merchantId: 20 });
  m.disconnect.mockResolvedValue({ success: true });
});
for (const surface of ["mounted", "standalone"])
  describe(`calendar connection controls ${surface}`, () => {
    const caller = (
      session: any = { sessionId },
      user: any = { id: 7, role: "user" }
    ) => {
      const ctx = {
        user,
        session,
        merchantId: 999,
        merchantRole: "owner",
        req: { headers: { "x-merchant-id": "20" } },
        res: {},
      } as any;
      return surface === "mounted"
        ? appRouter.createCaller(ctx).calendar
        : calendarRouter.createCaller(ctx);
    };
    it.each(["owner", "manager"])(
      "uses selected tenant and actor session for %s",
      async role => {
        m.access.mockResolvedValue({ merchantId: 20, role });
        await caller().settings();
        await caller().getStatus();
        await caller().disconnect(input);
        expect(m.read).toHaveBeenCalledWith({
          merchantId: 20,
          userId: 7,
          sessionId,
        });
        expect(m.disconnect).toHaveBeenCalledWith(
          { merchantId: 20, userId: 7, sessionId },
          input
        );
      }
    );
    it.each(["viewer", "sales_supervisor", null])(
      "blocks %s access",
      async role => {
        m.access.mockResolvedValue(role ? { merchantId: 20, role } : null);
        await expect(caller().settings()).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
        await expect(caller().getStatus()).rejects.toMatchObject({code:'FORBIDDEN'});
        await expect(caller().disconnect(input)).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
        expect(m.read).not.toHaveBeenCalled();
        expect(m.disconnect).not.toHaveBeenCalled();
      }
    );
    it("requires active session context", async () => {
      await expect(caller(null).getStatus()).rejects.toMatchObject({code:'UNAUTHORIZED'});
      await expect(caller(null).settings()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(caller(null).disconnect(input)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(
        caller({ sessionId }, null).settings()
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
    it.each([
      { merchantId: 999 },
      { expectedDigest: "bad" },
      { reviewed: false },
    ])("rejects injected or unreviewed disconnect %j", async patch => {
      await expect(
        caller().disconnect({ ...input, ...patch } as any)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(m.disconnect).not.toHaveBeenCalled();
    });
    it("redacts storage failures", async () => {
      m.read.mockRejectedValue(Error("SQL PRIVATE"));
      await expect(caller().getStatus()).rejects.toMatchObject({message:'calendar_oauth:unavailable'});
      await expect(caller().settings()).rejects.toMatchObject({
        message: "calendar_oauth:unavailable",
      });
    });
    it.each(['configured','unlinked','credentials_invalid','oauth_disabled','needs_destination'])('legacy status projects only a configured connection for %s',async state=>{
      m.read.mockResolvedValue({actorId:7,merchantId:20,state,active:state!=='unlinked'});
      expect(await caller().getStatus()).toMatchObject({actorId:7,merchantId:20,state,connected:state==='configured'});
    });
    it.each(["getAuthUrl", "handleCallback"])(
      "removes unsafe legacy entry %s on both surfaces",
      async method => {
        await expect(
          (caller() as any)[method]({ code: "private" })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    );
  });
it("requires strict disconnect confirmation evidence", () => {
  expect(
    calendarDisconnectInput.safeParse({ ...input, calendarId: "foreign" })
      .success
  ).toBe(false);
});
