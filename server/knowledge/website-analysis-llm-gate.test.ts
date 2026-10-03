import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ check: vi.fn(), config: vi.fn() }));
vi.mock("./website-analysis-jobs", async original => ({
  ...(await original<typeof import("./website-analysis-jobs")>()),
  assertWebsiteAnalysisJob: m.check,
}));
vi.mock("../ai/zahypi-client", async original => ({
  ...(await original<typeof import("../ai/zahypi-client")>()),
  resolveZahyPiRuntimeConfig: m.config,
}));
import { runWebsiteAnalysisExecution } from "./website-analysis-execution";
import { invokeLLM } from "../_core/llm";
const scope = { merchantId: 20, jobId: randomUUID(), token: randomUUID() };
beforeEach(() => {
  vi.resetAllMocks();
  m.config.mockResolvedValue({ enabled: false });
});
it("rejects an expired analysis before provider configuration or network work", async () => {
  m.check.mockRejectedValue(Error("expired"));
  await expect(
    runWebsiteAnalysisExecution(scope, () =>
      invokeLLM({ messages: [{ role: "user", content: "local" }] })
    )
  ).rejects.toThrow("expired");
  expect(m.check).toHaveBeenCalledExactlyOnceWith(scope);
  expect(m.config).not.toHaveBeenCalled();
});
it("rejects a mismatched merchant before a model call", async () => {
  await expect(
    runWebsiteAnalysisExecution(scope, () =>
      invokeLLM({ merchantId: 999, messages: [] })
    )
  ).rejects.toThrow("website_job:forbidden");
  expect(m.config).not.toHaveBeenCalled();
});
it("preserves ordinary non-website calls without checking a website job", async () => {
  await expect(invokeLLM({ merchantId: 20, messages: [] })).rejects.toThrow(
    "disabled"
  );
  expect(m.check).not.toHaveBeenCalled();
  expect(m.config).toHaveBeenCalledOnce();
});
