import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageWorkspaceFixture } from "./tests/helpers/message-workspace-fixture";
const m = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./message-workspace", () => ({ readLegacyMessageWorkspace: m.read }));
import {
  getMessageStats,
  getPeakHours,
  getTopProducts,
  getConversionRate,
  getDailyMessageCount,
} from "./message-analytics-legacy";
beforeEach(() => {
  vi.resetAllMocks();
  m.read.mockResolvedValue(messageWorkspaceFixture());
});
describe("legacy output semantics use the reviewed snapshot", () => {
  it("preserves all four message counts", async () => {
    expect(await getMessageStats(20)).toEqual({
      text: 6,
      voice: 2,
      image: 1,
      document: 1,
      total: 10,
    });
  });
  it("returns unavailable sales conversion and explicit association meaning", async () => {
    expect(await getConversionRate(20)).toMatchObject({
      merchantId: 20,
      rate: null,
      associationShare: 100 / 3,
      totalConversations: 3,
      conversationsWithOrders: 1,
      includesAllOrderStatuses: true,
      salesProficiency: null,
      evidenceKind: "exact_phone_match_to_any_order_in_period",
    });
  });
  it("preserves null rather than zero for an empty association denominator", async () => {
    const s = messageWorkspaceFixture();
    s.orderAssociation = {
      ...s.orderAssociation,
      total: 0,
      positive: 0,
      ratio: null,
    };
    m.read.mockResolvedValue(s);
    expect(await getConversionRate(20)).toMatchObject({
      rate: null,
      associationShare: null,
      totalConversations: 0,
    });
  });
  it("passes limits and periods through the validated data reader", async () => {
    await getTopProducts(20, 50);
    expect(m.read).toHaveBeenLastCalledWith(20, {}, { limit: 50 });
    await getDailyMessageCount(20, 1);
    expect(m.read).toHaveBeenLastCalledWith(20, {}, { days: 1 });
    await getPeakHours(20, new Date("2026-09-01Z"), new Date("2026-09-02Z"));
    expect(m.read).toHaveBeenLastCalledWith(20, {
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2026-09-02T00:00:00.000Z",
    });
  });
  it("does not hide an unavailable database as empty data", async () => {
    m.read.mockRejectedValue(Error("database unavailable"));
    await expect(getMessageStats(20)).rejects.toThrow("database unavailable");
  });
});
