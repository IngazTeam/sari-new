import { beforeEach, expect, it, vi } from 'vitest';
const data = vi.hoisted(() => ({ sections: vi.fn() }));
vi.mock('../db/knowledge', () => ({ getBotSectionsWithEmbedding: data.sections }));
import { hasCurrentKnowledgeEmbeddings, embeddingToBuffer } from '../ai/rag-engine';
import { sectionContentHash } from './retrieval';
import { AUXILIARY_AI_ROUTES } from '../../shared/ai-capabilities';
const valid = () => { const row = { title: 'Warranty', summary: null, content: 'Two years' }; return { ...row, embedding_content_hash: sectionContentHash(row), embedding: embeddingToBuffer(new Float32Array(AUXILIARY_AI_ROUTES.embedding.dimensions).fill(0.1)) }; };
beforeEach(() => vi.clearAllMocks());
it('checks current persisted section versions, scoped to the merchant, without model requests', async () => {
  data.sections.mockResolvedValue([valid()]); expect(await hasCurrentKnowledgeEmbeddings(20)).toBe(true); expect(data.sections).toHaveBeenCalledWith(20);
});
it.each(['missing', 'changed', 'short', 'invalid', 'empty'])('does not certify %s vectors', async failure => {
  const row = valid();
  if (failure === 'missing') row.embedding = null as any;
  if (failure === 'changed') row.content = 'One year';
  if (failure === 'short') row.embedding = Buffer.alloc(3);
  if (failure === 'invalid') row.embedding = embeddingToBuffer(new Float32Array(AUXILIARY_AI_ROUTES.embedding.dimensions).fill(NaN));
  data.sections.mockResolvedValue(failure === 'empty' ? [] : [valid(), row]);
  expect(await hasCurrentKnowledgeEmbeddings(20)).toBe(false);
});
