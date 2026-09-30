import { describe, it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("./db/connection", () => ({ getDb: m.db }));
import { orderListInput, orderMinor } from "../shared/order-workspace";
import {
  parseOrderItems,
  readOrderWorkspace,
  readOrderDetail,
} from "./order-workspace";
beforeEach(() => vi.resetAllMocks());
describe("order source contract", () => {
  it.each([
    null,
    undefined,
    true,
    "",
    "1.5",
    -1,
    NaN,
    Number.MAX_SAFE_INTEGER + 1,
  ])("never fabricates an amount from %s", v =>
    expect(orderMinor(v)).toBeNull()
  );
  it("retains zero and exact minor values", () => {
    expect(orderMinor(0)).toBe(0);
    expect(orderMinor("3453")).toBe(3453);
  });
  it.each([
    { merchantId: 5 },
    { page: 0 },
    { page: 1.2 },
    { page: 100001 },
    { search: "x".repeat(101) },
    { status: "confirmed" },
    { payment: "completed" },
  ])("rejects malformed selections %j", v =>
    expect(orderListInput.safeParse(v).success).toBe(false)
  );
  it("retains stored legacy JSON without interpreting an ambiguous price unit", () => {
    const raw = JSON.stringify([
      { name: "Saved", quantity: 2, price: 25, sku: "Keep me" },
    ]);
    expect(parseOrderItems(raw, false)).toEqual({
      rawItems: raw,
      itemsState: "legacy",
      items: [
        { name: "Saved", quantity: 2, unitPriceMinor: null, totalMinor: null },
      ],
    });
  });
  it("uses explicit minor units only and guards multiplication overflow", () => {
    expect(
      parseOrderItems(
        JSON.stringify([
          { name: "A", quantity: 2, price: 3453, priceUnit: "minor" },
        ]),
        false
      ).items[0].totalMinor
    ).toBe(6906);
    expect(
      parseOrderItems(
        JSON.stringify([
          { name: "A", quantity: 2, unitPriceMinor: Number.MAX_SAFE_INTEGER },
        ]),
        false
      ).items[0].totalMinor
    ).toBeNull();
  });
  it.each([
    "null",
    "{}",
    "false",
    "broken",
    JSON.stringify(Array(201).fill({})),
    "[null]",
  ])("preserves malformed or unsupported JSON %s", raw => {
    expect(parseOrderItems(raw, false)).toEqual({
      items: [],
      rawItems: raw,
      itemsState: "legacy",
    });
  });
  it("does not parse a clipped representation", () =>
    expect(parseOrderItems("[]", true)).toEqual({
      items: [],
      rawItems: "[]",
      itemsState: "truncated",
    }));
  it("reports a missing database as failure for both reads", async () => {
    m.db.mockResolvedValue(null);
    await expect(readOrderWorkspace(1, {})).rejects.toThrow(
      "Orders unavailable"
    );
    await expect(readOrderDetail(1, 1)).rejects.toThrow("Orders unavailable");
  });
  it("does not query for an invalid tenant, detail ID or clock", async () => {
    await expect(readOrderWorkspace(0, {})).rejects.toThrow();
    await expect(readOrderDetail(1, 0)).rejects.toThrow();
    await expect(readOrderWorkspace(1, {}, new Date("bad"))).rejects.toThrow();
    expect(m.db).not.toHaveBeenCalled();
  });
});
