// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheTestWorkspaceDraft, clearTestWorkspaceDrafts, readTestWorkspaceDraft, testDraftEpoch } from '../client/src/lib/test-workspace-draft';
import { clearKnowledgeWorkspace } from '../client/src/lib/knowledge-workspace-cache';
const scope = '1:20:test-sari-session';
const draft = { conversationId: 12, message: 'Unsent test message', dealValue: '125.50', scenarioId: 'complaint' };
beforeEach(() => { clearTestWorkspaceDrafts(); sessionStorage.clear(); });
describe('test workspace navigation drafts', () => {
  it('isolates actors, tenants and sessions, and copies on both boundaries', () => {
    const input = { ...draft };
    expect(cacheTestWorkspaceDraft(scope, input, testDraftEpoch())).toBe(true);
    input.message = 'changed externally';
    const restored = readTestWorkspaceDraft(scope, 12)!;
    expect(restored).toEqual(draft);
    restored.message = 'changed by caller';
    expect(readTestWorkspaceDraft(scope, 12)).toEqual(draft);
    expect(readTestWorkspaceDraft('2:20:test-sari-session', 12)).toBeNull();
    expect(readTestWorkspaceDraft('1:21:test-sari-session', 12)).toBeNull();
    expect(readTestWorkspaceDraft(scope, 13)).toBeNull();
    expect(readTestWorkspaceDraft(scope, 12)).toBeNull();
  });
  it('keeps drafts without a created session and never writes browser storage', () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    cacheTestWorkspaceDraft(scope, { ...draft, conversationId: null }, testDraftEpoch());
    expect(readTestWorkspaceDraft(scope, null)?.message).toBe(draft.message);
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
  });
  it('keeps the unload warning while another tenant has a draft, then removes it', () => {
    const warn = () => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
    cacheTestWorkspaceDraft(scope, draft, testDraftEpoch());
    cacheTestWorkspaceDraft('1:21:test-sari-session', draft, testDraftEpoch());
    cacheTestWorkspaceDraft(scope, { ...draft, message: '', dealValue: '' }, testDraftEpoch());
    expect(readTestWorkspaceDraft(scope, 12)).toBeNull();
    expect(warn()).toBe(true);
    clearTestWorkspaceDrafts();
    expect(warn()).toBe(false);
  });
  it('clears on logout and rejects late writes from the old session', () => {
    const prior = testDraftEpoch();
    cacheTestWorkspaceDraft(scope, draft, prior);
    clearKnowledgeWorkspace();
    expect(readTestWorkspaceDraft(scope, 12)).toBeNull();
    expect(cacheTestWorkspaceDraft(scope, draft, prior)).toBe(false);
  });
  it.each(['', '0:20:test-sari-session', '1:20:other', '1:20:test-sari-session:extra', '9007199254740992:20:test-sari-session'])('rejects invalid scope %s', key => {
    expect(cacheTestWorkspaceDraft(key, draft, testDraftEpoch())).toBe(false);
    expect(readTestWorkspaceDraft(key, 12)).toBeNull();
  });
  it.each([{ conversationId: 0 }, { conversationId: NaN }, { message: 'x'.repeat(2001) }, { dealValue: '1'.repeat(101) }, { scenarioId: 'foreign' }])('rejects invalid data %j', patch => {
    expect(cacheTestWorkspaceDraft(scope, { ...draft, ...patch }, testDraftEpoch())).toBe(false);
    expect(readTestWorkspaceDraft(scope, 12)).toBeNull();
  });
});
