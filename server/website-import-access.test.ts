import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  extract: vi.fn(),
  store: vi.fn(),
  read: vi.fn(),
  refresh: vi.fn(),
  apply: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./knowledge/website-import-extract", () => ({
  extractImportPreview: m.extract,
}));
vi.mock("./knowledge/website-import", () => ({
  storeImportReview: m.store,
  readImportReview: m.read,
  refreshImportReview: m.refresh,
  applyReviewedImport: m.apply,
}));
import { analysisRouter } from "./routers/analysis";
import { PublicWebsiteError } from "./security/public-website";
const id = "8b72f09a-1964-4d32-bc51-62c47bc9b727";
const caller = () =>
  analysisRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
const apply = () => ({
  previewId: id,
  expectedRevision: "a".repeat(64),
  choices: {
    productsAction: "merge" as const,
    pagesAction: "skip" as const,
    faqsAction: "skip" as const,
    applyContactInfo: false,
  },
  acknowledged: true as const,
});
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.extract.mockResolvedValue({
    products: [],
    pages: [],
    faqs: [],
    warnings: [],
  });
});
it.each(["owner", "manager", "viewer", "sales_supervisor"])(
  "scopes %s reads to the selected merchant",
  async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    expect((await caller().importAccess()).canManage).toBe(
      ["owner", "manager"].includes(role)
    );
    await caller().importReview({ previewId: id });
    expect(m.read).toHaveBeenCalledWith(20, id);
  }
);
it.each(["viewer", "sales_supervisor"])(
  "blocks %s before provider/storage writes",
  async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    for (const route of [
      "previewImport",
      "refreshImport",
      "applyImport",
    ] as const)
      await expect(caller()[route]({} as any)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    expect(m.extract).not.toHaveBeenCalled();
    expect(m.apply).not.toHaveBeenCalled();
  }
);
it("requires explicit extraction agreement and passes only server extraction to storage", async () => {
  await expect(
    caller().previewImport({ websiteUrl: "https://example.test" } as any)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await caller().previewImport({
    websiteUrl: "https://example.test",
    acknowledged: true,
  });
  expect(m.extract).toHaveBeenCalledWith(20, "https://example.test");
  expect(m.store).toHaveBeenCalledWith(
    20,
    expect.objectContaining({
      productsAction: "skip",
      applyContactInfo: false,
    }),
    []
  );
});
it("rejects client content and missing approval before applying", async () => {
  await expect(
    caller().applyImport({ ...apply(), products: [] } as any)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    caller().applyImport({ ...apply(), acknowledged: false } as any)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(m.apply).not.toHaveBeenCalled();
  await caller().applyImport(apply());
  expect(m.apply).toHaveBeenCalledWith(20, apply());
});
it("keeps wizard extraction compatible without applying a saved import", async () => {
  await caller().previewAnalysis({ websiteUrl: "https://example.test" });
  expect(m.extract).toHaveBeenCalledWith(20, "https://example.test");
  expect(m.store).not.toHaveBeenCalled();
  expect(m.apply).not.toHaveBeenCalled();
});
it("sanitizes unexpected database errors", async () => {
  m.read.mockRejectedValue(Error("mysql secret raw query"));
  await expect(caller().importReview({ previewId: id })).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "Website import unavailable",
  });
});
it("returns a safe, actionable source error when static extraction is unavailable", async () => {
  m.extract.mockRejectedValue(
    new PublicWebsiteError("WEBSITE_NO_READABLE_TEXT")
  );
  await expect(
    caller().previewImport({
      websiteUrl: "https://example.test",
      acknowledged: true,
    })
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "WEBSITE_NO_READABLE_TEXT",
  });
  expect(m.store).not.toHaveBeenCalled();
});
