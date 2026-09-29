import {
  mysqlTable,
  int,
  varchar,
  json,
  datetime,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import { merchants } from "./schema";
import type {
  ImportBasis,
  ImportSnapshot,
  ImportReceipt,
} from "../shared/website-import";
export const websiteImportReviews = mysqlTable(
  "website_import_reviews",
  {
    id: int().autoincrement().primaryKey(),
    merchantId: int("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    previewId: varchar("preview_id", { length: 36 }).notNull(),
    proposal: json().$type<ImportSnapshot>().notNull(),
    basis: json().$type<ImportBasis>().notNull(),
    basisHash: varchar("basis_hash", { length: 64 }).notNull(),
    warnings: json().$type<string[]>().notNull(),
    receipt: json().$type<ImportReceipt>(),
    decisionHash: varchar("decision_hash", { length: 64 }),
    afterHash: varchar("after_hash", { length: 64 }),
    expiresAt: datetime("expires_at", { mode: "string", fsp: 3 }).notNull(),
    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex("uq_website_import_preview").on(
      table.merchantId,
      table.previewId
    ),
    index("idx_website_import_expiry").on(table.merchantId, table.expiresAt),
  ]
);
