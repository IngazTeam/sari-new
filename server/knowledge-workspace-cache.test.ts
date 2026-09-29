import { webcrypto } from 'node:crypto';
// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cacheKnowledgeDraft, clearKnowledgeWorkspace, discardKnowledgeDraft, forgetKnowledgeAttempt, hasKnowledgeDrafts, knowledgeCacheEpoch, knowledgeWorkspaceKey, readKnowledgeAttempt, readKnowledgeDraft, rememberKnowledgeAttempt, knowledgeFileFingerprint, readKnowledgeUploadFingerprint, rememberKnowledgeUpload } from '../client/src/lib/knowledge-workspace-cache';
const draft = { name: 'Private company policy', content: 'Sensitive unsaved instructions', type: 'document' as const, sourceDocument: { id: 9, revision: 'a'.repeat(64) } };
const id = '00000000-0000-4000-8000-000000000001';
beforeEach(() => { clearKnowledgeWorkspace(); sessionStorage.clear(); localStorage.clear(); });
afterEach(() => vi.restoreAllMocks());
it('isolates drafts and requests by API account, merchant and source without persisting text or source revisions', () => {
  const key = knowledgeWorkspaceKey(1, 2, 'text-source-9');
  cacheKnowledgeDraft(key, draft, knowledgeCacheEpoch()); rememberKnowledgeAttempt(key, id, knowledgeCacheEpoch());
  expect(readKnowledgeDraft(key)).toEqual(draft); expect(readKnowledgeAttempt(key)).toBe(id);
  for (const other of [knowledgeWorkspaceKey(3, 2, 'text-source-9'), knowledgeWorkspaceKey(1, 3, 'text-source-9'), knowledgeWorkspaceKey(1, 2, 'text-source-10'), knowledgeWorkspaceKey(1, 2, 'text')]) {
    expect(readKnowledgeDraft(other)).toBeNull(); expect(readKnowledgeAttempt(other)).toBeNull();
  }
  expect(Object.values(sessionStorage)).toEqual([id]); expect(localStorage.length).toBe(0);
  readKnowledgeDraft(key)!.content = 'Mutated copy'; expect(readKnowledgeDraft(key)?.content).toBe(draft.content);
});
it('warns on unload only for unsaved text and removes warnings after discarding', () => {
  cacheKnowledgeDraft('test', draft, knowledgeCacheEpoch());
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  discardKnowledgeDraft('test'); const cleared = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(cleared); expect(cleared.defaultPrevented).toBe(false);
});
it('clears only its own storage at logout and prevents late callbacks from restoring cleared state', () => {
  const epoch = knowledgeCacheEpoch(); sessionStorage.setItem('unrelated', 'keep');
  cacheKnowledgeDraft('test', draft, epoch); rememberKnowledgeAttempt('test', id, epoch); clearKnowledgeWorkspace();
  cacheKnowledgeDraft('test', draft, epoch); expect(hasKnowledgeDrafts()).toBe(false);
  expect(() => rememberKnowledgeAttempt('test', id, epoch)).toThrow('Session changed');
  expect(readKnowledgeAttempt('test')).toBeNull(); expect(sessionStorage.getItem('unrelated')).toBe('keep');
});
it('never replaces an existing reference, including corrupted or unreadable storage', () => {
  rememberKnowledgeAttempt('test', id, knowledgeCacheEpoch());
  expect(() => rememberKnowledgeAttempt('test', '00000000-0000-4000-8000-000000000002', knowledgeCacheEpoch())).toThrow();
  forgetKnowledgeAttempt('test', 'different'); expect(readKnowledgeAttempt('test')).toBe(id);
  sessionStorage.setItem('sary:knowledge-attempt:v1:test', 'invalid'); expect(() => readKnowledgeAttempt('test')).toThrow();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('Blocked storage'); });
  expect(() => rememberKnowledgeAttempt('test', id, knowledgeCacheEpoch())).toThrow();
});

it('binds retry identity to complete bytes and exact filename, without storing either', async () => {
  vi.stubGlobal('crypto', webcrypto);
  try {
    const file = (name: string, content: string) => ({ name, arrayBuffer: async () => new TextEncoder().encode(content).buffer }) as File;
    const digest = await knowledgeFileFingerprint(file('Private.pdf', 'Complete private content'));
    expect(await knowledgeFileFingerprint(file('Private.pdf', 'Complete private content'))).toBe(digest);
    expect(await knowledgeFileFingerprint(file('Renamed.pdf', 'Complete private content'))).not.toBe(digest);
    expect(await knowledgeFileFingerprint(file('Private.pdf', 'Changed private content'))).not.toBe(digest);
    rememberKnowledgeUpload('upload', id, digest, knowledgeCacheEpoch());
    expect(readKnowledgeUploadFingerprint('upload', id)).toBe(digest); expect(Object.values(sessionStorage).join(' ')).not.toContain('Private.pdf');
    expect(() => rememberKnowledgeUpload('upload', id, 'b'.repeat(64), knowledgeCacheEpoch())).toThrow();
    forgetKnowledgeAttempt('upload', id); expect(readKnowledgeUploadFingerprint('upload', id)).toBeNull();
  } finally { vi.unstubAllGlobals(); }
});
