// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  start: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
  website: {} as any,
  status: {} as any,
  statusInput: null as any,
  statusOptions: null as any,
  websiteInput: null as any,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      sariBrain: Object.fromEntries(
        [
          "getSources",
          "getActivityLog",
          "getWebsiteKnowledge",
          "pageWorkspace",
          "getKnowledgeSections",
          "getHealthScore",
        ].map(k => [k, { invalidate: m.invalidate }])
      ),
    }),
    sariBrain: {
      reanalyzeWebsite: { useMutation: () => ({ mutateAsync: m.start }) },
      getAnalysisStatus: {
        useQuery: (input: any, options: any) => {
          m.statusInput = input;
          m.statusOptions = options;
          return { ...m.status, refetch: m.refetch };
        },
      },
      getWebsiteKnowledge: {
        useQuery: (input: any) => {
          m.websiteInput = input;
          return { ...m.website, refetch: m.refetch };
        },
      },
    },
  },
}));
import { useWebsiteAnalysis } from "../client/src/lib/use-website-analysis";
import { clearKnowledgeWorkspace } from "../client/src/lib/knowledge-workspace-cache";
import {
  readWebsiteAttempt,
  saveWebsiteAttempt,
} from "../client/src/lib/website-analysis-attempt";
import { knowledgeCacheEpoch } from "../client/src/lib/knowledge-workspace-cache";
let value: ReturnType<typeof useWebsiteAnalysis>,
  root: Root,
  container: HTMLDivElement;
const jobId = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
function Harness({ scope }: { scope: string }) {
  value = useWebsiteAnalysis(scope, true);
  return React.createElement(
    "p",
    null,
    JSON.stringify({ result: value.result, issue: value.issue })
  );
}
const render = (scope = "7:20:brain-page") =>
  act(async () =>
    root.render(React.createElement(Harness, { key: scope, scope }))
  );
