import { afterEach, describe, expect, it, vi } from "vitest";

const { requestZahyPiCompletion } = vi.hoisted(() => ({
  requestZahyPiCompletion: vi.fn(),
}));

vi.mock("../ai/zahypi-client", () => ({
  zahyPiEnabled: () => true,
  requestZahyPiCompletion,
}));

import { invokeLLM } from "./llm";

afterEach(() => {
  requestZahyPiCompletion.mockReset();
});

describe("invokeLLM ZahyPi routing", () => {
  it("preserves structured requests and uses the merchant as tenant context", async () => {
    requestZahyPiCompletion.mockResolvedValue({
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
    expect(requestZahyPiCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", name: undefined, content: "choose" }],
        response_format: { type: "json_object" },
      }),
      { merchantId: 91, taskType: "sari.invoke" },
      30_000,
      3,
    );
  });

  it("does not collapse requests without tenant context into a system tenant", async () => {
    requestZahyPiCompletion.mockRejectedValue(new Error("ZahyPi tenant context is required"));

    await expect(invokeLLM({
      messages: [{ role: "user", content: "private merchant data" }],
    })).rejects.toThrow("tenant context");

    expect(requestZahyPiCompletion).toHaveBeenCalledWith(
      expect.any(Object),
      undefined,
      30_000,
      3,
    );
  });
});
