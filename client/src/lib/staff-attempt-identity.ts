const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable = (): never => { throw Error('Reply attempt storage unavailable'); };

/** Keep uncertain legacy requests; never turn an upgrade into a fresh send. */
export function staffAttemptIdentity(kind: 'reply' | 'voice', actor: number, digest: string) {
  if (!Number.isSafeInteger(actor) || actor <= 0 || !/^[a-f0-9]{64}$/.test(digest)) return unavailable();
  const legacyKey = `sary:staff-${kind}:v1:${digest}`;
  const ownerKey = `sary:staff-${kind}:v1-owner:${digest}`;
  const key = `sary:staff-${kind}:v2:${actor}:${digest}`;
  const legacy = sessionStorage.getItem(legacyKey), prior = sessionStorage.getItem(key);
  if ((legacy !== null && !uuid.test(legacy)) || (prior !== null && !uuid.test(prior))) return unavailable();
  const rawOwner = sessionStorage.getItem(ownerKey);
  let owner: { actor: number; requestId: string } | undefined;
  if (rawOwner !== null) {
    try {
      const value = JSON.parse(rawOwner);
      if (!value || Object.keys(value).sort().join(',') !== 'actor,requestId' || !Number.isSafeInteger(value.actor) || value.actor <= 0 || !uuid.test(value.requestId)) return unavailable();
      // Orphan owner metadata cannot authorize replacement of a different request.
      if (legacy && value.requestId !== legacy) return unavailable();
      owner = value;
    } catch { return unavailable(); }
  }
  const foreignLegacy = legacy && owner?.requestId === legacy && owner.actor !== actor;
  const foreignPrior = prior && owner?.requestId === prior && owner.actor !== actor;
  const requestId = prior && !foreignPrior ? prior : legacy && !foreignLegacy ? legacy : crypto.randomUUID();
  sessionStorage.setItem(key, requestId);
  if (sessionStorage.getItem(key) !== requestId) return unavailable();
  return {
    requestId,
    // Call only after a normal server response. The server validates the actor
    // before returning even a pending result; a thrown conflict proves nothing.
    confirmOwner: () => {
      if (legacy !== requestId || sessionStorage.getItem(legacyKey) !== requestId) return;
      const encoded = JSON.stringify({ actor, requestId });
      sessionStorage.setItem(ownerKey, encoded);
      if (sessionStorage.getItem(ownerKey) !== encoded) return unavailable();
    },
    complete: () => {
      if (sessionStorage.getItem(key) === requestId) {
        sessionStorage.removeItem(key);
        if (sessionStorage.getItem(key) === requestId) return unavailable();
      }
      if (legacy === requestId && sessionStorage.getItem(legacyKey) === requestId) {
        const recorded = sessionStorage.getItem(ownerKey);
        if (recorded === JSON.stringify({ actor, requestId })) {
          sessionStorage.removeItem(legacyKey);
          if (sessionStorage.getItem(legacyKey) === requestId) return unavailable();
          // Keep the ownership tombstone: another actor may have tried this
          // unassigned legacy UUID before its owner received a server response.
        }
      }
    },
  };
}
