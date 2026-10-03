import { expect, it } from "vitest";
import {
  competitorNavigation,
  scopedCompetitors,
  scopedCompetitorDetail,
  competitorFields,
} from "../client/src/lib/competitor-workspace";
import { competitorViewFixture } from "./tests/helpers/competitor-view-fixture";
it("normalizes navigation while preserving a literal search", () => {
  expect(
    competitorNavigation("?q=%25_%20&state=bad&page=NaN&sort=bad")
  ).toEqual({ query: "%_", state: "all", page: 1, sort: "newest" });
});
it("accepts validated scoped source data", () => {
  const f = competitorViewFixture();
  expect(scopedCompetitors(f.workspace, 7, 20, f.workspace.selection)).toEqual(
    f.workspace
  );
  expect(scopedCompetitorDetail(f.detail, 7, 20, 8, 1)).toEqual(f.detail);
});
it.each([
  { actorId: 9 },
  { merchantId: 30 },
  { matched: 26 },
  { pages: 0 },
  { rows: [] },
  { selection: { query: "other", state: "all", page: 1, sort: "newest" } },
])("rejects mismatched workspace %j", patch => {
  const f = competitorViewFixture();
  expect(
    scopedCompetitors(
      { ...f.workspace, ...patch },
      7,
      20,
      f.workspace.selection
    )
  ).toBeNull();
});
it.each([
  { actorId: 9 },
  { merchantId: 30 },
  { revision: "bad" },
  { productPages: 2 },
  { products: [] },
  {
    pricing: {
      pricedCount: 0,
      unverifiedCount: 0,
      groups: [],
      evidence: "extracted_not_current",
    },
  },
])("rejects mismatched detail %j", patch => {
  const f = competitorViewFixture();
  expect(
    scopedCompetitorDetail({ ...f.detail, ...patch }, 7, 20, 8, 1)
  ).toBeNull();
});
it.each(["javascript:alert(1)", "https://user:password@example.test"])(
  "rejects unsafe URLs in a response",
  url => {
    const f = competitorViewFixture();
    expect(
      scopedCompetitorDetail(
        { ...f.detail, report: { ...f.detail.report, url } },
        7,
        20,
        8,
        1
      )
    ).toBeNull();
  }
);
it.each([
  "file:///private",
  "http://example.test",
  "https://u:p@example.test",
  "broken",
])("validates URL fields %s", url =>
  expect(competitorFields("Name", url)).toEqual({ name: false, url: true })
);
it("validates a trimmed name and source", () => {
  expect(competitorFields("  ", "https://example.test")).toEqual({
    name: true,
    url: false,
  });
  expect(competitorFields(" Name ", " https://example.test ")).toEqual({
    name: false,
    url: false,
  });
});
