import { mysqlTable, varchar, int, text, timestamp, boolean, decimal, mysqlEnum, index } from "drizzle-orm/mysql-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { merchants } from "./schema";

// ============================================
// AI Platform Settings (single global record)
// ============================================
export const aiSettings = mysqlTable("ai_settings", {
  id: int("id").primaryKey().autoincrement(),
  openaiApiKey: text("openai_api_key"), // Stored as-is; masked in frontend
  model: varchar("model", { length: 100 }).notNull().default("gpt-4o-mini"),
  whisperModel: varchar("whisper_model", { length: 100 }).notNull().default("whisper-1"),
  isActive: boolean("is_active").notNull().default(true),
  monthlyBudgetLimit: decimal("monthly_budget_limit", { precision: 10, scale: 2 }),
  // Google Analytics 4
  gaPropertyId: varchar("ga_property_id", { length: 50 }),
  gaServiceAccountJson: text("ga_service_account_json"),
  gaEnabled: boolean("ga_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export type AiSettings = InferSelectModel<typeof aiSettings>;
export type NewAiSettings = InferInsertModel<typeof aiSettings>;

// ============================================
// AI Usage Logs (per-request tracking)
// ============================================
export const aiUsageLogs = mysqlTable("ai_usage_logs", {
  id: int("id").primaryKey().autoincrement(),
  merchantId: int("merchant_id").references(() => merchants.id, { onDelete: "set null" }),
  requestType: mysqlEnum("request_type", ["chat", "whisper", "embedding"]).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  promptTokens: int("prompt_tokens").default(0),
  completionTokens: int("completion_tokens").default(0),
  totalTokens: int("total_tokens").default(0),
  audioDurationSec: int("audio_duration_sec"), // For whisper requests
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 6 }).default("0"),
  durationMs: int("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_usage_merchant").on(table.merchantId),
  index("idx_usage_created").on(table.createdAt),
  index("idx_usage_type").on(table.requestType),
]);

export type AiUsageLog = InferSelectModel<typeof aiUsageLogs>;
export type NewAiUsageLog = InferInsertModel<typeof aiUsageLogs>;
