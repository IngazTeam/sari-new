import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  details: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./calendar-workspace", async original => ({
  ...(await original<typeof import("./calendar-workspace")>()),
  readCalendarWorkspace: m.list,
  readCalendarDetails: m.details,
}));
import { appRouter } from "./routers";
import { calendarRouter } from "./routers-calendar";
import { CalendarWorkspaceMissingError } from "./calendar-workspace";
import {
  calendarWorkspaceInput,
  calendarWorkspaceSchema,
  calendarDetailsSchema,
} from "../shared/calendar-workspace";
const range = { startDate: "2026-10-01", endDate: "2026-10-31" };
const empty = {
  actorId: 7,
  merchantId: 20,
  canManage: false,
  canManageIntegration: false,
  checkedAt: "2026-10-02T10:00:00Z",
  selection: calendarWorkspaceInput.parse(range),
  summary: {
    total: 0,
    counts: {
      pending: 0,
      confirmed: 0,
      cancelled: 0,
      completed: 0,
      no_show: 0,
      unknown: 0,
    },
    sync: {
      none: 0,
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
  days: [],
  pagination: { page: 1, pageSize: 25, total: 0, pages: 0 },
  rows: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
  m.list.mockResolvedValue(empty);
  m.details.mockResolvedValue({ ...empty, appointment: { id: 31 } });
});
for (const surface of ["mounted", "standalone"])
  describe(`calendar workspace authority ${surface}`, () => {
    const caller = (user: any = { id: 7, role: "user" }) => {
      const ctx = {
        user,
        merchantId: 999,
        merchantRole: "owner",
        req: { headers: { "x-merchant-id": "20" } },
        res: {},
      } as any;
      return surface === "mounted"
        ? appRouter.createCaller(ctx).calendar
        : calendarRouter.createCaller(ctx);
    };
    it.each(["owner", "manager", "sales_supervisor", "viewer"])(
      "derives %s permissions from selected membership",
      async role => {
        m.access.mockResolvedValue({ merchantId: 20, role });
        const a = await caller().workspace({
            ...range,
            search: " name ",
            page: 2,
          }),
          b = await caller().details({ appointmentId: 31 });
        for (const v of [a, b])
          expect(v).toMatchObject({
            canManage: role !== "viewer",
            canManageIntegration: ["owner", "manager"].includes(role),
          });
        expect(m.list).toHaveBeenCalledWith(7, 20, {
          ...empty.selection,
          search: "name",
          page: 2,
        });
        expect(m.details).toHaveBeenCalledWith(7, 20, { appointmentId: 31 });
      }
    );
    it.each(["workspace", "details"] as const)(
      "denies anonymous, forged scope and revoked membership for %s",
      async method => {
        const input = method === "workspace" ? range : { appointmentId: 31 };
        await expect(
          (caller(null)[method] as any)(input)
        ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        await expect(
          (caller()[method] as any)({ ...input, merchantId: 999 })
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
        m.access.mockResolvedValue(null);
        await expect((caller()[method] as any)(input)).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
        expect(m.list).not.toHaveBeenCalled();
        expect(m.details).not.toHaveBeenCalled();
      }
    );
    it.each(["workspace", "details"] as const)(
      "redacts failures and distinguishes missing record for %s",
      async method => {
        const input = method === "workspace" ? range : { appointmentId: 31 },
          source = method === "workspace" ? m.list : m.details;
        source.mockRejectedValue(Error("private credential SQL"));
        await expect((caller()[method] as any)(input)).rejects.toMatchObject({
          code: "INTERNAL_SERVER_ERROR",
          message: "Calendar data unavailable",
        });
        source.mockRejectedValue(new CalendarWorkspaceMissingError());
        await expect((caller()[method] as any)(input)).rejects.toMatchObject({
          code: "NOT_FOUND",
        });
      }
    );
  });
describe("calendar workspace contracts", () => {
  it.each([
    { page: 0 },
    { page: 1.2 },
    { page: 1_000_001 },
    { status: "paid" },
    { sync: "successful" },
    { serviceId: 0 },
    { staffId: 1.5 },
    { startDate: "2026-02-30" },
    { endDate: "2026-09-30" },
    { endDate: "2027-01-02" },
    { search: "x".repeat(201) },
    { limit: 500 },
    { actorId: 9 },
  ])("rejects invalid selection %j", patch =>
    expect(
      calendarWorkspaceInput.safeParse({ ...range, ...patch }).success
    ).toBe(false)
  );
  it("accepts leap days, unknown states, literal search and exactly 93 days", () => {
    expect(
      calendarWorkspaceInput.parse({
        startDate: "2028-02-29",
        endDate: "2028-05-31",
        search: "%_\\",
        status: "unknown",
        sync: "unknown",
      })
    ).toMatchObject({ search: "%_\\" });
  });
  it("accepts an empty consistent snapshot", () =>
    expect(calendarWorkspaceSchema.safeParse(empty).success).toBe(true));
  it.each([
    (v: any) => {
      v.pagination.total = 1;
    },
    (v: any) => {
      v.pagination.page = 2;
    },
    (v: any) => {
      v.pagination.pages = 1;
    },
    (v: any) => {
      v.summary.counts.pending = 1;
    },
    (v: any) => {
      v.summary.sync.synced = 1;
    },
    (v: any) => {
      v.days = [{ date: "2026-10-03", total: 1 }];
    },
  ])("rejects inconsistent aggregates %#", change => {
    const v = structuredClone(empty);
    change(v);
    expect(calendarWorkspaceSchema.safeParse(v).success).toBe(false);
  });
  it("rejects mismatched appointment details identity", () =>
    expect(
      calendarDetailsSchema.safeParse({
        ...empty,
        selection: { appointmentId: 31 },
        appointment: { id: 32, merchantId: 21 },
      }).success
    ).toBe(false));
});
