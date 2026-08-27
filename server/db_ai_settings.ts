/**
 * AI Settings & Usage Logs Database Module
 */
import { eq, desc, sql, gte, and } from "drizzle-orm";
import { aiSettings, AiSettings, NewAiSettings, aiUsageLogs, NewAiUsageLog } from "../drizzle/schema_ai_settings";
import { decryptSecret, encryptSecret } from "./security/secrets";

export const AI_SETTINGS_SINGLETON_ID = 1;

// Re-use the singleton DB getter
async function getDb() {
  const { getDb: getDbMain } = await import("./db");
  return getDbMain();
}

// ============================================
// AI Settings CRUD
// ============================================

export type TextGenerationProvider = "openai" | "zahypi";

export type AiSettingsWithoutCredentials = Omit<
  AiSettings,
  "openaiApiKey" | "zahyPiApiKey" | "gaServiceAccountJson"
>;

export type ZahyPiRuntimeConfig = {
  provider: TextGenerationProvider;
  apiKey: string;
  baseUrl: string;
  projectId: string;
  model: string;
  source: "database" | "environment";
};

export async function getAiSettings(): Promise<AiSettingsWithoutCredentials | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({
    id: aiSettings.id,
    model: aiSettings.model,
    whisperModel: aiSettings.whisperModel,
    textGenerationProvider: aiSettings.textGenerationProvider,
    zahyPiBaseUrl: aiSettings.zahyPiBaseUrl,
    zahyPiProjectId: aiSettings.zahyPiProjectId,
    zahyPiModel: aiSettings.zahyPiModel,
    isActive: aiSettings.isActive,
    monthlyBudgetLimit: aiSettings.monthlyBudgetLimit,
    gaPropertyId: aiSettings.gaPropertyId,
    gaEnabled: aiSettings.gaEnabled,
    alertEmail: aiSettings.alertEmail,
    healthStatus: aiSettings.healthStatus,
    lastHealthCheck: aiSettings.lastHealthCheck,
    lastAlertSentAt: aiSettings.lastAlertSentAt,
    createdAt: aiSettings.createdAt,
    updatedAt: aiSettings.updatedAt,
  }).from(aiSettings).where(eq(aiSettings.id, AI_SETTINGS_SINGLETON_ID)).limit(1);
  return result[0];
}

export async function upsertAiSettings(data: Partial<NewAiSettings>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const protectedData: Partial<NewAiSettings> = {
    ...data,
    ...(data.openaiApiKey !== undefined
      ? { openaiApiKey: encryptSecret(data.openaiApiKey) }
      : {}),
    ...(data.zahyPiApiKey !== undefined
      ? { zahyPiApiKey: encryptSecret(data.zahyPiApiKey) }
      : {}),
    ...(data.gaServiceAccountJson !== undefined
      ? { gaServiceAccountJson: encryptSecret(data.gaServiceAccountJson) }
      : {}),
  };

  if (Object.keys(protectedData).length === 0) return;
  await db.insert(aiSettings)
    .values({ ...protectedData, id: AI_SETTINGS_SINGLETON_ID } as NewAiSettings)
    .onDuplicateKeyUpdate({ set: protectedData });
}

/**
 * Get the OpenAI API key from DB, falling back to env var
 */
export async function getOpenAiApiKey(): Promise<string> {
  let record: { openaiApiKey: string | null; isActive: boolean } | undefined;
  try {
    const db = await getDb();
    if (db) {
      const result = await db.select({
        openaiApiKey: aiSettings.openaiApiKey,
        isActive: aiSettings.isActive,
      }).from(aiSettings).where(eq(aiSettings.id, AI_SETTINGS_SINGLETON_ID)).limit(1);
      record = result[0];
    }
  } catch (e) {
    console.warn("[AI Settings] Failed to fetch from DB, using env fallback:", e);
  }

  // Keep authenticated-decryption outside the availability fallback. A DB
  // outage may use the environment key, but tampered ciphertext must fail.
  if (record?.openaiApiKey && record.isActive) {
    return decryptSecret(record.openaiApiKey) || "";
  }

  // Fallback to environment variable
  return process.env.OPENAI_API_KEY || "";
}

