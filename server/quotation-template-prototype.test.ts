import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  TemplatePreviewModel,
  templatePreviewId,
  templateModes,
} from "../prototypes/tenant-dashboard/src/template-model";
const fields = {
  name: "My demo",
  headerImageUrl: null,
  termsText: "Full\nterms",
  footerText: "Footer",
  isDefault: false,
};
const create = () => ({
  action: "create" as const,
  requestId: randomUUID(),
  fields: { ...fields },
});
describe("template prototype interaction fixture", () => {
  it("has complete detail fields and the real scoped list shape", () => {
    const m = new TemplatePreviewModel();
    expect(m.workspace({})).toMatchObject({
      merchantId: templatePreviewId,
      total: 6,
      selection: { page: 1, search: "" },
      canManage: true,
    });
    expect(m.detail(1)).toMatchObject({
      isDefault: true,
      editable: true,
      truncated: false,
    });
    expect(m.detail(1)?.termsText).toContain("\n");
  });
  it("paginates all legacy fixtures without hiding oversized content", () => {
    const m = new TemplatePreviewModel();
    m.setMode("large");
    const a = m.workspace({}),
      b = m.workspace({ page: 2 });
    expect(a.items).toHaveLength(20);
    expect(b.items).toHaveLength(7);
    expect(new Set([...a.items, ...b.items].map(r => r.id)).size).toBe(27);
    expect(m.detail(27)).toMatchObject({ truncated: true, editable: false });
  });
  it("allows creation from the empty state and displays the result", () => {
    const m = new TemplatePreviewModel();
    m.setMode("empty");
    expect(m.workspace({}).total).toBe(0);
    const r = m.write(create());
    expect(m.workspace({}).total).toBe(1);
    expect(m.detail(r.recordId)?.name).toBe("My demo");
  });
  it("limits new creation at20 without hiding the full legacy list", () => {
    const m = new TemplatePreviewModel();
    m.setMode("limit");
    expect(() => m.write(create())).toThrow("PRECONDITION_FAILED");
    m.setMode("large");
    expect(m.workspace({}).total).toBe(27);
    expect(() => m.write(create())).toThrow("PRECONDITION_FAILED");
  });
  it.each(["create", "update", "delete"])(
    "recovers a lost %s response without executing it again",
    action => {
      const m = new TemplatePreviewModel();
      m.setMode("lost");
      const row = m.detail(2)!,
        v =
          action === "create"
            ? create()
            : {
                action,
                requestId: randomUUID(),
                id: row.id,
                expectedDigest: row.digest,
                ...(action === "update" ? { fields } : {}),
              };
      expect(() => m.write(v)).toThrow("TIMEOUT");
      const r = m.receipt(v.requestId);
      expect(r?.action).toBe(action);
      expect(m.write(v)).toEqual(r);
      expect(m.workspace({}).total).toBe(
        action === "create" ? 7 : action === "delete" ? 5 : 6
      );
    }
  );
  it("does not reuse a request for different contents", () => {
    const m = new TemplatePreviewModel(),
      v = create();
    m.write(v);
    expect(() =>
      m.write({ ...v, fields: { ...fields, name: "Changed" } })
    ).toThrow("CONFLICT");
  });
  it("simulates a competing edit once, then accepts explicit rereview", () => {
    const m = new TemplatePreviewModel(),
      row = m.detail(1)!;
    m.setMode("conflict");
    const v = {
      action: "update",
      requestId: randomUUID(),
      id: 1,
      expectedDigest: row.digest,
      fields,
    };
    expect(() => m.write(v)).toThrow("CONFLICT");
    const changed = m.detail(1)!;
    expect(changed.termsText).toContain("تعديل خارجي");
    expect(changed.digest).not.toBe(row.digest);
    m.write({ ...v, requestId: randomUUID(), expectedDigest: changed.digest });
    expect(m.detail(1)?.name).toBe("My demo");
  });
  it("moves the preferred flag and invalidates the other template's review token", () => {
    const m = new TemplatePreviewModel(),
      old = m.detail(1)!,
      r = m.detail(2)!;
    m.write({
      action: "update",
      requestId: randomUUID(),
      id: 2,
      expectedDigest: r.digest,
      fields: { ...fields, isDefault: true },
    });
    expect(m.workspace({}).items.filter(r => r.isDefault)).toHaveLength(1);
    expect(m.detail(1)?.digest).not.toBe(old.digest);
  });
  it("does not let a clipped preview authorize deletion", () => {
    const m = new TemplatePreviewModel();
    m.setMode("large");
    const row = m.detail(27)!;
    expect(() =>
      m.write({
        action: "delete",
        requestId: randomUUID(),
        id: 27,
        expectedDigest: row.digest,
      })
    ).toThrow("CONFLICT");
  });
  it("treats search text literally and returns an honest empty result", () => {
    const m = new TemplatePreviewModel();
    m.write({ ...create(), fields: { ...fields, name: "Literal %_" } });
    expect(m.workspace({ search: "%_" }).filtered).toBe(1);
    expect(m.workspace({ search: "missing" }).filtered).toBe(0);
  });
  it.each(["error", "forbidden", "viewer"] as const)(
    "applies %s access to writes and receipts",
    mode => {
      const m = new TemplatePreviewModel();
      m.setMode(mode);
      expect(() => m.write(create())).toThrow();
      expect(() => m.receipt(randomUUID())).toThrow();
      if (mode === "viewer") expect(m.workspace({}).canManage).toBe(false);
      else expect(() => m.workspace({})).toThrow();
    }
  );
  it("resets only this model and discards its illustrative receipts", () => {
    const m = new TemplatePreviewModel(),
      v = create();
    m.write(v);
    m.reset();
    expect(m.receipt(v.requestId)).toBeNull();
    expect(m.workspace({}).total).toBe(6);
    expect(Object.keys(templateModes)).toHaveLength(10);
  });
});
