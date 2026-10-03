import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ sections: vi.fn(), store: vi.fn(), fetch: vi.fn(), checkpoint: vi.fn() }));
vi.mock('../db/knowledge', () => ({ getBotSectionsWithEmbedding: m.sections, storeSectionEmbedding: m.store }));
vi.mock('./intake-execution', () => ({ assertIntakeCheckpoint: m.checkpoint }));
vi.mock('../ai/auxiliary-routing', () => ({ resolveAuxiliaryAiRoute: async () => ({ apiKey: 'local-test-only' }), assertAuxiliaryAiRouteCurrent: async () => undefined }));
vi.mock('../ai/budget-ledger', () => ({ withAiBudget: async (_: unknown, work: any) => work({ requestId: 'local' }) }));
vi.mock('../ai/zahypi-client', () => ({ getOptionalZahyPiRequestContext: () => undefined }));
import { embedAllSections, embedAllSectionsWithEvidence, embeddingToBuffer } from '../ai/rag-engine';
import { sectionContentHash } from './retrieval';
import { knowledgeIndexingEvidence } from '../../shared/knowledge-indexing-evidence';
import { AUXILIARY_AI_ROUTES } from '../../shared/ai-capabilities';
const dimensions = AUXILIARY_AI_ROUTES.embedding.dimensions;
const section = (id = 1, current = false): any => {
  const row = { id, merchantId: 20, title: 'Private title', summary: null, content: 'Private content' };
  return current ? { ...row, embedding_content_hash: sectionContentHash(row), embedding: embeddingToBuffer(new Float32Array(dimensions).fill(0.1)) } : row;
};
const counts = { selectedSections: 2, attemptedSections: 2, storedSections: 1, reusedSections: 0, unconfirmedSections: 1 };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('fetch', m.fetch);
  m.sections.mockResolvedValue([section()]); m.store.mockResolvedValue(true);
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ embedding: Array(dimensions).fill(0.1) }] }) });
});
afterEach(() => vi.unstubAllGlobals());
it('distinguishes an unconfirmed write from provider output and checks the persisted current versions', async () => {
  m.sections.mockResolvedValueOnce([section(), section(2)]).mockResolvedValueOnce([section(1, true), section(2)]);
  m.store.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect(await embedAllSectionsWithEvidence(20, true)).toEqual({ ...counts, currentSnapshot: { sections: 2, matchingEmbeddings: 1, changedSinceStart: false } });
  expect(m.sections).toHaveBeenNthCalledWith(1, 20); expect(m.sections).toHaveBeenNthCalledWith(2, 20);
  expect(m.store.mock.calls.every(call => call[1] === 20)).toBe(true);
});
it('reports a null embedding as unconfirmed without calling storage', async () => {
  m.fetch.mockRejectedValue(Error('PRIVATE_PROVIDER_TOKEN'));
  const report = await embedAllSectionsWithEvidence(20, true);
  expect(report).toMatchObject({ attemptedSections: 1, storedSections: 0, unconfirmedSections: 1, currentSnapshot: { matchingEmbeddings: 0 } });
  expect(m.store).not.toHaveBeenCalled(); expect(JSON.stringify(report)).not.toMatch(/Private|PRIVATE|content|title/);
});
it('keeps a failed refresh separate from a still matching previous embedding', async () => {
  m.sections.mockResolvedValue([section(1, true)]); m.fetch.mockRejectedValue(Error('offline'));
  expect(await embedAllSectionsWithEvidence(20, true)).toMatchObject({ storedSections: 0, unconfirmedSections: 1, currentSnapshot: { matchingEmbeddings: 1, changedSinceStart: false } });
});
it.each(['snake', 'camel'])('reuses a valid %s-case hash without another provider request', async casing => {
  const row = section(1, true); if (casing === 'camel') { row.embeddingContentHash = row.embedding_content_hash; delete row.embedding_content_hash; }
  m.sections.mockResolvedValue([row]);
  expect(await embedAllSectionsWithEvidence(20)).toMatchObject({ selectedSections: 1, attemptedSections: 0, storedSections: 0, reusedSections: 1, unconfirmedSections: 0 });
  expect(m.fetch).not.toHaveBeenCalled();
});
it.each(['short', 'nan', 'changed', 'missing'])('tries a %s vector even when forceAll is false', async fault => {
  const row = section(1, true);
  if (fault === 'short') row.embedding = Buffer.alloc(3);
  if (fault === 'nan') row.embedding = embeddingToBuffer(new Float32Array(dimensions).fill(NaN));
  if (fault === 'changed') row.content = 'Changed during a previous run';
  if (fault === 'missing') delete row.embedding;
  m.sections.mockResolvedValue([row]);
  expect(await embedAllSections(20)).toBe(1); expect(m.fetch).toHaveBeenCalledOnce();
});
it.each(['edit', 'add', 'remove', 'replace'])('detects %s during the batch independently of successful writes', async change => {
  const first = section(); let current = [section(1, true)];
  if (change === 'edit') current[0].content = 'New text after indexing';
  if (change === 'add') current.push(section(2));
  if (change === 'remove') current = [];
  if (change === 'replace') current = [section(2, true)];
  m.sections.mockResolvedValueOnce([first]).mockResolvedValueOnce(current);
  const report = await embedAllSectionsWithEvidence(20, true);
  expect(report.storedSections).toBe(1); expect(report.currentSnapshot?.changedSinceStart).toBe(true);
  if (change === 'edit') expect(report.currentSnapshot?.matchingEmbeddings).toBe(0);
});
it('does not count ordering or freshly stored vectors as a content change', async () => {
  m.sections.mockResolvedValueOnce([section(), section(2)]).mockResolvedValueOnce([section(2, true), section(1, true)]);
  expect(await embedAllSectionsWithEvidence(20, true)).toMatchObject({ storedSections: 2, currentSnapshot: { sections: 2, matchingEmbeddings: 2, changedSinceStart: false } });
});
it('keeps an unavailable final read unknown while preserving batch counts', async () => {
  m.sections.mockResolvedValueOnce([section()]).mockRejectedValueOnce(Error('PRIVATE_DATABASE_ERROR'));
  expect(await embedAllSectionsWithEvidence(20, true)).toEqual({ selectedSections: 1, attemptedSections: 1, storedSections: 1, reusedSections: 0, unconfirmedSections: 0, currentSnapshot: null });
});
it('represents an empty scope as empty counts without claiming readiness', async () => {
  m.sections.mockResolvedValue([]);
  expect(await embedAllSectionsWithEvidence(20)).toEqual({ selectedSections: 0, attemptedSections: 0, storedSections: 0, reusedSections: 0, unconfirmedSections: 0, currentSnapshot: { sections: 0, matchingEmbeddings: 0, changedSinceStart: false } });
  expect(m.fetch).not.toHaveBeenCalled();
});
it('does not recover an unreadable starting snapshot as an empty successful batch', async () => {
  m.sections.mockRejectedValue(Error('read failed'));
  await expect(embedAllSectionsWithEvidence(20)).rejects.toThrow('read failed'); expect(m.fetch).not.toHaveBeenCalled();
});
it('stops the batch on execution expiry without calling the provider or reading a success snapshot', async () => {
  m.checkpoint.mockRejectedValue(Error('expired'));
  await expect(embedAllSectionsWithEvidence(20)).rejects.toThrow('expired');
  expect(m.fetch).not.toHaveBeenCalled(); expect(m.sections).toHaveBeenCalledTimes(1);
});
it('does not return a successful report after an uncertain storage error', async () => {
  m.store.mockRejectedValue(Error('connection lost'));
  await expect(embedAllSectionsWithEvidence(20)).rejects.toThrow('connection lost'); expect(m.sections).toHaveBeenCalledTimes(1);
});
it('rejects finite provider numbers that overflow the persisted Float32 vector', async () => {
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ embedding: Array(dimensions).fill(1e100) }] }) });
  expect(await embedAllSectionsWithEvidence(20)).toMatchObject({ storedSections: 0, unconfirmedSections: 1 }); expect(m.store).not.toHaveBeenCalled();
});
it('keeps the legacy count signature and single snapshot read', async () => {
  m.sections.mockResolvedValue([section(), section(2)]); m.store.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect(await embedAllSections(20, true)).toBe(1); expect(m.sections).toHaveBeenCalledTimes(1);
});
it.each([
  { storedSections: 3 }, { selectedSections: 3 }, { attemptedSections: '2' }, { unconfirmedSections: -1 },
  { reusedSections: Infinity }, { currentSnapshot: { sections: 1, matchingEmbeddings: 2, changedSinceStart: false } },
  { currentSnapshot: { sections: 1, matchingEmbeddings: 1, changedSinceStart: 'false' } }, { privateValue: 'hidden' },
])('rejects incoherent or extra evidence %j', patch => {
  expect(knowledgeIndexingEvidence.safeParse({ ...counts, currentSnapshot: null, ...patch }).success).toBe(false);
});
