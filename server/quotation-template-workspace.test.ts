import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./quotation-template-workspace", async original => ({
  ...(await original<typeof import("./quotation-template-workspace")>()),
  readTemplateWorkspace: m.list,
  readTemplateDetail: m.detail,
  writeQuotationTemplate: m.write,
  readTemplateReceipt: m.receipt,
}));
import { quotationTemplatesRouter } from "./routers-quotation-templates";
import { QuotationTemplateLimit } from "./quotation-template-workspace";
import { QuotationConflict, QuotationUnavailable } from "./quotation-mutations";
import {
  templateFields,
  templateWriteInput,
} from "../shared/quotation-templates";
const fields = {
  name: "My template",
  headerImageUrl: null,
  footerText: null,
  termsText: null,
  isDefault: false,
};
const input = () => ({
  action: "create" as const,
  requestId: randomUUID(),
  fields: { ...fields },
});
const caller = () =>
  quotationTemplatesRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.list.mockResolvedValue({ merchantId: 20, items: [] });
});
describe("reviewed template boundary", () => {
  it("binds tenant and actor instead of accepting caller identities", async () => {
    const v = input();
    await caller().write(v);
    await caller().receipt({ requestId: v.requestId });
    expect(m.write).toHaveBeenCalledWith(20, 7, v);
    expect(m.receipt).toHaveBeenCalledWith(20, 7, { requestId: v.requestId });
  });
  it.each(["owner", "manager", "sales_supervisor", "support_agent", "viewer"])(
    "exposes accurate manage access for %s",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role });
      if (role === "support_agent") {
        await expect(
          caller().workspace({ page: 1, search: "" })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      } else
        expect(
          (await caller().workspace({ page: 1, search: "" })).canManage
        ).toBe(role !== "viewer");
    }
  );
  it("denies writes and receipt reads for viewers", async () => {
    m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
    await expect(caller().write(input())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller().receipt({ requestId: randomUUID() })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.write).not.toHaveBeenCalled();
  });
  it.each([
    { merchantId: 999 },
    { actorId: 1 },
    { requestId: "bad" },
    { action: "update", id: 1 },
    { action: "delete", id: 0, expectedDigest: "a".repeat(64) },
  ])("rejects unreviewed/extra fields %j", async patch => {
    await expect(
      caller().write({ ...input(), ...patch } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.write).not.toHaveBeenCalled();
  });
  it.each([
    [new QuotationTemplateLimit(), "PRECONDITION_FAILED"],
    [new QuotationConflict(), "CONFLICT"],
    [new QuotationUnavailable(), "NOT_FOUND"],
    [Error("secret SQL"), "INTERNAL_SERVER_ERROR"],
  ])("maps write errors safely", async (error, code) => {
    m.write.mockRejectedValue(error);
    await expect(caller().write(input())).rejects.toMatchObject({ code });
    await expect(caller().write(input())).rejects.not.toMatchObject({
      message: "secret SQL",
    });
  });
});
describe("template content validation", () => {
  it.each([
    { name: " " },
    { name: "x".repeat(256) },
    { termsText: "x".repeat(5001) },
    { footerText: "x".repeat(5001) },
    { headerImageUrl: "javascript:alert(1)" },
    { headerImageUrl: "data:image/png;base64,a" },
    { headerImageUrl: "file:///c:/local" },
    { headerImageUrl: "https://name:secret@example.test/image" },
    { extra: "discard" },
  ])("rejects malformed content without silently clipping it", patch => {
    expect(templateFields.safeParse({ ...fields, ...patch }).success).toBe(
      false
    );
  });
  it("preserves line breaks and complete terms and accepts a stored HTTP(S) URL", () => {
    expect(
      templateFields.parse({
        ...fields,
        name: "  My template  ",
        headerImageUrl: "https://example.test/logo.png",
        termsText: "\nLine1\nLine2\n",
      })
    ).toMatchObject({ name: "My template", termsText: "\nLine1\nLine2\n" });
  });
  it("requires a digest for changes and rejects fields on deletion", () => {
    expect(
      templateWriteInput.safeParse({
        action: "update",
        requestId: randomUUID(),
        id: 1,
        fields,
      }).success
    ).toBe(false);
    expect(
      templateWriteInput.safeParse({
        action: "delete",
        requestId: randomUUID(),
        id: 1,
        expectedDigest: "a".repeat(64),
        fields,
      }).success
    ).toBe(false);
  });
});
