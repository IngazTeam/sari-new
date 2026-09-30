import { z } from "zod";
export const PRODUCT_CATEGORY_LIMIT = 1000;
export const PRODUCT_CATEGORY_DEPTH = 8;
const id = z.number().int().positive().max(2147483647);
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(v => !/[\u0000-\u001f\u007f]/.test(v));
const name = text(100)
  .transform(v => v.trim())
  .refine(v => v.length > 0);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const toggle = z.union([z.literal(0), z.literal(1)]);
export const categoryFields = z
  .object({
    name,
    nameEn: text(100)
      .transform(v => v.trim())
      .nullable(),
    parentId: id.nullable(),
    sortOrder: z.number().int().min(0).max(100000),
    isActive: toggle,
  })
  .strict();
export const categoryRow = z
  .object({
    id,
    merchantId: id,
    name: text(100),
    nameEn: text(100).nullable(),
    parentId: id.nullable(),
    sortOrder: z.number().int(),
    isActive: toggle,
    // Products include inactive/archived records: deletion must not orphan them.
    productCount: z.number().int().min(0).max(2147483647),
  })
  .strict();
export const categorySelection = z
  .object({
    search: z.string().trim().max(100).default(""),
    state: z.enum(["all", "active", "inactive"]).default("all"),
  })
  .strict();
const request = {
  requestId: z.string().uuid(),
  expectedDigest: digest,
  reviewed: z.literal(true),
};
export const categoryWrite = z.discriminatedUnion("kind", [
  z
    .object({ ...request, kind: z.literal("create"), fields: categoryFields })
    .strict(),
  z
    .object({
      ...request,
      kind: z.literal("update"),
      id,
      fields: categoryFields
        .partial()
        .refine(v => Object.values(v).some(value => value !== undefined)),
    })
    .strict(),
  z.object({ ...request, kind: z.literal("delete"), id }).strict(),
]);
export const categoryReceipt = z
  .object({
    merchantId: id,
    actorId: id,
    requestId: z.string().uuid(),
    categoryId: id,
    kind: z.enum(["create", "update", "delete"]),
    digest,
    confirmedAt: z.string().datetime(),
  })
  .strict();
export const categoryReceiptInput = z
  .object({ requestId: z.string().uuid() })
  .strict();
export const categorySnapshot = z
  .object({
    merchantId: id,
    actorId: id,
    canManage: z.boolean(),
    locked: z.boolean(),
    digest,
    rows: z.array(categoryRow).max(PRODUCT_CATEGORY_LIMIT),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.rows.some(row => row.merchantId !== v.merchantId) ||
      new Set(v.rows.map(row => row.id)).size !== v.rows.length
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Category scope mismatch",
        path: ["rows"],
      });
  });
export type CategoryRow = z.infer<typeof categoryRow>;
export type CategoryWrite = z.infer<typeof categoryWrite>;
export type CategoryFields = z.infer<typeof categoryFields>;
export type CategoryIssue =
  | "parent_missing"
  | "cycle"
  | "depth"
  | "inactive_parent";
export type CategoryPlanError =
  | "scope"
  | "limit"
  | "missing"
  | "in_use"
  | "duplicate"
  | "no_change"
  | CategoryIssue;
export class CategoryPlanFailure extends Error {
  constructor(public reason: CategoryPlanError) {
    super(`category:${reason}`);
  }
}
// UI and server use the same bounded ancestry walk; no recursion on stored data.
export function categoryPath(
  rows: readonly CategoryRow[],
  categoryId: number
): { path: CategoryRow[]; issue: CategoryIssue | null } {
  const lookup = new Map(rows.map(row => [row.id, row])),
    seen = new Set<number>(),
    path: CategoryRow[] = [];
  let next: number | null = categoryId;
  while (next !== null) {
    if (seen.has(next)) return { path, issue: "cycle" };
    if (path.length >= PRODUCT_CATEGORY_DEPTH) return { path, issue: "depth" };
    const row = lookup.get(next);
    if (!row) return { path, issue: "parent_missing" };
    seen.add(next);
    path.unshift(row);
    next = row.parentId;
  }
  return { path, issue: null };
}
const nameKey = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("en");
export function planCategoryChange(
  merchantId: number,
  rawRows: unknown,
  raw: unknown
) {
  id.parse(merchantId);
  const rows = z.array(categoryRow).max(PRODUCT_CATEGORY_LIMIT).parse(rawRows),
    input = categoryWrite.parse(raw);
  if (
    rows.some(row => row.merchantId !== merchantId) ||
    new Set(rows.map(row => row.id)).size !== rows.length
  )
    throw new CategoryPlanFailure("scope");
  const current =
    input.kind === "create" ? null : rows.find(row => row.id === input.id);
  if (input.kind !== "create" && !current)
    throw new CategoryPlanFailure("missing");
  if (input.kind === "delete") {
    if (
      current!.productCount > 0 ||
      rows.some(row => row.parentId === current!.id)
    )
      throw new CategoryPlanFailure("in_use");
    return {
      kind: input.kind,
      before: current!,
      after: null,
      changes: [],
      linkedProducts: 0,
    };
  }
  if (input.kind === "create" && rows.length >= PRODUCT_CATEGORY_LIMIT)
    throw new CategoryPlanFailure("limit");
  const after = categoryFields.parse(
    current
      ? {
          name: current.name,
          nameEn: current.nameEn,
          parentId: current.parentId,
          isActive: current.isActive,
          sortOrder: current.sortOrder,
          ...input.fields,
        }
      : input.fields
  );
  // A new row uses a negative in-memory key only while planning; never persisted.
  const node: CategoryRow = {
    ...after,
    id: current?.id ?? -1,
    merchantId,
    productCount: current?.productCount ?? 0,
  };
  const candidate = [...rows.filter(row => row.id !== node.id), node];
  const affected = candidate.filter(row => {
    if (row.id === node.id) return true;
    // Descendants need validation too: a move can exceed depth or deactivate an ancestor.
    return categoryPath(rows, row.id).path.some(
      parent => parent.id === node.id
    );
  });
  for (const row of affected) {
    const result = categoryPath(candidate, row.id);
    if (result.issue) throw new CategoryPlanFailure(result.issue);
    if (
      row.isActive === 1 &&
      result.path.slice(0, -1).some(parent => parent.isActive !== 1)
    )
      throw new CategoryPlanFailure("inactive_parent");
  }
  if (
    candidate.some(
      row =>
        row.id !== node.id &&
        row.parentId === node.parentId &&
        nameKey(row.name) === nameKey(node.name)
    )
  )
    throw new CategoryPlanFailure("duplicate");
  const changes = (Object.keys(after) as (keyof CategoryFields)[]).filter(
    key => !current || after[key] !== current[key]
  );
  if (!changes.length) throw new CategoryPlanFailure("no_change");
  return {
    kind: input.kind,
    before: current ?? null,
    after,
    changes,
    linkedProducts: current?.productCount ?? 0,
  };
}
