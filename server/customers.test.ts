import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  export: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./customer-workspace", async original => ({
  ...(await original<typeof import("./customer-workspace")>()),
  readCustomerList: m.list,
  readCustomerDetail: m.detail,
  exportCustomerWorkspace: m.export,
}));
import { customersRouter } from "./routers-customers";
import { CustomerExportLimit } from "./customer-workspace";
const caller = (user: any = { id: 7, role: "user" }, selected = "20") =>
  customersRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": selected } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "manager", memberId: 3 });
  m.list.mockResolvedValue({ merchantId: 20, rows: [], canManage: false });
  m.detail.mockResolvedValue({ merchantId: 20, customer: null });
  m.export.mockResolvedValue({ merchantId: 20, count: 0 });
});
describe("retired customer browser APIs", () => {
  it.each(["list", "getByPhone", "getStats", "export", "exportCsv"])(
    "does not mount legacy %s or read data through it",
    async name => {
      await expect((caller() as any)[name]({})).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(m.list).not.toHaveBeenCalled();
      expect(m.detail).not.toHaveBeenCalled();
      expect(m.export).not.toHaveBeenCalled();
    }
  );
});
describe("canonical customer workspace permissions", () => {
  it.each(["owner", "manager", "sales_supervisor", "viewer"])(
    "uses selected verified membership for %s reads",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
      await expect(
        caller().workspace.list({ search: "%_" })
      ).resolves.toMatchObject({
        merchantId: 20,
        canManage: role !== "viewer",
      });
      expect(m.access).toHaveBeenCalledWith(7, 20);
      expect(m.list).toHaveBeenCalledWith(20, {
        search: "%_",
        activity: "all",
        page: 1,
      });
      await expect(
        caller().workspace.detail({ key: "customer%2F" })
      ).resolves.toMatchObject({ customer: null });
      expect(m.detail).toHaveBeenCalledWith(20, {
        key: "customer%2F",
        ordersPage: 1,
        conversationsPage: 1,
      });
    }
  );
  it.each(["owner", "manager", "sales_supervisor"])(
    "allows filtered export for %s",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
      await caller().workspace.export({ activity: "unknown", language: "en" });
      expect(m.export).toHaveBeenCalledWith(20, {
        search: "",
        activity: "unknown",
        language: "en",
      });
    }
  );
  it("denies bulk export before reading data for a viewer", async () => {
    m.access.mockResolvedValue({ merchantId: 20, role: "viewer", memberId: 3 });
    await expect(caller().workspace.export({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.export).not.toHaveBeenCalled();
  });
  it("fails closed after revoked access and for a platform admin without membership", async () => {
    m.access.mockResolvedValue(null);
    for (const user of [
      { id: 7, role: "user" },
      { id: 7, role: "admin" },
    ])
      await expect(caller(user).workspace.list({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    expect(m.list).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated reads", async () => {
    await expect(
      caller(null).workspace.detail({ key: "a" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(m.detail).not.toHaveBeenCalled();
  });
  it("rejects merchant injection and unbounded paging", async () => {
    await expect(
      caller().workspace.list({ merchantId: 30 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().workspace.list({ page: 1000001 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().workspace.export({ page: 1 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.list).not.toHaveBeenCalled();
    expect(m.export).not.toHaveBeenCalled();
  });
  it("hides database failure details without claiming empty data", async () => {
    m.list.mockRejectedValue(Error("private SQL"));
    m.detail.mockRejectedValue(Error("private SQL"));
    m.export.mockRejectedValue(Error("private SQL"));
    for (const action of [
      () => caller().workspace.list({}),
      () => caller().workspace.detail({ key: "a" }),
      () => caller().workspace.export({}),
    ]) {
      await expect(action()).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
      await expect(action()).rejects.not.toHaveProperty(
        "message",
        "private SQL"
      );
    }
  });
  it("reports the export limit distinctly", async () => {
    m.export.mockRejectedValue(new CustomerExportLimit());
    await expect(caller().workspace.export({})).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});
