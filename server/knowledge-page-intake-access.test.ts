import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  fetch: vi.fn(),
  store: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  index: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./knowledge/page-fetch", () => ({ fetchPageSnapshot: m.fetch }));
vi.mock("./knowledge/page-intake", () => ({
  storePagePreview: m.store,
  readPageIntake: m.read,
  savePagePreview: m.save,
}));
vi.mock("./knowledge/conflict-indexing", () => ({
  indexApprovedConflict: m.index,
}));
import { sariBrainRouter } from "./routers-sari-brain";
const id = "00000000-0000-4000-8000-000000000001";
const caller = () =>
  sariBrainRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.index.mockResolvedValue("unconfirmed");
  m.save.mockResolvedValue({
    state: "saved",
    pageId: 1,
    sectionId: 2,
    replayed: false,
  });
});
it.each(["viewer", "sales_supervisor"])(
  "rejects %s before fetching or storing anything",
  async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    for (const key of [
      "previewUrl",
      "savePreviewedPage",
      "addCustomUrl",
    ] as const)
      await expect(caller()[key]({} as any)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    expect(m.fetch).not.toHaveBeenCalled();
    expect(m.store).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  }
);
it("uses the resolved merchant for receipts and atomic saves", async () => {
  await caller().pageIntakeReceipt({ previewId: id });
  expect(m.read).toHaveBeenCalledWith(20, id);
  expect(
    await caller().savePreviewedPage({ previewId: id, acknowledged: true })
  ).toMatchObject({ state: "saved", indexing: "unconfirmed" });
  expect(m.save).toHaveBeenCalledWith(20, {
    previewId: id,
    acknowledged: true,
  });
  expect(m.index).toHaveBeenCalledWith(20, 2);
});
it("requires acknowledgement and rejects legacy unreviewed saves", async () => {
  await expect(
    caller().savePreviewedPage({ previewId: id, acknowledged: false } as any)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    caller().addCustomUrl({ url: "https://example.test" })
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  expect(m.save).not.toHaveBeenCalled();
});
it("never recrawls or reindexes a previously consumed preview", async () => {
  m.save.mockResolvedValue({
    state: "deleted",
    pageId: 1,
    sectionId: 2,
    replayed: true,
  });
  expect(
    await caller().savePreviewedPage({ previewId: id, acknowledged: true })
  ).toMatchObject({ state: "deleted", indexing: "not_requested" });
  expect(m.fetch).not.toHaveBeenCalled();
  expect(m.index).not.toHaveBeenCalled();
});
it("sanitizes receipt/save database failures", async () => {
  m.read.mockRejectedValue(Error("password secret"));
  m.save.mockRejectedValue(Error("password secret"));
  await expect(
    caller().pageIntakeReceipt({ previewId: id })
  ).rejects.toMatchObject({ message: "Page receipt unavailable" });
  await expect(
    caller().savePreviewedPage({ previewId: id, acknowledged: true })
  ).rejects.toMatchObject({ message: "Page save could not be confirmed" });
});
it("fetches once for a tenant-scoped preview and rate-limits repeated provider work", async () => {
  m.fetch.mockResolvedValue({ content: "snapshot" });
  await caller().previewUrl({ url: "https://example.test" });
  expect(m.fetch).toHaveBeenCalledWith(20, "https://example.test/");
  expect(m.store).toHaveBeenCalledWith(20, { content: "snapshot" });
  await expect(
    caller().previewUrl({ url: "https://example.test" })
  ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  expect(m.fetch).toHaveBeenCalledTimes(1);
});
