// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import { setupFieldsFromDraft } from "../client/src/lib/setup-completion-workspace";
const preview = vi.hoisted(() => vi.fn());
vi.mock("@/components/PreviewChat", () => ({
  default: (props: any) => {
    preview(props);
    return React.createElement("div", { "data-preview": true }, "preview");
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
import BasicInfoStep from "../client/src/pages/setup-wizard/BasicInfoStep";
import PersonalityStep from "../client/src/pages/setup-wizard/PersonalityStep";
import LanguageStep from "../client/src/pages/setup-wizard/LanguageStep";
import WorkingHoursFields from "../client/src/pages/setup-wizard/WorkingHoursFields";
import CompleteStep from "../client/src/pages/setup-wizard/CompleteStep";
let container: HTMLDivElement,
  root: Root,
  current: any,
  update: ReturnType<typeof vi.fn>,
  next: ReturnType<typeof vi.fn>;
const valid = () => ({
  businessType: "store",
  businessName: "متجر الاختبار",
  phone: "+966500000081",
  botTone: "friendly",
  botLanguage: "ar",
  welcomeMessage: "مرحبًا",
  products: [],
  services: [],
});
const button = (name: string) =>
  Array.from(container.querySelectorAll("button")).find(
    n => n.textContent?.trim() === name
  )!;
const render = async (Component: any, data: any) => {
  function Harness() {
    const [draft, setDraft] = useState(data);
    current = draft;
    return React.createElement(Component, {
      wizardData: draft,
      updateWizardData: (patch: any) => {
        update(patch);
        setDraft((old: any) => ({ ...old, ...patch }));
      },
      goToNextStep: next,
      goToStep: next,
      completeSetup: next,
      isLoading: false,
      compact: true,
      value: draft.workingHours,
      onChange: (hours: any) => {
        update(hours);
        setDraft((old: any) => ({ ...old, workingHours: hours }));
      },
    });
  }
  await act(async () => root.render(React.createElement(Harness)));
};
const change = async (selector: string, value: string) =>
  act(async () => {
    const node = container.querySelector(selector) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement;
    const proto =
      node.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : node.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(node, value);
    node.dispatchEvent(
      new Event(node.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      })
    );
  });
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
    fn();
    return 1;
  });
  preview.mockClear();
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
describe("setup profile, hours and assistant repair", () => {
  it("shows a field error for long names without trimming or advancing", async () => {
    await render(BasicInfoStep, { ...valid(), businessName: "ش".repeat(256) });
    await act(async () => button(ar.basicInfoStep.auto_3).click());
    expect(container.textContent).toContain(ar.setupFieldUx.nameError);
    expect(current.businessName).toHaveLength(256);
    expect(next).not.toHaveBeenCalled();
  });
  it("renders malformed profile values without crashing or silently replacing them", async () => {
    await render(BasicInfoStep, {
      ...valid(),
      businessName: { original: "bad" },
      phone: 77,
    });
    expect(container.textContent).toContain('"original"');
    expect(update).not.toHaveBeenCalled();
    await change("#businessName", "اسم جديد");
    expect(current.phone).toBe(77);
    await act(async () => button(ar.basicInfoStep.auto_3).click());
    expect(next).not.toHaveBeenCalled();
  });
  it("opens optional fields and identifies excessive descriptions", async () => {
    await render(BasicInfoStep, {
      ...valid(),
      description: "x".repeat(10001),
      address: "y".repeat(501),
    });
    await act(async () => button(ar.basicInfoStep.auto_3).click());
    expect(container.querySelector("details")?.open).toBe(true);
    expect(container.textContent).toContain(ar.setupFieldUx.descriptionError);
    expect(container.textContent).toContain(ar.setupFieldUx.addressError);
    expect(next).not.toHaveBeenCalled();
  });
  it("keeps values edited by another step and advances a valid business", async () => {
    await render(BasicInfoStep, valid());
    await change("#businessName", "اسم معدل");
    await act(async () => button(ar.basicInfoStep.auto_3).click());
    expect(current.businessName).toBe("اسم معدل");
    expect(current.botTone).toBe("friendly");
    expect(next).toHaveBeenCalledOnce();
  });
  it("edits a day, keeps overnight times and explicitly removes an unspecified day", async () => {
    await render(WorkingHoursFields, {
      ...valid(),
      workingHours: {
        sunday: { isOpen: true, open: "23:00", close: "06:00" },
        monday: { isOpen: false, open: "09:00", close: "17:00" },
      },
    });
    const sunday = Array.from(container.querySelectorAll(".ms-hours-row")).find(
      n => n.textContent?.includes(ar.setupTemplateUx.sunday)
    )!;
    const close = sunday.querySelectorAll("input")[1];
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(close, "07:30");
      close.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(current.workingHours.sunday).toEqual({
      isOpen: true,
      open: "23:00",
      close: "07:30",
    });
    expect(current.workingHours.monday.isOpen).toBe(false);
    const sundaySelect = sunday.querySelector("select")!;
    await act(async () => {
      sundaySelect.value = "unspecified";
      sundaySelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(current.workingHours.sunday).toBeUndefined();
    expect(current.workingHours.monday).toBeDefined();
  });
  it.each([null, "broken", { unexpected: { isOpen: true } }])(
    "preserves unsupported hours until an explicit reset: %j",
    async hours => {
      await render(WorkingHoursFields, { workingHours: hours });
      expect(container.textContent).toContain(ar.setupFieldUx.hoursUnreadable);
      expect(update).not.toHaveBeenCalled();
      await act(async () => button(ar.setupFieldUx.resetHours).click());
      expect(current.workingHours).toEqual({});
    }
  );
  it("does not pass invalid catalog data into the assistant preview", async () => {
    await render(PersonalityStep, { ...valid(), products: [null] });
    expect(preview).not.toHaveBeenCalled();
    expect(container.textContent).toContain(ar.setupFieldUx.previewInvalid);
    expect(current.products).toEqual([null]);
  });
  it("uses exact validated prices for local preview", async () => {
    await render(PersonalityStep, {
      ...valid(),
      products: [{ name: "صنف", price: "12.34", currency: "USD" }],
    });
    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({
        products: [expect.objectContaining({ price: 12.34, currency: "USD" })],
        useAI: false,
      })
    );
  });
  it("does not fake an English preview for a French assistant", async () => {
    await render(PersonalityStep, { ...valid(), botLanguage: "fr" });
    expect(preview).not.toHaveBeenCalled();
    expect(container.textContent).toContain(ar.setupFieldUx.previewLanguage);
  });
  it("shows malformed or excessive welcome messages for repair", async () => {
    await render(PersonalityStep, {
      ...valid(),
      welcomeMessage: { original: "bad" },
    });
    expect(container.textContent).toContain(ar.setupFieldUx.welcomeError);
    expect(container.textContent).toContain('"original"');
    expect(preview).not.toHaveBeenCalled();
    await act(async () => button(ar.setupFieldUx.clearInvalid).click());
    expect(current.welcomeMessage).toBe("");
  });
  it("changes only the assistant language, leaving currency untouched", async () => {
    await render(LanguageStep, {
      ...valid(),
      currency: "SAR",
      currencySymbol: "ر.س",
    });
    const french = Array.from(container.querySelectorAll("button")).find(n =>
      n.textContent?.includes("Français")
    )!;
    await act(async () => french.click());
    expect(update).toHaveBeenCalledWith({ botLanguage: "fr" });
    expect(current.currency).toBe("SAR");
    expect(current.currencySymbol).toBe("ر.س");
  });
  it("blocks continuing with invalid assistant fields", async () => {
    await render(LanguageStep, {
      ...valid(),
      welcomeMessage: "x".repeat(2001),
    });
    expect(button(ar.languageStep.auto_3).disabled).toBe(true);
    expect(container.textContent).toContain(ar.setupFieldUx.assistantInvalid);
  });
  it("lets review remove a retired template without removing copied catalog items", async () => {
    await render(CompleteStep, {
      ...valid(),
      templateId: 99,
      products: [{ name: "Keep", price: "3" }],
    });
    await act(async () => button(ar.setupFieldUx.clearTemplate).click());
    expect(current.templateId).toBeUndefined();
    expect(current.products).toHaveLength(1);
    expect(setupFieldsFromDraft(current).templateId).toBeUndefined();
  });
  it("lets review remove an invalid website reference while retaining products", async () => {
    await render(CompleteStep, {
      ...valid(),
      websiteAnalysis: { confirmed: true, websiteUrl: "bad" },
      products: [{ name: "Keep", price: "3" }],
    });
    await act(async () => button(ar.setupFieldUx.clearWebsite).click());
    expect(current.websiteAnalysis).toBeUndefined();
    expect(current.products).toHaveLength(1);
    expect(setupFieldsFromDraft(current).websiteAnalysis).toBeUndefined();
  });
  it("names invalid fields and links back to their section", async () => {
    await render(CompleteStep, {
      ...valid(),
      address: "x".repeat(501),
      botTone: "retired",
    });
    expect(container.textContent).toContain(ar.setupFieldUx.reviewErrors);
    const edit = Array.from(container.querySelectorAll("button")).find(n =>
      n.textContent?.includes(ar.setupApprovalUx.address)
    )!;
    await act(async () => edit.click());
    expect(next).toHaveBeenCalledWith(3, "address");
  });
});
