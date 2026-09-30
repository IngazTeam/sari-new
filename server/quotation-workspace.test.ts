import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  quotationMinor,
  quotationListInput,
  quotationMonth,
} from "../shared/quotation-workspace";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./quotation-workspace", async original => ({
  ...(await original<typeof import("./quotation-workspace")>()),
  readQuotationWorkspace: m.read,
  readQuotationDetail: m.detail,
}));
import { quotationWorkspaceRouter } from "./routers-quotations";
import { parseQuotationItems } from "./quotation-workspace";
const caller = (user: any = { id: 7, role: "user" }) =>
  quotationWorkspaceRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 4 });
  m.read.mockResolvedValue({ merchantId: 20 });
  m.detail.mockResolvedValue({ merchantId: 20, id: 1 });
});
describe("quotation read boundary", () => {
  it.each(["owner", "manager", "sales_supervisor", "viewer"])(
    "uses selected merchant for %s",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 4 });
      const workspace = await caller().workspace({});
      expect(workspace.canManage).toBe(role !== "viewer");
      expect(workspace.canSetTarget).toBe(["owner", "manager"].includes(role));
      await caller().detail({ id: 1 });
      expect(m.access).toHaveBeenCalledWith(7, 20);
      expect(m.read).toHaveBeenCalledWith(20, {
        search: "",
        status: "all",
        page: 1,
        pageSize: 20,
      });
      expect(m.detail).toHaveBeenCalledWith(20, 1);
    }
  );
  it.each([null, { merchantId: 20, role: "support_agent", memberId: 4 }])(
    "denies unavailable membership %j",
    async access => {
      m.access.mockResolvedValue(access);
      await expect(caller().workspace({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(m.read).not.toHaveBeenCalled();
    }
  );
  it("denies anonymous access", async () => {
    await expect(caller(null).workspace({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each([
    { merchantId: 1 },
    { status: "made-up" },
    { page: 1.2 },
    { page: 0 },
    { page: 100001 },
    { pageSize: 51 },
    { search: "x".repeat(121) },
  ])("rejects invalid selection %j", async v => {
    await expect(caller().workspace(v as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("does not return source errors or invented empty samples", async () => {
    m.read.mockRejectedValue(Error("private SQL credentials"));
    await expect(caller().workspace({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Quotations unavailable",
    });
  });
  it("makes foreign/missing details unavailable", async () => {
    m.detail.mockResolvedValue(null);
    await expect(caller().detail({ id: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("keeps literal search text", () => {
    expect(quotationListInput.parse({ search: "  %_';  " }).search).toBe(
      "%_';"
    );
  });
});
describe("money, time and legacy item evidence", () => {
  it.each([
    ["0", 0],
    ["0.01", 1],
    ["99999999.99", 9999999999],
    [1.15, 115],
    ["001.20", 120],
  ])("reads major units %s", (value, expected) => {
    expect(quotationMinor(value)).toBe(expected);
  });
  it.each([
    null,
    undefined,
    true,
    "",
    " ",
    "1e2",
    "-1",
    "1.001",
    "NaN",
    Infinity,
    0.1 + 0.2,
    "999999999999999999.99",
  ])("does not coerce invalid money %s", value => {
    expect(quotationMinor(value)).toBeNull();
  });
  it("anchors the creation cohort to UTC through the current second", () => {
    expect(quotationMonth(new Date("2026-10-01T01:00:00.999+03:00"))).toEqual({
      from: "2026-09-01T00:00:00.000Z",
      through: "2026-09-30T22:00:00.000Z",
      end: "2026-09-30",
    });
  });
  it("preserves unsupported item units and malformed legacy JSON", () => {
    const raw = JSON.stringify([{ name: "Item", quantity: 2, price: 500 }]);
    expect(parseQuotationItems(raw, false)).toMatchObject({
      rawItems: raw,
      items: [{ quantity: 2, unitPriceMinor: null, totalMinor: null }],
    });
    expect(parseQuotationItems("bad", false)).toEqual({
      items: [],
      rawItems: "bad",
      itemsTruncated: false,
    });
  });
  it("renders exact known item units and marks bounded raw text", () => {
    expect(
      parseQuotationItems(
        JSON.stringify([
          { name: "<img>", quantity: 1.5, unitPrice: 12.2, total: 18.3 },
        ]),
        false
      )
    ).toMatchObject({
      rawItems: null,
      items: [
        {
          name: "<img>",
          quantity: 1.5,
          unitPriceMinor: 1220,
          totalMinor: 1830,
        },
      ],
    });
    expect(parseQuotationItems("partial", true)).toEqual({
      items: [],
      rawItems: "partial",
      itemsTruncated: true,
    });
  });
});
