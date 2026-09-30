import { z } from "zod";
import {
  categoryFields,
  categoryWrite,
  type CategoryRow,
} from "@shared/product-categories";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
export const categoryForm = z
  .object({
    name: z.string().max(200),
    nameEn: z.string().max(200),
    parentId: z.string().max(12),
    sortOrder: z.string().max(12),
    active: z.boolean(),
  })
  .strict();
export type CategoryForm = z.infer<typeof categoryForm>;
export const categoryDraft = z
  .object({
    kind: z.enum(["create", "update", "delete"]),
    id: z.number().int().positive().nullable(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    form: categoryForm,
    attempt: categoryWrite.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.kind === "create") !== (v.id === null))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Category target mismatch",
      });
    if (v.attempt) {
      const expected = categoryFormRequest(v, v.attempt.requestId);
      if (
        !expected.success ||
        JSON.stringify(expected.data) !== JSON.stringify(v.attempt)
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Category request mismatch",
        });
    }
  });
export type CategoryDraft = z.infer<typeof categoryDraft>;
export const categoryToForm = (row?: CategoryRow): CategoryForm => ({
  name: row?.name ?? "",
  nameEn: row?.nameEn ?? "",
  parentId: row?.parentId?.toString() ?? "",
  sortOrder: String(row?.sortOrder ?? 0),
  active: row ? row.isActive === 1 : true,
});
export function categoryFormRequest(
  draft: {
    kind: "create" | "update" | "delete";
    id: number | null;
    digest: string;
    form: CategoryForm;
  },
  requestId: string
) {
  const common = {
    kind: draft.kind,
    requestId,
    expectedDigest: draft.digest,
    reviewed: true,
  };
  if (draft.kind === "delete")
    return categoryWrite.safeParse({ ...common, id: draft.id });
  const parsed = categoryFields.safeParse({
    name: draft.form.name,
    nameEn: draft.form.nameEn.trim() || null,
    parentId:
      draft.form.parentId === ""
        ? null
        : /^[1-9]\d*$/.test(draft.form.parentId)
          ? Number(draft.form.parentId)
          : NaN,
    sortOrder: /^\d+$/.test(draft.form.sortOrder)
      ? Number(draft.form.sortOrder)
      : NaN,
    isActive: draft.form.active ? 1 : 0,
  });
  if (!parsed.success) return parsed;
  return categoryWrite.safeParse({
    ...common,
    ...(draft.kind === "update" ? { id: draft.id } : {}),
    fields: parsed.data,
  });
}
const entry = z
  .object({ savedAt: z.number().finite(), draft: categoryDraft })
  .strict();
const prefix = "sary:product-category:v1:";
const key = (scope: string) => {
  if (!/^[1-9]\d*:[1-9]\d*:products$/.test(scope))
    throw Error("Category scope");
  return prefix + scope;
};
export function readCategoryDraft(scope: string): CategoryDraft | null {
  const raw = sessionStorage.getItem(key(scope));
  if (!raw) return null;
  if (raw.length > 12000) throw Error("Category draft too large");
  const value = entry.parse(JSON.parse(raw));
  if (
    !value.draft.attempt &&
    (value.savedAt > Date.now() || Date.now() - value.savedAt > 86400000)
  ) {
    sessionStorage.removeItem(key(scope));
    return null;
  }
  return value.draft;
}
export function saveCategoryDraft(
  scope: string,
  draft: CategoryDraft,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const value = JSON.stringify(entry.parse({ savedAt: Date.now(), draft }));
  if (value.length > 12000) throw Error("Category draft too large");
  sessionStorage.setItem(key(scope), value);
  if (sessionStorage.getItem(key(scope)) !== value)
    throw Error("Category storage unavailable");
}
export function clearCategoryDraft(scope: string, epoch: number) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  sessionStorage.removeItem(key(scope));
  if (sessionStorage.getItem(key(scope)) !== null)
    throw Error("Category cleanup unavailable");
}
