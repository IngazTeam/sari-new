import { z } from "zod";
import { sectionContentFits } from "./knowledge-sections";

export const pageUrlInput = z.object({
  url: z
    .string()
    .trim()
    .max(1000)
    .url()
    .refine(value => {
      try {
        const u = new URL(value);
        return u.protocol === "https:" && !u.username && !u.password && (!u.port || u.port === "443");
      } catch { return false; }
    })
    .transform(value => {
      const u = new URL(value);
      u.hash = "";
      return u.href;
    })
    .refine(value => value.length <= 1000),
});
export const pagePreviewReadInput = z.object({ previewId: z.string().uuid() });
export const pagePreviewSaveInput = pagePreviewReadInput.extend({
  acknowledged: z.literal(true),
});
export const pageSnapshotFields = z.object({
  url: pageUrlInput.shape.url,
  title: z.string().trim().min(1).max(500),
  content: z
    .string()
    .trim()
    .min(1)
    .max(50000)
    .refine(sectionContentFits)
    .refine(v => v.split(/\s+/).length >= 10),
});
export const pageClassification = z.object({
  summary: z.string().max(500),
  sections: z
    .array(
      z.object({
        title: z.string().max(200),
        points: z.array(z.string().max(500)).max(30),
      })
    )
    .max(10),
});
export type PageClassification = z.infer<typeof pageClassification>;
export type PageSnapshot = z.infer<typeof pageSnapshotFields> & {
  analysis: PageClassification | null;
};
export type PagePreview = PageSnapshot & {
  previewId: string;
  expiresAt: string;
  wordCount: number;
};
export type PageIntakeReceipt = {
  state: "saved" | "changed" | "deleted";
  pageId: number;
  sectionId: number;
};
export type PageIntakeRead =
  | { state: "review"; preview: PagePreview }
  | { state: "not_found" | "expired" }
  | PageIntakeReceipt;
