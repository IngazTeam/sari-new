import { z } from "zod";

export class KnowledgeAnalysisError extends Error {
  constructor(
    readonly stage:
      | "classification"
      | "sales"
      | "evolution"
      | "empty_classification"
  ) {
    super(`knowledge_analysis:${stage}_unavailable`);
    this.name = "KnowledgeAnalysisError";
  }
}

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const fields = z
  .object({
    sectionType: z.enum([
      "identity",
      "services",
      "policies",
      "faq",
      "contact",
      "team",
      "achievements",
      "custom",
    ]),
    title: text(500),
    content: text(100000),
    summary: text(1000),
    confidence: z.number().min(0.5).max(1),
  })
  .strict();
// The writer supports a parent and its immediate children. Reject deeper
// output explicitly instead of silently losing unpersisted descendants.
const child = fields
  .extend({ children: z.array(z.never()).max(0).optional() })
  .strict();
const sections = z
  .array(
    fields.extend({ children: z.array(child).max(100).optional() }).strict()
  )
  .max(100)
  .refine(
    rows => rows.reduce((n, r) => n + 1 + (r.children?.length || 0), 0) <= 200
  );
const sales = z
  .object({
    usps: z.array(text(2000)).max(20),
    sellingTips: z.array(text(2000)).max(20),
    opportunities: z.array(text(2000)).max(20),
  })
  .strict();

function json(response: unknown) {
  if (typeof response !== "string" || response.length > 400000)
    throw new Error("Invalid model response");
  const body = response.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(body);
  return JSON.parse(fenced ? fenced[1] : body);
}
export function parseKnowledgeSections(response: unknown) {
  try {
    return sections.parse(json(response));
  } catch {
    throw new KnowledgeAnalysisError("classification");
  }
}
export function parseSalesIntelligence(response: unknown) {
  try {
    return sales.parse(json(response));
  } catch {
    throw new KnowledgeAnalysisError("sales");
  }
}

/** Keep the complete supported hierarchy in the sales prompt. Never silently
 * replace source details with a short summary or discard children. */
export function formatSalesKnowledge(input: unknown) {
  try {
    const value = sections.parse(input);
    if (!value.length) throw new Error("No knowledge evidence");
    const result = JSON.stringify(value);
    if (result.length > 400000) throw new Error("Knowledge evidence too large");
    return result;
  } catch {
    throw new KnowledgeAnalysisError("sales");
  }
}
