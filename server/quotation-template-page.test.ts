// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const m = vi.hoisted(() => ({
  data: null as any,
  error: null as any,
  fetching: false,
  detail: null as any,
  detailError: null as any,
  detailFetching: false,
  selection: null as any,
  write: vi.fn(),
  receipt: vi.fn(),
  refetch: vi.fn(),
  detailRead: vi.fn(),
  invalidate: vi.fn(),
  toast: vi.fn(),
  language: "ar",
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      sariBrain: {
        quotationTemplates: {
          workspace: { invalidate: m.invalidate },
          detail: { invalidate: m.invalidate, fetch: m.detailRead },
          receipt: { fetch: m.receipt },
        },
        getQuotationTemplates: { invalidate: m.invalidate },
        quotations: { sendWorkspace: { invalidate: m.invalidate } },
      },
    }),
    sariBrain: {
      quotationTemplates: {
        workspace: {
          useQuery: (input: any) => {
            m.selection = input;
            return {
              data: m.data,
              error: m.error,
              isFetching: m.fetching,
              refetch: m.refetch,
            };
          },
        },
        detail: {
          useQuery: () => ({
            data: m.detail,
            error: m.detailError,
            isFetching: m.detailFetching,
            refetch: m.detailRead,
          }),
        },
        write: { useMutation: () => ({ mutateAsync: m.write }) },
      },
    },
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: m.language },
    t: (key: string, values: any = {}) => {
      const s =
        key
          .split(".")
          .reduce((v: any, k) => v?.[k], m.language === "en" ? en : ar) ?? key;
      return String(s).replace(/\{\{(\w+)\}\}/g, (_, k) =>
        String(values[k] ?? "")
      );
    },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: m.toast, error: m.toast } }));
vi.mock("../client/src/components/ui/dialog", () => {
  const part = ({ children }: any) =>
    React.createElement("section", null, children);
  return {
    Dialog: ({ open, children }: any) =>
      open ? React.createElement("section", null, children) : null,
    DialogContent: part,
    DialogHeader: part,
    DialogTitle: part,
    DialogDescription: part,
  };
});
vi.mock("../client/src/components/merchant/WorkspaceState", () => ({
  WorkspaceState: ({ kind }: any) =>
    React.createElement("p", null, `state:${kind}`),
  workspaceFailureKind: () => "error",
}));
import { QuotationTemplateWorkspace } from "../client/src/components/merchant/QuotationTemplateWorkspace";
import {
  blankTemplateForm,
  readTemplateCache,
  saveTemplateCache,
} from "../client/src/lib/quotation-template-cache";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
const scope = "7:20:quotation-templates",
  l = ar.quotationTemplates;
const row = () => ({
  id: 1,
  merchantId: 20,
  name: "Saved template",
  headerImageUrl: "https://example.test/logo.png",
  termsText: "All terms\nSecond line",
  footerText: "Complete footer",
  isDefault: true,
  digest: "a".repeat(64),
  createdAt: "2026-09-30T00:00:00Z",
  truncated: false,
  editable: true,
});
const workspace = () => ({
  merchantId: 20,
  selection: { page: 1, search: "" },
  page: 1,
  pageSize: 20,
  total: 1,
  filtered: 1,
  pages: 1,
  limit: 20,
  items: [row()],
  canManage: true,
});
const receipt = (input: any) => ({
  version: "quotation-template-receipt.v1",
  merchantId: 20,
  actorId: 7,
  requestId: input.requestId,
  action: input.action,
  recordId: input.id ?? 2,
  digest: input.action === "delete" ? null : "b".repeat(64),
  committedAt: "2026-09-30T00:00:00.000Z",
});
let root: Root, container: HTMLDivElement;
const render = () =>
  act(async () =>
    root.render(React.createElement(QuotationTemplateWorkspace, { scope }))
  );
const button = (text: string) =>
  Array.from(container.querySelectorAll("button")).find(
    b => b.textContent === text
  )!;
