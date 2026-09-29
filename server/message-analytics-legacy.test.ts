import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  legacyMessageWindow,
  legacyMessageRangeInput,
} from "../shared/message-analytics-legacy";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  stats: vi.fn(),
  hours: vi.fn(),
  products: vi.fn(),
  association: vi.fn(),
  daily: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./message-analytics-legacy", () => ({
  getMessageStats: m.stats,
  getPeakHours: m.hours,
  getTopProducts: m.products,
  getConversionRate: m.association,
  getDailyMessageCount: m.daily,
}));
import { messageAnalyticsRouter } from "./routers-message-analytics";
const caller = () =>
  messageAnalyticsRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
const methods = [
  "getMessageStats",
  "getPeakHours",
  "getTopProducts",
  "getConversionRate",
  "getDailyMessageCount",
  "exportPDF",
  "exportExcel",
] as const;
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 4 });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T10:11:12.567Z"));
});
afterEach(() => vi.useRealTimers());
describe("legacy message analytics authorization and bounded inputs", () => {
  it.each(["owner", "manager", "viewer", "sales_supervisor"])(
    "uses selected membership for %s instead of the user owner store",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 4 });
      await caller().getMessageStats({});
      expect(m.access).toHaveBeenCalledWith(7, 20);
      expect(m.stats).toHaveBeenCalledWith(
        20,
        new Date("2026-09-01T00:00:00Z"),
        new Date("2026-09-30T10:11:12Z")
      );
    }
  );
  it.each(methods)(
    "rejects missing membership before %s data or export",
    async method => {
      m.access.mockResolvedValue(null);
      await expect(caller()[method]({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      for (const mock of [m.stats, m.hours, m.products, m.association, m.daily])
        expect(mock).not.toHaveBeenCalled();
    }
  );
  it.each(methods)("rejects forged tenant input at %s", async method => {
    await expect(
      caller()[method]({ merchantId: 21 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it.each([
    { startDate: "bad", endDate: "worse" },
    { startDate: "2026-09-10" },
    { endDate: "2026-09-10" },
    { startDate: "2026-09-20", endDate: "2026-09-01" },
    { startDate: "2026-01-01", endDate: "2026-09-30" },
    { startDate: "2026-02-30", endDate: "2026-03-01" },
    { startDate: "2026-09-01T10:00:00", endDate: "2026-09-02T10:00:00" },
  ])("rejects invalid or unbounded range %j", async input => {
    await expect(caller().getMessageStats(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.stats).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 51, Infinity])(
    "bounds product limit %s",
    async limit => {
      await expect(caller().getTopProducts({ limit })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(m.products).not.toHaveBeenCalled();
    }
  );
  it.each([0, -1, 1.5, 91, Infinity])("bounds day count %s", async days => {
    await expect(caller().getDailyMessageCount({ days })).rejects.toMatchObject(
      { code: "BAD_REQUEST" }
    );
    expect(m.daily).not.toHaveBeenCalled();
  });
  it("keeps UTC offsets and inclusive date-only endpoints explicit", async () => {
    await caller().getPeakHours({
      startDate: "2026-09-28T03:00:00+03:00",
      endDate: "2026-09-29",
    });
    expect(m.hours).toHaveBeenCalledWith(
      20,
      new Date("2026-09-28T00:00:00Z"),
      new Date("2026-09-29T23:59:59Z")
    );
  });
  it.each(["exportPDF", "exportExcel"] as const)(
    "retires %s without reading or regenerating unreviewed data",
    async method => {
      await expect(caller()[method]({})).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
      for (const mock of [m.stats, m.hours, m.products, m.association, m.daily])
        expect(mock).not.toHaveBeenCalled();
    }
  );
  it("sanitizes database failures without returning a zero sample", async () => {
    m.association.mockRejectedValue(Error("private SQL detail"));
    await expect(caller().getConversionRate({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Message analytics unavailable",
    });
  });
  it("returns exactly the requested bounded day slots", () => {
    expect(legacyMessageWindow({}, new Date(), 1).dates).toEqual([
      "2026-09-30",
    ]);
    expect(legacyMessageWindow({}, new Date(), 90).dates).toHaveLength(90);
    expect(
      legacyMessageWindow({
        startDate: "2026-09-01T23:59:59Z",
        endDate: "2026-09-02T00:00:01Z",
      }).dates
    ).toEqual(["2026-09-01", "2026-09-02"]);
    expect(
      legacyMessageRangeInput.safeParse({
        startDate: "2026-01-01T12:00:00Z",
        endDate: "2026-04-01T11:00:00Z",
      }).success
    ).toBe(false);
  });
});