const fresh = () => ({
  isLoading: false,
  isFetching: false,
  isError: false,
  isFetchedAfterMount: true,
  dataUpdatedAt: Date.now() + 1000,
});
beforeEach(() => {
  vi.clearAllMocks();
  clearKnowledgeWorkspace();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("crypto", { randomUUID: () => jobId });
  m.website = {
    ...fresh(),
    data: { merchantId: 20, totalPages: 3, activePages: 2, canManage: true },
  };
  m.status = { ...fresh(), isFetchedAfterMount: false, data: undefined };
  m.start.mockImplementation(async input => ({
    ...input,
    started: true,
    alreadyRunning: false,
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  clearKnowledgeWorkspace();
  vi.unstubAllGlobals();
});
it("partitions query caches by confirmed merchant and original attempt", async () => {
  await render();
  expect(m.websiteInput).toEqual({ merchantId: 20 });
  expect(m.statusOptions.enabled).toBe(false);
  await act(async () => {
    await value.start();
  });
  expect(m.start).toHaveBeenCalledExactlyOnceWith({ merchantId: 20, jobId });
  expect(m.statusInput).toEqual({ merchantId: 20, jobId });
  expect(m.statusOptions.enabled).toBe(true);
});
it.each([
  { merchantId: 21, jobId, status: "completed", title: "Foreign" },
  { merchantId: 20, jobId: other, status: "completed", title: "Old" },
  { status: "completed", title: "No identity" },
])("rejects foreign, stale or unscoped results %o", async data => {
  await render();
  await act(async () => {
    await value.start();
  });
  m.status = { ...fresh(), data };
  await render();
  expect(value.result).toBeNull();
  expect(value.issue).toBe("unverified");
  expect(m.invalidate).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain(data.title);
});
it("only accepts a fresh matching completed result and invalidates dependent reads", async () => {
  await render();
  await act(async () => {
    await value.start();
  });
  const data = { merchantId: 20, jobId, status: "completed", title: "Current" };
  m.status = { ...fresh(), data, isFetchedAfterMount: false };
  await render();
  expect(value.result).toBeNull();
  m.status = { ...fresh(), data, dataUpdatedAt: 0 };
  await render();
  expect(value.result).toBeNull();
  m.status = { ...fresh(), data };
  await render();
  expect(value.result).toEqual(data);
  expect(m.invalidate).toHaveBeenCalledTimes(6);
  expect(value.polling).toBe(false);
});
it("locks duplicate clicks and ignores an acknowledgement after scope remount", async () => {
  let resolve!: (v: any) => void;
  m.start.mockImplementation(() => new Promise(r => (resolve = r)));
  await render();
  let pending!: Promise<void>;
  await act(async () => {
    pending = value.start();
    void value.start();
  });
  expect(m.start).toHaveBeenCalledOnce();
  m.website = {
    ...fresh(),
    data: { merchantId: 21, totalPages: 0, activePages: 0, canManage: true },
  };
  await render("7:21:brain-page");
  await act(async () => {
    resolve({ merchantId: 20, jobId, started: true, alreadyRunning: false });
    await pending;
  });
  expect(value.hasAttempt).toBe(false);
  expect(value.pending).toBe(false);
  expect(value.polling).toBe(false);
  expect(value.result).toBeNull();
});
it("does not revive status polling after logout clears the workspace epoch", async () => {
  let resolve!: (v: any) => void;
  m.start.mockImplementation(() => new Promise(r => (resolve = r)));
  await render();
  let pending!: Promise<void>;
  await act(async () => {
    pending = value.start();
  });
  clearKnowledgeWorkspace();
  await act(async () => {
    resolve({ merchantId: 20, jobId, started: true, alreadyRunning: false });
    await pending;
  });
  expect(value.polling).toBe(false);
  expect(m.invalidate).not.toHaveBeenCalled();
});
it("retains the original reference on an ambiguous start and retries reading, not starting", async () => {
  m.start.mockRejectedValue(new Error("network"));
  await render();
  await act(async () => {
    await value.start();
  });
  expect(value.issue).toBe("startUnconfirmed");
  expect(value.busy).toBe(true);
  await act(async () => {
    await value.start();
    value.readStatus();
  });
  expect(m.start).toHaveBeenCalledOnce();
  expect(m.refetch).toHaveBeenCalledOnce();
  expect(m.statusInput).toEqual({ merchantId: 20, jobId });
});
it("adopts an already-running reference only from a valid same-merchant acknowledgement", async () => {
  m.start.mockResolvedValue({
    merchantId: 20,
    jobId: other,
    started: true,
    alreadyRunning: true,
  });
  await render();
  await act(async () => {
    await value.start();
  });
  expect(m.statusInput.jobId).toBe(other);
});
it.each([
  { merchantId: 21, jobId, started: true, alreadyRunning: true },
  { merchantId: 20, jobId: other, started: true, alreadyRunning: false },
])("does not accept an unrelated acknowledgement %o", async accepted => {
  m.start.mockResolvedValue(accepted);
  await render();
  await act(async () => {
    await value.start();
  });
  expect(value.issue).toBe("startUnconfirmed");
  expect(value.polling).toBe(false);
});
it.each(["foreign", "stale", "viewer", "failed"])(
  "does not start from %s website context",
  async mode => {
    if (mode === "foreign") m.website.data.merchantId = 21;
    if (mode === "stale") m.website.isFetchedAfterMount = false;
    if (mode === "viewer") m.website.data.canManage = false;
    if (mode === "failed") m.website.isError = true;
    await render();
    await act(async () => {
      await value.start();
    });
    expect(m.start).not.toHaveBeenCalled();
  }
);

it("persists only the opaque reference before dispatch and restores it after remount without starting again", async () => {
  m.start.mockImplementation(async input => {
    expect(readWebsiteAttempt("7:20:brain-page")).toBe(jobId);
    return { ...input, started: true, alreadyRunning: false };
  });
  await render();
  await act(async () => {
    await value.start();
  });
  expect(Object.values(sessionStorage)).toEqual([jobId]);
  await act(async () => root.render(null));
  await render();
  expect(value.restored).toBe(true);
  expect(value.polling).toBe(true);
  expect(value.dialogOpen).toBe(false);
  expect(m.statusInput.jobId).toBe(jobId);
  expect(m.start).toHaveBeenCalledOnce();
});
it("retains an adopted running reference across navigation", async () => {
  m.start.mockResolvedValue({
    merchantId: 20,
    jobId: other,
    started: true,
    alreadyRunning: true,
  });
  await render();
  await act(async () => {
    await value.start();
  });
  expect(readWebsiteAttempt("7:20:brain-page")).toBe(other);
  await act(async () => root.render(null));
  await render();
  expect(m.statusInput.jobId).toBe(other);
  expect(m.start).toHaveBeenCalledOnce();
});
it("a missing receipt retries the original request ID even if a fresh UUID would be available", async () => {
  await render();
  await act(async () => {
    await value.start();
  });
  m.status = { ...fresh(), data: { merchantId: 20, jobId, status: "idle" } };
  await render();
  expect(value.issue).toBe("missing");
  vi.stubGlobal("crypto", { randomUUID: () => other });
  await act(async () => {
    await value.start();
  });
  expect(m.start).toHaveBeenLastCalledWith({ merchantId: 20, jobId });
  expect(readWebsiteAttempt("7:20:brain-page")).toBe(jobId);
});
it.each([
  ["interrupted", "interrupted"],
  ["processing_failed", "failed"],
  ["result_unavailable", "resultUnavailable"],
  ["future_reason", "unverified"],
])("shows the verified failure %s as %s", async (serverIssue, uiIssue) => {
  saveWebsiteAttempt("7:20:brain-page", jobId, null, knowledgeCacheEpoch());
  m.status = {
    ...fresh(),
    data: { merchantId: 20, jobId, status: "error", issue: serverIssue },
  };
  await render();
  expect(value.issue).toBe(uiIssue);
  expect(value.result).toBeNull();
  expect(m.start).not.toHaveBeenCalled();
});
it("does not send when writing session storage fails and can recover storage without sending", async () => {
  const storage = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw Error("blocked");
    });
  await render();
  await act(async () => {
    await value.start();
  });
  expect(value.issue).toBe("storageUnavailable");
  expect(value.busy).toBe(true);
  expect(m.start).not.toHaveBeenCalled();
  storage.mockRestore();
  await act(async () => value.readStatus());
  expect(value.issue).toBeNull();
  expect(m.start).not.toHaveBeenCalled();
});
it("blocks an unreadable saved reference without overwriting it", async () => {
  sessionStorage.setItem("sary:website-analysis:v1:7:20:brain-page", "invalid");
  await render();
  await act(async () => {
    await value.start();
    value.readStatus();
  });
  expect(value.issue).toBe("storageUnavailable");
  expect(m.start).not.toHaveBeenCalled();
  expect(
    sessionStorage.getItem("sary:website-analysis:v1:7:20:brain-page")
  ).toBe("invalid");
});
it("partitions restored references by account as well as tenant and clears them on logout", async () => {
  saveWebsiteAttempt("7:20:brain-page", jobId, null, knowledgeCacheEpoch());
  await render("8:20:brain-page");
  expect(value.hasAttempt).toBe(false);
  await render("7:20:brain-page");
  expect(value.hasAttempt).toBe(true);
  clearKnowledgeWorkspace();
  await act(async () => root.render(null));
  await render();
  expect(value.hasAttempt).toBe(false);
  expect(m.start).not.toHaveBeenCalled();
});
it("replaces a verified terminal attempt only on a new explicit start", async () => {
  saveWebsiteAttempt("7:20:brain-page", jobId, null, knowledgeCacheEpoch());
  m.status = {
    ...fresh(),
    data: { merchantId: 20, jobId, status: "error", issue: "interrupted" },
  };
  await render();
  vi.stubGlobal("crypto", { randomUUID: () => other });
  expect(m.start).not.toHaveBeenCalled();
  m.status = { ...fresh(), isFetchedAfterMount: false, data: undefined };
  await render();
  await act(async () => {
    await value.start();
  });
  expect(m.start).toHaveBeenCalledExactlyOnceWith({
    merchantId: 20,
    jobId: other,
  });
  expect(readWebsiteAttempt("7:20:brain-page")).toBe(other);
});
