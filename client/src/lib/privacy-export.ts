export interface PrivacyActions {
  download(payload: unknown, name: string): void;
  deleted(): void;
}
export function downloadPrivacyExport(
  payload: any,
  actorId: number,
  actions: PrivacyActions
) {
  if (
    payload?.account?.id !== actorId ||
    payload.formatVersion !== '1.0' ||
    !Number.isSafeInteger(payload.requestId) ||
    payload.requestId < 1 ||
    payload.scope !==
      'account-holder personal data; customer conversation content is intentionally excluded' ||
    ![
      'merchants',
      'memberships',
      'subscriptions',
      'payments',
      'whatsappConnections',
      'consentHistory',
      'requestHistory',
    ].every(k => Array.isArray(payload[k])) ||
    !Number.isFinite(Date.parse(payload.generatedAt)) ||
    new TextEncoder().encode(JSON.stringify(payload)).length > 8 * 1024 * 1024
  )
    throw Error('Export response unavailable');
  actions.download(
    payload,
    'sary-account-data-' +
      new Date(payload.generatedAt).toISOString().slice(0, 10) +
      '.json'
  );
}
export const browserPrivacyActions: PrivacyActions = {
  download(payload, name) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  },
  deleted() {
    window.location.assign('/');
  },
};
