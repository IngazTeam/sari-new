// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import { buildSetupWebsitePreview } from "../client/src/lib/setup-website-draft";
import { clearKnowledgeWorkspace } from "../client/src/lib/knowledge-workspace-cache";
const preview = vi.hoisted(() => vi.fn());
vi.mock("@/lib/trpc", () => ({
  trpc: {
    analysis: {
      previewAnalysis: {
        useMutation: () => ({ mutateAsync: preview, isPending: false }),
      },
    },
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars: Record<string, unknown> = {}) =>
      String(
        key.split(".").reduce((value: any, part) => value?.[part], ar) || key
      ).replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? "")),
  }),
}));
import WebsiteStep from "../client/src/pages/setup-wizard/WebsiteStep";
const source = "https://example.test";
const id = "38c80c9e-8d9b-49b8-bd88-8b7449647a71";
const response = (
  products: any[] = [
    {
      name: "مقترح",
      price: 12.34,
      currency: "USD",
      imageUrl: "https://example.test/image.png",
    },
  ]
) => ({
  success: true,
  websiteUrl: source,
  products,
  companyInfo: { name: "اسم مقترح" },
  contactInfo: { phones: ["+966500000001"] },
  pages: [],
  faqs: [],
});
let root: Root,
  container: HTMLDivElement,
  current: any,
  update: ReturnType<typeof vi.fn>,
  next: ReturnType<typeof vi.fn>;
const button = (name: string) =>
  Array.from(container.querySelectorAll("button")).find(
    n => n.textContent?.trim() === name
  )!;