const click = (text: string) => act(async () => button(text).click());
const input = (id: string, value: string) =>
  act(async () => {
    const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `#${id}`
    )!;
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
function seedDraft(mode: "create" | "update" = "create") {
  saveTemplateCache(
    scope,
    {
      draft:
        mode === "create"
          ? { mode, form: { ...blankTemplateForm(), name: "Draft" } }
          : {
              mode,
              id: 1,
              digest: "a".repeat(64),
              form: { ...blankTemplateForm(), name: "My edit" },
            },
    },
    knowledgeCacheEpoch()
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  clearKnowledgeWorkspace();
  sessionStorage.clear();
  m.data = workspace();
  m.detail = row();
  m.error = null;
  m.detailError = null;
  m.fetching = false;
  m.detailFetching = false;
  m.language = "ar";
  m.invalidate.mockResolvedValue(undefined);
  m.refetch.mockImplementation(async () => ({ data: m.data }));
  m.detailRead.mockImplementation(async () => m.detail);
  m.write.mockImplementation(async input => receipt(input));
  m.receipt.mockResolvedValue(null);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("template workspace journeys", () => {
  it("shows whole content without loading remote image URLs", async () => {
    await render();
    await click(l.open);
    expect(container.textContent).toContain("All terms\nSecond line");
    expect(container.textContent).toContain("Complete footer");
    expect(container.querySelector("img")).toBeNull();
  });
  it.each(["error", "fetching", "merchant", "selection"])(
    "hides unconfirmed list contents for %s",
    async mode => {
      if (mode === "error") m.error = Error();
      if (mode === "fetching") m.fetching = true;
      if (mode === "merchant") m.data.merchantId = 21;
      if (mode === "selection") m.data.selection.search = "previous";
      await render();
      expect(container.textContent).not.toContain("Saved template");
      expect(button(l.create).disabled).toBe(true);
    }
  );
  it("keeps read-only access explicit and disables mutations", async () => {
    m.data.canManage = false;
    await render();
    expect(container.textContent).toContain(l.readOnly);
    expect(button(l.create).disabled).toBe(true);
    await click(l.open);
    expect(button(l.edit).disabled).toBe(true);
    expect(button(l.delete).disabled).toBe(true);
  });
  it("focuses the first invalid field without sending", async () => {
    await render();
    await click(l.create);
    await click(l.save);
    expect(m.write).not.toHaveBeenCalled();
    expect(container.textContent).toContain(l.nameError);
    expect(document.activeElement?.id).toBe("tt-name");
  });
  it("validates an image URL and retains the entered draft", async () => {
    await render();
    await click(l.create);
    await input("tt-name", "Named");
    await input("tt-headerImageUrl", "javascript:bad");
    await click(l.save);
    expect(m.write).not.toHaveBeenCalled();
    expect(container.textContent).toContain(l.imageError);
    expect(readTemplateCache(scope).draft?.form.name).toBe("Named");
  });
  it("retains complete content before create and clears only after acknowledgement", async () => {
    await render();
    await click(l.create);
    await input("tt-name", "New template");
    await input("tt-termsText", "First\nSecond");
    m.write.mockImplementationOnce(async v => {
      expect(readTemplateCache(scope).attempt).toEqual(v);
      return receipt(v);
    });
    await click(l.save);
    expect(m.write.mock.calls[0][0].fields).toMatchObject({
      name: "New template",
      termsText: "First\nSecond",
      headerImageUrl: null,
    });
    expect(readTemplateCache(scope)).toEqual({});
    expect(m.toast).toHaveBeenCalledWith(l.saved);
  });
  it("does not write if retaining the request fails", async () => {
    seedDraft();
    await render();
    await click(l.resume);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("quota");
    });
    await click(l.save);
    expect(m.write).not.toHaveBeenCalled();
    expect(container.textContent).toContain(l.storageError);
  });
  it("reuses a lost response request and recovers without another mutation", async () => {
    seedDraft();
    m.write.mockRejectedValueOnce(Error("lost"));
    await render();
    await click(l.resume);
    await click(l.save);
    const sent = m.write.mock.calls[0][0];
    expect(button(l.save).disabled).toBe(true);
    m.receipt.mockResolvedValue(receipt(sent));
    await click(l.checkReceipt);
    expect(m.write).toHaveBeenCalledTimes(1);
    expect(readTemplateCache(scope)).toEqual({});
  });
  it("repeats an unknown request with the same UUID and payload", async () => {
    seedDraft();
    m.write.mockRejectedValueOnce(Error("lost"));
    await render();
    await click(l.resume);
    await click(l.save);
    const sent = m.write.mock.calls[0][0];
    await click(l.retrySame);
    expect(m.write.mock.calls[1][0]).toEqual(sent);
  });
  it("rejects foreign receipts and ignores late logout completion", async () => {
    seedDraft();
    m.write.mockImplementationOnce(async v => ({ ...receipt(v), actorId: 8 }));
    await render();
    await click(l.resume);
    await click(l.save);
    expect(readTemplateCache(scope).attempt).toBeTruthy();
    expect(m.toast).not.toHaveBeenCalledWith(l.saved);
    let finish: (v: any) => void = () => {};
    m.write.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    await click(l.retrySame);
    const sent = m.write.mock.calls[1][0];
    clearKnowledgeWorkspace();
    await act(async () => finish(receipt(sent)));
    expect(readTemplateCache(scope)).toEqual({});
    expect(m.toast).not.toHaveBeenCalledWith(l.saved);
  });
  it("keeps edits during conflict and requires reviewing the new digest before saving", async () => {
    seedDraft("update");
    m.write.mockRejectedValueOnce({ data: { code: "CONFLICT" } });
    await render();
    await click(l.resume);
    await click(l.save);
    expect(button(l.save).disabled).toBe(true);
    m.detail = { ...row(), name: "Other edit", digest: "c".repeat(64) };
    await click(l.loadLatest);
    expect(container.textContent).toContain("Other edit");
    await click(l.keepEdits);
    expect(readTemplateCache(scope).draft).toMatchObject({
      digest: "c".repeat(64),
      form: { name: "My edit" },
    });
    await click(l.save);
    expect(m.write.mock.calls[1][0]).toMatchObject({
      expectedDigest: "c".repeat(64),
      fields: { name: "My edit" },
    });
  });
  it("requires confirmation of the exact template before deletion", async () => {
    await render();
    await click(l.open);
    await click(l.delete);
    expect(button(l.confirmDelete).disabled).toBe(true);
    const check = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]'
    )!;
    await act(async () => check.click());
    await click(l.confirmDelete);
    expect(m.write.mock.calls[0][0]).toMatchObject({
      action: "delete",
      id: 1,
      expectedDigest: "a".repeat(64),
    });
  });
  it("does not discard a local draft through another template's delete", async () => {
    seedDraft();
    await render();
    await click(l.open);
    expect(button(l.delete).disabled).toBe(true);
  });
  it("restores a draft on remount and discards it only after explicit review", async () => {
    seedDraft();
    await render();
    await click(l.discard);
    expect(readTemplateCache(scope).draft).toBeTruthy();
    await click(l.cancel);
    await click(l.resume);
    expect(
      (container.querySelector("#tt-name") as HTMLInputElement).value
    ).toBe("Draft");
  });
  it("translates the list and editor into English", async () => {
    m.language = "en";
    await render();
    await click(en.quotationTemplates.create);
    expect(container.textContent).toContain(en.quotationTemplates.newTitle);
    expect(container.querySelector(".tt-workspace")?.getAttribute("dir")).toBe(
      "ltr"
    );
    expect(container.textContent).not.toContain("quotationTemplates.");
  });
});
