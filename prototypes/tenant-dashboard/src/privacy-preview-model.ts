import { privacyWorkspace } from '../../../shared/privacy-workspace';
import type { PrivacyActions } from '../../../client/src/lib/privacy-export';
export class PrivacyPreviewStore {
  private consent = false;
  private requests: any[] = [];
  private next = 1;
  downloadCount = 0;
  deleted = false;
  readonly actions: PrivacyActions = {
    download: () => {
      this.downloadCount++;
    },
    deleted: () => {
      this.deleted = true;
    },
  };
  constructor(
    private actorId: number,
    private mode: () => string
  ) {}
  read() {
    return privacyWorkspace.parse({
      actorId: this.actorId,
      scope: 'account',
      marketingConsent: this.mode() === 'legacy' ? null : this.consent,
      marketingStatus: this.mode() === 'legacy' ? 'invalid' : 'saved',
      canVerifyPassword: true,
      isAdmin: false,
      responseDays: 30,
      graceHours: 24,
      ownedStores:
        this.mode() === 'empty'
          ? []
          : [
              {
                id: 269,
                name: 'متجر نواة · Nawa store',
                shared: this.mode() === 'readonly',
              },
              { id: 270, name: 'متجر مدار · Madar store', shared: false },
            ],
      hasMoreStores: false,
      requests: this.requests.slice(-20).reverse(),
    });
  }
  mutate(name: string, i: any) {
    if (this.mode() === 'uncertain-save') throw Error('Outcome unavailable');
    const type =
      name === 'accountData.setMarketingConsent'
        ? 'withdraw_consent'
        : name === 'accountData.exportPersonalData'
          ? 'export'
          : name === 'accountData.requestDeletion'
            ? 'deletion'
            : i.requestType;
    if (name === 'accountData.setMarketingConsent') {
      this.consent = i.granted;
      if (!i.granted)
        this.requests.push({
          id: this.next++,
          requestType: 'withdraw_consent',
          status: 'completed',
          requestedAt: '2026-10-04T12:00:00.000Z',
          dueAt: '2026-10-04T12:00:00.000Z',
          completedAt: '2026-10-04T12:00:00.000Z',
          rejectionReason: null,
        });
      return { success: true, actorId: this.actorId, granted: i.granted };
    }
    if (name === 'accountData.submitRequest') {
      const existing = this.requests.find(
        r => r.requestType === type && r.status === 'pending'
      );
      if (existing)
        return { ...existing, actorId: this.actorId, created: false };
    }
    const r = {
      id: this.next++,
      requestType: type,
      status: type === 'export' ? 'completed' : 'pending',
      requestedAt: '2026-10-04T12:00:00.000Z',
      dueAt: '2026-11-03T12:00:00.000Z',
      completedAt: type === 'export' ? '2026-10-04T12:00:00.000Z' : null,
      rejectionReason: null,
    };
    this.requests.push(r);
    if (name === 'accountData.exportPersonalData')
      return {
        formatVersion: '1.0',
        generatedAt: r.requestedAt,
        requestId: r.id,
        scope:
          'account-holder personal data; customer conversation content is intentionally excluded',
        account: { id: this.actorId, name: 'Local sample' },
        merchants: [],
        memberships: [],
        subscriptions: [],
        payments: [],
        whatsappConnections: [],
        consentHistory: [],
        requestHistory: [],
      };
    if (name === 'accountData.requestDeletion')
      return { success: true, actorId: this.actorId, request: r };
    return { ...r, actorId: this.actorId, created: true };
  }
}
