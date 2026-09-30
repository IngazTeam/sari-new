import { describe, it, expect, beforeEach, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  status: vi.fn(),
  send: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./api/distributed-rate-limit", () => ({
  reserveApiRateLimit: m.limit,
}));
vi.mock("./inventory-sheet-export", async original => ({
  ...(await original<typeof import("./inventory-sheet-export")>()),
  readInventoryExportStatus: m.status,
  exportInventoryToSheet: m.send,
}));
import {
  projectInventoryExport,
  InventoryExportEmpty,
  InventoryExportLimit,
} from "./inventory-sheet-export";
import { sheetsRouter } from "./routers-sheets";
import { InventoryExportProviderError } from "./inventory-sheet-export-provider";
import {
  ProductEditorConflict,
  ProductEditorForbidden,
} from "./product-editor";
const row = {
  id: 4,
  merchantId: 20,
  name: '=HYPERLINK("https://example.test")',
  category: "+value",
  price: 1234,
  priceUnit: "minor",
  currency: "USD",
  stock: 0,
};
const at = "2026-09-30T12:00:00.000Z",
  input = { expectedSourceDigest: "a".repeat(64), reviewed: true as const };
const caller = (user: any = { id: 7 }) =>
  sheetsRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "manager" });
  m.limit.mockResolvedValue({ allowed: true });
  m.send.mockResolvedValue({ success: true });
});
describe("inventory export data and API boundary", () => {
  it("keeps explicit zero, minor-unit decimals and currency while preserving literal text", () => {
    expect(projectInventoryExport([row], 20, at)).toEqual({
      rows: [["4", row.name, "+value", "12.34 USD", "0", at]],
      unknownStock: 0,
      unverifiedPrice: 0,
    });
  });
  it.each([null, -1, 1.5, 2147483648, NaN])(
    "exports unknown or invalid stock %s as blank, never zero",
    stock => {
      const r = projectInventoryExport([{ ...row, stock }], 20, at);
      expect(r.rows[0][4]).toBe("");
      expect(r.unknownStock).toBe(1);
    }
  );
  it.each([
    { priceUnit: "unverified" },
    { price: -1 },
    { currency: "XYZ" },
    { price: 1.5 },
  ])("leaves an unverified price blank %#", patch => {
    const r = projectInventoryExport([{ ...row, ...patch }], 20, at);
    expect(r.rows[0][3]).toBe("");
    expect(r.unverifiedPrice).toBe(1);
  });
  it.each([0, 1, 99, 2147483647])("formats price %s without loss", price => {
    const r = projectInventoryExport([{ ...row, price }], 20, at);
    expect(r.rows[0][3]).toBe(
      `${Math.floor(price / 100)}.${String(price % 100).padStart(2, "0")} USD`
    );
  });
  it("rejects empty, excess, mixed-tenant and duplicate catalogs without dropping rows", () => {
    expect(() => projectInventoryExport([], 20, at)).toThrow(
      InventoryExportEmpty
    );
    expect(() => projectInventoryExport(Array(5001).fill(row), 20, at)).toThrow(
      InventoryExportLimit
    );
    expect(() =>
      projectInventoryExport([{ ...row, merchantId: 21 }], 20, at)
    ).toThrow();
    expect(() => projectInventoryExport([row, row], 20, at)).toThrow();
  });
  it("binds status and export to authenticated scope and limits sends by tenant", async () => {
    await caller().inventoryStatus();
    expect(m.status).toHaveBeenCalledExactlyOnceWith(20, 7);
    await caller().syncInventory(input);
    expect(m.send).toHaveBeenCalledExactlyOnceWith(20, 7, input);
    expect(m.limit.mock.calls[0][0]).toMatchObject({
      identity: "20",
      maxRequests: 10,
    });
  });
  it.each([
    undefined,
    { ...input, reviewed: false },
    { ...input, merchantId: 21 },
    { ...input, spreadsheetId: "other" },
    { ...input, rows: [] },
    { ...input, expectedSourceDigest: "bad" },
  ])("rejects unreviewed, old or forged input %#", async value => {
    await expect(caller().syncInventory(value as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("requires products.manage and denies unauthenticated and viewer requests", async () => {
    await expect(caller(null).inventoryStatus()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller(null).syncInventory(input)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
    await expect(caller().inventoryStatus()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller().syncInventory(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.send).not.toHaveBeenCalled();
    expect(m.status).not.toHaveBeenCalled();
  });
  it("does not send when rate-limited", async () => {
    m.limit.mockResolvedValue({ allowed: false });
    await expect(caller().syncInventory(input)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(m.send).not.toHaveBeenCalled();
  });
  it.each([
    [new ProductEditorConflict(), "CONFLICT"],
    [new ProductEditorForbidden(), "FORBIDDEN"],
    [new InventoryExportProviderError("unconfirmed"), "BAD_GATEWAY"],
    [Error("token secret SQL"), "INTERNAL_SERVER_ERROR"],
  ])(
    "returns classified errors without private details %#",
    async (error, code) => {
      m.send.mockRejectedValueOnce(error);
      await expect(caller().syncInventory(input)).rejects.toMatchObject({
        code,
      });
      m.status.mockRejectedValueOnce(Error("SQL private"));
      await expect(caller().inventoryStatus()).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "inventory_export:unavailable",
      });
    }
  );
});
