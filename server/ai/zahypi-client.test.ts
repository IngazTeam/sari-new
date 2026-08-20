import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getZahyPiRequestContext,
  requestZahyPiChat,
  requestZahyPiCompletion,
  runWithZahyPiContext,
} from "./zahypi-client";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("requestZahyPiChat", () => {
  it("sends merchant-scoped red data through the ZahyPi gateway", async () => {
    process.env.ZAHYPI_ENABLED = "true";
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    process.env.ZAHYPI_PROJECT_ID = "sari";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "chat-1",
      created: 1,
      model: "qwen-local",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "ready" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestZahyPiChat(
      [{ role: "user", content: "hello" }],
      { maxTokens: 50, temperature: 0.2 },
      { merchantId: 42, taskType: "sari.reply" },
    );

    expect(result.content).toBe("ready");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.zahypi.test/v1/chat/completions");
    expect(request.headers).toMatchObject({
      Authorization: "Bearer zahypi-test-key",
      "X-ZahyPi-Project": "sari",
      "X-ZahyPi-Tenant": "merchant:42",
      "X-Task-Type": "sari.reply",
      "X-Data-Classification": "red",
      "X-External-Processing": "deny",
    });
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: "qwen-local",
      max_tokens: 50,
      temperature: 0.2,
    });
  });

  it("fails closed when the gateway key is missing", async () => {
    process.env.ZAHYPI_ENABLED = "true";
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    delete process.env.ZAHYPI_API_KEY;

    await expect(requestZahyPiChat(
      [{ role: "user", content: "hello" }],
      {},
      { merchantId: 42, taskType: "sari.reply" },
    )).rejects.toThrow("ZAHYPI_API_KEY");
  });

  it("preserves structured-output and tool fields for internal LLM calls", async () => {
    process.env.ZAHYPI_ENABLED = "true";
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "chat-1",
      created: 1,
      model: "qwen-local",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "{}" },
        finish_reason: "stop",
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await requestZahyPiCompletion({
      messages: [{ role: "user", content: "choose" }],
      tools: [{ type: "function", function: { name: "select_action" } }],
      response_format: { type: "json_object" },
    }, { merchantId: 7, taskType: "sari.invoke" });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: "qwen-local",
      tools: [{ type: "function", function: { name: "select_action" } }],
      response_format: { type: "json_object" },
    });
  });

  it("keeps concurrent merchant contexts isolated", async () => {
    const observed: Array<number | string> = [];

    await Promise.all([
      runWithZahyPiContext({ merchantId: 11, taskType: "sari.reply" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        observed.push(getZahyPiRequestContext().merchantId);
      }),
      runWithZahyPiContext({ merchantId: 22, taskType: "sari.reply" }, async () => {
        observed.push(getZahyPiRequestContext().merchantId);
        await new Promise((resolve) => setTimeout(resolve, 20));
        observed.push(getZahyPiRequestContext().merchantId);
      }),
    ]);

    expect(observed).toEqual([22, 11, 22]);
  });

  it("rejects requests without explicit or scoped tenant context", async () => {
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";

    await expect(requestZahyPiCompletion({ messages: [] })).rejects.toThrow(
      "tenant context",
    );
  });

  it.each([429, 503])(
    "retries transient status %i with the same idempotency key",
    async (status) => {
    vi.useFakeTimers();
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "chat-1",
        created: 1,
        model: "qwen-local",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "ready" },
          finish_reason: "stop",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = requestZahyPiCompletion(
      { messages: [{ role: "user", content: "hello" }] },
      { merchantId: 42, taskType: "sari.reply" },
    );
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ id: "chat-1" });

    const firstHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
    expect(firstHeaders["Idempotency-Key"]).toBe(secondHeaders["Idempotency-Key"]);
    vi.useRealTimers();
    },
  );

  it("retries an early abort with the same idempotency key", async () => {
    vi.useFakeTimers();
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";

    const fetchMock = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "chat-after-timeout",
        created: 1,
        model: "qwen-local",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "ready" },
          finish_reason: "stop",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = requestZahyPiCompletion(
      { messages: [{ role: "user", content: "hello" }] },
      { merchantId: 42, taskType: "sari.reply" },
      100,
      2,
    );
    const assertion = expect(pending).resolves.toMatchObject({ id: "chat-after-timeout" });
    await vi.runAllTimersAsync();
    await assertion;

    const firstHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
    expect(firstHeaders["Idempotency-Key"]).toBe(secondHeaders["Idempotency-Key"]);
    vi.useRealTimers();
  });

  it("rejects an unapproved HTTPS gateway origin", async () => {
    process.env.ZAHYPI_BASE_URL = "https://attacker.example/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.com";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";

    await expect(requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 42, taskType: "sari.reply" },
    )).rejects.toThrow("approved origin");
  });

  it("rejects malformed successful responses", async () => {
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ model: "qwen-local", choices: [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    )));

    await expect(requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 42, taskType: "sari.reply" },
    )).rejects.toThrow("invalid response");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "chat-recovery",
      created: 1,
      model: "qwen-local",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "ready" },
        finish_reason: "stop",
      }],
    }), { status: 200 })));
    await expect(requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 42, taskType: "sari.reply" },
    )).resolves.toMatchObject({ id: "chat-recovery" });
  });

  it("rejects an empty explicit tenant context before network access", async () => {
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestZahyPiCompletion(
      { messages: [] },
      { merchantId: "   ", taskType: "sari.reply" },
    )).rejects.toThrow("tenant context");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed message roles and tool calls", async () => {
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "chat-invalid",
      created: 1,
      model: "qwen-local",
      choices: [{
        index: 0,
        message: {
          role: "attacker",
          content: null,
          tool_calls: [{ id: "tool-1", type: "function", function: { name: 42 } }],
        },
        finish_reason: "tool_calls",
      }],
    }), { status: 200 })));

    await expect(requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 42, taskType: "sari.reply" },
    )).rejects.toThrow("invalid response");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "chat-number-recovery",
      created: 1,
      model: "qwen-local",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "ready" },
        finish_reason: "stop",
      }],
    }), { status: 200 })));
    await requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 42, taskType: "sari.reply" },
    );
  });

  it.each([
    { created: -1, index: 0, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
    { created: 1, index: -1, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
    { created: 1, index: 0, usage: { prompt_tokens: -1, completion_tokens: 1, total_tokens: 0 } },
    { created: 1.5, index: 0, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
  ])("rejects invalid numeric response fields", async ({ created, index, usage }) => {
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "chat-invalid-number",
      created,
      model: "qwen-local",
      choices: [{
        index,
        message: { role: "assistant", content: "ready" },
        finish_reason: "stop",
      }],
      usage,
    }), { status: 200 })));

    await expect(requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 42, taskType: "sari.reply" },
    )).rejects.toThrow("invalid response");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "chat-number-recovery",
      created: 1,
      model: "qwen-local",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "ready" },
        finish_reason: "stop",
      }],
    }), { status: 200 })));
    await requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 42, taskType: "sari.reply" },
    );
  });

  it("allows a slow successful response to use the remaining overall budget", async () => {
    vi.useFakeTimers();
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    const fetchMock = vi.fn().mockImplementation((_url: string, request: RequestInit) => (
      new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(new Response(JSON.stringify({
          id: "chat-slow-success",
          created: 1,
          model: "qwen-local",
          choices: [{
            index: 0,
            message: { role: "assistant", content: "ready" },
            finish_reason: "stop",
          }],
        }), { status: 200 })), 50);
        request.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      })
    ));
    vi.stubGlobal("fetch", fetchMock);

    const pending = requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 42, taskType: "sari.reply" },
      90,
      3,
    );
    await vi.advanceTimersByTimeAsync(51);
    await expect(pending).resolves.toMatchObject({ id: "chat-slow-success" });
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("uses one timeout budget across retries", async () => {
    vi.useFakeTimers();
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    const fetchMock = vi.fn().mockImplementation((_url: string, request: RequestInit) => (
      new Promise((_resolve, reject) => {
        request.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })
    ));
    vi.stubGlobal("fetch", fetchMock);

    const startedAt = Date.now();
    const pending = requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 42, taskType: "sari.reply" },
      100,
      3,
    );
    const assertion = expect(pending).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
    expect(Date.now() - startedAt).toBeLessThanOrEqual(101);
    vi.useRealTimers();
  });

  it("does not open the shared circuit for tenant-specific 400 errors", async () => {
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("bad request", { status: 400 }))
      .mockResolvedValueOnce(new Response("bad request", { status: 400 }))
      .mockResolvedValueOnce(new Response("bad request", { status: 400 }))
      .mockResolvedValueOnce(new Response("bad request", { status: 400 }))
      .mockResolvedValueOnce(new Response("bad request", { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "chat-after-400",
        created: 1,
        model: "qwen-local",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "ready" },
          finish_reason: "stop",
        }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    for (let index = 0; index < 5; index += 1) {
      await expect(requestZahyPiCompletion(
        { messages: [] },
        { merchantId: index + 1, taskType: "sari.reply" },
        1_000,
        1,
      )).rejects.toThrow("status 400");
    }

    await expect(requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 99, taskType: "sari.reply" },
      1_000,
      1,
    )).resolves.toMatchObject({ id: "chat-after-400" });
  });

  it("keeps transient circuit state isolated per merchant", async () => {
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "chat-other-merchant",
        created: 1,
        model: "qwen-local",
        choices: [{
          index: 0,
          message: { role: "assistant", content: "ready" },
          finish_reason: "stop",
        }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    for (let index = 0; index < 5; index += 1) {
      await expect(requestZahyPiCompletion(
        { messages: [] },
        { merchantId: 42_001, taskType: "sari.reply" },
        1_000,
        1,
      )).rejects.toThrow("status 503");
    }

    await expect(requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 42_002, taskType: "sari.reply" },
      1_000,
      1,
    )).resolves.toMatchObject({ id: "chat-other-merchant" });
  });
});
