// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
import { competitorViewFixture } from "./tests/helpers/competitor-view-fixture";
const m = vi.hoisted(() => ({
  locale: "en",
  search: "",
  navigate: vi.fn(),
  workspace: null as any,
  detail: null as any,
  error: null as any,
  detailError: null as any,
  refresh: vi.fn(),
  detailRefresh: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  options: null as any,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: m.locale },
    t: (key: string) =>
      key
        .split(".")
        .reduce((o: any, k) => o?.[k], m.locale === "ar" ? ar : en) || key,
  }),
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/merchant/competitor-analysis", m.navigate],
  useSearch: () => m.search,
  Link: ({ href, children }: any) =>
    React.createElement("a", { href }, children),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    websiteAnalysis: {
      competitorWorkspace: {
        useQuery: (_input: any, options: any) => {
          m.options = options;
          return {
            data: m.workspace,
            error: m.error,
            isLoading: false,
            isFetching: false,
            refetch: m.refresh,
          };
        },
      },
      competitorDetail: {
        useQuery: () => ({
          data: m.detail,
          error: m.detailError,
          isLoading: false,
          isFetching: false,
          refetch: m.detailRefresh,
        }),
      },
      addCompetitor: { useMutation: () => ({ mutateAsync: m.add }) },
      deleteReviewedCompetitor: {
        useMutation: () => ({ mutateAsync: m.remove }),
      },
    },
  },
}));
import { CompetitorWorkspace } from "../client/src/components/merchant/CompetitorWorkspace";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("React", React);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  Object.assign(m, {
    locale: "en",
    search: "",
    error: null,
    detailError: null,
    ...competitorViewFixture(),
  });
  m.refresh.mockResolvedValue({ error: null });
  m.detailRefresh.mockResolvedValue({ error: null });
  m.add.mockResolvedValue({ competitorId: 9, status: "analyzing" });
  m.remove.mockResolvedValue({ merchantId: 20, id: 8, success: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () =>
    root.render(
      React.createElement(CompetitorWorkspace, { actorId: 7, merchantId: 20 })
    )
  );
const button = (text: string) =>
  Array.from(document.querySelectorAll("button")).find(
    b => b.textContent === text
  ) as HTMLButtonElement;
const click = async (text: string) => {
  const b = button(text);
  expect(b).toBeTruthy();
  await act(async () => b.click());
};
const fill = async (id: string, value: string) => {
  const field = document.getElementById(id) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
it.each(["ar", "en"])(
  "shows scoped estimates and complete detail without inventing sales proficiency (%s)",
  async locale => {
    m.locale = locale;
    m.search = "?report=8";
    await render();
    const c = (locale === "ar" ? ar : en).competitorWorkspaceUx;
    expect(document.body.textContent).toContain(c.evidence);
    expect(document.body.textContent).toContain("Full product description");
    expect(document.body.textContent).toContain("Final strength");
    expect(document.body.textContent).toContain(c.invalidNotes);
    expect(document.body.textContent).toContain("SAR");
    expect(document.body.textContent).toContain("USD");
    expect(document.body.textContent).toContain(c.recorded);
    expect(document.querySelector(".cmp-notes b")).toBeNull();
  }
);
it.each(["ar", "en"])(
  "hides cached rows and private failures on read error (%s)",
  async locale => {
    m.locale = locale;
    m.error = Error("PRIVATE_PROVIDER");
    await render();
    const c = (locale === "ar" ? ar : en).competitorWorkspaceUx;
    expect(host.textContent).toContain(c.loadFailed);
    expect(host.textContent).not.toMatch(/Fixture competitor|PRIVATE_PROVIDER/);
    await click(locale === "ar" ? "إعادة المحاولة" : "Try again");
    expect(m.refresh).toHaveBeenCalledOnce();
  }
);
it.each(["actorId", "merchantId"])(
  "rejects stale cached %s scope",
  async field => {
    m.workspace[field] = 99;
    await render();
    expect(host.textContent).not.toContain("Fixture competitor");
    expect(button(en.competitorWorkspaceUx.add)).toBeUndefined();
  }
);
it("does not expose a foreign detail even when the list is valid", async () => {
  m.search = "?report=8";
  m.detail.merchantId = 99;
  await render();
  expect(document.querySelector("[role=dialog]")?.textContent).not.toContain(
    "Full product description"
  );
  expect(document.querySelector("[role=dialog]")?.textContent).toContain(
    en.competitorWorkspaceUx.detailFailed
  );
});
it.each(["ar", "en"])(
  "shows name and URL field errors before any creation (%s)",
  async locale => {
    m.locale = locale;
    await render();
    const c = (locale === "ar" ? ar : en).competitorWorkspaceUx;
    await click(c.add);
    await click(c.start);
    expect(document.getElementById("competitor-name-error")?.textContent).toBe(
      c.nameError
    );
    expect(document.getElementById("competitor-url-error")?.textContent).toBe(
      c.urlError
    );
    expect(document.activeElement?.id).toBe("competitor-name");
    expect(m.add).not.toHaveBeenCalled();
  }
);
it("submits trimmed fields once and refreshes the list on confirmed creation", async () => {
  await render();
  const c = en.competitorWorkspaceUx;
  await click(c.add);
  await fill("competitor-name", " New name ");
  await fill("competitor-url", " https://example.test ");
  await click(c.start);
  expect(m.add).toHaveBeenCalledExactlyOnceWith({
    name: "New name",
    url: "https://example.test",
  });
  expect(m.refresh).toHaveBeenCalledOnce();
  expect(host.textContent).toContain(c.added);
});
it("blocks repeated creation after an uncertain result until the list is refreshed", async () => {
  m.add.mockRejectedValue(Error("PRIVATE_PROVIDER"));
  await render();
  const c = en.competitorWorkspaceUx;
  await click(c.add);
  await fill("competitor-name", "Name");
  await fill("competitor-url", "https://example.test");
  await click(c.start);
  expect(document.body.textContent).toContain(c.addFailed);
  expect(document.body.textContent).not.toContain("PRIVATE_PROVIDER");
  expect(button(c.start).disabled).toBe(true);
  expect(m.add).toHaveBeenCalledOnce();
});
it("requires review acknowledgement and sends the exact revision for deletion", async () => {
  m.search = "?report=8";
  await render();
  const c = en.competitorWorkspaceUx;
  expect(button(c.confirmDelete).disabled).toBe(true);
  const box = document.querySelector(".cmp-check input") as HTMLInputElement;
  await act(async () => box.click());
  await click(c.confirmDelete);
  expect(m.remove).toHaveBeenCalledExactlyOnceWith({
    id: 8,
    expectedRevision: "a".repeat(64),
    acknowledged: true,
  });
  expect(m.navigate).toHaveBeenCalledWith("/merchant/competitor-analysis");
});
it("blocks stale confirmation until refreshed and acknowledged again", async () => {
  m.search = "?report=8";
  m.remove.mockRejectedValue({
    data: { code: "CONFLICT" },
    message: "PRIVATE_SQL",
  });
  await render();
  const c = en.competitorWorkspaceUx;
  await act(async () =>
    (document.querySelector(".cmp-check input") as HTMLInputElement).click()
  );
  await click(c.confirmDelete);
  expect(document.body.textContent).toContain(c.changed);
  expect(button(c.confirmDelete).disabled).toBe(true);
  expect(document.body.textContent).not.toContain("PRIVATE_SQL");
  expect(
    (document.querySelector(".cmp-check input") as HTMLInputElement).checked
  ).toBe(false);
});
it.each(["pending", "analyzing", "foreign"])(
  "does not offer destructive confirmation for %s reports",
  async state => {
    m.search = "?report=8";
    if (state === "foreign") m.detail.report.excludedProducts = 1;
    else m.detail.report.status = state;
    await render();
    expect(document.body.textContent).toContain(
      en.competitorWorkspaceUx.deleteBlocked
    );
    expect(button(en.competitorWorkspaceUx.confirmDelete)).toBeUndefined();
  }
);
it("keeps read-only users out of creation and deletion controls", async () => {
  m.workspace.canManage = false;
  m.detail.canManage = false;
  m.search = "?report=8";
  await render();
  expect(button(en.competitorWorkspaceUx.add)).toBeUndefined();
  expect(button(en.competitorWorkspaceUx.confirmDelete)).toBeUndefined();
});
it("polls globally running reports even when the current filtered page contains none", async () => {
  await render();
  expect(
    m.options.refetchInterval({ state: { data: { stats: { running: 1 } } } })
  ).toBe(5000);
  expect(
    m.options.refetchInterval({ state: { data: { stats: { running: 0 } } } })
  ).toBe(false);
});
it("puts full product page navigation in the URL", async () => {
  m.search = "?report=8";
  m.detail.report.products = 27;
  m.detail.productPages = 2;
  m.detail.productPage = 2;
  m.detail.pricing.pricedCount = 27;
  m.detail.pricing.groups[0].count = 26;
  m.search += "&products=2";
  await render();
  await click(en.competitorWorkspaceUx.previous);
  expect(m.navigate).toHaveBeenCalledWith(
    "/merchant/competitor-analysis?report=8&products=1"
  );
});
it("ignores a late creation result after navigation changed", async () => {
  let resolve!: (v: any) => void;
  m.add.mockImplementation(
    () =>
      new Promise(r => {
        resolve = r;
      })
  );
  await render();
  const c = en.competitorWorkspaceUx;
  await click(c.add);
  await fill("competitor-name", "Name");
  await fill("competitor-url", "https://example.test");
  await click(c.start);
  m.search = "?state=failed";
  m.workspace.selection.state = "failed";
  await render();
  await act(async () => resolve({ competitorId: 9, status: "analyzing" }));
  expect(host.textContent).not.toContain(c.added);
  expect(m.refresh).not.toHaveBeenCalled();
});
