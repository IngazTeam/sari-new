import { afterEach, describe, expect, it, vi } from "vitest";

// These tests isolate the gateway HTTP contract. Real budget admission and accounting
// are exercised against MySQL in aiBudgetLedger.mysql.test.ts and at the call boundary.
vi.mock('./budget-ledger', async (importOriginal) => ({
  ...await importOriginal<typeof import('./budget-ledger')>(),
  withAiBudget: async (_request: unknown, operation: () => Promise<unknown>) => operation(),
}));

import {
  clearZahyPiRuntimeConfigCache,
  getZahyPiRequestContext,
  requestZahyPiChat,
  requestZahyPiCompletion,
  requestZahyPiJobCompletion,
  runWithZahyPiContext,
  buildSariBusinessInput,
} from "./zahypi-client";
import { SARI_TASK_CATALOG, resolveSariTaskType } from "./task-catalog";

const ORIGINAL_ENV = { ...process.env };

describe('provider conversation memory isolation', () => {
  const contract = resolveSariTaskType('sari.reply');
  const messages = [{ role: 'user' as const, content: 'synthetic' }];
  it('separates customers inside a merchant and merchants sharing a conversation number', () => {
    const scope = (merchantId: number, conversationId: number) => buildSariBusinessInput(contract, messages,
      { merchantId, conversationId, taskType: 'sari.reply' }, 'op-1').conversationId;
    expect(scope(1, 10)).toBe('merchant:1:conversation:10');
    expect(new Set([scope(1, 10), scope(1, 11), scope(2, 10)]).size).toBe(3);
  });
  it('uses operation isolation for tasks lacking a conversation and rejects malformed scope', () => {
    const context = { merchantId: 1, taskType: 'sari.reply' };
    expect(buildSariBusinessInput(contract, messages, context, 'op-1').conversationId)
      .not.toBe(buildSariBusinessInput(contract, messages, context, 'op-2').conversationId);
    expect(() => runWithZahyPiContext({ ...context, conversationId: 'another:merchant' }, () => true)).toThrow();
  });
});

