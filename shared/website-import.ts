import { z } from "zod";
import { majorToMinor } from "./product-money";
const action = z.enum(["replace", "merge", "skip"]);
export const analysisProductSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(15000).default(""),
  price: z
    .number()
    .finite()
    .refine(value => {
      try {
        majorToMinor(value);
        return true;
      } catch {
        return false;
      }
    }, "Product price requires verification"),
  currency: z.enum(["SAR", "USD"]).default("SAR"),
  imageUrl: z.string().max(500).nullish(),
  productUrl: z.string().max(500).nullish(),
  category: z.string().max(100).nullish(),
});
export const analysisSnapshotSchema = z.object({
  websiteUrl: z.string().url().max(500),
  platform: z.enum([
    "salla",
    "zid",
    "shopify",
    "woocommerce",
    "custom",
    "unknown",
  ]),
  productsAction: action,
  products: z.array(analysisProductSchema).max(2000).default([]),
  faqsAction: action,
  faqs: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(15000),
        answer: z.string().trim().min(1).max(15000),
        category: z.string().max(255).default(""),
      })
    )
    .max(2000)
    .default([]),
  pagesAction: action,
  pages: z
    .array(
      z.object({
        pageType: z.enum([
          "about",
          "shipping",
          "returns",
          "faq",
          "contact",
          "privacy",
          "terms",
          "other",
        ]),
        title: z.string().max(500),
        url: z.string().url().max(1000),
        content: z.string().max(15000).optional(),
      })
    )
    .max(2000)
    .default([]),
  applyContactInfo: z.boolean().default(false),
  contactInfo: z
    .object({
      phones: z.array(z.string().max(20)).max(20).default([]),
      emails: z.array(z.string()).default([]),
      whatsappNumber: z.string().nullable().default(null),
      address: z.string().max(500).nullable().default(null),
    })
    .optional(),
});
export const importChoices = z
  .object({
    productsAction: action,
    faqsAction: action,
    pagesAction: action,
    applyContactInfo: z.boolean(),
  })
  .strict();
export const importPreviewInput = z
  .object({
    websiteUrl: z.string().trim().url().max(500),
    acknowledged: z.literal(true),
  })
  .strict();
export const importReadInput = z
  .object({ previewId: z.string().uuid() })
  .strict();
export const importApplyInput = importReadInput
  .extend({
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    choices: importChoices,
    acknowledged: z.literal(true),
  })
  .strict();
export type ImportChoices = z.infer<typeof importChoices>;
export type ImportSnapshot = z.infer<typeof analysisSnapshotSchema>;
export type ImportBasis = {
  products: Record<string, unknown>[];
  variants: Record<string, unknown>[];
  pages: Record<string, unknown>[];
  faqs: Record<string, unknown>[];
  sections: Record<string, unknown>[];
  merchant: Record<string, unknown>;
};
export type ImportReceipt = {
  success: true;
  savedProducts: number;
  savedPages: number;
  savedFaqs: number;
  pausedSections: number;
  choices: ImportChoices;
  appliedAt: string;
};
export type ImportReview = {
  previewId: string;
  revision: string;
  expiresAt: string;
  proposal: ImportSnapshot;
  current: ImportBasis;
  warnings: string[];
};
export type ImportRead =
  | { state: "review"; review: ImportReview }
  | { state: "applied" | "changed"; receipt: ImportReceipt }
  | { state: "not_found" | "expired" };
