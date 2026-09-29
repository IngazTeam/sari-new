import { z } from "zod";
export const pageListInput = z
  .object({
    search: z.string().trim().max(200).default(""),
    state: z
      .enum(["all", "enabled", "paused", "inactive", "empty"])
      .default("all"),
    page: z.number().int().min(1).max(100000).default(1),
  })
  .default({ search: "", state: "all", page: 1 });
export const pageReadInput = z.object({
  id: z.number().int().positive().max(2147483647),
});
export const pageChangeInput = pageReadInput.extend({
  action: z.enum(["enable", "pause", "delete"]),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledged: z.literal(true),
});
export function pageState(row: {
  isActive: boolean | number;
  useInBot: boolean | number;
  hasContent: boolean;
}) {
  if (!row.isActive) return "inactive" as const;
  if (!row.hasContent) return "empty" as const;
  return row.useInBot ? ("enabled" as const) : ("paused" as const);
}
export function safePageUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export type PageItem = {
  id: number;
  title: string;
  url: string;
  pageType: string;
  state: ReturnType<typeof pageState>;
};
export type PageReview = {
  page: PageItem & { content: string };
  revision: string;
  duplicateCount: number;
  canEnable: boolean;
  sections: Array<{
    id: number;
    title: string;
    content: string;
    state: string;
  }>;
  faqs: Array<{
    id: number;
    question: string;
    answer: string;
    enabled: boolean;
  }>;
};
