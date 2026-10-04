import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  collect: vi.fn(),
  integration: vi.fn(),
  merchant: vi.fn(),
  instances: vi.fn(),
  add: vi.fn(),
  write: vi.fn(),
  append: vi.fn(),
  execute: vi.fn(),
  send: vi.fn(),
}));
vi.mock("./sheets-report-source", () => ({
  collectSheetReportData: m.collect,
}));
vi.mock("./db", () => ({
  getGoogleIntegration: m.integration,
  getMerchantById: m.merchant,
  getWhatsAppInstancesByMerchantId: m.instances,
}));
vi.mock("./db/connection", () => ({
  getPool: async () => ({ execute: m.execute }),
}));
vi.mock("./_core/googleSheets", () => ({
  addSheet: m.add,
  writeToSheet: m.write,
  appendToSheet: m.append,
}));
vi.mock("./whatsapp", () => ({ sendMessageWithCredentials: m.send }));
import {
  generateDailyReport,
  generateWeeklyReport,
  generateMonthlyReport,
  generateCustomReport,
  sendReportViaWhatsApp,
} from "./sheetsReports";
const data = () => ({
  merchantId: 7,
  period: "UTC synthetic",
  startAt: "2026-10-01T00:00:00.000Z",
  endAt: "2026-10-02T00:00:00.000Z",
  timeZone: "UTC",
  totalOrders: 1,
  totalConversations: 2,
  totalMessages: 3,
  newCustomers: 4,
  orderValues: [
    { currency: "USD", count: 1, totalMinor: 1200, markedPaidMinor: 0 },
  ],
  excludedAmounts: 0,
  excludedItemOrders: 0,
  topProducts: [{ name: '=IMPORTXML("example")', count: 1 }],
  ordersByStatus: { pending: 1 },
});
beforeEach(() => {
  vi.resetAllMocks();
  m.collect.mockResolvedValue(data());
  m.integration.mockResolvedValue({ id: 8, isActive: 1, sheetId: "local" });
  m.add.mockResolvedValue({ success: true });
  m.write.mockResolvedValue({ success: true });
  m.append.mockImplementation(async (_m, _s, _r, _v, o) => {
    await o.beforeSend();
    return { success: true };
  });
  m.execute.mockResolvedValue([{ affectedRows: 1 }]);
  m.merchant.mockResolvedValue({ id: 7, phone: "99900000001" });
  m.instances.mockResolvedValue([
    {
      id:3,merchantId:7,isPrimary:1,provider:"green_api",expiresAt:null,
      status: "active",
      instanceId: "7512345678",
      token: "synthetic",
      apiUrl: "https://api.green-api.com",
    },
  ]);
  m.send.mockResolvedValue({ success: true, messageId: "local-receipt" });
});
it.each([generateDailyReport, generateWeeklyReport, generateMonthlyReport])(
  "requires acknowledgements for every report write (%s)",
  async generate => {
    expect(await generate(7)).toMatchObject({ success: true });
    expect(m.write).toHaveBeenCalledTimes(2);
    expect(m.write.mock.calls.every(c => c[4]?.raw === true)).toBe(true);
    expect(m.append.mock.calls[0][4].raw).toBe(true);
    const cells = JSON.stringify(m.append.mock.calls[0][3]);
    expect(cells).toContain("12.00 USD");
    expect(cells).not.toContain("ريال");
    expect(m.write.mock.calls[1][2]).toContain("A1:B6");
    expect(m.write.mock.calls[1][3].slice(-4)).toEqual([
      ["", ""],
      ["", ""],
      ["", ""],
      ["", ""],
    ]);
  }
);
it("allows an existing report tab only when its literal header write succeeds", async () => {
  m.add.mockResolvedValue({ success: false, message: "already exists" });
  expect(await generateDailyReport(7)).toMatchObject({ success: true });
});
it.each(["header", "append", "products", "ack"])(
  "does not claim success after a failed %s stage",
  async stage => {
    if (stage === "header") m.write.mockResolvedValueOnce({ success: false });
    if (stage === "products")
      m.write
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false });
    if (stage === "append")
      m.append.mockResolvedValue({ success: false, message: "PRIVATE" });
    if (stage === "ack") m.execute.mockResolvedValue([{ affectedRows: 0 }]);
    const result = await generateDailyReport(7);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  }
);
it("does not contact Sheets when the source query fails", async () => {
  m.collect.mockRejectedValue(Error("PRIVATE"));
  expect(await generateDailyReport(7)).toMatchObject({ success: false });
  expect(m.add).not.toHaveBeenCalled();
  expect(m.append).not.toHaveBeenCalled();
});
it("rejects a changed export destination immediately before append", async () => {
  m.integration
    .mockResolvedValueOnce({ id: 8, isActive: 1, sheetId: "local" })
    .mockResolvedValueOnce({ id: 8, isActive: 1, sheetId: "local" })
    .mockResolvedValue({ id: 8, isActive: 1, sheetId: "other" });
  expect(await generateDailyReport(7)).toMatchObject({ success: false });
  expect(m.execute).not.toHaveBeenCalled();
});
it("passes the exact custom dates to the consistent source", async () => {
  const start = new Date("2026-10-01"),
    end = new Date("2026-10-02");
  expect(await generateCustomReport(7, start, end)).toMatchObject({
    success: true,
  });
  expect(m.collect).toHaveBeenCalledWith(7, start, end);
});
it("binds outgoing report data to its tenant and separates acceptance from delivery", async () => {
  expect(await sendReportViaWhatsApp(8, "يومي", data() as any)).toMatchObject({
    success: false,
  });
  expect(m.send).not.toHaveBeenCalled();
  const result = await sendReportViaWhatsApp(7, "يومي", data() as any);
  expect(result.success).toBe(true);
  expect(result.message).toContain("التسليم غير مؤكد");
  expect(m.send.mock.calls[0][4]).toContain("ملفات عملاء منشأة");
  expect(m.send.mock.calls[0][4]).toContain("ليست إيرادًا محصلًا");
});
it("requires a provider message receipt, not only a boolean success", async () => {
  m.send.mockResolvedValue({ success: true });
  expect(await sendReportViaWhatsApp(7, "يومي", data() as any)).toMatchObject({
    success: false,
  });
});
it("rejects a spreadsheet changed since review before provider writes",async()=>{expect(await generateDailyReport(7,{expectedSpreadsheetId:'other'})).toMatchObject({success:false});expect(m.add).not.toHaveBeenCalled();expect(m.append).not.toHaveBeenCalled();});
it.each([{isPrimary:0},{provider:'meta_cloud'},{status:'expired'},{expiresAt:'2020-01-01 00:00:00'},{apiUrl:'https://localhost/private'}])('rejects an ineligible primary sender %j',async patch=>{m.instances.mockResolvedValue([{id:3,isPrimary:1,provider:'green_api',status:'active',expiresAt:null,instanceId:'7512345678',token:'synthetic',apiUrl:'https://api.green-api.com',...patch}]);expect(await sendReportViaWhatsApp(7,'يومي',data()as any)).toMatchObject({success:false});expect(m.send).not.toHaveBeenCalled();});
it('requires the exact reviewed recipient and primary record',async()=>{for(const review of [{expectedRecipientPhone:'99900000003',expectedInstanceId:3},{expectedRecipientPhone:'99900000001',expectedInstanceId:4}])expect(await sendReportViaWhatsApp(7,'يومي',data()as any,review)).toMatchObject({success:false});expect(m.send).not.toHaveBeenCalled();});
