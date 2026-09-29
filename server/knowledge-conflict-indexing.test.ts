import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), embed: vi.fn() }));
vi.mock("./db/knowledge", () => ({ getSectionById: mocks.get }));
vi.mock("./ai/rag-engine", () => ({ embedSection: mocks.embed }));
import { indexApprovedConflict } from "./knowledge/conflict-indexing";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue({
    id: 5,
    merchantId: 20,
    content: "Reviewed text",
  });
});
it("indexes the latest scoped section after the decision", async () => {
  mocks.embed.mockResolvedValue(true);
  expect(await indexApprovedConflict(20, 5)).toBe("ready");
  expect(mocks.get).toHaveBeenCalledWith(5, 20);
  expect(mocks.embed).toHaveBeenCalledWith(
    { id: 5, merchantId: 20, content: "Reviewed text" },
    20
  );
});
it.each(["false", "throw", "missing"])(
  "does not misreport a saved decision as failed when indexing is %s",
  async mode => {
    if (mode === "false") mocks.embed.mockResolvedValue(false);
    if (mode === "throw")
      mocks.embed.mockRejectedValue(Error("Provider unavailable"));
    if (mode === "missing") mocks.get.mockResolvedValue(null);
    expect(await indexApprovedConflict(20, 5)).toBe("unconfirmed");
  }
);