/**
 * Resolve the text-generation provider and ZahyPi credentials. Stored values
 * take precedence, while environment variables remain a deployment fallback.
 */
export async function getZahyPiRuntimeConfig(): Promise<ZahyPiRuntimeConfig> {
  let record: {
    textGenerationProvider: TextGenerationProvider | null;
    zahyPiApiKey: string | null;
    zahyPiBaseUrl: string | null;
    zahyPiProjectId: string | null;
    zahyPiModel: string | null;
  } | undefined;
  try {
    const db = await getDb();
    if (db) {
      const result = await db.select({
        textGenerationProvider: aiSettings.textGenerationProvider,
        zahyPiApiKey: aiSettings.zahyPiApiKey,
        zahyPiBaseUrl: aiSettings.zahyPiBaseUrl,
        zahyPiProjectId: aiSettings.zahyPiProjectId,
        zahyPiModel: aiSettings.zahyPiModel,
      }).from(aiSettings).where(eq(aiSettings.id, AI_SETTINGS_SINGLETON_ID)).limit(1);
      record = result[0];
    }
  } catch (error) {
    console.warn("[AI Settings] Failed to fetch ZahyPi settings, using env fallback:", error);
  }

  const provider = record?.textGenerationProvider
    || (process.env.ZAHYPI_ENABLED?.trim().toLowerCase() === "true" ? "zahypi" : "openai");
  const apiKey = record?.zahyPiApiKey
    ? decryptSecret(record.zahyPiApiKey) || ""
    : process.env.ZAHYPI_API_KEY?.trim() || "";

  return {
    provider,
    apiKey,
    baseUrl: record?.zahyPiBaseUrl?.trim()
      || process.env.ZAHYPI_BASE_URL?.trim()
      || "https://api.zahypi.com/v1",
    projectId: record?.zahyPiProjectId?.trim()
      || process.env.ZAHYPI_PROJECT_ID?.trim()
      || "sari",
    model: record?.zahyPiModel?.trim()
      || process.env.ZAHYPI_DEFAULT_MODEL?.trim()
      || "qwen-local",
    source: record?.textGenerationProvider
      || record?.zahyPiApiKey
      || record?.zahyPiBaseUrl
      || record?.zahyPiProjectId
      || record?.zahyPiModel
      ? "database"
      : "environment",
  };
}

/**
 * Read the Google credential only for the GA service boundary. General AI
 * settings consumers never receive this private key, even encrypted.
 */
export async function getGoogleAnalyticsSettings(): Promise<{
  propertyId: string | null;
  serviceAccountJson: string | null;
  isEnabled: boolean;
} | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({
    propertyId: aiSettings.gaPropertyId,
    serviceAccountJson: aiSettings.gaServiceAccountJson,
    isEnabled: aiSettings.gaEnabled,
  }).from(aiSettings).where(eq(aiSettings.id, AI_SETTINGS_SINGLETON_ID)).limit(1);
  const record = result[0];
  if (!record) return undefined;
  return {
    ...record,
    serviceAccountJson: decryptSecret(record.serviceAccountJson),
  };
}

/**
 * Get the active model name from DB
 */
export async function getActiveModel(): Promise<string> {
  try {
    const settings = await getAiSettings();
    if (settings?.model) return settings.model;
  } catch { /* fallback */ }
  return "gpt-4o-mini";
}

/**
 * Get the active Whisper model from DB
 */
export async function getActiveWhisperModel(): Promise<string> {
  try {
    const settings = await getAiSettings();
    if (settings?.whisperModel) return settings.whisperModel;
  } catch { /* fallback */ }
  return "whisper-1";
}

// ============================================
// Usage Logging
// ============================================

