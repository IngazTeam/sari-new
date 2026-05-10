/**
 * AI Settings & Usage Logs Database Module
 */
import { eq, desc, sql, gte, and } from "drizzle-orm";
import { aiSettings, AiSettings, NewAiSettings, aiUsageLogs, NewAiUsageLog } from "../drizzle/schema_ai_settings";

// Re-use the singleton DB getter
async function getDb() {
  const { getDb: getDbMain } = await import("./db");
  return getDbMain();
}

// ============================================
// AI Settings CRUD
// ============================================

export async function getAiSettings(): Promise<AiSettings | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(aiSettings).limit(1);
  return result[0];
}

export async function upsertAiSettings(data: Partial<NewAiSettings>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existing = await getAiSettings();
  if (existing) {
    await db.update(aiSettings).set(data).where(eq(aiSettings.id, existing.id));
  } else {
    await db.insert(aiSettings).values(data as NewAiSettings);
  }
}

/**
 * Get the OpenAI API key from DB, falling back to env var
 */
export async function getOpenAiApiKey(): Promise<string> {
  try {
    const settings = await getAiSettings();
    if (settings?.openaiApiKey && settings.isActive) {
      return settings.openaiApiKey;
    }
  } catch (e) {
    console.warn("[AI Settings] Failed to fetch from DB, using env fallback:", e);
  }
  // Fallback to environment variable
  return process.env.OPENAI_API_KEY || "";
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
