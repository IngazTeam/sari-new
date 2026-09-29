export type KnowledgeDraft = {
  name: string;
  content: string;
  type: 'document' | 'products' | 'custom';
  sourceDocument?: { id: number; revision: string };
  faq?: { id?: number; revision?: string; category: string; isActive: boolean; useInBot: boolean; requestId: string; baseline: string; uncertain: boolean };
};

// Business text and binary files live only in memory. Only opaque request IDs
// and opaque file fingerprints enter sessionStorage. Never persist file bytes,
// filenames, text, model reports or approval consent.
const drafts = new Map<string, KnowledgeDraft>();
const prefix = 'sary:knowledge-attempt:v1:';
let epoch = 0;
const warn = (event: BeforeUnloadEvent) => {
  if (!drafts.size) return;
  event.preventDefault();
  event.returnValue = '';
};
export const knowledgeCacheEpoch = () => epoch;
export function knowledgeWorkspaceKey(userId: number, merchantId: number, slot: string) {
  return `${userId}:${merchantId}:${slot}`;
}
export function readKnowledgeDraft(key: string) {
  const draft = drafts.get(key);
  return draft ? structuredClone(draft) : null;
}
export function cacheKnowledgeDraft(key: string, draft: KnowledgeDraft, expectedEpoch: number) {
  if (epoch !== expectedEpoch) return;
  if (!drafts.size) window.addEventListener('beforeunload', warn);
  drafts.set(key, structuredClone(draft));
}
export function discardKnowledgeDraft(key: string) {
  drafts.delete(key);
  if (!drafts.size) window.removeEventListener('beforeunload', warn);
}
export function hasKnowledgeDrafts() { return drafts.size > 0; }
export function readKnowledgeAttempt(key: string): string | null {
  const value = sessionStorage.getItem(prefix + key);
  if (!value) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw Error('Invalid request reference');
  return value;
}
export function rememberKnowledgeAttempt(key: string, requestId: string, expectedEpoch: number) {
  if (epoch !== expectedEpoch) throw Error('Session changed');
  const previous = readKnowledgeAttempt(key);
  if (previous && previous !== requestId) throw Error('Existing request needs review');
  sessionStorage.setItem(prefix + key, requestId);
  if (readKnowledgeAttempt(key) !== requestId) throw Error('Request reference unavailable');
}
export async function knowledgeFileFingerprint(file: File) {
  const name = new TextEncoder().encode(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const combined = new Uint8Array(4 + name.length + bytes.length);
  new DataView(combined.buffer).setUint32(0, name.length);
  combined.set(name, 4); combined.set(bytes, 4 + name.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', combined));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}
export function readKnowledgeUploadFingerprint(key: string, requestId: string) {
  const value = sessionStorage.getItem(prefix + key + ':file');
  return value?.startsWith(requestId + ':') && /^[a-f0-9]{64}$/.test(value.slice(37)) ? value.slice(37) : null;
}
export function rememberKnowledgeUpload(key: string, requestId: string, fingerprint: string, expectedEpoch: number) {
  if (epoch !== expectedEpoch) throw Error('Session changed');
  const previous = readKnowledgeAttempt(key);
  if (previous && (previous !== requestId || readKnowledgeUploadFingerprint(key, requestId) !== fingerprint)) throw Error('Different original file');
  const value = requestId + ':' + fingerprint;
  sessionStorage.setItem(prefix + key + ':file', value);
  if (sessionStorage.getItem(prefix + key + ':file') !== value) throw Error('File identity unavailable');
  // Write the reference last. A failed first write cannot strand a sent request.
  rememberKnowledgeAttempt(key, requestId, expectedEpoch);
}
export function forgetKnowledgeAttempt(key: string, requestId: string | null) {
  try {
    if (readKnowledgeAttempt(key) === requestId) {
      sessionStorage.removeItem(prefix + key);
      sessionStorage.removeItem(prefix + key + ':file');
    }
  } catch { /* Never replace an unreadable reference with a new request. */ }
}
export function clearKnowledgeWorkspace() {
  epoch++;
  drafts.clear();
  window.removeEventListener('beforeunload', warn);
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index));
    keys.filter((key): key is string => !!key?.startsWith(prefix)).forEach(key => sessionStorage.removeItem(key));
  } catch { /* Browser storage may be unavailable. Keys are also account-scoped. */ }
}
