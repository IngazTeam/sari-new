import { afterEach, describe, expect, it, vi } from "vitest";

const {
  requestZahyPiJobCompletion,
  resolveZahyPiRuntimeConfig,
  getOptionalZahyPiRequestContext,
} = vi.hoisted(() => ({
  requestZahyPiJobCompletion: vi.fn(),
  getOptionalZahyPiRequestContext: vi.fn(),
  resolveZahyPiRuntimeConfig: vi.fn().mockResolvedValue({
    provider: "zahypi",
    apiKey: "gateway-key",
    baseUrl: "https://api.zahypi.test/v1",
    projectId: "sari",
    model: "qwen-local",
    source: "override",
  }),
}));

vi.mock("../ai/zahypi-client", () => ({
  resolveZahyPiRuntimeConfig,
  requestZahyPiJobCompletion,
  getOptionalZahyPiRequestContext,
}));

import { invokeLLM } from "./llm";

afterEach(() => {
  requestZahyPiJobCompletion.mockReset();
  getOptionalZahyPiRequestContext.mockReset();
});

describe("invokeLLM ZahyPi routing", () => {
  it("preserves structured requests and uses the merchant as tenant context", async () => {
    requestZahyPiJobCompletion.mockResolvedValue({
      id: "chat-1",
      object: "chat.completion",
      created: 1,
      model: "qwen-local",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "{}" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
    });

    const result = await invokeLLM({
      merchantId: 91,
      messages: [{ role: "user", content: "choose" }],
      responseFormat: { type: "json_object" },
    });

    expect(result.model).toBe("qwen-local");
    expect(requestZahyPiJobCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", name: undefined, content: "choose" }],
        response_format: { type: "json_object" },
      }),
      { merchantId: 91, taskType: "sari.reply" },
      30_000,
      3,
    );
  });

  it("does not collapse requests without tenant context into a system tenant", async () => {
    requestZahyPiJobCompletion.mockRejectedValue(new Error("ZahyPi tenant context is required"));

    await expect(invokeLLM({
      messages: [{ role: "user", content: "private merchant data" }],
    })).rejects.toThrow("tenant context");

    expect(requestZahyPiJobCompletion).toHaveBeenCalledWith(
      expect.any(Object),
      undefined,
      30_000,
      3,
    );
  });

  it("inherits the merchant while allowing a nested task type override", async () => {
    getOptionalZahyPiRequestContext.mockReturnValue({
      merchantId: 91,
      userId: 8,
      taskType: "sari.reply",
    });
    requestZahyPiJobCompletion.mockResolvedValue({
      id: "job-2",
      created: 1,
      model: "qwen-local",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "{}" },
        finish_reason: "stop",
      }],
    });

    await invokeLLM({
      taskType: "sari.response.validate",
      messages: [{ role: "user", content: "validate" }],
    });

    expect(requestZahyPiJobCompletion).toHaveBeenCalledWith(
      expect.any(Object),
      { merchantId: 91, userId: 8, taskType: "sari.response.validate" },
      30_000,
      3,
    );
  });
});
