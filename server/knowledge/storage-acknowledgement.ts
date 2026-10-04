export class KnowledgeStorageError extends Error {
  constructor(readonly reason: "unavailable" | "missing" | "unconfirmed") {
    super("knowledge_storage:" + reason);
    this.name = "KnowledgeStorageError";
  }
}
export function verifiedKnowledgeUpdate(result: unknown): void {
  const count = (result as { affectedRows?: unknown } | null)?.affectedRows;
  if (count !== 1)
    throw new KnowledgeStorageError(count === 0 ? "missing" : "unconfirmed");
}
export function verifiedKnowledgeInsert(result: unknown): number {
  const value = result as { affectedRows?: unknown; insertId?: unknown } | null;
  if (
    value?.affectedRows !== 1 ||
    typeof value.insertId !== "number" ||
    !Number.isSafeInteger(value.insertId) ||
    value.insertId < 1 ||
    value.insertId > 2147483647
  ) {
    throw new KnowledgeStorageError("unconfirmed");
  }
  return value.insertId;
}
