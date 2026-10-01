import { z } from 'zod';

export const CONVERSATION_DRAFT_PREFIX = 'sary:conversation-draft:v1:';
const lifetime = 86400000;
const schema = z.object({ version: z.literal(1), scope: z.string(), savedAt: z.number().int().positive(), text: z.string().max(100000), review: z.boolean() }).strict();
type Record = z.infer<typeof schema>;
export type ConversationDraft = { state: 'ready'; record: Record; persisted: boolean } | { state: 'missing' | 'invalid' | 'expired' | 'unavailable' };
const memory = new Map<string, ConversationDraft>();
let epoch = 0;
export const conversationDraftEpoch = () => epoch;
export function conversationDraftScope(actor: number, merchant: number, conversation: number) {
  if (![actor, merchant, conversation].every(id => Number.isSafeInteger(id) && id > 0)) throw Error('Invalid draft scope');
  return `${actor}:${merchant}:${conversation}`;
}
const validScope = (scope: string) => /^[1-9]\d*:[1-9]\d*:[1-9]\d*$/.test(scope) && scope.split(':').every(id => Number.isSafeInteger(Number(id)));
const warn = (event: BeforeUnloadEvent) => {
  if (!Array.from(memory.values()).some(value => value.state === 'ready' && !value.persisted)) return;
  event.preventDefault(); event.returnValue = '';
};
export function readConversationDraft(scope: string, now = Date.now()): ConversationDraft {
  if (!validScope(scope)) return { state: 'invalid' };
  let current = memory.get(scope);
  if (!current) {
    let raw: string | null;
    try { raw = sessionStorage.getItem(CONVERSATION_DRAFT_PREFIX + scope); }
    catch { return { state: 'unavailable' }; }
    if (raw === null) return { state: 'missing' };
    if (raw.length > 610000) return { state: 'invalid' };
    try {
      const parsed = schema.safeParse(JSON.parse(raw));
      if (!parsed.success || parsed.data.scope !== scope || parsed.data.savedAt > now + 60000) return { state: 'invalid' };
      current = { state: 'ready', record: parsed.data, persisted: true };
    } catch { return { state: 'invalid' }; }
  }
  if (current.state === 'ready' && now - current.record.savedAt >= lifetime) {
    current = { state: 'expired' };
    try { sessionStorage.removeItem(CONVERSATION_DRAFT_PREFIX + scope); } catch { /* Never restore expired content. */ }
  }
  memory.set(scope, current);
  return current;
}
export function saveConversationDraft(scope: string, text: string, review: boolean, expectedEpoch: number, now = Date.now()) {
  if (expectedEpoch !== epoch || !validScope(scope)) return false;
  const parsed = schema.safeParse({ version: 1, scope, savedAt: now, text, review });
  if (!parsed.success) return false;
  const encoded = JSON.stringify(parsed.data);
  let persisted = false;
  try {
    sessionStorage.setItem(CONVERSATION_DRAFT_PREFIX + scope, encoded);
    persisted = sessionStorage.getItem(CONVERSATION_DRAFT_PREFIX + scope) === encoded;
  } catch { /* Preserve the tab's current text, and disclose the failed save. */ }
  memory.set(scope, { state: 'ready', record: parsed.data, persisted });
  window.addEventListener('beforeunload', warn);
  return persisted;
}
export function clearConversationDrafts() {
  epoch++;
  memory.clear();
  window.removeEventListener('beforeunload', warn);
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index));
    for (const key of keys) if (key?.startsWith(CONVERSATION_DRAFT_PREFIX)) sessionStorage.removeItem(key);
  } catch { /* Account scopes still prevent another user from reading a draft. */ }
}
