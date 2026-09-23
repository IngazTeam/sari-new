import { createHash } from 'node:crypto';

type SectionText = { title: string; summary: string | null; content: string };
/** A content digest is also valid for legacy writers: no in-memory revision counter. */
export function sectionContentHash(section: SectionText): string {
  return createHash('sha256').update(JSON.stringify([section.title, section.summary, section.content])).digest('hex');
}

export function normalizeKnowledgeText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(new RegExp('[^\\p{L}\\p{N}\\s]', 'gu'), ' ');
}
const stopWords = new Set('في من عن على الي الى هل هو هي ما ماذا كم كيف مع عندكم عندك ابغي ابي اريد لو سمحت ممكن the a an is are do you what how much can please'.split(' '));
export function knowledgeTerms(question: string): string[] {
  return Array.from(new Set(normalizeKnowledgeText(question).split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.has(word)).map(word => word.replace(/^ال(?=.{3})/, '')))).slice(0, 20);
}

export function lexicalRelevance(question: string, title: string, content: string): number {
  const terms = knowledgeTerms(question);
  if (!terms.length) return 0;
  const heading = normalizeKnowledgeText(title), text = normalizeKnowledgeText(content);
  const matched = terms.filter(term => text.includes(term) || heading.includes(term));
  if (!matched.length) return 0;
  const titleMatches = terms.filter(term => heading.includes(term)).length;
  return Math.min(1, 0.6 * matched.length / terms.length + 0.4 * titleMatches / terms.length);
}

/** Return ranked passages with source offsets. No first-pages fallback on a miss. */
export function relevantPassages(text: string, question: string, limit = 3): Array<{ text: string; start: number; end: number; score: number }> {
  const passages: Array<{ text: string; start: number; end: number; score: number }> = [];
  const bounded = text.slice(0, 500_000);
  for (let start = 0; start < bounded.length; start += 650) {
    const end = Math.min(bounded.length, start + 850), passage = bounded.slice(start, end);
    const score = lexicalRelevance(question, '', passage);
    if (score > 0) passages.push({ text: passage, start, end, score });
  }
  const selected: typeof passages = [];
  for (const passage of passages.sort((a, b) => b.score - a.score || a.start - b.start)) {
    if (selected.some(other => passage.start < other.end && passage.end > other.start)) continue;
    selected.push(passage);
    if (selected.length >= Math.max(1, Math.min(limit, 10))) break;
  }
  return selected;
}
