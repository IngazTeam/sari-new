// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import en from "../client/src/locales/en.json";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en", dir: () => "ltr" },
    t: (key: string, args: Record<string, unknown> = {}) => {
      const value = key.split(".").reduce((o: any, k) => o?.[k], en) ?? key;
      return value.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) =>
        String(args[k] ?? "")
      );
    },
  }),
}));
vi.mock("@/lib/trpc", () => ({ trpc: {} }));
import { KnowledgeRemovalView } from "../client/src/components/KnowledgeRemovalWorkspace";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
import {
  readRemovalAttempt,
  rememberRemovalAttempt,
} from "../client/src/lib/knowledge-removal-attempt";
import {
  removalFixture,
  removalFixtureReceipt,
} from "../prototypes/tenant-dashboard/src/knowledge-removal-fixture";
import type { KnowledgeRemovalTarget } from "../shared/knowledge-source-removal";
let root: Root, container: HTMLDivElement;
const scopeKey = "7:20:knowledge-removal",
  copy = en.knowledgeRemovalUx;
const api = {
    review: vi.fn(),
    send: vi.fn(),
    receipt: vi.fn(),
    changed: vi.fn(),
  },
  close = vi.fn();
const fixture = () => removalFixture({ kind: "all" }, 20, 7);
const render = (
  target: KnowledgeRemovalTarget | null = { kind: "all" },
  key = scopeKey
) =>
  act(async () =>
    root.render(
      React.createElement(KnowledgeRemovalView, {
        key,
        scopeKey: key,
        target,
        onClose: close,
        api,
      })
    )
  );
const button = (label: string) =>
  Array.from(document.querySelectorAll("button")).find(
    b => b.textContent === label
  )!;
const click = (label: string) => act(async () => button(label).click());
const body = () => document.body.textContent!;
const name = () =>
  document.querySelector<HTMLInputElement>("#removal-confirmation")!;
const fill = (text: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(name(), text);
    name().dispatchEvent(new Event("input", { bubbles: true }));
  });
