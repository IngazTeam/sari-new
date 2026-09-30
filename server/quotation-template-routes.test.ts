import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  merchant: vi.fn(),
  list: vi.fn(),
  template: vi.fn(),
  quote: vi.fn(),
  format: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./db", async original => ({
  ...(await original<typeof import("./db")>()),
  getMerchantById: m.merchant,
}));
vi.mock("./db/sales-quotations", () => ({
  getTemplates: m.list,
  getTemplateById: m.template,
  getQuotationById: m.quote,
  formatQuotationMessage: m.format,
}));
import { sariBrainRouter } from "./routers-sari-brain";
const caller = () =>
  sariBrainRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
  m.merchant.mockResolvedValue({ id: 20, businessName: "Local" });
  m.list.mockResolvedValue([]);
  m.quote.mockResolvedValue({ id: 1 });
  m.format.mockReturnValue("Only explicitly selected content");
});
describe("template selection and copy compatibility", () => {
  it("uses resolved membership for listing", async () => {
    expect(await caller().getQuotationTemplates()).toEqual([]);
    expect(m.list).toHaveBeenCalledWith(20);
  });
  it("denies template reads to a role without analytics.read", async () => {
    m.access.mockResolvedValue({ merchantId: 20, role: "support_agent" });
    await expect(caller().getQuotationTemplates()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.list).not.toHaveBeenCalled();
  });
  it("sanitizes a failed source rather than reporting no templates", async () => {
    m.list.mockRejectedValue(Error("SQL secret"));
    await expect(caller().getQuotationTemplates()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Quotations unavailable",
    });
  });
  it.each([undefined, null])(
    "never selects default terms implicitly (%s)",
    async templateId => {
      await caller().formatQuotationForWhatsApp({ quotationId: 1, templateId });
      expect(m.list).not.toHaveBeenCalled();
      expect(m.template).not.toHaveBeenCalled();
      expect(m.format).toHaveBeenCalledWith({ id: 1 }, "Local", null);
    }
  );
  it("selects only the explicit owned template", async () => {
    m.template.mockResolvedValue({ id: 3, termsText: "My terms" });
    await caller().formatQuotationForWhatsApp({
      quotationId: 1,
      templateId: 3,
    });
    expect(m.template).toHaveBeenCalledWith(3, 20);
    expect(m.format).toHaveBeenCalledWith({ id: 1 }, "Local", {
      id: 3,
      termsText: "My terms",
    });
  });
  it("rejects foreign or missing selections without fallback", async () => {
    m.template.mockResolvedValue(null);
    await expect(
      caller().formatQuotationForWhatsApp({ quotationId: 1, templateId: 3 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(m.format).not.toHaveBeenCalled();
    expect(m.list).not.toHaveBeenCalled();
  });
  it.each([
    { quotationId: 1, templateId: 0 },
    { quotationId: 1, templateId: 1.5 },
    { quotationId: 1, merchantId: 999 },
  ])("rejects malformed and extra selection fields", async input => {
    await expect(
      caller().formatQuotationForWhatsApp(input as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.quote).not.toHaveBeenCalled();
  });
});
