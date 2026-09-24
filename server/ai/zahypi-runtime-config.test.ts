import { afterEach, describe, expect, it, vi } from "vitest";

const connectorMock = vi.hoisted(() => ({
  getActive: vi.fn(),
  getMetadata: vi.fn(),
}));

const databaseMock = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("../integrations/zahypi-connector/repository", () => ({
  getActiveConnectorCredential: connectorMock.getActive,
  getActiveConnectorMetadata: connectorMock.getMetadata,
}));

vi.mock("../db", () => ({
  getDb: databaseMock.getDb,
}));

import { getOpenAiApiKey, getZahyPiRuntimeConfig, getZahyPiRuntimeMetadata, upsertAiSettings } from "../db_ai_settings";
import { encryptSecret, decryptSecret } from "../security/secrets";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  connectorMock.getActive.mockReset();
  connectorMock.getMetadata.mockReset();
  databaseMock.getDb.mockReset();
});

function settingsDatabase(record?: Record<string, unknown>) {
  const limit = vi.fn().mockResolvedValue(record ? [record] : []);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select };
}

describe("getZahyPiRuntimeConfig provider control", () => {
  it("reads connector metadata without decrypting an unreadable credential", async () => {
    databaseMock.getDb.mockResolvedValue(settingsDatabase());
    connectorMock.getActive.mockRejectedValue(new Error("Unable to decrypt stored credential"));
    connectorMock.getMetadata.mockResolvedValue({ projectId: "sari", generation: 7,
      baseUrl: "https://connector.zahypi.test/v1", model: "qwen-local" });
    const result = await getZahyPiRuntimeMetadata();
    expect(result).toMatchObject({ provider: "zahypi", generation: 7, source: "connector" });
    expect(result).not.toHaveProperty("apiKey");
    expect(connectorMock.getActive).not.toHaveBeenCalled();
    await expect(getZahyPiRuntimeConfig()).rejects.toThrow("Unable to decrypt stored credential");
  });

  it("uses the admin's saved ZahyPi key ahead of a stale connector", async () => {
    process.env.FIELD_ENCRYPTION_KEY = "test-only-field-key-32-characters-long";
    databaseMock.getDb.mockResolvedValue(settingsDatabase({ textGenerationProvider: "zahypi", isActive: true,
      zahyPiApiKey: encryptSecret("zk-replacement-admin-key"), zahyPiModel: "admin-model" }));
    connectorMock.getActive.mockRejectedValue(new Error("Unable to decrypt stored credential"));
    expect(await getZahyPiRuntimeConfig()).toMatchObject({ apiKey: "zk-replacement-admin-key", source: "database", model: "admin-model" });
    expect(connectorMock.getActive).not.toHaveBeenCalled();
  });

  it("does not decrypt an unused ZahyPi key while OpenAI is selected", async () => {
    databaseMock.getDb.mockResolvedValue(settingsDatabase({ textGenerationProvider: "openai", isActive: true,
      zahyPiApiKey: "enc:v1:damaged" }));
    expect(await getZahyPiRuntimeConfig()).toMatchObject({ provider: "openai", apiKey: "" });
    await expect(getZahyPiRuntimeConfig({ provider: "zahypi" })).rejects.toThrow();
  });

  it("keeps paid OpenAI access closed instead of silently using an environment key", async () => {
    process.env.OPENAI_API_KEY = "sk-env-must-not-be-used";
    databaseMock.getDb.mockResolvedValue(settingsDatabase({ isActive: true, openaiApiKey: "enc:v1:damaged" }));
    await expect(getOpenAiApiKey()).rejects.toThrow();
  });

  it("encrypts replacement admin keys without selecting or decrypting the old row", async () => {
    process.env.FIELD_ENCRYPTION_KEY = "test-only-field-key-32-characters-long";
    const update = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn(() => ({ onDuplicateKeyUpdate: update }));
    databaseMock.getDb.mockResolvedValue({ insert: () => ({ values }) });
    await upsertAiSettings({ openaiApiKey: "sk-new-admin-key", zahyPiApiKey: "zk-new-admin-key" });
    const saved = update.mock.calls[0][0].set;
    expect(saved.openaiApiKey).toMatch(/^enc:v1:/);
    expect(decryptSecret(saved.openaiApiKey)).toBe("sk-new-admin-key");
    expect(decryptSecret(saved.zahyPiApiKey)).toBe("zk-new-admin-key");
  });
  it("uses the active one-click credential when no database provider overrides it", async () => {
    process.env.ZAHYPI_API_KEY = "environment-key-that-must-not-win";
    databaseMock.getDb.mockResolvedValue(settingsDatabase());
    connectorMock.getActive.mockResolvedValue({
      projectId: "sari",
      generation: 4,
      baseUrl: "https://connector.zahypi.test/v1",
      model: "qwen-local",
      apiKeyPrefix: "zk_sari_",
      apiKey: "zk_sari_connector_key",
      taskTypes: ["sari.reply"],
      taskTypesHash: "a".repeat(64),
      status: "active",
      activatedAt: new Date("2026-08-29T12:00:00.000Z"),
    });

    await expect(getZahyPiRuntimeConfig()).resolves.toMatchObject({
      enabled: true,
      provider: "zahypi",
      apiKey: "zk_sari_connector_key",
      baseUrl: "https://connector.zahypi.test/v1",
      projectId: "sari",
      model: "qwen-local",
      source: "connector",
      generation: 4,
      taskTypesHash: "a".repeat(64),
    });
  });

  it("honors an explicit OpenAI selection instead of forcing the active connector", async () => {
    databaseMock.getDb.mockResolvedValue(settingsDatabase({
      textGenerationProvider: "openai",
      isActive: true,
      zahyPiApiKey: null,
      zahyPiBaseUrl: null,
      zahyPiProjectId: null,
      zahyPiModel: null,
    }));
    connectorMock.getActive.mockResolvedValue({
      projectId: "sari",
      generation: 4,
      baseUrl: "https://connector.zahypi.test/v1",
      model: "qwen-local",
      apiKey: "zk_sari_connector_key",
      taskTypes: ["sari.reply"],
      taskTypesHash: "a".repeat(64),
      status: "active",
    });

    await expect(getZahyPiRuntimeConfig()).resolves.toMatchObject({
      enabled: true,
      provider: "openai",
      source: "database",
    });
    expect(connectorMock.getActive).not.toHaveBeenCalled();
  });

  it("can resolve the saved connector while validating a switch from OpenAI to ZahyPi", async () => {
    databaseMock.getDb.mockResolvedValue(settingsDatabase({
      textGenerationProvider: "openai",
      isActive: true,
      zahyPiApiKey: null,
      zahyPiBaseUrl: null,
      zahyPiProjectId: null,
      zahyPiModel: null,
    }));
    connectorMock.getActive.mockResolvedValue({
      projectId: "sari",
      generation: 4,
      baseUrl: "https://connector.zahypi.test/v1",
      model: "qwen-local",
      apiKey: "zk_sari_connector_key",
      taskTypes: ["sari.reply"],
      taskTypesHash: "a".repeat(64),
      status: "active",
    });

    await expect(getZahyPiRuntimeConfig({ provider: "zahypi" })).resolves.toMatchObject({
      enabled: true,
      provider: "zahypi",
      apiKey: "zk_sari_connector_key",
      source: "connector",
    });
  });

  it("can validate re-enabling AI directly onto the saved ZahyPi connector", async () => {
    databaseMock.getDb.mockResolvedValue(settingsDatabase({
      textGenerationProvider: "openai",
      isActive: false,
      zahyPiApiKey: null,
      zahyPiBaseUrl: null,
      zahyPiProjectId: null,
      zahyPiModel: null,
    }));
    connectorMock.getActive.mockResolvedValue({
      projectId: "sari",
      generation: 4,
      baseUrl: "https://connector.zahypi.test/v1",
      model: "qwen-local",
      apiKey: "zk_sari_connector_key",
      taskTypes: ["sari.reply"],
      taskTypesHash: "a".repeat(64),
      status: "active",
    });

    await expect(getZahyPiRuntimeConfig({
      enabled: true,
      provider: "zahypi",
    })).resolves.toMatchObject({
      enabled: true,
      provider: "zahypi",
      source: "connector",
    });
  });

  it("fails closed when AI is disabled even if connector and environment keys exist", async () => {
    process.env.OPENAI_API_KEY = "sk-environment-key";
    process.env.ZAHYPI_API_KEY = "zk_environment_key";
    databaseMock.getDb.mockResolvedValue(settingsDatabase({
      textGenerationProvider: "zahypi",
      isActive: false,
      zahyPiApiKey: null,
      zahyPiBaseUrl: null,
      zahyPiProjectId: null,
      zahyPiModel: null,
      openaiApiKey: null,
    }));
    connectorMock.getActive.mockResolvedValue({
      projectId: "sari",
      generation: 4,
      baseUrl: "https://connector.zahypi.test/v1",
      model: "qwen-local",
      apiKey: "zk_sari_connector_key",
      taskTypes: ["sari.reply"],
      taskTypesHash: "a".repeat(64),
      status: "active",
    });

    await expect(getZahyPiRuntimeConfig()).resolves.toMatchObject({
      enabled: false,
      provider: "zahypi",
      source: "database",
    });
    await expect(getOpenAiApiKey()).resolves.toBe("");
    expect(connectorMock.getActive).not.toHaveBeenCalled();
  });

  it("fails closed when the active connector credential cannot be decrypted", async () => {
    databaseMock.getDb.mockResolvedValue(settingsDatabase());
    connectorMock.getActive.mockRejectedValue(new Error("Unable to decrypt stored credential"));

    await expect(getZahyPiRuntimeConfig()).rejects.toThrow(
      "Unable to decrypt stored credential",
    );
  });
});
