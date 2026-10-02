import { byaanDataInput, byaanDataStates, byaanDataWorkspaceSchema, byaanFaqChangeInput, type ByaanDataRow } from '../../../shared/byaan-data-workspace';
import { byaanDashboardOverviewSchema } from '../../../shared/byaan-dashboard-overview';
import { byaanResyncRequest, byaanResyncLookup, byaanResyncReceipt, type ByaanResyncReceipt } from '../../../shared/byaan-resync';
import { byaanSalesReviewInput, byaanSalesReviewItem, byaanSalesReviewPage } from '../../../shared/byaan-sales-review';
import { byaanEnrollmentRecoveryInput, byaanEnrollmentRecoveryOutput } from '../../../shared/byaan-enrollment-recovery';
import { byaanConnectionWorkspaceSchema } from '../../../shared/byaan-connection-workspace';
import type { ByaanConnectionPreviewStore } from './byaan-connection-preview-model';

export const byaanDataQueries = ['byaan.dashboardOverview','byaan.dataWorkspace','byaan.resyncAttempt','byaan.salesReviewAccess','byaan.listSalesOperations'] as const;
export const byaanDataMutations = ['byaan.changeFaq','byaan.requestResync','byaan.recoverEnrollmentProjection'] as const;
const fault = (code = 'CONFLICT') => ({ message: 'Local Byaan sample', data: { code } });
/** In-memory examples only. The real components use their unchanged, strict server contracts. */
export class ByaanDataPreviewStore {
  writes = 0;
  private rows: ByaanDataRow[] = [];
  private requests = new Map<string, ByaanResyncReceipt>();
  private restored = new Set<number>();
  private versions = new Map<number, number>();
  private sales: ReturnType<typeof byaanSalesReviewItem.parse>[] = [];
  constructor(private actorId: number, private merchantId: number, private now: string, private mode: () => string, private connection: ByaanConnectionPreviewStore) {
    const counts = this.snapshot().counts, name = merchantId === 269 ? 'نواة · Nawa' : 'مدار · Madar';
    const base = { merchantId, syncedAt: now };
    for (let id = 1; id <= counts.activeTrainees + (counts.activeTrainees ? 4 : 0); id++) this.rows.push({ ...base, id, kind: 'trainees', state: id <= counts.activeTrainees ? 'active' : id === counts.activeTrainees + 4 ? 'unknown' : 'archived', externalId: `LOCAL-${merchantId}-${id}`, name: `${name} · متدرب · Trainee ${id}`, phone: null, email: `trainee-${id}@example.test`, courses: ['مهارات البيع · Sales skills'], coursesTruncated: id === 2, courseDataInvalid: id === 3, createdAt: now });
    for (let id = 1; id <= counts.activeFaqs + (counts.activeFaqs ? 3 : 0); id++) this.rows.push({ ...base, id, kind: 'faqs', question: `${name} · سؤال · Question ${id}`, answer: 'إجابة توضيحية عن الدورة وطريقة التسجيل.\nSample course and enrollment answer. <script>sample text only</script>', category: id % 3 ? 'التسجيل · Enrollment' : null, isActive: id <= counts.activeFaqs ? true : id === counts.activeFaqs + 3 ? null : false, useInBot: id % 4 !== 0, state: id <= counts.activeFaqs ? id % 4 ? 'included' : 'excluded' : id === counts.activeFaqs + 3 ? 'unknown' : 'disabled', revision: this.revision(id) });
    const pageTypes = ['about','vision','mission','policies','custom'] as const;
    for (let id = 1; id <= counts.sitePages; id++) this.rows.push({ ...base, id, kind: 'site', state: id === 5 ? 'empty' : 'content', pageType: pageTypes[id - 1], title: `${name} · صفحة · Page ${id}`, content: id === 5 ? '' : 'محتوى الأكاديمية محفوظ كنص.\nAcademy content displayed as plain text. <a href="https://example.test">Source text</a>' });
    if (this.mode() !== 'empty') for (let id = 24; id >= 1; id--) {
      const state = (['reported','preparing','dispatching','not_sent','unknown','reported'] as const)[id % 6], evidence = id % 6 === 5 ? 'invalid' : ['preparing','dispatching'].includes(state) ? 'pending' : 'consistent';
      this.sales.push(byaanSalesReviewItem.parse({ id, requestId: `${merchantId.toString().padStart(8,'0')}-0000-4000-8000-${id.toString().padStart(12,'0')}`, kind: id % 2 ? 'payment' : 'enrollment', state, evidence, reference: state === 'reported' && evidence === 'consistent' ? `LOCAL-${merchantId}-${id}` : null, createdAt: now, updatedAt: now, providerStatus: 'not_checked', paymentEvidence: 'not_verified' }));
    }
  }
  private snapshot() { return byaanConnectionWorkspaceSchema.parse(this.connection.read('integrations.byaanConnectionWorkspace')); }
  private revision(id: number) { return [this.merchantId,29,id,this.versions.get(id) ?? 0,0,0,0,0].map(n => n.toString(16).padStart(8,'0')).join(''); }
  private access() { const allowed = this.mode() !== 'readonly'; return { trainees: allowed, faqs: allowed, site: allowed, sales: allowed, integrations: allowed }; }
  private ready() { const value = this.snapshot(); if (!value.managedContent || !value.verifiedAt || !['configured','syncing','paused','error'].includes(value.state)) throw fault('PRECONDITION_FAILED'); }
  read(name: string, input: unknown = {}) {
    if (name === 'byaan.dashboardOverview') return byaanDashboardOverviewSchema.parse({ connection: this.snapshot(), access: this.access(), lastRequest: this.access().integrations ? Array.from(this.requests.values()).at(-1) ?? null : null });
    if (this.mode() === 'readonly') throw fault('FORBIDDEN');
    if (name === 'byaan.resyncAttempt') { const { requestId } = byaanResyncLookup.parse(input), receipt = this.requests.get(requestId); if (!receipt) throw fault('NOT_FOUND'); return byaanResyncReceipt.parse({ ...receipt, replayed: true }); }
    if (name === 'byaan.salesReviewAccess') return { merchantId: this.merchantId };
    if (name === 'byaan.listSalesOperations') { const { beforeId } = byaanSalesReviewInput.parse(input), all = this.sales.filter(row => !beforeId || row.id < beforeId), items = all.slice(0,20); return byaanSalesReviewPage.parse({ merchantId: this.merchantId, items, nextCursor: all.length > 20 ? items.at(-1)!.id : null }); }
    if (name === 'byaan.dataWorkspace') {
      this.ready(); const selection = byaanDataInput.parse(input), all = this.rows.filter(row => row.kind === selection.kind), search = selection.search.toLocaleLowerCase();
      const matches = all.filter(row => (row.kind === 'trainees' ? [row.name,row.phone,row.email,row.externalId] : row.kind === 'faqs' ? [row.question,row.answer,row.category] : [row.title,row.content]).some(value => value?.toLocaleLowerCase().includes(search)));
      const groups = byaanDataStates[selection.kind].map(key => ({ key, count: matches.filter(row => row.state === key).length })), filtered = matches.filter(row => selection.state === 'all' || row.state === selection.state);
      return byaanDataWorkspaceSchema.parse({ actorId: this.actorId, merchantId: this.merchantId, checkedAt: this.now, selection, summary: { stored: all.length, matched: matches.length, groups }, pagination: { page: selection.page, pageSize: 25, total: filtered.length, pages: Math.ceil(filtered.length / 25) }, rows: filtered.slice((selection.page - 1) * 25, selection.page * 25) });
    }
    throw Error('Unmapped Byaan data read');
  }
  mutate(name: string, input: unknown) {
    if (this.mode() === 'readonly') throw fault('FORBIDDEN');
    if (name === 'byaan.changeFaq') {
      this.ready(); const change = byaanFaqChangeInput.parse(input), row = this.rows.find(row => row.kind === 'faqs' && row.id === change.faqId);
      if (!row || row.kind !== 'faqs') throw fault('NOT_FOUND'); if (row.revision !== change.revision) throw fault();
      row[change.field === 'is_active' ? 'isActive' : 'useInBot'] = change.value;
      row.state = row.isActive === null || row.useInBot === null ? 'unknown' : !row.isActive ? 'disabled' : row.useInBot ? 'included' : 'excluded';
      this.versions.set(row.id, (this.versions.get(row.id) ?? 0) + 1); row.revision = this.revision(row.id);
      this.connection.updateDataCounts({ activeFaqs: this.rows.filter(row => row.kind === 'faqs' && row.isActive === true).length }); this.writes++;
      return { actorId: this.actorId, merchantId: this.merchantId, faqId: row.id, success: true };
    }
    if (name === 'byaan.requestResync') {
      const request = byaanResyncRequest.parse(input), existing = this.requests.get(request.requestId);
      if (existing) { if (existing.revision !== request.revision) throw fault(); return byaanResyncReceipt.parse({ ...existing, replayed: true }); }
      this.ready(); if (request.revision !== this.snapshot().revision) throw fault(); if (this.requests.size >= 3) throw fault('TOO_MANY_REQUESTS');
      const receipt = byaanResyncReceipt.parse({ ...request, actorId: this.actorId, merchantId: this.merchantId, outcome: this.mode() === 'credentials-invalid' ? 'not_sent' : this.mode() === 'destination-missing' ? 'unknown' : 'queued', createdAt: this.now, replayed: false });
      this.requests.set(request.requestId, receipt); this.writes++; return receipt;
    }
    if (name === 'byaan.recoverEnrollmentProjection') {
      const { operationId } = byaanEnrollmentRecoveryInput.parse(input), row = this.sales.find(row => row.id === operationId);
      if (!row || row.kind !== 'enrollment' || row.state !== 'reported' || row.evidence !== 'consistent') throw fault();
      const replayed = this.restored.has(operationId); if (!replayed) { this.restored.add(operationId); this.writes++; }
      return byaanEnrollmentRecoveryOutput.parse({ merchantId: this.merchantId, operationId, quotationId: operationId, requestId: row.requestId, outcome: 'projection_present', replayed, recovery: { reviewerUserId: this.actorId, restoredAt: this.now }, providerStatus: 'not_checked', paymentEvidence: 'not_verified', externalRequest: 'not_sent', customerMessage: 'not_sent' });
    }
    throw Error('Unmapped Byaan data action');
  }
}
