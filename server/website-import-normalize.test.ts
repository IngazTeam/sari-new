import { it, expect } from "vitest";
import { normalizeImportProposal } from "./knowledge/website-import";

const base = {
  websiteUrl: "https://example.test",
  platform: "custom",
  productsAction: "skip",
  pagesAction: "skip",
  faqsAction: "skip",
  products: [],
  pages: [],
  faqs: [],
};
it.each([
  {
    products: [
      { name: "Item", price: 0 },
      { name: " item ", price: 1 },
    ],
  },
  {
    pages: [
      { pageType: "other", title: "First", url: "https://example.test/about" },
      { pageType: "other", title: "Second", url: "https://example.test/about" },
    ],
  },
  {
    faqs: [
      { question: "Return Policy?", answer: "First" },
      { question: "  return   policy? ", answer: "Different" },
    ],
  },
])(
  "rejects conflicting duplicate identities before a preview can be saved: %j",
  group => {
    expect(() => normalizeImportProposal({ ...base, ...group })).toThrow(
      /IMPORT_DUPLICATE_/
    );
  }
);
it("keeps zero prices and separate page/question identities", () => {
  expect(
    normalizeImportProposal({ ...base, products: [{ name: "Gift", price: 0 }] })
      .products[0].price
  ).toBe(0);
});
