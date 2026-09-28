export const KNOWLEDGE_PREVIEW_LIMIT = 30_000;
export type KnowledgePreviewFile = { name: string; size: number; type: string; text(): Promise<string> };

// Never silently analyse only part of a knowledge file.
export async function readKnowledgePreview(file: KnowledgePreviewFile) {
  if (!/\.(txt|csv)$/i.test(file.name) && !['text/plain', 'text/csv'].includes(file.type)) {
    return { error: 'unsupported' } as const;
  }
  if (file.size > KNOWLEDGE_PREVIEW_LIMIT * 4) return { error: 'tooLong' } as const;
  try {
    const content = await file.text();
    if (content.length > KNOWLEDGE_PREVIEW_LIMIT) return { error: 'tooLong' } as const;
    if (!content.trim()) return { error: 'empty' } as const;
    return { content, name: file.name } as const;
  } catch {
    return { error: 'unreadable' } as const;
  }
}
