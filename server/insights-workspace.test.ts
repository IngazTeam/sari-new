import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  insightDate,
  insightPage,
  insightWindow,
  insightStoredList,
  insightWorkspaceInput,
  observationArm,
  sentimentObservation,
} from "../shared/insights-workspace";
import { insightCsv } from "../shared/insight-csv";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  report: vi.fn(),
  keyword: vi.fn(),
  reports: vi.fn(),
  tests: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./insights-workspace", () => ({
  readInsightWorkspace: m.read,
  readInsightReport: m.report,
}));
vi.mock("./db-insights", () => ({
  getKeywordInsights: m.keyword,
  getWeeklyReportsList: m.reports,
  getActiveABTests: m.tests,
}));
import { insightsRouter } from "./routers-insights";
const caller = () =>
  insightsRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 4 });
  m.read.mockResolvedValue({ merchantId: 20 });
  m.report.mockResolvedValue({ merchantId: 20, id: 3 });
});
describe("selected-tenant insight reads", () => {
  it.each(["owner", "manager", "viewer", "sales_supervisor"])(
    "permits authorized %s and binds every endpoint to the selected tenant",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 4 });
      await caller().workspace({ period: "7d" });
      expect(m.access).toHaveBeenCalledWith(7, 20);
      expect(m.read).toHaveBeenCalledWith(20, {
        period: "7d",
        keywordPage: 1,
        reportPage: 1,
        testPage: 1,
      });
      await caller().getKeywordStats({ period: "90d" });
      expect(m.keyword).toHaveBeenCalledWith(20, "90d");
      await caller().getWeeklyReports({ limit: 8 });
      expect(m.reports).toHaveBeenCalledWith(20, 8);
      await caller().getActiveABTests();
      expect(m.tests).toHaveBeenCalledWith(20);
      expect(await caller().report({ reportId: 3 })).toEqual({
        merchantId: 20,
        id: 3,
      });
      expect(m.report).toHaveBeenCalledWith(20, 3);
    }
  );
  it("rejects missing membership before reading data", async () => {
    m.access.mockResolvedValue(null);
    await expect(caller().workspace({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each([
    { merchantId: 21 },
    { period: "all" },
    { keywordPage: 0 },
    { reportPage: 1.5 },
    { testPage: 100001 },
    { testPage: Infinity },
  ])("rejects invalid selection %j", async attack => {
    await expect(caller().workspace(attack as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 53, Infinity])(
    "bounds legacy report limit %s",
    async limit => {
      await expect(caller().getWeeklyReports({ limit })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(m.reports).not.toHaveBeenCalled();
    }
  );
  it("rejects forged tenant parameters on compatibility queries", async () => {
    await expect(
      caller().getKeywordStats({ merchantId: 21, period: "7d" } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().getWeeklyReports({ merchantId: 21, limit: 4 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("does not expose database failures or claim an empty dataset", async () => {
    m.read.mockRejectedValue(Error("secret SQL connection detail"));
    await expect(caller().workspace({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Insights unavailable",
    });
  });
  it.each([
    { reportId: 0 },
    { reportId: -1 },
    { reportId: 1.2 },
    { reportId: 2147483648 },
    { reportId: 3, merchantId: 21 },
  ])("rejects invalid report lookup %j", async input => {
    await expect(caller().report(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.report).not.toHaveBeenCalled();
  });
  it("does not disguise a missing or failed report read as empty content", async () => {
    m.report.mockResolvedValueOnce(null);
    await expect(caller().report({ reportId: 3 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Report unavailable",
    });
    m.report.mockRejectedValueOnce(Error("secret database detail"));
    await expect(caller().report({ reportId: 3 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Insights unavailable",
    });
    m.access.mockResolvedValue(null);
    await expect(caller().report({ reportId: 3 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.report).toHaveBeenCalledTimes(2);
  });
});
describe("evidence semantics and portable dates", () => {
  it("preserves complete saved lists and legacy text instead of dropping unrecognized formats", () => {
    expect(insightStoredList(null)).toEqual({
      format: "empty",
      items: [],
      raw: null,
    });
    expect(insightStoredList('["first","<img src=x>"]')).toEqual({
      format: "list",
      items: ["first", "<img src=x>"],
      raw: null,
    });
    for (const raw of [
      "plain text",
      "[invalid",
      '[1,"text"]',
      '{"text":"recommendation"}',
    ])
      expect(insightStoredList(raw)).toEqual({
        format: "legacy",
        items: [],
        raw,
      });
  });
  it("normalizes UTC SQL strings independently of browser parsing and rejects unzoned dates", () => {
    expect(insightDate("2026-09-29 12:00:00")).toBe("2026-09-29T12:00:00.000Z");
    expect(insightDate("2026-09-29T15:00:00+03:00")).toBe(
      "2026-09-29T12:00:00.000Z"
    );
    for (const value of [
      null,
      "",
      "garbage",
      "2026-09-29T12:00:00",
      "2026-99-29 12:00:00",
    ])
      expect(insightDate(value)).toBeNull();
  });
  it("uses a rolling UTC window and clamps pages without reporting an invalid offset", () => {
    expect(insightWindow("7d", new Date("2026-09-29T12:00:00Z"))).toMatchObject(
      { from: "2026-09-22T12:00:00.000Z", sqlThrough: "2026-09-29 12:00:00" }
    );
    expect(insightPage(90, 21)).toMatchObject({
      page: 2,
      pages: 2,
      offset: 20,
    });
    expect(insightPage(90, 0)).toMatchObject({ page: 1, pages: 1, offset: 0 });
    expect(insightWorkspaceInput.parse({})).toEqual({
      period: "30d",
      keywordPage: 1,
      reportPage: 1,
      testPage: 1,
    });
  });
  it("distinguishes no sample from measured zero and rejects inconsistent observations", () => {
    expect(observationArm(0, 0)).toMatchObject({ valid: true, ratio: null });
    expect(observationArm(5, 0)).toMatchObject({ valid: true, ratio: 0 });
    for (const [total, positive] of [
      [0, 1],
      [-1, 0],
      [1, 2],
      [1.2, 1],
      [NaN, 0],
    ])
      expect(observationArm(total, positive)).toMatchObject({
        valid: false,
        ratio: null,
      });
  });
  it("keeps unclassified conversations visible and does not reuse the stored satisfaction label", () => {
    expect(
      sentimentObservation({
        totalConversations: 10,
        positiveCount: 4,
        neutralCount: 2,
        negativeCount: 1,
      })
    ).toMatchObject({ positiveShare: 40, unclassified: 3, valid: true });
    expect(
      sentimentObservation({
        totalConversations: 0,
        positiveCount: 0,
        neutralCount: 0,
        negativeCount: 0,
      }).positiveShare
    ).toBeNull();
    expect(
      sentimentObservation({
        totalConversations: 1,
        positiveCount: 2,
        neutralCount: 0,
        negativeCount: 0,
      })
    ).toMatchObject({ positiveShare: null, unclassified: null, valid: false });
  });
  it("exports literal spreadsheet text, quotes multiline fields, and keeps numeric zero", () => {
    const csv = insightCsv([
      [
        '=HYPERLINK("https://invalid.test")',
        " \t+cmd",
        "@SUM(A1)",
        "normal,comma",
        'line\nquote"',
        0,
        null,
      ],
    ]);
    expect(csv).toContain('"\'=HYPERLINK(""https://invalid.test"")"');
    expect(csv).toContain('"\' \t+cmd"');
    expect(csv).toContain('"\'@SUM(A1)"');
    expect(csv).toContain('"normal,comma"');
    expect(csv).toContain('"line\nquote"""');
    expect(csv).toContain(',"0",""');
  });
});
