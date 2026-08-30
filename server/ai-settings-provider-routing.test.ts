import { afterEach, describe, expect, it, vi } from "vitest";

const databaseMock = vi.hoisted(() => ({
  getAiSettings: vi.fn(),
  getOpenAiApiKey: vi.fn(),
  getZahyPiRuntimeConfig: vi.fn(),
  upsertAiSettings: vi.fn(),
}));

const clientMock = vi.hoisted(() => ({
  clearCache: vi.fn(),
  resolveRuntime: vi.fn(),
}));

vi.mock("./db_ai_settings", () => ({
  getAiSettings: databaseMock.getAiSettings,
  getOpenAiApiKey: databaseMock.getOpenAiApiKey,
  getZahyPiRuntimeConfig: databaseMock.getZahyPiRuntimeConfig,
  upsertAiSettings: databaseMock.upsertAiSettings,
}));

vi.mock("./ai/zahypi-client", () => ({
  clearZahyPiRuntimeConfigCache: clientMock.clearCache,
  requestZahyPiJobCompletion: vi.fn(),
  resolveZahyPiRuntimeConfig: clientMock.resolveRuntime,
  validateZahyPiBaseUrl: vi.fn(),
}));

vi.mock("./_core/llm", () => ({ _clearCache: vi.fn() }));

import { aiSettingsRouter } from "./routers-ai-settings";

function adminCaller() {
  return aiSettingsRouter.createCaller({
    user: { id: 1, role: "admin" },
  } as any);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("AI settings provider control", () => {
  it("allows an administrator to save ZahyPi as the future provider while AI is disabled", async () => {
    databaseMock.upsertAiSettings.mockResolvedValue(undefined);

    await expect(adminCaller().updateSettings({
      textGenerationProvider: "zahypi",
      isActive: false,
    })).resolves.toEqual({ success: true });

    expect(databaseMock.getZahyPiRuntimeConfig).not.toHaveBeenCalled();
    expect(databaseMock.upsertAiSettings).toHaveBeenCalledWith({
      textGenerationProvider: "zahypi",
      isActive: false,
    });
  });

  it("shows the saved ZahyPi connector without changing an active OpenAI selection", async () => {
    databaseMock.getAiSettings.mockResolvedValue({
      model: "gpt-4o-mini",
      whisperModel: "whisper-1",
      textGenerationProvider: "openai",
      isActive: true,
    });
    databaseMock.getOpenAiApiKey.mockResolvedValue("sk-openai-secret");
    clientMock.resolveRuntime.mockResolvedValue({
      enabled: true,
      provider: "openai",
      apiKey: "",
      baseUrl: "https://api.zahypi.com/v1",
      projectId: "sari",
      model: "qwen-local",
      source: "database",
    });
    databaseMock.getZahyPiRuntimeConfig.mockResolvedValue({
      enabled: true,
      provider: "zahypi",
      apiKey: "zk_connector_secret",
      baseUrl: "https://api.zahypi.com/v1",
      projectId: "sari",
      model: "qwen-local",
      source: "connector",
    });

    const settings = await adminCaller().getSettings();

    expect(databaseMock.getZahyPiRuntimeConfig).toHaveBeenCalledWith({
      enabled: true,
      provider: "zahypi",
    });
    expect(settings.textGenerationProvider).toBe("openai");
    expect(settings.hasZahyPiKey).toBe(true);
    expect(settings.zahyPiApiKey).toBe("****cret");
    expect(settings.zahyPiProjectId).toBe("sari");
  });
});