// Cost per 1M tokens (input/output) - approximate
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4-turbo": { input: 10.00, output: 30.00 },
  "gpt-3.5-turbo": { input: 0.50, output: 1.50 },
};

const WHISPER_COST_PER_MINUTE = 0.006;

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const costs = MODEL_COSTS[model] || MODEL_COSTS["gpt-4o-mini"];
  return (promptTokens * costs.input + completionTokens * costs.output) / 1_000_000;
}

export function estimateWhisperCost(durationSec: number): number {
  return (durationSec / 60) * WHISPER_COST_PER_MINUTE;
}

export async function logAiUsage(data: NewAiUsageLog): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(aiUsageLogs).values(data);
  } catch (e) {
    console.error("[AI Usage] Failed to log usage:", e);
  }
}

// ============================================
// Usage Statistics
// ============================================

export async function getUsageStats(period: "today" | "month" | "all" = "month") {
  const db = await getDb();
  if (!db) return null;

  let dateFilter;
  const now = new Date();
  if (period === "today") {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    dateFilter = gte(aiUsageLogs.createdAt, todayStart);
  } else if (period === "month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    dateFilter = gte(aiUsageLogs.createdAt, monthStart);
  }

  const where = dateFilter ? dateFilter : undefined;

  const result = await db.select({
    totalRequests: sql<number>`COUNT(*)`,
    totalPromptTokens: sql<number>`COALESCE(SUM(${aiUsageLogs.promptTokens}), 0)`,
    totalCompletionTokens: sql<number>`COALESCE(SUM(${aiUsageLogs.completionTokens}), 0)`,
    totalTokens: sql<number>`COALESCE(SUM(${aiUsageLogs.totalTokens}), 0)`,
    totalCost: sql<string>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
    chatRequests: sql<number>`SUM(CASE WHEN ${aiUsageLogs.requestType} = 'chat' THEN 1 ELSE 0 END)`,
    whisperRequests: sql<number>`SUM(CASE WHEN ${aiUsageLogs.requestType} = 'whisper' THEN 1 ELSE 0 END)`,
    totalAudioDuration: sql<number>`COALESCE(SUM(${aiUsageLogs.audioDurationSec}), 0)`,
    avgDurationMs: sql<number>`COALESCE(AVG(${aiUsageLogs.durationMs}), 0)`,
  }).from(aiUsageLogs).where(where);

  return result[0] || null;
}

export async function getDailyUsage(days: number = 30) {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const result = await db.select({
    date: sql<string>`DATE(${aiUsageLogs.createdAt})`,
    requests: sql<number>`COUNT(*)`,
    tokens: sql<number>`COALESCE(SUM(${aiUsageLogs.totalTokens}), 0)`,
    cost: sql<string>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
  })
    .from(aiUsageLogs)
    .where(gte(aiUsageLogs.createdAt, startDate))
    .groupBy(sql`DATE(${aiUsageLogs.createdAt})`)
    .orderBy(sql`DATE(${aiUsageLogs.createdAt})`);

  return result;
}

export async function getTopMerchantUsage(limit: number = 5) {
  const db = await getDb();
  if (!db) return [];

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const result = await db.select({
    merchantId: aiUsageLogs.merchantId,
    requests: sql<number>`COUNT(*)`,
    totalTokens: sql<number>`COALESCE(SUM(${aiUsageLogs.totalTokens}), 0)`,
    totalCost: sql<string>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
  })
    .from(aiUsageLogs)
    .where(and(
      gte(aiUsageLogs.createdAt, monthStart),
      sql`${aiUsageLogs.merchantId} IS NOT NULL`
    ))
    .groupBy(aiUsageLogs.merchantId)
    .orderBy(sql`SUM(${aiUsageLogs.totalTokens}) DESC`)
    .limit(limit);

  return result;
}

export async function getRecentLogs(limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  return db.select()
    .from(aiUsageLogs)
    .orderBy(desc(aiUsageLogs.createdAt))
    .limit(limit);
}
