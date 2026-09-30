import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  merchant: vi.fn(),
  primary: vi.fn(),
  read: vi.fn(),
  templates: vi.fn(),
  format: vi.fn(),
  update: vi.fn(),
  pdf: vi.fn(),
  text: vi.fn(),
  file: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./db", async original => ({
  ...(await original<typeof import("./db")>()),
  getMerchantById: m.merchant,
  getPrimaryWhatsAppInstance: m.primary,
}));
vi.mock("./db/sales-quotations", () => ({
  getQuotationById: m.read,
  getTemplates: m.templates,
  formatQuotationMessage: m.format,
  updateQuotationStatus: m.update,
}));
vi.mock("./services/quotation-pdf", () => ({ generateQuotationPDF: m.pdf }));
vi.mock("./whatsapp", () => ({
  sendMessageWithCredentials: m.text,
  sendFileWithCredentials: m.file,
}));
import { sariBrainRouter } from "./routers-sari-brain";
let merchantId = 20000;
const quote = () => ({
  id: 1,
  merchantId,
  customerPhone: "+966500000000",
  customerName: "Local",
  quotationNumber: "Q-local",
  items: [{ name: "Item", quantity: 1, unitPrice: 10, total: 10 }],
  rawItems: null,
  itemsTruncated: false,
  subtotal: 10,
  taxAmount: 0.5,
  total: 10.5,
  taxRate: 0.05,
  currency: "SAR",
  status: "draft",
  validUntil: "2026-10-01",
  createdAt: new Date(),
  managed: false,
  offerVersion: 1,
  validityElapsed: false,
});
const send = () =>
  sariBrainRouter
    .createCaller({
      user: { id: 7, role: "user" },
      req: { headers: { "x-merchant-id": String(merchantId) } },
      res: {},
    } as any)
    .sendQuotationToCustomer({
      quotationId: 1,
      customerPhone: "+966500000000",
    });
beforeEach(() => {
  vi.resetAllMocks();
  merchantId++;
  m.access.mockResolvedValue({ merchantId, role: "owner" });
  m.merchant.mockResolvedValue({ id: merchantId, businessName: "Local" });
  m.read.mockResolvedValue(quote());
  m.primary.mockResolvedValue({
    id: 2,
    instanceId: "123400",
    token: "fixture-only",
    provider: "green_api",
  });
  m.templates.mockResolvedValue([]);
  m.format.mockReturnValue("Quotation");
  m.pdf.mockResolvedValue("https://storage.example.test/quote.pdf");
  m.text.mockResolvedValue({ success: true, messageId: "text-id" });
  m.file.mockResolvedValue({ success: true, messageId: "file-id" });
});
describe("legacy quotation delivery guards with fake providers", () => {
  it.each([
    { managed: true },
    { validityElapsed: true },
    { status: "accepted" },
    { customerPhone: "+966599999999" },
    { rawItems: "bad" },
  ])(
    "blocks unsafe documents or destinations before effects %j",
    async patch => {
      m.read.mockResolvedValue({ ...quote(), ...patch });
      await expect(send()).rejects.toMatchObject({ code: "CONFLICT" });
      expect(m.pdf).not.toHaveBeenCalled();
      expect(m.text).not.toHaveBeenCalled();
    }
  );
  it("checks the connection before generating or uploading a PDF", async () => {
    m.primary.mockResolvedValue(undefined);
    await expect(send()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.pdf).not.toHaveBeenCalled();
  });
  it.each([{ success: false }, { success: true }])(
    "does not advance after unacknowledged text %j",
    async result => {
      m.text.mockResolvedValue(result);
      await expect(send()).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
      expect(m.file).not.toHaveBeenCalled();
      expect(m.update).not.toHaveBeenCalled();
    }
  );
  it("does not claim success or sent state for an unacknowledged file", async () => {
    m.file.mockResolvedValue({ success: false });
    await expect(send()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(m.update).not.toHaveBeenCalled();
  });
  it("reports provider acceptance separately from delivery and binds the status projection", async () => {
    expect(await send()).toMatchObject({
      success: true,
      providerAccepted: true,
      delivered: false,
    });
    expect(m.text.mock.calls[0].at(-1)).toEqual({
      idempotencyKey: `quotation:${merchantId}:1:text`,
    });
    expect(m.file.mock.calls[0].at(-1)).toEqual({
      idempotencyKey: `quotation:${merchantId}:1:pdf`,
    });
    expect(m.update).toHaveBeenCalledWith(1, merchantId, "sent", {
      actorId: 7,
      expectedRevision: 1,
      expectedStatus: "draft",
    });
  });
  it("selects the registered Meta transport when the primary provider is Meta", async () => {
    m.primary.mockResolvedValue({
      id: 2,
      instanceId: "meta-phone",
      token: "fixture-only",
      provider: "meta_cloud",
    });
    await send();
    expect(m.text.mock.calls[0][2]).toBe("https://graph.facebook.com");
    expect(m.file.mock.calls[0][2]).toBe("https://graph.facebook.com");
  });
});
