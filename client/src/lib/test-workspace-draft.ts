export interface TestWorkspaceDraft {
  conversationId: number | null;
  message: string;
  dealValue: string;
  scenarioId: string;
}

// Unsent text stays in this tab's memory, never in browser storage or the API.
// A saved session ID alone cannot restore an unfinished operation.
const drafts = new Map<string, TestWorkspaceDraft>();
let epoch = 0;
export const testDraftEpoch = () => epoch;
const validScope = (scope: string) => /^[1-9]\d*:[1-9]\d*:test-sari-session$/.test(scope)
  && scope.split(':').slice(0, 2).every(value => Number.isSafeInteger(Number(value)));
const validId = (value: number | null) => value === null || (Number.isSafeInteger(value) && value > 0);
const warn = (event: BeforeUnloadEvent) => {
  if (!drafts.size) return;
  event.preventDefault();
  event.returnValue = '';
};
export function discardTestWorkspaceDraft(scope: string) {
  drafts.delete(scope);
  if (!drafts.size) window.removeEventListener('beforeunload', warn);
}
export function readTestWorkspaceDraft(scope: string, conversationId: number | null): TestWorkspaceDraft | null {
  if (!validScope(scope) || !validId(conversationId)) return null;
  const draft = drafts.get(scope);
  if (!draft) return null;
  if (draft.conversationId !== conversationId) {
    discardTestWorkspaceDraft(scope);
    return null;
  }
  return { ...draft };
}
export function cacheTestWorkspaceDraft(scope: string, draft: TestWorkspaceDraft, expectedEpoch: number) {
  if (expectedEpoch !== epoch || !validScope(scope) || !validId(draft.conversationId)
    || typeof draft.message !== 'string' || draft.message.length > 2000
    || typeof draft.dealValue !== 'string' || draft.dealValue.length > 100
    || !['', 'price-inquiry', 'product-search', 'order-inquiry', 'greeting', 'recommendations', 'complaint', 'multi-turn'].includes(draft.scenarioId)) return false;
  if (!draft.message.trim() && !draft.dealValue.trim()) {
    discardTestWorkspaceDraft(scope);
    return true;
  }
  drafts.set(scope, { ...draft });
  window.addEventListener('beforeunload', warn);
  return true;
}
export function clearTestWorkspaceDrafts() {
  epoch++;
  drafts.clear();
  window.removeEventListener('beforeunload', warn);
}
