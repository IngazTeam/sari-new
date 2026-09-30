import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  pool: vi.fn(),
  execute: vi.fn(),
  schema: vi.fn(),
}));
vi.mock("./db/connection", () => ({ getPool: m.pool }));
vi.mock("./db/schema-readiness", () => ({ assertRuntimeSchema: m.schema }));
import { getTemplates, getTemplateById } from "./quotation-template-reads";
beforeEach(() => {
  vi.resetAllMocks();
  m.pool.mockResolvedValue({ execute: m.execute });
  m.execute.mockResolvedValue([[]]);
});
describe("quotation template reads have no commercial side effects", () => {
  it("returns a real empty list without inserting defaults", async () => {
    expect(await getTemplates(20)).toEqual([]);
    expect(m.execute).toHaveBeenCalledTimes(1);
    expect(m.execute.mock.calls[0][0]).toMatch(
      /^SELECT .*WHERE merchant_id=\?.*LIMIT 201$/
    );
    expect(m.execute.mock.calls[0][1]).toEqual([20]);
  });
  it.each([0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid merchant %s before reading",
    async value => {
      await expect(getTemplates(value)).rejects.toThrow();
      expect(m.pool).not.toHaveBeenCalled();
    }
  );
  it("does not turn an unavailable database into an empty list", async () => {
    m.pool.mockResolvedValue(null);
    await expect(getTemplates(20)).rejects.toThrow("unavailable");
  });
  it("does not suppress schema or query failures", async () => {
    m.schema.mockRejectedValueOnce(Error("schema"));
    await expect(getTemplates(20)).rejects.toThrow("schema");
    expect(m.execute).not.toHaveBeenCalled();
    m.execute.mockRejectedValueOnce(Error("source"));
    await expect(getTemplates(20)).rejects.toThrow("source");
  });
  it("does not silently truncate an oversized compatibility list", async () => {
    m.execute.mockResolvedValue([Array.from({ length: 201 }, () => ({}))]);
    await expect(getTemplates(20)).rejects.toThrow("pagination");
  });
  it("reads only the selected merchant's selected template", async () => {
    expect(await getTemplateById(3, 20)).toBeNull();
    expect(m.execute).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE merchant_id=\? AND id=\?/),
      [20, 3]
    );
  });
  it("preserves stored text without substituting tax, payment or delivery terms", async () => {
    m.execute.mockResolvedValue([
      [
        {
          id: 3,
          merchant_id: 20,
          name: "Saved",
          header_image_url: null,
          footer_text: "Full footer\nline2",
          terms_text: "Merchant terms\nline2",
          is_default: 0,
          created_at: "2026-09-30",
        },
      ],
    ]);
    expect(await getTemplateById(3, 20)).toMatchObject({
      id: 3,
      merchantId: 20,
      name: "Saved",
      headerImageUrl: null,
      footerText: "Full footer\nline2",
      termsText: "Merchant terms\nline2",
      isDefault: false,
    });
  });
});
