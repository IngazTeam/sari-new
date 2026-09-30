import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const read = (path: string) => readFileSync(path, "utf8");
const root = "docs/audits/tenant-features-2026-09-30";
const inventory = JSON.parse(read(`${root}/inventory.json`));
const coverage = JSON.parse(read(`${root}/coverage.json`));
describe("tenant feature inventory completeness boundaries", () => {
  it("accounts for every literal tenant route in the current application exactly once", () => {
    const source = ts.createSourceFile(
      "App.tsx",
      read("client/src/App.tsx"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const routes: string[] = [];
    function walk(n: ts.Node) {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        if (n.tagName.getText(source) === "Route") {
          const attr = n.attributes.properties.find(
            p => ts.isJsxAttribute(p) && p.name.getText(source) === "path"
          ) as ts.JsxAttribute | undefined;
          if (
            attr?.initializer &&
            ts.isStringLiteral(attr.initializer) &&
            attr.initializer.text.startsWith("/merchant")
          )
            routes.push(attr.initializer.text);
        }
      }
      ts.forEachChild(n, walk);
    }
    walk(source);
    expect(inventory.routes.map((r: any) => r.route).sort()).toEqual(
      routes.sort()
    );
    expect(coverage.routes.map((r: any) => r.route).sort()).toEqual(
      routes.sort()
    );
    expect(new Set(routes).size).toBe(routes.length);
    for (const route of inventory.routes)
      if (!route.redirect)
        expect(route.files.length, route.route).toBeGreaterThan(0);
  });
  it("includes feature components, shared shell, conditional controls and dynamic choice lists", () => {
    const files = inventory.files.map((f: any) => f.file);
    for (const file of [
      "client/src/components/DiscountPolicySettings.tsx",
      "client/src/components/CheckoutMarginPolicySettings.tsx",
      "client/src/components/merchant/MerchantShell.tsx",
    ])
      expect(files).toContain(file);
    expect(
      inventory.controls.filter((c: any) => c.conditions.length).length
    ).toBeGreaterThan(500);
    expect(
      inventory.files.reduce((n: number, f: any) => n + f.choices.length, 0)
    ).toBeGreaterThan(40);
    for (const r of inventory.routes)
      for (const id of r.controls)
        expect(inventory.controls.some((c: any) => c.id === id)).toBe(true);
  });
  it("detects source drift rather than silently calling an old inventory complete", () => {
    for (const item of inventory.files) {
      expect(existsSync(item.file)).toBe(true);
      expect(
        createHash("sha256")
          .update(read(item.file).replace(/\r\n/g, "\n"))
          .digest("hex")
          .slice(0, 12),
        `Regenerate audit for ${item.file}`
      ).toBe(item.hash);
    }
    expect(inventory.invalidLinks).toEqual([]);
    expect(inventory.orphanDetails).toHaveLength(inventory.orphanFiles.length);
  });
  it("includes recovery reads, local controllers and multipart knowledge upload", () => {
    const trial = inventory.routes.find(
      (r: any) => r.route === "/merchant/test-sari"
    );
    expect(trial.queries).toEqual(
      expect.arrayContaining([
        "testSari.feedback",
        "testSari.transcript",
        "testSari.listSessions",
      ])
    );
    expect(trial.files).toContain("client/src/lib/test-sari-session.ts");
    const upload = inventory.files.find(
      (f: any) => f.file === "client/src/components/KnowledgeDocumentUpload.tsx"
    );
    expect(upload.browserRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "/api/knowledge-docs/upload",
          method: "POST",
        }),
      ])
    );
    expect(
      inventory.controls.filter(
        (c: any) =>
          c.file === "client/src/pages/merchant/SalesPipeline.tsx" &&
          c.role === "button"
      ).length
    ).toBeGreaterThanOrEqual(4);
  });
  it("does not equate route coverage with completed feature designs or successful backend tests", () => {
    expect(
      coverage.routes.find((r: any) => r.route === "/merchant/sari-brain")
        .design
    ).toBe("تفصيلي جزئي");
    expect(
      coverage.routes.find((r: any) => r.route === "/merchant/orders").gaps
        .length
    ).toBeGreaterThan(0);
    for (const c of inventory.controls)
      expect(c.review).toBe("source-inventoried");
    for (const r of coverage.routes) expect(r.acceptancePlan).toBeTruthy();
  });
  it("keeps every new semantic string present in Arabic and English", () => {
    const ar = JSON.parse(read("client/src/locales/ar.json")),
      en = JSON.parse(read("client/src/locales/en.json"));
    const flatten = (value: any, prefix = ""): string[] =>
      Object.entries(value).flatMap(([k, v]) =>
        typeof v === "string"
          ? (expect(v.trim()).not.toBe(""), [`${prefix}${k}`])
          : flatten(v, `${prefix}${k}.`)
      );
    for (const section of [
      "virtualTeamUx",
      "assistantSectionsUx",
      "knowledgePreviewUx",
    ])
      expect(flatten(ar[section]).sort()).toEqual(flatten(en[section]).sort());
  });
});
