import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./customer-annotations", () => ({
  readCustomerAnnotations: mocks.read,
  writeCustomerAnnotation: mocks.write,
  readCustomerAnnotationReceipt: mocks.receipt,
  CustomerAnnotationMissing: class extends Error {},
  CustomerAnnotationForbidden: class extends Error {},
  CustomerAnnotationConflict: class extends Error {},
}));
import { customerAnnotationsRouter } from "./routers-customer-annotations";
import {
  CustomerAnnotationMissing,
  CustomerAnnotationForbidden,
  CustomerAnnotationConflict,
} from "./customer-annotations";
import { customerAnnotationWrite } from "../shared/customer-annotations";
const caller = () =>
  customerAnnotationsRouter.createCaller({
    user: { id: 74, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
const note = () => ({
  key: "966500000074",
  kind: "note" as const,
  content: "ملاحظة",
  requestId: randomUUID(),
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({
    merchantId: 20,
    role: "manager",
    memberId: 3,
  });
  mocks.read.mockResolvedValue({ key: "966500000074", tags: [], notes: [] });
});
describe("customer annotation boundary", () => {
  it("uses resolved membership and actor identity", async () => {
    const input = note();
    await caller().write(input);
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith(20, 74, input);
  });
  it("allows viewer reads but denies writing and receipt recovery before storage", async () => {
    mocks.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
    expect(await caller().read({ key: "966500000074" })).toMatchObject({
      canManage: false,
    });
    await expect(caller().write(note())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller().receipt({ requestId: randomUUID() })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.receipt).not.toHaveBeenCalled();
  });
  it("denies absent membership before reading", async () => {
    mocks.access.mockResolvedValue(null);
    await expect(caller().read({ key: "x" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([
    ["NOT_FOUND", CustomerAnnotationMissing],
    ["FORBIDDEN", CustomerAnnotationForbidden],
    ["CONFLICT", CustomerAnnotationConflict],
  ] as const)(
    "maps %s without private source details",
    async (code, ErrorClass) => {
      mocks.write.mockRejectedValue(new ErrorClass("private data"));
      await expect(caller().write(note())).rejects.toMatchObject({ code });
    }
  );
  it("hides unexpected SQL errors", async () => {
    mocks.write.mockRejectedValue(Error("secret SQL"));
    await expect(caller().write(note())).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Customer annotations unavailable",
    });
  });
  it("rejects injected tenant and actor IDs before storage", async () => {
    await expect(
      caller().write({ ...note(), merchantId: 999, actorId: 9 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it.each(["", " ", "x".repeat(2001), "text\u0000"])(
    "rejects invalid note %j",
    content =>
      expect(
        customerAnnotationWrite.safeParse({ ...note(), content }).success
      ).toBe(false)
  );
  it.each([
    ["same", "same"],
    [" "],
    Array.from({ length: 21 }, (_, i) => String(i)),
    ["x".repeat(41)],
    ["a\nb"],
  ])("rejects invalid tag set %j", tags =>
    expect(
      customerAnnotationWrite.safeParse({
        key: "966500000074",
        requestId: randomUUID(),
        kind: "tags",
        tags,
        expectedRevision: 0,
      }).success
    ).toBe(false)
  );
  it("accepts multiline text and an explicit empty tag replacement", () => {
    expect(
      customerAnnotationWrite.parse({ ...note(), content: "  first\nsecond  " })
        .kind
    ).toBe("note");
    expect(
      customerAnnotationWrite.parse({
        key: "x",
        kind: "tags",
        requestId: randomUUID(),
        expectedRevision: 0,
        tags: [],
      })
    ).toMatchObject({ tags: [] });
  });
});
