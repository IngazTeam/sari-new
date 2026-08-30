import { afterEach, describe, expect, it, vi } from "vitest";

const {
  requestZahyPiChat,
  getOpenAiApiKey,
  getOptionalZahyPiRequestContext,
  resolveZahyPiRuntimeConfig,
  zahyPiTextGenerationEnabled,
} = vi.hoisted(() => ({
  requestZahyPiChat: vi.fn(),
  getOpenAiApiKey: vi.fn(),
  getOptionalZahyPiRequestContext: vi.fn(),
  resolveZahyPiRuntimeConfig: vi.fn(),
  zahyPiTextGenerationEnabled: vi.fn(),
}));

vi.mock("./zahypi-client", () => ({
  zahyPiTextGenerationEnabled,
  resolveZahyPiRuntimeConfig,
  requestZahyPiChat,
  getOptionalZahyPiRequestContext,
}));

vi.mock("../db_ai_settings", () => ({
  getOpenAiApiKey,
}));

import { callGPT4, testOpenAIConnection } from "./openai";

afterEach(() => {
  requestZahyPiChat.mockReset();
  getOpenAiApiKey.mockReset();
  getOptionalZahyPiRequestContext.mockReset();
  resolveZahyPiRuntimeConfig.mockReset();
  resolveZahyPiRuntimeConfig.mockResolvedValue({
    enabled: true,
    provider: "zahypi",
    apiKey: "gateway-key",
    baseUrl: "https://api.zahypi.test/v1",
    projectId: "sari",
    model: "qwen-local",
    source: "connector",
  });
  zahyPiTextGenerationEnabled.mockReset();
  zahyPiTextGenerationEnabled.mockResolvedValue(true);
  vi.unstubAllGlobals();
});

describe("callGPT4 ZahyPi routing", () => {
  it("fails closed before calling either provider when AI is disabled", async () => {
    resolveZahyPiRuntimeConfig.mockResolvedValue({
      enabled: false,
      provider: "zahypi",
      apiKey: "gateway-key",
      baseUrl: "https://api.zahypi.test/v1",
      projectId: "sari",
      model: "qwen-local",
      source: "database",
    });
    zahyPiTextGenerationEnabled.mockResolvedValue(false);
    getOpenAiApiKey.mockResolvedValue("");

    await expect(callGPT4([{ role: "user", content: "do not run" }], {
      merchantId: 77,
      noRetry: true,
    })).rejects.toThrow("AI services are disabled by an administrator");
    expect(requestZahyPiChat).not.toHaveBeenCalled();
  });

  it("uses ZahyPi for text generation without reading an OpenAI key", async () => {
    requestZahyPiChat.mockResolvedValue({
      content: "gateway response",
      model: "qwen-local",
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
    });
    const messages = [{ role: "user" as const, content: "hello" }];
    const result = await callGPT4(messages, {
      merchantId: 77,
      maxTokens: 80,
      temperature: 0.3,
      noRetry: true,
    });

    expect(result).toBe("gateway response");
    expect(requestZahyPiChat).toHaveBeenCalledWith(
      messages,
      expect.objectContaining({ maxTokens: 80, temperature: 0.3 }),
      { merchantId: 77, taskType: "sari.reply" },
    );
  });

  it("inherits the merchant while allowing an internal task type override", async () => {
    getOptionalZahyPiRequestContext.mockReturnValue({
      merchantId: 77,
      userId: 14,
      taskType: "sari.reply",
    });
    requestZahyPiChat.mockResolvedValue({
      content: "validated response",
      model: "qwen-local",
    });

    await callGPT4([{ role: "user", content: "validate" }], {
      taskType: "sari.response.validate",
      noRetry: true,
    });

    expect(requestZahyPiChat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object),
      { merchantId: 77, userId: 14, taskType: "sari.response.validate" },
    );
  });

  it("tests the remaining OpenAI service without generating text", async () => {
    getOpenAiApiKey.mockResolvedValue("sk-openai-test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      object: "list",
      data: [],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(testOpenAIConnection()).resolves.toBe(true);
    expect(requestZahyPiChat).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer sk-openai-test-key" }),
        redirect: "error",
      }),
    );
  });
});
