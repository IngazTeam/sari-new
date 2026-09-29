import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  db: vi.fn(),
  legacyWrite: vi.fn(),
  cache: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./db", () => ({
  getMerchantById: m.db,
  getDiscoveredPagesByMerchantId: m.db,
  getExtractedFaqsByMerchantId: m.db,
  updateDiscoveredPage: m.legacyWrite,
  deleteDiscoveredPage: m.legacyWrite,
  updateExtractedFaq: m.legacyWrite,
  deleteExtractedFaq: m.legacyWrite,
}));
vi.mock("./db/knowledge", () => ({ invalidateCache: m.cache }));
import { analysisRouter } from "./routers/analysis";
const caller = (user: any = { id: 1, role: "user" }) =>
  analysisRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
const routes = ["updatePage", "deletePage", "updateFaq", "deleteFaq", "applyAnalysis", "analyzeWebsite"] as const;
const payload = {
  merchantId: 999,
  pageId: 200,
  faqId: 300,
  useInBot: true,
  isActive: true,
  content: "Unreviewed",
  question: "Unreviewed",
  answer: "Unreviewed",
};
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
});
it.each(routes)(
  "%s refuses old clients even with owner access, without reading or writing knowledge",
  async route => {
    await expect(caller()[route](payload)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(m.db).not.toHaveBeenCalled();
    expect(m.legacyWrite).not.toHaveBeenCalled();
    expect(m.cache).not.toHaveBeenCalled();
  }
);
it.each(routes)(
  "%s refuses manager calls and explains the reviewed replacement",
  async route => {
    m.access.mockResolvedValue({ merchantId: 20, role: "manager" });
    await expect(caller()[route](payload)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(m.legacyWrite).not.toHaveBeenCalled();
  }
);
it.each(routes)(
  "%s checks authorization before handling an arbitrary legacy payload",
  async route => {
    m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
    await expect(caller()[route](payload)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller(null)[route](payload)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(m.legacyWrite).not.toHaveBeenCalled();
  }
);
