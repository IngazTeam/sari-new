import { describe, expect, it } from "vitest";
import {
  buildSetupWebsitePreview,
  setupWebsitePatch,
  setupWebsiteUrl,
  validSetupWebsiteProfile,
  readSetupWebsiteChoices,
} from "../client/src/lib/setup-website-draft";
const id = "38c80c9e-8d9b-49b8-bd88-8b7449647a71",
  source = "https://example.test";
const raw = () => ({
  success: true,
  websiteUrl: source,
  products: [
    { name: "New", price: 0, currency: "EUR", description: "  exact text  " },
  ],
  companyInfo: { name: "New name", description: "long".repeat(3000) },
  contactInfo: {
    phones: [
      "+966500000001",
      "+966500000002",
      "+966500000003",
      "+966500000004",
    ],
  },
  crawlStats: { totalPages: 45 },
  faqs: Array.from({ length: 105 }, () => ({})),
});
const preview = () => buildSetupWebsitePreview(raw(), source, id);
describe("website setup draft choices", () => {
  it("preserves all names, raw prices, contacts, descriptions and counts without silent clipping", () => {
    const p = preview();
    expect(p.products[0]).toMatchObject({
      price: "",
      currency: "EUR",
      websiteOriginalPrice: "0",
      description: "  exact text  ",
    });
    expect(p.profile.description).toHaveLength(12000);
    expect(p.contact.phones).toHaveLength(4);
    expect(p.pageCount).toBe(45);
    expect(p.faqCount).toBe(105);
    expect(validSetupWebsiteProfile("description", p.profile.description)).toBe(
      false
    );
  });
  it("merges incomplete selected rows while keeping existing products and unrelated services", () => {
    const p = preview(),
      old = { name: "Old", price: "" };
    const patch = setupWebsitePatch(
      { products: [old], services: [{ name: "Service" }] },
      p,
      { catalog: "merge", productIds: [p.products[0].id], profile: [] }
    );
    expect(patch.products).toEqual([old, p.products[0]]);
    expect(patch.services).toBeUndefined();
    expect(patch.businessName).toBeUndefined();
    expect(patch.phone).toBeUndefined();
  });
  it("replaces only products after an explicit replacement choice", () => {
    const p = preview(),
      patch = setupWebsitePatch({ products: [{ name: "Old" }] }, p, {
        catalog: "replace",
        productIds: [],
        profile: [],
      });
    expect(patch.products).toEqual([]);
  });
  it("keeps existing edits to an already imported ID during merge", () => {
    const p = preview(),
      old = { ...p.products[0], price: "7" };
    expect(
      setupWebsitePatch({ products: [old] }, p, {
        catalog: "merge",
        productIds: [old.id],
        profile: [],
      }).products
    ).toEqual([old]);
  });
  it("skips invalid catalog data without replacing it", () => {
    expect(
      setupWebsitePatch({ products: "original" }, preview(), {
        catalog: "skip",
        productIds: [],
        profile: [],
      }).products
    ).toBeUndefined();
  });
  it("rejects merge of an invalid current list", () => {
    expect(() =>
      setupWebsitePatch({ products: "original" }, preview(), {
        catalog: "merge",
        productIds: [],
        profile: [],
      })
    ).toThrow("SETUP_WEBSITE_DRAFT_INVALID");
  });
  it("rejects over 100 products instead of slicing them", () => {
    const p = preview();
    expect(() =>
      setupWebsitePatch(
        { products: Array.from({ length: 100 }, () => ({ name: "Old" })) },
        p,
        { catalog: "merge", productIds: [p.products[0].id], profile: [] }
      )
    ).toThrow("SETUP_WEBSITE_LIMIT");
  });
  it("preserves 101 proposals and defaults to no selected products", () => {
    const value = raw();
    value.products = Array.from({ length: 101 }, () => value.products[0]);
    const p = buildSetupWebsitePreview(value, source, id);
    expect(p.products).toHaveLength(101);
    expect(readSetupWebsiteChoices(null, p).productIds).toEqual([]);
  });
  it("only patches whitelisted valid profile fields", () => {
    const p = preview();
    expect(
      setupWebsitePatch({}, p, {
        catalog: "skip",
        productIds: [],
        profile: ["businessName"],
      }).businessName
    ).toBe("New name");
    expect(() =>
      setupWebsitePatch({}, p, {
        catalog: "skip",
        productIds: [],
        profile: ["description"],
      })
    ).toThrow("SETUP_WEBSITE_PROFILE_INVALID");
    expect(() =>
      setupWebsitePatch({}, p, {
        catalog: "skip",
        productIds: [],
        profile: ["autoReplyEnabled" as any],
      })
    ).toThrow("SETUP_WEBSITE_PROFILE_INVALID");
  });
  it("rejects selected IDs not in the current preview and duplicate choices", () => {
    const p = preview();
    for (const productIds of [["other"], [p.products[0].id, p.products[0].id]])
      expect(() =>
        setupWebsitePatch({}, p, { catalog: "merge", productIds, profile: [] })
      ).toThrow("SETUP_WEBSITE_INVALID_CHOICE");
  });
  it("bounds the combined draft before applying without silently dropping a preview", () => {
    const p = preview();
    expect(() =>
      setupWebsitePatch({ notes: "ش".repeat(500_000) }, p, {
        catalog: "skip",
        productIds: [],
        profile: [],
      })
    ).toThrow("SETUP_WEBSITE_DRAFT_TOO_LARGE");
  });
  it("does not reuse choices from another extraction", () => {
    const p = preview();
    expect(
      readSetupWebsiteChoices(
        {
          previewId: "another",
          catalog: "replace",
          productIds: [],
          profile: ["phone"],
        },
        p
      )
    ).toEqual({
      catalog: "merge",
      productIds: [p.products[0].id],
      profile: [],
    });
  });
  it.each([
    "javascript:alert(1)",
    "https://u:p@example.test",
    "file:///tmp/page",
    "",
  ])("rejects invalid source %s", url =>
    expect(() => setupWebsiteUrl(url)).toThrow()
  );
  it("normalizes a bare website without changing a valid source", () =>
    expect(setupWebsiteUrl("example.test")).toBe(source));
  it("rejects mismatched result provenance and failed extraction", () => {
    expect(() =>
      buildSetupWebsitePreview(
        { ...raw(), websiteUrl: "https://other.test" },
        source,
        id
      )
    ).toThrow("SETUP_WEBSITE_SOURCE_CHANGED");
    expect(() =>
      buildSetupWebsitePreview({ ...raw(), success: false }, source, id)
    ).toThrow("SETUP_WEBSITE_INVALID");
  });
});