const approve = async () => {
  await fill(fixture().businessName);
  await act(async () =>
    document.querySelector<HTMLInputElement>("input[type=checkbox]")!.click()
  );
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  clearKnowledgeWorkspace();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  api.review.mockImplementation(async target => ({ ...fixture(), target }));
  api.send.mockImplementation(async input =>
    removalFixtureReceipt(fixture(), input.requestId)
  );
  api.receipt.mockResolvedValue(null);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  clearKnowledgeWorkspace();
  vi.unstubAllGlobals();
});
it("shows complete counts and related effects without deleting on open", async () => {
  await render();
  expect(api.review).toHaveBeenCalledWith({ kind: "all" });
  expect(api.send).not.toHaveBeenCalled();
  for (const label of Object.values(copy.count))
    expect(body()).toContain(label);
  expect(body()).toContain(copy.permanent);
  expect(body()).toContain(copy.related.productVariants);
  expect(
    document.querySelector('label[for="removal-confirmation"]')
  ).not.toBeNull();
});
it("requires matching store name and fresh consent, then verifies and displays a durable receipt", async () => {
  await render();
  await click(copy.approve);
  expect(api.send).not.toHaveBeenCalled();
  expect(body()).toContain(copy.confirmError);
  await fill("Wrong");
  await act(async () =>
    document.querySelector<HTMLInputElement>("input[type=checkbox]")!.click()
  );
  await click(copy.approve);
  expect(api.send).not.toHaveBeenCalled();
  await fill(fixture().businessName);
  await click(copy.approve);
  expect(api.send).toHaveBeenCalledTimes(1);
  expect(body()).toContain(copy.completed);
  expect(readRemovalAttempt(scopeKey)).toBeNull();
  expect(api.changed).toHaveBeenCalledTimes(1);
});
it("blocks duplicate clicks and editing or closing while sending", async () => {
  let resolve!: (v: unknown) => void;
  api.send.mockImplementation(() => new Promise(r => (resolve = r)));
  await render();
  await approve();
  await act(async () => {
    const b = button(copy.approve);
    b.click();
    b.click();
  });
  expect(api.send).toHaveBeenCalledTimes(1);
  expect(name().disabled).toBe(true);
  expect(button(copy.close).disabled).toBe(true);
  await act(async () =>
    resolve(
      removalFixtureReceipt(fixture(), api.send.mock.calls[0][0].requestId)
    )
  );
  expect(body()).toContain(copy.completed);
});
it("keeps a pending reference on uncertainty, clears consent and recovers by receipt without another write", async () => {
  api.send.mockRejectedValue(Error("secret database detail"));
  await render();
  await approve();
  await click(copy.approve);
  const pending = readRemovalAttempt(scopeKey)!;
  expect(pending).not.toBeNull();
  expect(body()).toContain(copy.issue.uncertain);
  expect(body()).not.toContain("secret");
  expect(name().value).toBe("");
  expect(
    document.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked
  ).toBe(false);
  api.receipt.mockResolvedValue(
    removalFixtureReceipt(pending.review, pending.requestId)
  );
  await click(copy.checkReceipt);
  expect(api.send).toHaveBeenCalledTimes(1);
  expect(body()).toContain(copy.completed);
  expect(readRemovalAttempt(scopeKey)).toBeNull();
});
it("restores the reviewed reference after remount but never approval and resends exactly the same request", async () => {
  api.send.mockRejectedValueOnce(Error("lost"));
  await render();
  await approve();
  await click(copy.approve);
  const first = api.send.mock.calls[0][0];
  await act(async () => root.unmount());
  root = createRoot(container);
  await render(null);
  expect(body()).toContain(copy.pendingNotice);
  await click(copy.openRecovery);
  expect(name().value).toBe("");
  expect(
    document.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked
  ).toBe(false);
  await click(copy.checkReceipt);
  expect(body()).toContain(copy.issue.missing);
  expect(api.send).toHaveBeenCalledTimes(1);
  await approve();
  await click(copy.resume);
  expect(api.send.mock.calls[1][0]).toEqual(first);
  expect(body()).toContain(copy.completed);
});
it("does not consider a mismatched receipt successful or erase the pending request", async () => {
  api.send.mockImplementation(async input => ({
    ...removalFixtureReceipt(fixture(), input.requestId),
    merchantId: 99,
  }));
  await render();
  await approve();
  await click(copy.approve);
  expect(body()).toContain(copy.issue.uncertain);
  expect(readRemovalAttempt(scopeKey)).not.toBeNull();
  expect(api.changed).not.toHaveBeenCalled();
});
it("rejects a stale or foreign review before consent controls appear", async () => {
  api.review.mockResolvedValue({ ...fixture(), actorId: 99 });
  await render();
  expect(body()).toContain(copy.issue.read);
  expect(name()).toBeNull();
  expect(api.send).not.toHaveBeenCalled();
});
it.each([
  "running_intake",
  "external_catalog",
  "missing_source",
  "empty",
  "foreign_relationship",
] as const)("blocks %s with a concrete explanation", async reason => {
  api.review.mockResolvedValue({ ...fixture(), blockers: [reason] });
  await render();
  expect(body()).toContain(copy.blocker[reason]);
  expect(name()).toBeNull();
  expect(button(copy.approve)).toBeUndefined();
});
it("refreshes a rejected stale revision without retaining approval or replaying a write", async () => {
  api.send.mockRejectedValue({ data: { code: "CONFLICT" } });
  await render();
  await approve();
  await click(copy.approve);
  expect(body()).toContain(copy.issue.conflict);
  expect(readRemovalAttempt(scopeKey)).toBeNull();
  expect(name()).toBeNull();
  await click(copy.refresh);
  expect(name().value).toBe("");
  expect(api.send).toHaveBeenCalledTimes(1);
});
it("refuses to send if request storage is unavailable", async () => {
  await render();
  await approve();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("Storage blocked");
  });
  await click(copy.approve);
  expect(body()).toContain(copy.storageError);
  expect(api.send).not.toHaveBeenCalled();
});
it("never overwrites a malformed or foreign pending reference", async () => {
  sessionStorage.setItem(
    "sary:knowledge-removal:v1:" + scopeKey,
    JSON.stringify({
      requestId: crypto.randomUUID(),
      review: { ...fixture(), merchantId: 99 },
    })
  );
  await render();
  expect(body()).toContain(copy.storageError);
  expect(api.review).not.toHaveBeenCalled();
  expect(api.send).not.toHaveBeenCalled();
});
it("ignores late responses after logout and removes only the owned recovery namespace", async () => {
  let resolve!: (v: unknown) => void;
  api.send.mockImplementation(() => new Promise(r => (resolve = r)));
  await render();
  await approve();
  await click(copy.approve);
  const request = api.send.mock.calls[0][0];
  sessionStorage.setItem("unrelated", "keep");
  await act(async () => clearKnowledgeWorkspace());
  expect(readRemovalAttempt(scopeKey)).toBeNull();
  expect(sessionStorage.getItem("unrelated")).toBe("keep");
  await act(async () =>
    resolve(removalFixtureReceipt(fixture(), request.requestId))
  );
  expect(api.changed).not.toHaveBeenCalled();
  expect(body()).not.toContain(copy.completed);
});
it("isolates pending attempts by tenant and actor", async () => {
  rememberRemovalAttempt(
    scopeKey,
    { requestId: crypto.randomUUID(), review: fixture() },
    knowledgeCacheEpoch()
  );
  api.review.mockResolvedValue(removalFixture({ kind: "all" }, 21, 7));
  await render({ kind: "all" }, "7:21:knowledge-removal");
  expect(body()).not.toContain(copy.recoveryHelp);
  expect(readRemovalAttempt(scopeKey)).not.toBeNull();
});
