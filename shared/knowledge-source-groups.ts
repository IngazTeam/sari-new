import { z } from "zod";
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const date = z.string().datetime().nullable();
const anchor = z.number().int().positive().nullable();
export const knowledgeSourceGroups = z.object({
  merchantId: z.number().int().positive(),
  businessName: z.string().max(255),
  documents: z.object({ total: count, textReady: count, empty: count, pending: count, processing: count, failed: count, latestUploadedAt: date, removalAnchorId: anchor }).strict(),
  products: z.object({ total: count, visible: count, activeVisible: count, latestModifiedAt: date }).strict(),
  website: z.object({ analyses: count, pages: count, enabledPages: count, pagesWithText: count, latestAnalysisAt: date, latestPageUpdateAt: date, removalAnchorId: anchor }).strict(),
  faqs: z.object({ total: count, enabled: count, archived: count, latestModifiedAt: date }).strict(),
  sections: z.object({ total: count, switchedOn: count, latestModifiedAt: date }).strict(),
  settings: z.object({ createdAt: date, modifiedAt: date }).strict(),
}).strict().superRefine((v, ctx) => {
  const d = v.documents, p = v.products, w = v.website, f = v.faqs;
  if (d.textReady + d.empty + d.pending + d.processing + d.failed !== d.total
    || (d.total > 0) !== (d.removalAnchorId !== null)
    || p.activeVisible > p.visible || p.visible > p.total
    || w.enabledPages > w.pages || w.pagesWithText > w.pages
    || (w.analyses > 0) !== (w.removalAnchorId !== null)
    || f.enabled + f.archived > f.total || v.sections.switchedOn > v.sections.total)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent stored source counts" });
});
export type KnowledgeSourceGroups = z.infer<typeof knowledgeSourceGroups>;
