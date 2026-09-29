import { and, eq, sql } from "drizzle-orm";
import {
  merchantKnowledgeDocs as docs,
  products,
  extractedFaqs as faqs,
  discoveredPages as pages,
} from "../../drizzle/schema";
import { getDb } from "../db/connection";
import { catalogVisibleSql } from "../integrations/catalog-scope";
import type { KnowledgeSourceInventory } from "../../shared/knowledge-source-inventory";

/** Counts describe stored records and switches, never successful retrieval or answer quality. */
export async function readKnowledgeSourceInventory(
  merchantId: number
): Promise<KnowledgeSourceInventory> {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1)
    throw Error("Invalid merchant");
  const db = await getDb();
  if (!db) throw Error("Source inventory unavailable");
  const total = () => sql<number>`COUNT(*)`.mapWith(Number);
  return db.transaction(
    async tx => {
      const [documents] = await tx
        .select({
          total: total(),
          textReady:
            sql<number>`COALESCE(SUM(${docs.extractionStatus} = 'completed' AND COALESCE(${docs.extractedText}, '') REGEXP '[^[:space:]]'), 0)`.mapWith(
              Number
            ),
          empty:
            sql<number>`COALESCE(SUM(${docs.extractionStatus} = 'completed' AND NOT (COALESCE(${docs.extractedText}, '') REGEXP '[^[:space:]]')), 0)`.mapWith(
              Number
            ),
          pending:
            sql<number>`COALESCE(SUM(${docs.extractionStatus} = 'pending'), 0)`.mapWith(
              Number
            ),
          processing:
            sql<number>`COALESCE(SUM(${docs.extractionStatus} = 'processing'), 0)`.mapWith(
              Number
            ),
          failed:
            sql<number>`COALESCE(SUM(${docs.extractionStatus} = 'failed'), 0)`.mapWith(
              Number
            ),
        })
        .from(docs)
        .where(eq(docs.merchantId, merchantId));
      const [catalog] = await tx
        .select({
          total: total(),
          active:
            sql<number>`COALESCE(SUM(${products.isActive} = 1), 0)`.mapWith(
              Number
            ),
        })
        .from(products)
        .where(
          and(eq(products.merchantId, merchantId), sql.raw(catalogVisibleSql()))
        );
      const [questions] = await tx
        .select({
          total: total(),
          enabled:
            sql<number>`COALESCE(SUM(${faqs.sourceStatus} = 'active' AND ${faqs.isActive} = 1 AND ${faqs.useInBot} = 1), 0)`.mapWith(
              Number
            ),
          archived:
            sql<number>`COALESCE(SUM(${faqs.sourceStatus} = 'archived'), 0)`.mapWith(
              Number
            ),
        })
        .from(faqs)
        .where(eq(faqs.merchantId, merchantId));
      const [website] = await tx
        .select({
          total: total(),
          enabled:
            sql<number>`COALESCE(SUM(${pages.isActive} = 1 AND ${pages.useInBot} = 1), 0)`.mapWith(
              Number
            ),
          withText:
            sql<number>`COALESCE(SUM(COALESCE(${pages.content}, '') REGEXP '[^[:space:]]'), 0)`.mapWith(
              Number
            ),
        })
        .from(pages)
        .where(eq(pages.merchantId, merchantId));
      return { documents, products: catalog, faqs: questions, pages: website };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
