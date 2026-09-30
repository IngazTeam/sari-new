import { describe, it, expect } from "vitest";
import {
  ProductPreviewStore,
  productPreviewId,
} from "../prototypes/tenant-dashboard/src/product-model";
import {
  ProductDetailPreviewStore,
  detailModes,
} from "../prototypes/tenant-dashboard/src/product-detail-model";
import {
  productDetailsSnapshot,
  productDetailReceipt,
} from "../shared/product-details";
const uuid = (n = 1) =>
  `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
function setup() {
  const products = new ProductPreviewStore(),
    details = new ProductDetailPreviewStore(products);
  products.detailSummary = details.summary;
  products.removeDetails = details.remove;
  return { products, details };
}
function request(
  s: ProductDetailPreviewStore,
  productId = 27,
  patch: Record<string, unknown> = {}
) {
  const input = {
    productId,
    kind: "option_create",
    requestId: uuid(),
    reviewed: true,
    expectedDigest: s.read({ productId }).digest,
    fields: {
      name: "اللون",
      nameEn: null,
      values: ["أحمر", "أزرق"],
      sortOrder: 0,
    },
    ...patch,
  };
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}
const variantFields = {
  name: "نسخة جديدة",
  sku: null,
  price: "20.25",
  compareAtPrice: null,
  costPrice: null,
  stock: 7,
  barcode: null,
  weight: null,
  imageUrl: null,
  selections: [],
  isActive: 1,
  sortOrder: 0,
};
describe("product details interactive preview", () => {
  it.each(Object.keys(detailModes) as (keyof typeof detailModes)[])(
    "models %s with the shared contract",
    mode => {
      const { details } = setup();
      details.setMode(mode);
      if (["forbidden", "session", "error", "missing"].includes(mode))
        expect(() => details.read({ productId: 27 })).toThrow();
      else
        expect(
          productDetailsSnapshot.safeParse(details.read({ productId: 27 }))
            .success
        ).toBe(true);
    }
  );
  it("keeps products independent and updates flags, review counts and editor digests", async () => {
    const { products, details } = setup(),
      before = products.read({ id: 27 }).digest;
    const o = await details.write(request(details));
    expect(details.read({ productId: 27 }).options).toHaveLength(1);
    expect(details.read({ productId: 26 }).options).toHaveLength(0);
    const input = request(details, 27, {
        kind: "variant_create",
        requestId: uuid(2),
        fields: {
          ...variantFields,
          selections: [{ optionId: o.detailId, value: "أحمر" }],
        },
      }),
      r = await details.write(input);
    expect(productDetailReceipt.safeParse(r).success).toBe(true);
    expect(products.read({ id: 27 }).product.hasVariants).toBe(1);
    expect(products.read({ id: 27 }).digest).not.toBe(before);
    expect(products.deleteReview({ ids: [27] }).items[0]).toMatchObject({
      options: 1,
      variants: 1,
    });
    expect(details.read({ productId: 1 }).variants).toHaveLength(2);
    const middle = products.read({ id: 27 }).digest;
    await details.write(
      request(details, 27, {
        kind: "variant_update",
        id: r.detailId,
        requestId: uuid(3),
        fields: { name: "تعديل الاسم" },
      })
    );
    expect(products.read({ id: 27 }).digest).not.toBe(middle);
    await details.write(
      request(details, 27, {
        kind: "variant_delete",
        id: r.detailId,
        requestId: uuid(4),
        fields: undefined,
      })
    );
    expect(products.read({ id: 27 }).product.hasVariants).toBe(0);
  });
  it.each(["uncertain", "receiptError", "wrongReceipt"] as const)(
    "recovers %s and replays the same receipt",
    async mode => {
      const { details } = setup();
      details.setMode(mode);
      const input = request(details);
      if (mode === "wrongReceipt")
        expect((await details.write(input)).actorId).toBe(1);
      else await expect(details.write(input)).rejects.toThrow();
      if (mode === "receiptError")
        await expect(details.receipt(uuid())).rejects.toThrow();
      details.setMode("data");
      const receipt = await details.receipt(uuid());
      expect(receipt?.actorId).toBe(productPreviewId);
      await expect(details.write(input)).resolves.toEqual(receipt);
      expect(details.read({ productId: 27 }).options).toHaveLength(1);
      await expect(
        details.write({
          ...input,
          fields: { ...(input.fields as object), name: "Other" },
        })
      ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    }
  );
  it.each([
    "viewer",
    "source",
    "wrongTenant",
    "saveError",
    "notCommitted",
    "limit",
    "offline",
    "loading",
  ] as const)("blocks writes for %s", async mode => {
    const { details } = setup();
    details.setMode(mode);
    const before = details.read({ productId: 27 });
    await expect(details.write(request(details))).rejects.toThrow();
    expect(details.read({ productId: 27 })).toEqual(before);
    if (["viewer", "wrongTenant"].includes(mode))
      await expect(details.receipt(uuid())).rejects.toMatchObject({
        data: { code: "FORBIDDEN" },
      });
    else await expect(details.receipt(uuid())).resolves.toBeNull();
  });
  it("rejects stale parent and detail reviews", async () => {
    const { products, details } = setup();
    const first = request(details);
    details.conflict();
    await expect(details.write(first)).rejects.toMatchObject({
      data: { code: "CONFLICT" },
    });
    const second = request(details);
    products.conflict();
    await expect(details.write(second)).rejects.toMatchObject({
      data: { code: "CONFLICT" },
    });
  });
  it("preserves legacy data for independent edits and materializes explicit repairs", async () => {
    const { details } = setup();
    details.setMode("legacy");
    let snapshot = details.read({ productId: 27 });
    const id = snapshot.variants[0].id;
    await details.write(
      request(details, 27, {
        kind: "variant_update",
        id,
        fields: { name: "Rename" },
      })
    );
    snapshot = details.read({ productId: 27 });
    expect(snapshot.variants[0]).toMatchObject({
      name: "Rename",
      priceUnit: "unverified",
      price: 1234,
      costPrice: 700,
      stock: null,
    });
    await details.write(
      request(details, 27, {
        kind: "variant_update",
        id,
        requestId: uuid(2),
        fields: { price: "20.25" },
      })
    );
    expect(details.read({ productId: 27 }).variants[0]).toMatchObject({
      priceUnit: "minor",
      price: 2025,
      costPrice: null,
      compareAtPrice: null,
    });
    details.setMode("broken");
    await details.write(
      request(details, 27, {
        kind: "variant_update",
        id,
        requestId: uuid(3),
        fields: { name: "Rename again" },
      })
    );
    expect(details.read({ productId: 27 }).variants[0].options).toBe(
      '{"old-size":"value"}'
    );
  });
  it("prevents deleting used option values, but allows unrelated option edits", async () => {
    const { details } = setup(),
      snapshot = details.read({ productId: 1 }),
      id = snapshot.options[0].id;
    await expect(
      details.write(
        request(details, 1, { kind: "option_delete", id, fields: undefined })
      )
    ).rejects.toMatchObject({ data: { code: "BAD_REQUEST" } });
    await details.write(
      request(details, 1, {
        kind: "option_update",
        id,
        fields: { nameEn: "Size" },
      })
    );
    expect(details.read({ productId: 1 }).options[0].nameEn).toBe("Size");
  });
  it("keeps receipts recoverable after product deletion and resets explicitly", async () => {
    const { products, details } = setup(),
      input = request(details),
      receipt = await details.write(input),
      review = products.deleteReview({ ids: [27] });
    await products.deleteWrite({
      requestId: uuid(4),
      ids: [27],
      expectedDigest: review.digest,
      reviewed: true,
    });
    expect(() => details.read({ productId: 27 })).toThrow();
    await expect(details.receipt(uuid())).resolves.toEqual(receipt);
    await expect(details.write(input)).resolves.toEqual(receipt);
    details.reset();
    products.reset();
    await expect(details.receipt(uuid())).resolves.toBeNull();
    expect(details.read({ productId: 27 }).options).toHaveLength(0);
  });
  it("honours product permission and source state even with a normal detail scenario", async () => {
    const { products, details } = setup(),
      input = request(details);
    products.setMode("viewer");
    expect(details.read({ productId: 27 }).canManage).toBe(false);
    await expect(details.write(input)).rejects.toMatchObject({
      data: { code: "FORBIDDEN" },
    });
    products.setMode("source");
    expect(details.read({ productId: 27 }).locked).toBe(true);
    await expect(details.write(input)).rejects.toMatchObject({
      data: { code: "PRECONDITION_FAILED" },
    });
  });
});
