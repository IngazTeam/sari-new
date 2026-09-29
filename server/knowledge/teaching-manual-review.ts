import { createHash } from "node:crypto";

export function isSourcedTeaching(
  provenance: any,
  sourceUrl: unknown
): boolean {
  return (
    ["contextual_whatsapp_teaching", "contextual_whatsapp_dialogue"].includes(
      provenance?.origin
    ) ||
    (typeof sourceUrl === "string" &&
      /^whatsapp-(teaching|dialogue):\/\//.test(sourceUrl))
  );
}

/** Explicit manual review becomes a new, separately auditable source. */
export function manualTeachingReviewHash(input: {
  merchantId: number;
  id: number;
  title: string;
  content: string;
  summary: string | null;
  useInBot: boolean;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.merchantId,
        input.id,
        input.title,
        input.content,
        input.summary,
        input.useInBot,
      ])
    )
    .digest("hex");
}
