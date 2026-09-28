import { createHash } from 'node:crypto';
import { knowledgeSections as sections } from '../../drizzle/schema';

// Intentionally excludes indexing, confidence, source attribution and timestamps.
// A later source can update attribution without changing the text or its settings.
export const sectionComparisonColumns = {
  id: sections.id, title: sections.title, content: sections.content, summary: sections.summary,
  sectionType: sections.sectionType, parentId: sections.parentId, status: sections.status,
  useInBot: sections.useInBot, injectAs: sections.injectAs, validUntil: sections.validUntil,
};
type Section = Pick<typeof sections.$inferSelect, keyof typeof sectionComparisonColumns>;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function sectionFingerprints(row: Section) {
  return {
    contentHash: hash([row.sectionType, row.title, row.content, row.summary || '']),
    settingsHash: hash([row.parentId, row.status, !!row.useInBot, row.injectAs, row.validUntil]),
  };
}
