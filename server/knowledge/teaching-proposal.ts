import type { knowledgeSections } from "../../drizzle/schema";
import type { TeachingSource } from "./whatsapp-teaching-source";
import { validateTeachingDialogue } from "../ai/teaching-dialogue-understanding";
import { policyHash } from "../ai/teaching-policy-understanding";
const decode = (v: any): any => (typeof v === "string" ? JSON.parse(v) : v);
export type Proposal = Pick<
  typeof knowledgeSections.$inferSelect,
  | "id"
  | "merchantId"
  | "title"
  | "content"
  | "provenance"
  | "status"
  | "sourceUrl"
  | "parentId"
>;
export function parseTeachingProposal(
  merchantId: number,
  proposed: Proposal,
  turn: any
) {
  const p = decode(proposed.provenance);
  if (
    !turn ||
    proposed.merchantId !== merchantId ||
    p?.origin !== "contextual_whatsapp_dialogue" ||
    p.version !== 2 ||
    proposed.sourceUrl !== `whatsapp-dialogue://${p.eventKey}`
  )
    throw Error("Teaching proof unavailable");
  const source = decode(turn.source_json) as TeachingSource,
    context = decode(turn.context_json),
    result = decode(turn.result_json),
    d = validateTeachingDialogue(
      JSON.stringify(decode(turn.decision_json)),
      context.input
    );
  if (
    d.intent !== "submit" ||
    result.sectionId !== proposed.id ||
    source.merchantId !== merchantId ||
    source.digest !== turn.source_digest ||
    source.digest !== p.sourceDigest ||
    source.eventKey !== p.eventKey ||
    source.inboundId !== p.inboundId ||
    source.instanceId !== p.instanceId ||
    context.input.message !== source.text ||
    proposed.title !== d.title
  )
    throw Error("Teaching proof changed");
  const fragments: TeachingSource[] = [
    ...context.fragments,
    ...(d.includeCurrent ? [source] : []),
  ];
  if (
    !fragments.length ||
    fragments.length > 8 ||
    fragments.reduce((n, f) => n + f.text.length, 0) > 12000 ||
    policyHash(
      context.fragments.map((f: TeachingSource) => ({
        inboundId: f.inboundId,
        text: f.text,
      }))
    ) !== policyHash(context.input.draft?.fragments || [])
  )
    throw Error("Teaching fragments changed");
  for (const f of [...fragments, source]) {
    if (
      f.merchantId !== merchantId ||
      f.instanceId !== source.instanceId ||
      f.authorPhone !== source.authorPhone ||
      (f.text.length > 2000 && f !== source)
    )
      throw Error("Teaching proof scope changed");
  }
  const content =
    fragments.length === 1
      ? `المعلومة: ${fragments[0].text.trim()}`
      : fragments
          .map((f, i) => `الجزء ${i + 1} من تعليم التاجر:\n${f.text.trim()}`)
          .join("\n\n");
  if (
    proposed.content !== content ||
    policyHash(p.sourceIds) !== policyHash(fragments.map(f => f.inboundId))
  )
    throw Error("Teaching text changed");
  return { source, fragments, d };
}
