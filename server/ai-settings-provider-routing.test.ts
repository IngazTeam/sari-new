import { afterEach, describe, expect, it, vi } from "vitest";

const databaseMock = vi.hoisted(() => ({
  getAiSettings: vi.fn(),
  getOpenAiApiKey: vi.fn(),
  getZahyPiRuntimeConfig: vi.fn(),
  getZahyPiRuntimeMetadata: vi.fn(),
  upsertAiSettings: vi.fn(),
}));

const clientMock = vi.hoisted(() => ({
  clearCache: vi.fn(),
  resolveRuntime: vi.fn(),
  requestCompletion: vi.fn(),
}));

vi.mock("./db_ai_settings", () => ({
  getAiSettings: databaseMock.getAiSettings,
  getOpenAiApiKey: databaseMock.getOpenAiApiKey,
  getZahyPiRuntimeConfig: databaseMock.getZahyPiRuntimeConfig,
  getZahyPiRuntimeMetadata: databaseMock.getZahyPiRuntimeMetadata,
  upsertAiSettings: databaseMock.upsertAiSettings,
}));

vi.mock("./ai/zahypi-client", () => ({
  clearZahyPiRuntimeConfigCache: clientMock.clearCache,
  requestZahyPiJobCompletion: clientMock.requestCompletion,
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
    databaseMock.getZahyPiRuntimeMetadata.mockImplementation(async (desired) => {
      const config = desired?.provider === "zahypi"
        ? await databaseMock.getZahyPiRuntimeConfig(desired) : await clientMock.resolveRuntime();
      const { apiKey: _key, ...metadata } = config;
      return metadata;
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

  it("opens recovery settings for an admin when both stored credentials are unreadable", async () => {
    databaseMock.getAiSettings.mockResolvedValue({ model: "gpt-4o", isActive: true });
    databaseMock.getZahyPiRuntimeMetadata.mockResolvedValue({
      enabled: true, provider: "zahypi", model: "qwen-local", source: "connector",
      baseUrl: "https://connector.zahypi.test/v1", projectId: "sari",
    });
    databaseMock.getOpenAiApiKey.mockRejectedValue(new Error("private-ciphertext-must-not-leak"));
    databaseMock.getZahyPiRuntimeConfig.mockRejectedValue(new Error("private-api-key-must-not-leak"));
    const settings = await adminCaller().getSettings();
    expect(settings).toMatchObject({
      model: "gpt-4o", textGenerationProvider: "zahypi", hasKey: false, hasZahyPiKey: false,
      openaiCredentialStatus: "unreadable", zahyPiCredentialStatus: "unreadable",
      openaiApiKey: null, zahyPiApiKey: null, zahyPiBaseUrl: "https://connector.zahypi.test/v1",
    });
    expect(JSON.stringify(settings)).not.toContain("private-");
    expect(clientMock.resolveRuntime).not.toHaveBeenCalled();
  });

  it("saves replacement keys without reading the unreadable old credentials", async () => {
    databaseMock.getZahyPiRuntimeConfig.mockRejectedValue(new Error("Unable to decrypt stored credential"));
    await expect(adminCaller().updateSettings({ textGenerationProvider: "zahypi",
      openaiApiKey: "sk-replacement-test-only", zahyPiApiKey: "zk-replacement-test-only",
      isActive: true,
    })).resolves.toEqual({ success: true });
    expect(databaseMock.getZahyPiRuntimeConfig).not.toHaveBeenCalled();
    expect(databaseMock.upsertAiSettings).toHaveBeenCalledWith(expect.objectContaining({
      openaiApiKey: "sk-replacement-test-only", zahyPiApiKey: "zk-replacement-test-only",
    }));
    expect(clientMock.clearCache).toHaveBeenCalledOnce();
  });

  it("does not expose recovery metadata to merchants", async () => {
    const caller = aiSettingsRouter.createCaller({ user: { id: 4, role: "merchant" } } as any);
    await expect(caller.getSettings()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(databaseMock.getAiSettings).not.toHaveBeenCalled();
  });

  it("tests a replacement ZahyPi key without decrypting the old key first", async () => {
    databaseMock.getZahyPiRuntimeMetadata.mockResolvedValue({
      enabled: true, provider: "zahypi", model: "qwen-local", source: "connector",
      baseUrl: "https://connector.zahypi.test/v1", projectId: "sari",
    });
    clientMock.resolveRuntime.mockRejectedValue(new Error("Unable to decrypt stored credential"));
    clientMock.requestCompletion.mockResolvedValue({ model: "qwen-local" });
    await expect(adminCaller().testZahyPiConnection({ apiKey: "zk-new-test-key" })).resolves.toMatchObject({ success: true });
    expect(clientMock.resolveRuntime).not.toHaveBeenCalled();
    expect(clientMock.requestCompletion).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), 15000, 1,
      expect.objectContaining({ apiKey: "zk-new-test-key", model: "qwen-local" }));
  });
});
