import { describe, expect, it } from "vitest";
import ts from "typescript";
import {
  browserRequests,
  imperativeReads,
  routeComponentImports,
  runtimeModuleReferences,
} from "../scripts/testing/tenant-source-analysis.mjs";
const parse = (source: string) =>
  ts.createSourceFile(
    "fixture.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

describe("tenant source audit blind spots", () => {
  it('follows runtime barrel exports, renamed defaults, namespace exports and literal lazy imports', () => {
    expect(runtimeModuleReferences(parse(`
      import { type Shape, Page } from './Mixed'; import './effects';
      export { Page as default } from './Actual'; export * from './More';
      export * as widgets from './Widgets'; const Lazy=lazy(()=>import('./Lazy'));
      export { Page } from './Actual';
    `))).toEqual(['./Mixed','./effects','./Actual','./More','./Widgets','./Lazy']);
  });
  it('excludes type-only module edges, local exports and unproved dynamic module names', () => {
    expect(runtimeModuleReferences(parse(`
      import type P from './Type'; import { type Shape } from './OnlyTypes';
      export type { P } from './Types'; export { type P } from './Again';
      export type * from './Other'; export { local }; import(variable);
    `))).toEqual([]);
  });
  it("resolves direct utilities, ref aliases and nested operation holders", () => {
    const calls = imperativeReads(
      parse(`const utils=trpc.useUtils(); const api=useRef(utils); const operations=useRef({utils});
      utils.knowledge.read.fetch({}); api.current.testSari.listSessions.fetch({}); operations.current.utils.testSari.transcript.fetch({});`)
    );
    expect(calls.map((c: any) => c.procedure)).toEqual([
      "knowledge.read",
      "testSari.listSessions",
      "testSari.transcript",
    ]);
  });
  it("leaves unproved fetch sources visible without inventing a tRPC procedure", () => {
    const calls = imperativeReads(
      parse(
        `client.external.report.fetch({}); const api=useRef({}); api.current.read.fetch({});`
      )
    );
    expect(calls).toHaveLength(2);
    expect(
      calls.every(
        (c: any) =>
          c.procedure === null && c.provenance === "unresolved-static-candidate"
      )
    ).toBe(true);
  });
  it("handles cyclic aliases without hiding unresolved calls or recursing forever", () => {
    const calls = imperativeReads(
      parse(`const a=b; const b=a; a.foo.bar.fetch({});`)
    );
    expect(calls[0].procedure).toBeNull();
  });
  it("discovers multiline lazy imports, direct imports and renamed imports", () => {
    const imports = routeComponentImports(
      parse(`import Direct from './Direct'; import { Page as Renamed } from './More';
      const Lazy = lazyLoad( () =>
        import('./Lazy')
      );`),
      (p: string) => p + ".tsx"
    );
    expect(imports).toEqual({
      Direct: "./Direct.tsx",
      Renamed: "./More.tsx",
      Lazy: "./Lazy.tsx",
    });
  });
  it("does not treat type-only or nonliteral imports as resolved components", () => {
    const imports = routeComponentImports(
      parse(
        `import type Page from './Type'; const Dynamic=lazy(()=>import(name));`
      ),
      (p: string) => p
    );
    expect(imports).toEqual({});
  });
  it("accounts for multipart uploads and unresolved fetch targets without reading payloads", () => {
    const requests = browserRequests(
      parse(
        `fetch('/api/knowledge-docs/upload',{method:'POST',body:secret}); window.fetch(target);`
      )
    );
    expect(requests).toEqual([
      expect.objectContaining({
        target: "/api/knowledge-docs/upload",
        method: "POST",
      }),
      expect.objectContaining({
        target: null,
        targetExpression: "target",
        method: "GET",
      }),
    ]);
    expect(JSON.stringify(requests)).not.toContain("secret");
  });
});
