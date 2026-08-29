import { afterEach, describe, expect, it, vi } from "vitest";

import { createActivationVerifier } from "./activation-verifier";

afterEach(() => {
  vi.unstubAllGlobals();
});

const credential = {
  projectId: "sari",
  generation: 1,
  baseUrl: "https://api.zahypi.test/v1",
  model: "qwen-local",
  apiKeyPrefix: "zk_sari_",
  apiKey: "zk_sari_demo_key_001",
  taskTypes: ["sari.reply"],
  taskTypesHash: "a".repeat(64),
  status: "active" as const,
  activatedAt: new Date("2026-08-29T12:00:00.000Z"),
};

const evidence = {
  job_id: "22222222-2222-4222-8222-222222222222",
  status: "completed",
  trace_id: "activation-trace-1",
  run_manifest_id: "33333333-3333-4333-8333-333333333333",
  route: "qwen-core",
  duration_ms: 120,
  usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
};

describe("ZahyPi activation verifier", () => {
  it("submits a real tenant-scoped governed task and returns content-free evidence", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(evidence), {
      status: 202,
      headers: { "content-type": "application/json" },
    }));
    const verifier = createActivationVerifier({ fetchImpl: fetchMock, timeoutMs: 1_000 });

    await expect(verifier.verify({
      credential,
      activationId: "11111111-1111-4111-8111-111111111111",
      generation: 1,
    })).resolves.toEqual({
      job_id: evidence.job_id,
      trace_id: evidence.trace_id,
      run_manifest_id: evidence.run_manifest_id,
      route: evidence.route,
      duration_ms: 120,
      usage: evidence.usage,
    });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.zahypi.test/v1/jobs");
    expect(request.headers).toMatchObject({
      Authorization: "Bearer zk_sari_demo_key_001",
      "X-ZahyPi-Project": "sari",
      "X-ZahyPi-Tenant": "activation-11111111-1111-4111-8111-111111111111",
      "X-Task-Type": "sari.reply",
      "X-Data-Classification": "red",
      "X-External-Processing": "deny",
    });
    expect(JSON.parse(String(request.body))).toMatchObject({
      task_type: "sari.reply",
      input: { operationId: "activation-11111111-1111-4111-8111-111111111111" },
    });
  });

  it("polls the exact job when submission is not terminal", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        job_id: evidence.job_id,
        status: "queued",
      }), { status: 202, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(evidence), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    const verifier = createActivationVerifier({ fetchImpl: fetchMock, timeoutMs: 2_000 });

    const pending = verifier.verify({
      credential,
      activationId: "11111111-1111-4111-8111-111111111111",
      generation: 1,
    });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ job_id: evidence.job_id });
    expect(fetchMock.mock.calls[1][0]).toBe(`https://api.zahypi.test/v1/jobs/${evidence.job_id}`);
    vi.useRealTimers();
  });

  it("rejects a response without an immutable run manifest", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...evidence,
      run_manifest_id: null,
    }), { status: 202, headers: { "content-type": "application/json" } }));
    const verifier = createActivationVerifier({ fetchImpl: fetchMock, timeoutMs: 1_000 });

    await expect(verifier.verify({
      credential,
      activationId: "11111111-1111-4111-8111-111111111111",
      generation: 1,
    })).rejects.toThrow(/run manifest/i);
  });
});