const click = async (name: string) => act(async () => button(name).click());
const render = async (
  data: any = {
    websiteUrl: source,
    products: [{ name: "منتج موجود", price: "5", currency: "SAR" }],
    services: [{ name: "خدمة", price: "2" }],
  }
) => {
  function Harness() {
    const [draft, setDraft] = useState(data);
    current = draft;
    return React.createElement(WebsiteStep, {
      wizardData: draft,
      updateWizardData: (patch: any) => {
        update(patch);
        setDraft((old: any) => ({ ...old, ...patch }));
      },
      goToNextStep: next,
      skipStep: vi.fn(),
    });
  }
  await act(async () => root.render(React.createElement(Harness)));
};
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  preview.mockReset().mockResolvedValue(response());
  update = vi.fn();
  next = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("website setup proposal review", () => {
  it("does not replace products on extraction and keeps uncertain prices raw after explicit addition", async () => {
    preview.mockResolvedValue(
      response([
        { name: "Missing", price: null, currency: "SAR" },
        { name: "Ambiguous", price: 0, currency: "SAR" },
        { name: "", price: 10, currency: "EUR" },
        { name: "Valid", price: 12.34, currency: "USD" },
      ])
    );
    await render();
    await click(ar.websiteStep.auto_2);
    expect(preview).toHaveBeenCalledWith({ websiteUrl: source });
    expect(current.products).toHaveLength(1);
    expect(update.mock.calls[0][0].products).toBeUndefined();
    expect(
      container.textContent?.split(ar.setupCatalogUx.extractedPriceReview)
    ).toHaveLength(4);
    await click(ar.setupWebsiteUx.addDraft);
    expect(
      current.products.map((r: any) => [r.name, r.price, r.currency])
    ).toEqual([
      ["منتج موجود", "5", "SAR"],
      ["Missing", "", "SAR"],
      ["Ambiguous", "", "SAR"],
      ["", "10", "EUR"],
      ["Valid", "12.34", "USD"],
    ]);
    expect(current.services).toEqual([{ name: "خدمة", price: "2" }]);
    expect(next).toHaveBeenCalledOnce();
  });
  it("keeps every row beyond 100 available for selection and pagination", async () => {
    preview.mockResolvedValue(
      response(
        Array.from({ length: 101 }, (_, i) => ({
          name: `منتج ${i + 1}`,
          price: 3,
          currency: "SAR",
        }))
      )
    );
    await render();
    await click(ar.websiteStep.auto_2);
    expect(current.websitePreview.products).toHaveLength(101);
    expect(container.querySelectorAll("ol input:checked")).toHaveLength(0);
    for (let i = 0; i < 5; i++) await click(ar.basicInfoStep.auto_3);
    expect(container.textContent).toContain("منتج 101");
    await click(ar.setupWebsiteUx.selectPage);
    await click(ar.setupWebsiteUx.addDraft);
    expect(current.products).toHaveLength(2);
    expect(current.products[1].name).toBe("منتج 101");
  });
  it("applies only selected profile fields and does not load external product images", async () => {
    await render({
      websiteUrl: source,
      businessName: "الاسم الحالي",
      phone: "500000099",
      products: [],
    });
    await click(ar.websiteStep.auto_2);
    const name = Array.from(container.querySelectorAll(".ms-website-profile"))
      .find(n => n.textContent?.includes(ar.setupWorkspace.nameLabel))!
      .querySelector("input")!;
    await act(async () => name.click());
    await click(ar.setupWebsiteUx.addDraft);
    expect(current.businessName).toBe("اسم مقترح");
    expect(current.phone).toBe("500000099");
    expect(container.querySelector("img")).toBeNull();
  });
  it("keeps invalid long profile proposals visible but unselectable without truncating", async () => {
    const raw = response();
    raw.companyInfo.name = "ش".repeat(256);
    preview.mockResolvedValue(raw);
    await render();
    await click(ar.websiteStep.auto_2);
    expect(container.textContent).toContain("ش".repeat(256));
    expect(
      (container.querySelector(".ms-website-profile input") as HTMLInputElement)
        .disabled
    ).toBe(true);
  });
  it("restores a proposal and selected products without another extraction request", async () => {
    const proposal = buildSetupWebsitePreview(response(), source, id);
    await render({
      websiteUrl: source,
      websitePreview: proposal,
      websitePreviewChoices: {
        previewId: id,
        catalog: "skip",
        productIds: [],
        profile: [],
      },
      products: [{ name: "Keep", price: "9" }],
    });
    expect(preview).not.toHaveBeenCalled();
    await click(ar.setupWebsiteUx.addDraft);
    expect(current.products).toEqual([{ name: "Keep", price: "9" }]);
  });
  it("prevents reapplying an already added preview", async () => {
    const proposal = buildSetupWebsitePreview(response(), source, id);
    await render({
      websiteUrl: source,
      websitePreview: proposal,
      websitePreviewAppliedId: id,
      products: [],
    });
    await click(ar.setupWebsiteUx.addDraft);
    expect(update).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(container.textContent).toContain(ar.setupWebsiteUx.applied);
  });
  it("does not leak server errors or discard a previous successful preview", async () => {
    await render();
    await click(ar.websiteStep.auto_2);
    const saved = current.websitePreview;
    preview.mockRejectedValue(new Error("SELECT private_secret FROM users"));
    await click(ar.websiteStep.auto_2);
    expect(current.websitePreview).toEqual(saved);
    expect(container.textContent).not.toContain("private_secret");
    expect(container.textContent).toContain(ar.setupWebsiteUx.failed);
  });
  it.each(["javascript:alert(1)", "https://name:secret@example.test"])(
    "rejects unsafe URL %s before requesting",
    async url => {
      await render({ websiteUrl: url });
      await click(ar.websiteStep.auto_2);
      expect(preview).not.toHaveBeenCalled();
      expect(container.textContent).toContain(ar.setupWebsiteUx.urlInvalid);
    }
  );
  it("disables adding a preview when the entered source differs", async () => {
    const proposal = buildSetupWebsitePreview(response(), source, id);
    await render({
      websiteInputUrl: "https://another.test",
      websitePreview: proposal,
    });
    await click(ar.setupWebsiteUx.addDraft);
    expect(update).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(container.textContent).toContain(ar.setupWebsiteUx.sourceChanged);
  });
  it("ignores a response arriving after leaving the screen", async () => {
    let resolve!: (v: any) => void;
    preview.mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        })
    );
    await render();
    await click(ar.websiteStep.auto_2);
    await act(async () => root.render(null));
    await act(async () => resolve(response()));
    expect(update).not.toHaveBeenCalled();
  });
  it("ignores a response from a previous login session", async () => {
    let resolve!: (v: any) => void;
    preview.mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        })
    );
    await render();
    await click(ar.websiteStep.auto_2);
    clearKnowledgeWorkspace();
    await act(async () => resolve(response()));
    expect(update).not.toHaveBeenCalled();
  });
  it("shows unreadable saved preview without replacing it or crashing", async () => {
    await render({
      websiteUrl: source,
      websitePreview: { version: 1, products: "broken" },
    });
    expect(container.textContent).toContain(ar.setupWebsiteUx.unreadable);
    expect(update).not.toHaveBeenCalled();
  });
});
