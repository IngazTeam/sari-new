import { afterEach, describe, expect, it, vi } from "vitest";

const { requestZahyPiChat, getOpenAiApiKey } = vi.hoisted(() => ({
  requestZahyPiChat: vi.fn(),
  getOpenAiApiKey: vi.fn(),
}));

vi.mock("./zahypi-client", () => ({
  zahyPiEnabled: () => true,
  requestZahyPiChat,
  getOptionalZahyPiRequestContext: () => undefined,
}));

vi.mock("../db_ai_settings", () => ({
  getOpenAiApiKey,
}));

import { callGPT4, testOpenAIConnection } from "./openai";

afterEach(() => {
  requestZahyPiChat.mockReset();
  getOpenAiApiKey.mockReset();
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

  it("tests OpenAI directly even when ZahyPi text routing is enabled", async () => {
    getOpenAiApiKey.mockResolvedValue("openai-test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "openai-test",
      object: "chat.completion",
      created: 1,
      model: "gpt-4o-mini",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "OK" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(testOpenAIConnection()).resolves.toBe(true);
    expect(requestZahyPiChat).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer openai-test-key" }),
      }),
    );
  });
});
