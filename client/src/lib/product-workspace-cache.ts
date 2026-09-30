import { z } from "zod";
import { productEditorWrite } from "@shared/product-editor";
import { productDeleteWriteInput } from "@shared/product-delete";
import {
  productFormSchema,
  productFormRequest,
} from "./product-workspace-model";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
export const productWorkspaceDraft = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("editor"),
      target: z.union([z.literal("new"), z.number().int().positive()]),
      form: productFormSchema,
      baseline: productFormSchema,
      digest: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
      attempt: productEditorWrite.optional(),
    })
    .strict(),
  z
    .object({ kind: z.literal("delete"), attempt: productDeleteWriteInput })
    .strict(),
]);
export type ProductWorkspaceDraft = z.infer<typeof productWorkspaceDraft>;
const entry = z
  .object({ savedAt: z.number().finite(), draft: productWorkspaceDraft })
  .strict();
const prefix = "sary:product-workspace:v1:";
function key(scope: string) {
  if (!/^[1-9]\d*:[1-9]\d*:products$/.test(scope))
    throw Error("Invalid product scope");
  return prefix + scope;
}
function checked(raw: unknown) {
  const value = entry.parse(raw),
    draft = value.draft;
  if (draft.kind === "editor") {
    if ((draft.target === "new") !== (draft.digest === null))
      throw Error("Invalid product baseline");
    if (draft.attempt) {
      const intended = productFormRequest(
        draft.target,
        draft.form,
        draft.baseline,
        draft.digest,
        draft.attempt.requestId
      );
      if (
        !intended.success ||
        JSON.stringify(intended.data) !== JSON.stringify(draft.attempt)
      )
        throw Error("Product attempt mismatch");
    }
  }
  return value;
}
export function readProductWorkspaceCache(
  scope: string
): ProductWorkspaceDraft | null {
  const name = key(scope),
    raw = sessionStorage.getItem(name);
  if (!raw) return null;
  if (raw.length > 600000) throw Error("Product draft too large");
  const value = checked(JSON.parse(raw));
  if (
    !value.draft.attempt &&
    (value.savedAt > Date.now() || Date.now() - value.savedAt > 86400000)
  ) {
    sessionStorage.removeItem(name);
    return null;
  }
  return value.draft;
}
export function saveProductWorkspaceCache(
  scope: string,
  draft: ProductWorkspaceDraft,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const raw = JSON.stringify(checked({ draft, savedAt: Date.now() })),
    name = key(scope);
  if (raw.length > 600000) throw Error("Product draft too large");
  sessionStorage.setItem(name, raw);
  if (sessionStorage.getItem(name) !== raw)
    throw Error("Product draft unavailable");
}
export function clearProductWorkspaceCache(scope: string, epoch: number) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const name = key(scope);
  sessionStorage.removeItem(name);
  if (sessionStorage.getItem(name) !== null)
    throw Error("Product draft cleanup unavailable");
}
