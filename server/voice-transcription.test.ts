import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  budget: vi.fn(),
  config: vi.fn(),
  post: vi.fn(),
  key: vi.fn(),
}));
vi.mock("axios", () => ({ default: { post: mocks.post } }));
vi.mock("./security/download-media", () => ({
  downloadPublicMedia: mocks.download,
}));
vi.mock("./ai/budget-ledger", () => ({ withAiBudget: mocks.budget }));
vi.mock("./ai/zahypi-client", () => ({
  resolveZahyPiRuntimeConfig: mocks.config,
  getOptionalZahyPiRequestContext: () => undefined,
}));
vi.mock("./db_ai_settings", () => ({ getOpenAiApiKey: mocks.key }));
import { transcribeVoiceMessage } from "./voice-transcription";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.config.mockResolvedValue({ enabled: true });
  mocks.key.mockResolvedValue("synthetic-test-token");
  mocks.download.mockResolvedValue({
    data: Buffer.from("synthetic audio fixture"),
  });
  mocks.budget.mockImplementation(async (_input, run) =>
    run({ requestId: "test-attempt" })
  );
  mocks.post.mockResolvedValue({
    data: { text: "نص الاختبار", language: "ar" },
  });
});
describe("production voice transcription (isolated transport)", () => {
  it("uses guarded download and platform budget before the provider call", async () => {
    expect(
      await transcribeVoiceMessage(
        "https://media.example.test/voice.ogg",
        "ar",
        7
      )
    ).toMatchObject({ text: "نص الاختبار", language: "ar" });
    expect(mocks.download).toHaveBeenCalledWith(
      "https://media.example.test/voice.ogg"
    );
    expect(mocks.budget).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 7,
        provider: "openai",
        taskType: "voice.transcription",
      }),
      expect.any(Function),
      expect.any(Function)
    );
    expect(mocks.post).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.anything(),
      expect.objectContaining({
        timeout: 60000,
        maxRedirects: 0,
        headers: expect.objectContaining({
          "X-Client-Request-Id": "test-attempt",
        }),
      })
    );
  });
  it("does not download or transcribe when AI is disabled", async () => {
    mocks.config.mockResolvedValue({ enabled: false });
    await expect(
      transcribeVoiceMessage("https://media.example.test/a")
    ).rejects.toThrow();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("does not bypass a refused platform reservation", async () => {
    mocks.budget.mockRejectedValue(new Error("budget exhausted"));
    await expect(
      transcribeVoiceMessage("https://media.example.test/a")
    ).rejects.toThrow();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each([0, 16 * 1024 * 1024 + 1])(
    "rejects audio of %s bytes before spending",
    async length => {
      mocks.download.mockResolvedValue({ data: Buffer.alloc(length) });
      await expect(
        transcribeVoiceMessage("https://media.example.test/a")
      ).rejects.toThrow();
      expect(mocks.budget).not.toHaveBeenCalled();
      expect(mocks.post).not.toHaveBeenCalled();
    }
  );
  it.each([undefined, "", "   ", 42, {}])(
    "rejects invalid transcript: %j",
    async text => {
      mocks.post.mockResolvedValue({ data: { text } });
      await expect(
        transcribeVoiceMessage("https://media.example.test/a")
      ).rejects.toThrow("فشل تحويل");
    }
  );
  it("sanitizes transport errors in logs and caller responses", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.post.mockRejectedValue(
        new Error("Authorization: synthetic-test-token")
      );
      await expect(
        transcribeVoiceMessage("https://media.example.test/a")
      ).rejects.toThrow("فشل تحويل");
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        "synthetic-test-token"
      );
    } finally {
      log.mockRestore();
    }
  });
});
