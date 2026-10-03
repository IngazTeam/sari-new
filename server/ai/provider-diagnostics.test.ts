import { inspect } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  config: vi.fn(),
  budget: vi.fn(),
  fetch: vi.fn(),
  usage: vi.fn(),
  context: vi.fn(),
  job: vi.fn(),
  chat: vi.fn(),
}));
vi.mock("./zahypi-client", () => ({
  resolveZahyPiRuntimeConfig: m.config,
  getOptionalZahyPiRequestContext: () => undefined,
  requestZahyPiJobCompletion: m.job,
  requestZahyPiChat: m.chat,
}));
vi.mock("./budget-ledger", async original => ({
  ...(await original<typeof import("./budget-ledger")>()),
  withAiBudget: m.budget,
}));
vi.mock("./conversation-understanding-context", () => ({
  conversationUnderstandingIdentity: m.context,
}));
vi.mock("../db_ai_settings", () => ({
  getOpenAiApiKey: async () => "sk-fixture",
  logAiUsage: m.usage,
  estimateCost: () => 0,
}));
const secret = "PRIVATE_PROVIDER_DATA_429";
const messages = [{ role: "user" as const, content: secret }];
const completion = () => ({
  id: "fixture",
  model: "fixture",
  choices: [{ message: { content: secret } }],
  usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
});
let output: unknown[][];
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  output = [];
  for (const level of ["log", "warn", "error", "info", "debug"] as const)
    vi.spyOn(console, level).mockImplementation((...args) => {
      output.push(args);
    });
  vi.stubGlobal("fetch", m.fetch);
  m.config.mockResolvedValue({ enabled: true, provider: "openai" });
  m.budget.mockImplementation(async (_input, run) =>
    run({ requestId: "local-fixture" })
  );
  m.usage.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function logs() {
  const value = inspect(output, { depth: null });
  expect(value).not.toContain(secret);
  return value;
}
function rejectedUsage() {
  const promise = Promise.reject(Error(secret));
  // The test owns the rejection too, so the old implementation can be measured
  // without adding an unrelated unhandled rejection to the entire test runner.
  void promise.catch(() => {});
  return promise;
}
it("preserves noRetry and the original error without logging its body or stack", async () => {
  const { callGPT4 } = await import("./openai");
  const error = Error(secret);
  m.fetch.mockRejectedValue(error);
  await expect(
    callGPT4(messages, { merchantId: 42, noRetry: true })
  ).rejects.toBe(error);
  expect(m.fetch).toHaveBeenCalledTimes(1);
  expect(logs()).toContain("Attempt 1 failed");
});
it("keeps successful retry behavior and usage while omitting original error data", async () => {
  const { callGPT4 } = await import("./openai");
  m.fetch
    .mockRejectedValueOnce(Error(secret))
    .mockResolvedValue({ ok: true, json: async () => completion() });
  const pending = callGPT4(messages, { merchantId: 42 });
  await vi.advanceTimersByTimeAsync(1100);
  expect(await pending).toBe(secret);
  await flush();
  expect(m.fetch).toHaveBeenCalledTimes(2);
  expect(m.usage).toHaveBeenCalledTimes(1);
  expect(logs()).toContain("Attempt 2 succeeded");
});
it.each([false, true])(
  "keeps the existing attempt limit without logging provider errors or private model values (contextual=%s)",
  async contextual => {
    const { callGPT4 } = await import("./openai");
    if (contextual) m.context.mockReturnValue({ model: secret });
    const error = Error(secret);
    m.fetch.mockRejectedValue(error);
    const assertion = expect(
      callGPT4(messages, { merchantId: 42 })
    ).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
    expect(m.fetch).toHaveBeenCalledTimes(contextual ? 2 : 3);
    expect(logs()).toContain(
      contextual ? "Attempt 2 failed" : "Attempt 3 failed"
    );
  }
);
it("does not retry HTTP authentication failures", async () => {
  const { callGPT4 } = await import("./openai");
  m.fetch.mockResolvedValue({ ok: false, status: 401 });
  await expect(callGPT4(messages, { merchantId: 42 })).rejects.toThrow("401");
  expect(m.fetch).toHaveBeenCalledTimes(1);
  logs();
});
it("returns a failed connection check without printing the network error", async () => {
  const { testOpenAIConnection } = await import("./openai");
  m.fetch.mockRejectedValue(Error(secret));
  expect(await testOpenAIConnection("sk-fixture")).toBe(false);
  expect(logs()).toContain("connection test failed");
});
it.each(["sync", "async"] as const)(
  "handles %s OpenAI usage logging failure without replacing the model response",
  async mode => {
    const { callGPT4 } = await import("./openai");
    m.fetch.mockResolvedValue({ ok: true, json: async () => completion() });
    m.usage.mockImplementation(() => {
      if (mode === "sync") throw Error(secret);
      return rejectedUsage();
    });
    expect(await callGPT4(messages, { merchantId: 42, noRetry: true })).toBe(
      secret
    );
    await flush();
    expect(logs()).toContain("Usage logging failed");
  }
);
it.each(["sync", "async"] as const)(
  "handles %s shared LLM usage failure without leaking it or failing a completed response",
  async mode => {
    const { invokeLLM } = await import("../_core/llm");
    m.config.mockResolvedValue({
      enabled: true,
      provider: "zahypi",
      model: "fixture",
    });
    m.job.mockResolvedValue(completion());
    m.usage.mockImplementation(() => {
      if (mode === "sync") throw Error(secret);
      return rejectedUsage();
    });
    expect(await invokeLLM({ merchantId: 42, messages })).toEqual(completion());
    await flush();
    expect(logs()).toContain("Usage logging failed");
  }
);
it.each(["sync", "async"] as const)(
  "retains ZahyPi chat output after %s usage logging failure",
  async mode => {
    const { callGPT4 } = await import("./openai");
    m.config.mockResolvedValue({
      enabled: true,
      provider: "zahypi",
      model: "fixture",
    });
    m.chat.mockResolvedValue({
      content: secret,
      model: "fixture",
      usage: completion().usage,
    });
    m.usage.mockImplementation(() => {
      if (mode === "sync") throw Error(secret);
      return rejectedUsage();
    });
    expect(await callGPT4(messages, { merchantId: 42, noRetry: true })).toBe(
      secret
    );
    await flush();
    expect(logs()).toContain("Usage logging failed");
    expect(m.fetch).not.toHaveBeenCalled();
  }
);
it("does not hold a completed shared LLM response while usage logging is pending", async () => {
  const { invokeLLM } = await import("../_core/llm");
  m.config.mockResolvedValue({
    enabled: true,
    provider: "zahypi",
    model: "fixture",
  });
  m.job.mockResolvedValue(completion());
  let finish!: () => void;
  m.usage.mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  expect(await invokeLLM({ merchantId: 42, messages })).toEqual(completion());
  finish();
  await flush();
  logs();
});
