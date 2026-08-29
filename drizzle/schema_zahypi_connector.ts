import { sql, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const zahyPiConnectorCredentials = mysqlTable("zahypi_connector_credentials", {
  id: bigint({ mode: "number", unsigned: true }).autoincrement().primaryKey(),
  projectId: varchar("project_id", { length: 64 }).notNull(),
  generation: int({ unsigned: true }).notNull(),
  baseUrl: varchar("base_url", { length: 512 }).notNull(),
  model: varchar({ length: 128 }).notNull(),
  apiKeyCiphertext: text("api_key_ciphertext").notNull(),
  apiKeyHash: char("api_key_hash", { length: 64 }).notNull(),
  apiKeyPrefix: varchar("api_key_prefix", { length: 16 }).notNull(),
  taskTypesJson: text("task_types_json").notNull(),
  taskTypesHash: char("task_types_hash", { length: 64 }).notNull(),
  status: mysqlEnum(["active", "superseded", "revoked"]).default("active").notNull(),
  activatedAt: datetime("activated_at", { mode: "date", fsp: 3 }).notNull(),
  supersededAt: datetime("superseded_at", { mode: "date", fsp: 3 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
}, (table) => [
  uniqueIndex("zahypi_connector_project_generation_unique").on(table.projectId, table.generation),
  index("zahypi_connector_status_idx").on(table.projectId, table.status, table.generation),
  check("zahypi_connector_generation_check", sql`${table.generation} >= 0`),
]);

export const zahyPiConnectorReceipts = mysqlTable("zahypi_connector_receipts", {
  id: bigint({ mode: "number", unsigned: true }).autoincrement().primaryKey(),
  projectId: varchar("project_id", { length: 64 }).notNull(),
  action: mysqlEnum(["bootstrap", "verify"]).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
  bodyHash: char("body_hash", { length: 64 }).notNull(),
  status: mysqlEnum(["pending", "completed"]).default("pending").notNull(),
  responseStatus: int("response_status", { unsigned: true }),
  responseJson: text("response_json"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`CURRENT_TIMESTAMP(3)`).notNull(),
  completedAt: datetime("completed_at", { mode: "date", fsp: 3 }),
}, (table) => [
  uniqueIndex("zahypi_connector_receipt_unique").on(
    table.projectId,
    table.action,
    table.idempotencyKey,
  ),
  index("zahypi_connector_receipt_created_idx").on(table.projectId, table.createdAt),
]);

export type ZahyPiConnectorCredential = InferSelectModel<typeof zahyPiConnectorCredentials>;
export type NewZahyPiConnectorCredential = InferInsertModel<typeof zahyPiConnectorCredentials>;
export type ZahyPiConnectorReceipt = InferSelectModel<typeof zahyPiConnectorReceipts>;
export type NewZahyPiConnectorReceipt = InferInsertModel<typeof zahyPiConnectorReceipts>;
