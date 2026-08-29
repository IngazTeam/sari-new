import { afterEach, describe, expect, it, vi } from "vitest";

const { requestZahyPiChat, getOpenAiApiKey, getOptionalZahyPiRequestContext } = vi.hoisted(() => ({
  requestZahyPiChat: vi.fn(),
  getOpenAiApiKey: vi.fn(),
  getOptionalZahyPiRequestContext: vi.fn(),
}));

vi.mock("./zahypi-client", () => ({
  zahyPiTextGenerationEnabled: () => Promise.resolve(true),
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
  vi.unstubAllGlobals();
});

describe("callGPT4 ZahyPi routing", () => {
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