afterEach(() => {
  vi.useRealTimers();
  clearZahyPiRuntimeConfigCache();
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("governed job HTTP boundaries", () => {
  const runtime = {
    enabled: true, provider: "zahypi" as const, apiKey: "zahypi-test-key",
    baseUrl: "https://api.zahypi.test/v1", projectId: "sari", model: "qwen-local",
    taskTypes: ["sari.reply"],
  };
  const jobId = "11111111-1111-4111-8111-111111111111";
  const payload = { messages: [{ role: "user", content: "Synthetic HTTP boundary check." }] };
  function invoke(merchantId: number, timeoutMs = 2_000, maxAttempts = 3) {
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    return requestZahyPiJobCompletion(payload, { merchantId, taskType: "sari.reply" },
      timeoutMs, maxAttempts, runtime);
  }
  function completed(request: RequestInit) {
    const headers = request.headers as Record<string, string>;
    const traceId = headers["X-Trace-Id"];
    return Response.json({
      job_id: jobId, status: "completed", project_id: "sari",
      tenant_id: headers["X-ZahyPi-Tenant"], task_type: "sari.reply", trace_id: traceId,
      run_manifest_id: "22222222-2222-4222-8222-222222222222", route: "qwen-core",
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      structured_output: { traceId, text: "synthetic", applicationResponse: "synthetic" },
    });
  }

  it.each([408, 429, 500, 502, 503, 504])("retries HTML HTTP %i without changing the create identity", async (status) => {
    const failed = new Response("<html>private-provider-content</html>", { status });
    const cancel = vi.spyOn(failed.body!, "cancel");
    const fetchMock = vi.fn().mockResolvedValueOnce(failed)
      .mockImplementation(async (_url, request: RequestInit) => completed(request));
    vi.stubGlobal("fetch", fetchMock);

    await expect(invoke(91_000 + status)).resolves.toMatchObject({ model: "qwen-core" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledTimes(1);
    const [firstUrl, first] = fetchMock.mock.calls[0];
    const [secondUrl, second] = fetchMock.mock.calls[1];
    expect(secondUrl).toBe(firstUrl);
    expect(second).toMatchObject({ method: "POST", headers: first.headers, body: first.body, redirect: "error" });
  });

  it("retries only GET after a polling failure, preserving the original job and trace", async () => {
    const failed = new Response("upstream private-provider-content", { status: 503 });
    const cancel = vi.spyOn(failed.body!, "cancel");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ job_id: jobId, status: "retry_wait" }, { status: 202 }))
      .mockResolvedValueOnce(failed)
      .mockImplementation(async (_url, request: RequestInit) => completed(request));
    vi.stubGlobal("fetch", fetchMock);

    await expect(invoke(92_001)).resolves.toMatchObject({ model: "qwen-core" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(cancel).toHaveBeenCalledTimes(1);
    const createRequest = fetchMock.mock.calls[0][1];
    for (const [url, request] of fetchMock.mock.calls.slice(1)) {
      expect(url).toBe(`${runtime.baseUrl}/jobs/${jobId}`);
      expect(request).toMatchObject({ method: "GET", headers: createRequest.headers });
      expect(request.body).toBeUndefined();
    }
  });

  it.each([400, 401, 403, 404, 409, 422])("does not retry or parse the private HTTP %i error body", async (status) => {
    const response = new Response("private-provider-content", { status });
    const cancel = vi.spyOn(response.body!, "cancel");
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(invoke(93_000 + status)).rejects.toThrow(`ZahyPi request failed with status ${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("does not surface a failing error-body cancellation", async () => {
    const response = new Response("private-provider-content", { status: 401 });
    vi.spyOn(response.body!, "cancel").mockRejectedValue(new Error("private-cancellation-content"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(invoke(94_001)).rejects.toThrow("ZahyPi request failed with status 401");
  });

  it("does not wait for a hanging error-body cancellation", async () => {
    const response = new Response("private-provider-content", { status: 401 });
    vi.spyOn(response.body!, "cancel").mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(invoke(94_005)).rejects.toThrow("ZahyPi request failed with status 401");
  });

  it("caps transient retries at three and retains the safe HTTP status", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => new Response("private-provider-content", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = invoke(94_006, 2_000, 99).then(() => "unexpected success", (error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await result).toBe("ZahyPi request failed with status 503");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, request] of fetchMock.mock.calls) {
      expect(request.headers).toEqual(fetchMock.mock.calls[0][1].headers);
      expect(request.body).toBe(fetchMock.mock.calls[0][1].body);
    }
  });

  it("does not open the tenant circuit after permanent HTTP errors", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("private-provider-content", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(invoke(94_007)).rejects.toThrow("ZahyPi request failed with status 400");
    }
    fetchMock.mockImplementation(async (_url, request: RequestInit) => completed(request));
    await expect(invoke(94_007)).resolves.toMatchObject({ model: "qwen-core" });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("honors the no-retry budget even for a non-JSON 503", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("private-provider-content", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(invoke(94_002, 2_000, 1)).rejects.toThrow("ZahyPi request failed with status 503");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps one deadline across transient HTTP failures", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => new Response("private-provider-content", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = invoke(94_003, 100).then(() => "unexpected success", (error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(101);
    expect(await result).toBe("ZahyPi timeout after 0.1s");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still rejects malformed successful JSON once with a content-free error", async () => {
    const response = new Response("private-provider-content", { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    await expect(invoke(94_004)).rejects.toThrow("ZahyPi returned an invalid response");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.body!.locked).toBe(false);
  });
});

describe("requestZahyPiChat", () => {
  it("normalizes a connector gateway origin to the governed /v1 API", async () => {
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";

    const fetchMock = vi.fn().mockImplementation(async (_url, request: RequestInit) => {
      const traceId = String((request.headers as Record<string, string>)["X-Trace-Id"]);
      return new Response(JSON.stringify({
        job_id: "11111111-1111-4111-8111-111111111111",
        status: "completed",
        project_id: "sari",
        tenant_id: "merchant:9001",
        task_type: "sari.reply",
        trace_id: traceId,
        run_manifest_id: "22222222-2222-4222-8222-222222222222",
        route: "qwen-core",
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        structured_output: {
          traceId,
          text: "synthetic governed result",
          applicationResponse: "synthetic governed result",
        },
      }), { status: 202, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestZahyPiJobCompletion({
      messages: [{ role: "user", content: "Synthetic connector check." }],
    }, {
      merchantId: 9001,
      taskType: "sari.reply",
    }, 2_000, 1, {
      enabled: true,
      provider: "zahypi",
      apiKey: "zahypi-test-key",
      baseUrl: "https://api.zahypi.test",
      projectId: "sari",
      model: "qwen-local",
      taskTypes: ["sari.reply"],
    })).resolves.toMatchObject({ model: "qwen-core" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.zahypi.test/v1/jobs");
  });

  it.each(SARI_TASK_CATALOG.filter((contract) => contract.status === "existing"))(
    "submits governed contract $taskType with the declared tenant policy",
    async (contract) => {
      process.env.ZAHYPI_ENABLED = "true";
      process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
      process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
      process.env.ZAHYPI_API_KEY = "zahypi-test-key";
      process.env.ZAHYPI_PROJECT_ID = "sari";

      const fetchMock = vi.fn().mockImplementation(async (_url, request: RequestInit) => {
        const traceId = String((request.headers as Record<string, string>)["X-Trace-Id"]);
        return new Response(JSON.stringify({
          job_id: "11111111-1111-4111-8111-111111111111",
          status: "completed",
          project_id: "sari",
          tenant_id: "merchant:9001",
          task_type: contract.taskType,
          trace_id: traceId,
          run_manifest_id: "22222222-2222-4222-8222-222222222222",
          route: "qwen-core",
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
          structured_output: {
            ...contract.sampleOutput,
            traceId,
            applicationResponse: "synthetic governed result",
          },
        }), { status: 202, headers: { "content-type": "application/json" } });
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(requestZahyPiJobCompletion({
        messages: contract.sampleInput.promptMessages,
        max_tokens: 32,
        temperature: 0,
      }, {
        merchantId: 9001,
        userId: "contract-matrix",
        taskType: contract.taskType,
      }, contract.timeoutMs, 1)).resolves.toMatchObject({
        model: "qwen-core",
      });

      const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(request.headers).toMatchObject({
        "X-ZahyPi-Project": "sari",
        "X-ZahyPi-Tenant": "merchant:9001",
        "X-ZahyPi-User": "contract-matrix",
        "X-Task-Type": contract.taskType,
        "X-Data-Classification": contract.dataClassification,
        "X-External-Processing": contract.externalProcessing,
      });
      expect(JSON.parse(String(request.body))).toMatchObject({
        task_type: contract.taskType,
        business_input: { promptMessages: contract.sampleInput.promptMessages },
      });
    },
  );

  it("uses a governed job, canonicalizes aliases and polls for a manifest-backed result", async () => {
    process.env.ZAHYPI_ENABLED = "true";
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    process.env.ZAHYPI_PROJECT_ID = "sari";

    const jobId = "11111111-1111-4111-8111-111111111111";
    const manifestId = "22222222-2222-4222-8222-222222222222";
    let traceId = "";
    const fetchMock = vi.fn()
      .mockImplementationOnce(async (_url, request: RequestInit) => {
        traceId = String((request.headers as Record<string, string>)["X-Trace-Id"]);
        return new Response(JSON.stringify({
          job_id: jobId,
          status: "queued",
          project_id: "sari",
          tenant_id: "merchant:42",
          task_type: "sari.sales.next-best-action",
          trace_id: traceId,
        }), { status: 202 });
      })
      .mockImplementationOnce(async () => new Response(JSON.stringify({
        job_id: jobId,
        status: "completed",
        project_id: "sari",
        tenant_id: "merchant:42",
        task_type: "sari.sales.next-best-action",
        trace_id: traceId,
        run_manifest_id: manifestId,
        route: "qwen-core",
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
        result: {
          structured_output: {
            traceId,
            action: "request_more_information",
            rationale: "Need one more fact.",
            confidence: 0.8,
            requiresHumanReview: true,
            applicationResponse: '{"action":"none","reason":"Need one more fact."}',
          },
        },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestZahyPiJobCompletion({
      messages: [
        { role: "system", content: "Return the requested JSON." },
        { role: "user", content: "Choose the next action." },
      ],
      max_tokens: 120,
      temperature: 0.2,
    }, { merchantId: 42, taskType: "sari.action.selection" }, 2_000, 1);

    expect(result.choices[0]?.message.content).toBe(
      '{"action":"none","reason":"Need one more fact."}',
    );
    expect(result.usage).toEqual({ prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [createUrl, createRequest] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createUrl).toBe("https://api.zahypi.test/v1/jobs");
    expect(createRequest.headers).toMatchObject({
      "X-Task-Type": "sari.sales.next-best-action",
      "X-Data-Classification": "red",
      "X-External-Processing": "deny",
    });
    expect(JSON.parse(String(createRequest.body))).toMatchObject({
      task_type: "sari.sales.next-best-action",
      business_input: {
        promptMessages: [
          { role: "system", content: "Return the requested JSON." },
          { role: "user", content: "Choose the next action." },
        ],
      },
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${createUrl}/${jobId}`);
  });

  it("rejects a completed governed job that has no frozen run manifest", async () => {
    process.env.ZAHYPI_ENABLED = "true";
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";

    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, request: RequestInit) => {
      const traceId = String((request.headers as Record<string, string>)["X-Trace-Id"]);
      return new Response(JSON.stringify({
        job_id: "11111111-1111-4111-8111-111111111111",
        status: "completed",
        project_id: "sari",
        tenant_id: "merchant:42",
        task_type: "sari.reply",
        trace_id: traceId,
        route: "qwen-core",
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        result: {
          structured_output: {
            traceId,
            text: "unsafe generic result",
            applicationResponse: "unsafe generic result",
          },
        },
      }), { status: 202 });
    }));

    await expect(requestZahyPiJobCompletion(
      { messages: [{ role: "user", content: "hello" }] },
      { merchantId: 42, taskType: "sari.reply" },
      1_000,
      1,
    )).rejects.toThrow(/run manifest/i);
  });

  it.each(["missing_result", "extra_property", "oversized_result", "foreign_trace"])(
    "rejects invalid task output without retrying or returning provider content: %s", async (failure) => {
      process.env.ZAHYPI_ENABLED = "true";
      process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
      process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
      process.env.ZAHYPI_API_KEY = "zahypi-test-key";
      const fetchMock = vi.fn().mockImplementation(async (_url, request: RequestInit) => {
        const traceId = (request.headers as Record<string, string>)["X-Trace-Id"];
        const output: Record<string, unknown> = {
          traceId, text: "synthetic", applicationResponse: "private-provider-content",
        };
        if (failure === "missing_result") delete output.text;
        if (failure === "extra_property") output.untrusted = true;
        if (failure === "oversized_result") output.text = "x".repeat(12_001);
        if (failure === "foreign_trace") output.traceId = "another-trace";
        return new Response(JSON.stringify({
          job_id: "11111111-1111-4111-8111-111111111111", status: "completed",
          project_id: "sari", tenant_id: "merchant:42", task_type: "sari.reply", trace_id: traceId,
          run_manifest_id: "22222222-2222-4222-8222-222222222222", route: "qwen-core",
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, structured_output: output,
        }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);
      await expect(requestZahyPiJobCompletion(
        { messages: [{ role: "user", content: "synthetic" }] },
        { merchantId: 42, taskType: "sari.reply" }, 1_000, 3,
      )).rejects.toThrow(/schema|trace changed/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("sends merchant-scoped red data through the ZahyPi gateway", async () => {
    process.env.ZAHYPI_ENABLED = "true";
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    process.env.ZAHYPI_PROJECT_ID = "sari";

    const fetchMock = vi.fn().mockImplementation(async (_url, request: RequestInit) => {
      const traceId = String((request.headers as Record<string, string>)["X-Trace-Id"]);
      return new Response(JSON.stringify({
        job_id: "33333333-3333-4333-8333-333333333333",
        status: "completed",
        project_id: "sari",
        tenant_id: "merchant:42",
        task_type: "sari.reply",
        trace_id: traceId,
        run_manifest_id: "44444444-4444-4444-8444-444444444444",
        route: "qwen-core",
        usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
        structured_output: {
          traceId,
          text: "ready",
          applicationResponse: "ready",
        },
      }), { status: 202, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestZahyPiChat(
      [{ role: "user", content: "hello" }],
      { maxTokens: 50, temperature: 0.2 },
      { merchantId: 42, taskType: "sari.reply" },
    );

    expect(result.content).toBe("ready");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.zahypi.test/v1/jobs");
    expect(request.redirect).toBe("error");
    expect(request.headers).toMatchObject({
      Authorization: "Bearer zahypi-test-key",
      "X-ZahyPi-Project": "sari",
      "X-ZahyPi-Tenant": "merchant:42",
      "X-Task-Type": "sari.reply",
      "X-Data-Classification": "red",
      "X-External-Processing": "deny",
    });
    expect(JSON.parse(String(request.body))).toMatchObject({
      task_type: "sari.reply",
      input: { max_tokens: 50, temperature: 0.2 },
      business_input: { message: "hello" },
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

  it("rejects redirect-capable configuration and never delegates redirect handling", async () => {
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 501, taskType: "sari.reply" },
    )).rejects.toThrow("credential-free HTTPS origins");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed before network access for oversized request bodies", async () => {
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestZahyPiCompletion(
      { messages: [{ role: "user", content: "x".repeat(2 * 1024 * 1024) }] },
      { merchantId: 502, taskType: "sari.reply" },
    )).rejects.toThrow("request exceeds the size limit");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized gateway responses without retrying", async () => {
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    const response = new Response("{}", {
      status: 200,
      headers: { "content-length": String(1024 * 1024 + 1) },
    });
    const cancel = vi.spyOn(response.body!, "cancel");
    const read = vi.spyOn(response.body!, "getReader");
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 503, taskType: "sari.reply" },
      1_000,
      3,
    )).rejects.toThrow("response exceeds the size limit");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
  });

  it("caps chunked gateway responses even without a content-length header", async () => {
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    const response = new Response(
      "x".repeat(1024 * 1024 + 1),
      { status: 200 },
    );
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 505, taskType: "sari.reply" },
      1_000,
      3,
    )).rejects.toThrow("response exceeds the size limit");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(response.body!.locked).toBe(false);
  });

  it("rejects unsafe context header values before network access", async () => {
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 504, taskType: "sari.reply\r\nX-Injected: true" },
    )).rejects.toThrow("tenant context");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe gateway credentials and model names before network access", async () => {
    process.env.ZAHYPI_BASE_URL = "https://api.zahypi.test/v1";
    process.env.ZAHYPI_ALLOWED_ORIGINS = "https://api.zahypi.test";
    process.env.ZAHYPI_API_KEY = "gateway-key\r\nX-Injected:true";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 506, taskType: "sari.reply" },
    )).rejects.toThrow("ZAHYPI_API_KEY contains invalid characters");

    clearZahyPiRuntimeConfigCache();
    process.env.ZAHYPI_API_KEY = "zahypi-test-key";
    process.env.ZAHYPI_DEFAULT_MODEL = "qwen-local\r\nX-Injected:true";
    await expect(requestZahyPiCompletion(
      { messages: [] },
      { merchantId: 506, taskType: "sari.reply" },
    )).rejects.toThrow("ZAHYPI_DEFAULT_MODEL contains invalid characters");
    expect(fetchMock).not.toHaveBeenCalled();
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
