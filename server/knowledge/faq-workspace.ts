import { createHash } from "node:crypto";
import { and, eq, desc, sql, or, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { extractedFaqs as table, sariActivityLog } from "../../drizzle/schema";
import { getDb } from "../db/connection";
import { withKnowledgeTransaction } from "./transaction";
import {
  faqCreateInput,
  faqDeleteInput,
  faqListInput,
  faqUpdateInput,
  type FaqItem,
} from "../../shared/knowledge-faq";
import type { z } from "zod";

type Row = typeof table.$inferSelect;
export function faqRevision(row: Row) {
  // Usage counters change during normal replies and must not invalidate a merchant's edit.
  return createHash("sha256")
    .update(
      JSON.stringify([
        row.id,
        row.merchantId,
        row.question,
        row.answer,
        row.category,
        row.isActive,
        row.useInBot,
        row.priority,
        row.pageId,
        row.syncSource,
        row.externalId,
        row.sourceStatus,
      ])
    )
    .digest("hex");
}
function item(row: Row): FaqItem {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    category: row.category || "",
    isActive: row.isActive === 1,
    useInBot: row.useInBot === 1,
    revision: faqRevision(row),
    pageId: row.pageId,
    syncSource: row.syncSource,
    requestId: row.externalId?.startsWith("manual:")
      ? row.externalId.slice(7)
      : null,
  };
}
export async function listFaqWorkspace(
  merchantId: number,
  input: z.infer<typeof faqListInput>
) {
  const db = await getDb();
  if (!db) throw Error("Database unavailable");
  const filter = and(
    eq(table.merchantId, merchantId),
    eq(table.sourceStatus, "active"),
    input.status === "enabled"
      ? and(eq(table.isActive, 1), eq(table.useInBot, 1))
      : input.status === "paused"
        ? or(eq(table.isActive, 0), eq(table.useInBot, 0))
        : undefined,
    input.search
      ? or(
          like(table.question, `%${input.search.replace(/[\\%_]/g, "\\$&")}%`),
          like(table.answer, `%${input.search.replace(/[\\%_]/g, "\\$&")}%`)
        )
      : undefined
  );
  return db.transaction(
    async tx => {
      const [count] = await tx
        .select({ total: sql<number>`count(*)` })
        .from(table)
        .where(filter);
      const total = Number(count.total),
        totalPages = Math.max(1, Math.ceil(total / 12)),
        page = Math.min(input.page, totalPages);
      const rows = await tx
        .select()
        .from(table)
        .where(filter)
        .orderBy(desc(table.id))
        .limit(12)
        .offset((page - 1) * 12);
      return { items: rows.map(item), total, page, totalPages };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
export async function createWorkspaceFaq(
  merchantId: number,
  raw: z.infer<typeof faqCreateInput>
) {
  const input = faqCreateInput.parse(raw);
  return withKnowledgeTransaction(merchantId, async tx => {
    const values = {
      question: input.question,
      answer: input.answer,
      category: input.category || "عام",
      isActive: input.isActive === false ? 0 : 1,
      useInBot: input.useInBot === false ? 0 : 1,
    };
    const externalId = input.requestId ? `manual:${input.requestId}` : null;
    if (externalId) {
      const [prior] = await tx
        .select()
        .from(table)
        .where(
          and(
            eq(table.merchantId, merchantId),
            eq(table.syncSource, "extracted"),
            eq(table.externalId, externalId)
          )
        )
        .for("update");
      if (prior) {
        if (
          prior.sourceStatus !== "active" ||
          Object.entries(values).some(
            ([key, value]) => prior[key as keyof Row] !== value
          )
        )
          throw new TRPCError({
            code: "CONFLICT",
            message: "FAQ request changed",
          });
        return { success: true, id: prior.id };
      }
    }
    const [count] = await tx
      .select({ total: sql<number>`count(*)` })
      .from(table)
      .where(
        and(eq(table.merchantId, merchantId), eq(table.sourceStatus, "active"))
      );
    if (Number(count.total) >= 50)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "FAQ limit reached",
      });
    const [created] = await tx
      .insert(table)
      .values({ merchantId, ...values, externalId });
    const id = Number(created.insertId);
    await tx
      .insert(sariActivityLog)
      .values({
        merchantId,
        actionType: "faq_created",
        description: "تم حفظ سؤال شائع",
        details: JSON.stringify({
          faqId: id,
          useInBot: values.useInBot,
          isActive: values.isActive,
        }),
      });
    return { success: true, id };
  });
}
export async function changeWorkspaceFaq(
  merchantId: number,
  raw: z.infer<typeof faqUpdateInput> | z.infer<typeof faqDeleteInput>,
  remove = false
) {
  const input = remove ? faqDeleteInput.parse(raw) : faqUpdateInput.parse(raw);
  return withKnowledgeTransaction(merchantId, async tx => {
    const where = and(
      eq(table.merchantId, merchantId),
      eq(table.id, input.id),
      eq(table.sourceStatus, "active")
    );
    const [row] = await tx.select().from(table).where(where).for("update");
    if (!row)
      throw new TRPCError({ code: "NOT_FOUND", message: "FAQ unavailable" });
    if (input.expectedRevision && input.expectedRevision !== faqRevision(row))
      throw new TRPCError({
        code: "CONFLICT",
        message: "FAQ changed; reload before applying",
      });
    if (remove) await tx.delete(table).where(where);
    else {
      const patch = faqUpdateInput.parse(input),
        values: Partial<Row> = {};
      for (const key of ["question", "answer", "category"] as const)
        if (patch[key] !== undefined) values[key] = patch[key];
      for (const key of ["isActive", "useInBot"] as const)
        if (patch[key] !== undefined) values[key] = patch[key] ? 1 : 0;
      if (!Object.keys(values).length)
        throw new TRPCError({ code: "BAD_REQUEST", message: "No FAQ changes" });
      await tx.update(table).set(values).where(where);
    }
    await tx
      .insert(sariActivityLog)
      .values({
        merchantId,
        actionType: remove ? "faq_deleted" : "faq_updated",
        description: remove ? "تم حذف سؤال شائع" : "تم تعديل سؤال شائع",
        details: JSON.stringify({
          faqId: row.id,
          previousRevision: faqRevision(row),
        }),
      });
    return { success: true };
  });
}
