import { createHash } from "node:crypto";
import { and, eq, getTableColumns } from "drizzle-orm";
import {
  knowledgeSections as sections,
  knowledgeChangelog as changelog,
} from "../../drizzle/schema";
import { getDb } from "../db/connection";
import type { InsertKnowledgeSection } from "../db/knowledge";
import { withKnowledgeTransaction } from "./transaction";
import {
  KnowledgeStorageError,
  verifiedKnowledgeInsert,
  verifiedKnowledgeUpdate,
} from "./storage-acknowledgement";

// Embedding publication changes updatedAt as well. Neither is input to a model
// decision; all source, moderation, hierarchy and provenance fields are.
const { embedding, embeddingContentHash, updatedAt, ...columns } =
  getTableColumns(sections);
export type EvolutionSection = Pick<
  typeof sections.$inferSelect,
  keyof typeof columns
>;
export type EvolutionSnapshot = {
  merchantId: number;
  sections: EvolutionSection[];
  revision: string;
};
type Audit = {
  action: "add" | "conflict" | "evolve";
  reason: string;
  oldContent?: string;
  newContent: string;
  source: string;
};
type NewValues = Omit<
  InsertKnowledgeSection,
  "merchantId" | "embedding" | "validUntil" | "provenance"
>;
type UpdateValues = Pick<
  InsertKnowledgeSection,
  "content" | "summary" | "confidence" | "source" | "sourceUrl"
>;
export type EvolutionOperation =
  | { kind: "create"; temporaryId: number; values: NewValues; audit: Audit }
  | { kind: "update"; id: number; values: Partial<UpdateValues>; audit: Audit };

// The same projection/order is used before analysis and under the commit lock.
const revision = (merchantId: number, rows: EvolutionSection[]) =>
  createHash("sha256")
    .update(JSON.stringify([merchantId, rows]))
    .digest("hex");

export async function readEvolutionSnapshot(
  merchantId: number
): Promise<EvolutionSnapshot> {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1)
    throw new Error("Invalid merchant");
  const database = await getDb();
  if (!database) throw new KnowledgeStorageError("unavailable");
  const rows = await database
    .select(columns)
    .from(sections)
    .where(eq(sections.merchantId, merchantId))
    .orderBy(sections.sortOrder, sections.createdAt, sections.id);
  return { merchantId, sections: rows, revision: revision(merchantId, rows) };
}

/** No model calls here. A failed write rolls back sections, audit and cache changes together. */
export async function commitEvolution(
  snapshot: EvolutionSnapshot,
  operations: EvolutionOperation[]
): Promise<void> {
  const { merchantId } = snapshot;
  await withKnowledgeTransaction(merchantId, async tx => {
    const current = await tx
      .select(columns)
      .from(sections)
      .where(eq(sections.merchantId, merchantId))
      .orderBy(sections.sortOrder, sections.createdAt, sections.id)
      .for("update");
    if (revision(merchantId, current) !== snapshot.revision)
      throw new Error("knowledge_evolution:stale_snapshot");
    // Fresh per transaction attempt: rolled-back generated IDs must never be reused.
    const identities = new Map<number, number>();
    const known = new Map(current.map(row => [row.id, row]));
    const resolve = (id: number) => {
      const actual = id < 0 ? identities.get(id) : id;
      if (!actual || !known.has(actual))
        throw new Error("knowledge_evolution:invalid_reference");
      return actual;
    };
    for (const operation of operations) {
      let id: number;
      if (operation.kind === "create") {
        if (
          !Number.isSafeInteger(operation.temporaryId) ||
          operation.temporaryId >= 0 ||
          identities.has(operation.temporaryId)
        )
          throw new Error("knowledge_evolution:invalid_reference");
        const value = operation.values;
        const parentId =
          value.parentId == null ? null : resolve(value.parentId);
        const insert = {
          merchantId,
          parentId,
          sectionType: value.sectionType,
          title: value.title.substring(0, 500),
          content: value.content,
          summary: value.summary?.substring(0, 1000) ?? null,
          source: value.source,
          sourceUrl: value.sourceUrl ?? null,
          confidence: String(value.confidence ?? 0.9),
          status: value.status ?? ("auto_approved" as const),
          useInBot: value.useInBot === false ? 0 : 1,
          injectAs: value.injectAs ?? ("fact" as const),
          sortOrder: value.sortOrder ?? 0,
          merchantEdited: value.merchantEdited ? 1 : 0,
        };
        const [ack] = await tx.insert(sections).values(insert);
        id = verifiedKnowledgeInsert(ack);
        identities.set(operation.temporaryId, id);
        known.set(id, {
          ...insert,
          id,
          validUntil: null,
          provenance: null,
          createdAt: "",
        });
      } else {
        id = resolve(operation.id);
        if (known.get(id)!.merchantEdited)
          throw new Error("knowledge_evolution:protected_section");
        const value = operation.values;
        const [ack] = await tx
          .update(sections)
          .set({
            content: value.content,
            summary: value.summary?.substring(0, 1000),
            confidence:
              value.confidence === undefined
                ? undefined
                : String(value.confidence),
            source: value.source,
            sourceUrl: value.sourceUrl,
            embedding: null,
            embeddingContentHash: null,
          })
          .where(and(eq(sections.id, id), eq(sections.merchantId, merchantId)));
        verifiedKnowledgeUpdate(ack);
      }
      const [auditAck] = await tx
        .insert(changelog)
        .values({ merchantId, sectionId: id, ...operation.audit });
      verifiedKnowledgeInsert(auditAck);
    }
  });
}
