import { scheduledMessageRow, scheduledMessageSelection, type ScheduledMessageRow } from '../../../shared/scheduled-message-workspace';
import { scheduledMessageWorkspace, scheduledHistory, scheduledHistoryInput, scheduledEvidenceRow, scheduledOccurrence, type ScheduledEvidenceRow, type ScheduledOccurrence } from '../../../shared/scheduled-message-evidence';
import { scheduledActionTarget, scheduledActionReview, scheduledActionApply, scheduledActionResult, scheduledReceiptInput, scheduledReceiptResult, type ScheduledActionTarget, type ScheduledActionReview } from '../../../shared/scheduled-message-actions';
import { scheduledDefinitionFields, scheduledWeeklySlot, scheduledMessagePreview } from '../../../shared/scheduled-message-policy';
import type { ServiceMode } from './service-preview-model';

export const scheduledPreviewQueries = ['scheduledMessages.workspace', 'scheduledMessages.history', 'scheduledMessages.actionReceipt'] as const;
export const scheduledPreviewMutations = ['scheduledMessages.reviewAction', 'scheduledMessages.applyAction', 'scheduledMessages.resolveActionReceipt'] as const;
const fault = (reason: string, code = 'BAD_REQUEST') => ({ message: 'scheduled_action:' + reason, data: { code } });
type Receipt = ReturnType<typeof scheduledReceiptResult.parse>;
const noApproval = (): ScheduledEvidenceRow['authorization'] => ({ state: 'missing', actorId: null, reviewedAt: null, timezone: null, instanceId: null, firstDueAt: null });

/** In-memory UI examples only. No worker, database, provider or actual messages. */
export class ScheduledPreviewStore {
  writes = 0;
  private version = 0;
  private nextId = 33;
  private started = Date.now();
  private rows = new Map<number, ScheduledEvidenceRow>();
  private histories = new Map<number, ScheduledOccurrence[]>();
  private reviews = new Map<string, string>();
  private receipts = new Map<string, { signature: string | null; outcome: Receipt }>();
  constructor(readonly actorId: number, readonly merchantId: number, readonly now: string, private mode: () => ServiceMode) {
    if (mode() === 'empty') return;
    for (let id = 1; id <= 32; id++) {
      const enabled = id === 31 || id === 30 || id === 29, legacy = mode() === 'legacy' && id === 32;
      const fields = { title: this.storeName + ' · ' + (id === 32 ? 'رسالة الأسبوع · Weekly update' : 'Message رسالة ' + id),
        message: legacy ? '<img src=x onerror=alert(1)> · نص قديم للمراجعة' : id === 32 ? 'مرحبًا! اكتشف جديد متجرنا هذا الأسبوع.\nHello! Discover this week’s store updates.' : 'تفاصيل أسبوعك معنا في رسالة واحدة. Your weekly update in one message.',
        dayOfWeek: legacy ? null : id % 7, time: legacy ? null : '10:00' };
      const authorization = noApproval();
      if ([31, 29, 28].includes(id)) Object.assign(authorization, { state: id === 31 ? 'recorded' : id === 29 ? 'changed' : 'revoked', actorId,
        reviewedAt: this.shift(-86400000), timezone: this.storeZone, instanceId: 1, firstDueAt: this.shift(86400000) });
      this.rows.set(id, scheduledEvidenceRow.parse({ id, revision: this.marker(id), ...fields, enabled, state: enabled ? 'enabled' : 'disabled',
        legacyLastSentAt: id === 30 ? this.shift(-604800000) : null, createdAt: this.shift(-(33 - id) * 60000), updatedAt: now,
        issues: legacy ? ['day', 'time'] : [], authorization, nextDueAt: null, nextIssue: null, occurrenceCount: 0, latestOccurrence: null }));
    }
    this.histories.set(32, Array.from({ length: 31 }, (_, index) => {
      const id = index + 1, missing = index % 7 === 0, changed = index % 11 === 0 && !missing, verified = !missing && !changed;
      return scheduledOccurrence.parse({ id, dueAt: this.shift(-(31 - index) * 604800000), expiresAt: this.shift(-(31 - index) * 604800000 + 86400000),
        campaignId: verified ? 1 : null, campaignState: verified ? 'completed' : null, linkState: missing ? 'missing' : changed ? 'changed' : 'verified',
        recipients: verified ? 4 : null, acceptedByProvider: verified ? 2 : null, unconfirmed: verified ? 2 : null, needsReview: verified ? 1 : null,
        evidence: 'scoped_provider_receipts', salesVerified: false });
    }).reverse());
  }
  private get storeName() { return this.merchantId === 269 ? 'نواة · Nawa' : 'مدار · Madar'; }
  private get storeZone() { return this.merchantId === 269 ? 'Asia/Riyadh' : 'Asia/Dubai'; }
  private get zone() { return this.mode() === 'destination-missing' ? null : this.storeZone; }
  private get time() { return new Date(Date.parse(this.now) + Date.now() - this.started).toISOString(); }
  private shift(ms: number) { return new Date(Date.parse(this.now) + ms).toISOString(); }
  private marker(id: number) { return [this.actorId, this.merchantId, id, this.version, 0, 0, 0, 0].map(n => n.toString(16).padStart(8, '0')).join(''); }
  private base(row: ScheduledEvidenceRow): ScheduledMessageRow { const { authorization, nextDueAt, nextIssue, occurrenceCount, latestOccurrence, ...base } = row; return scheduledMessageRow.parse(base); }
  private history(id: number) {
    return (this.histories.get(id) ?? []).map(row => this.mode() === 'unavailable-reference' ? { ...row, linkState: 'missing' as const, campaignId: null, campaignState: null, recipients: null, acceptedByProvider: null, unconfirmed: null, needsReview: null } : row);
  }
  private all() {
    return Array.from(this.rows.values()).map(row => {
      const value = structuredClone(row), history = this.history(row.id); value.occurrenceCount = history.length; value.latestOccurrence = history[0] ?? null;
      if (value.enabled && value.authorization.state === 'recorded') {
        const fields = scheduledDefinitionFields.safeParse({ title: row.title, message: row.message, dayOfWeek: row.dayOfWeek, time: row.time, timezone: this.zone });
        const slot = fields.success ? scheduledWeeklySlot(fields.data, new Date(this.time), 'next') : { status: 'invalid' as const, reason: 'definition' as const };
        value.nextDueAt = slot.status === 'ready' ? slot.dueAt : null; value.nextIssue = slot.status === 'invalid' ? slot.reason : null;
      }
      return value;
    });
  }
  private review(input: unknown, checkedAt = this.time): ScheduledActionReview {
    if (this.mode() === 'readonly') throw fault('forbidden', 'FORBIDDEN');
    const target = scheduledActionTarget.parse(input), current = target.action === 'create' ? null : this.rows.get(target.id);
    if (target.action !== 'create' && !current) throw fault('missing', 'NOT_FOUND');
    const before = current ? this.base(current) : null, enabling = target.action === 'toggle' && target.enabled;
    let proposed = target.action === 'create' || target.action === 'update' ? target.data : null, nextDueAt: string | null = null;
    if (enabling) {
      const fields = scheduledDefinitionFields.safeParse({ title: before!.title, message: before!.message, dayOfWeek: before!.dayOfWeek, time: before!.time, timezone: this.zone });
      if (!fields.success || fields.data.title !== before!.title || fields.data.message !== before!.message) throw fault('invalid'); proposed = fields.data;
    }
    if (proposed && proposed.timezone !== this.zone) throw fault('timezone');
    if (enabling) {
      if (this.mode() === 'unlinked') throw fault('channel');
      const slot = scheduledWeeklySlot(proposed!, new Date(checkedAt), 'next');
      if (slot.status !== 'ready') throw fault('schedule'); if (Date.parse(slot.dueAt) <= Date.parse(this.time)) throw fault('stale', 'CONFLICT'); nextDueAt = slot.dueAt;
    }
    const terms = { actorId: this.actorId, merchantId: this.merchantId, target, checkedAt, expiresAt: new Date(Date.parse(checkedAt) + 300000).toISOString(), before, proposed,
      effect: target.action === 'create' ? 'create_paused' : target.action === 'update' ? 'update_paused' : target.action === 'delete' ? 'delete' : target.enabled ? 'enable' : 'disable',
      nextDueAt, instanceId: enabling ? 1 : null, channelPhone: null, messagePreview: proposed ? scheduledMessagePreview(proposed) : null,
      repeat: 'weekly_until_paused', audience: 'current_consented_conversations', audienceLimit: 2000, admissionMinutes: 15, deliveryMinutes: 1440,
      sendsImmediately: false, deliveryGuaranteed: false, salesVerified: false, retainsDeliveryHistory: true };
    const signature = JSON.stringify([terms, current?.authorization]); let reviewRevision = this.reviews.get(signature);
    if (!reviewRevision) { this.version++; reviewRevision = this.marker(target.action === 'create' ? 0 : target.id); this.reviews.set(signature, reviewRevision); }
    return scheduledActionReview.parse({ ...terms, reviewRevision });
  }
  read(name: string, input: unknown = {}) {
    if (name === 'scheduledMessages.actionReceipt') return structuredClone(this.receipts.get(scheduledReceiptInput.parse(input).requestKey)?.outcome ?? { state: 'missing', result: null });
    if (name === 'scheduledMessages.history') {
      if (this.mode() === 'choices-error') throw fault('unavailable', 'INTERNAL_SERVER_ERROR');
      const selection = scheduledHistoryInput.parse(input); if (!this.rows.has(selection.id) && !this.histories.has(selection.id)) throw fault('missing', 'NOT_FOUND');
      const all = this.history(selection.id), pages = Math.ceil(all.length / 25), currentPage = Math.min(selection.page, Math.max(1, pages));
      return scheduledHistory.parse({ actorId: this.actorId, merchantId: this.merchantId, selection, checkedAt: this.time, total: all.length, pages, currentPage, pageSize: 25, rows: all.slice((currentPage - 1) * 25, currentPage * 25) });
    }
    if (name !== 'scheduledMessages.workspace') throw fault('missing', 'NOT_FOUND');
    const selection = scheduledMessageSelection.parse(input), all = this.all(), q = selection.query.toLowerCase();
    const matches = all.filter(r => (selection.day === null || selection.day === r.dayOfWeek) && (selection.state === 'all' || selection.state === r.state)
      && (!q || [r.title, r.message].some(v => v?.toLowerCase().includes(q)) || String(r.id) === q));
    matches.sort((a, b) => selection.sort === 'title' ? (a.title ?? '').localeCompare(b.title ?? '') || a.id - b.id
      : selection.sort === 'schedule' ? (a.dayOfWeek ?? -1) - (b.dayOfWeek ?? -1) || (a.time ?? '').localeCompare(b.time ?? '') || a.id - b.id
      : selection.sort === 'oldest' ? (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id - b.id : (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id - a.id);
    const pages = Math.ceil(matches.length / 25), currentPage = Math.min(selection.page, Math.max(1, pages));
    return scheduledMessageWorkspace.parse({ actorId: this.actorId, merchantId: this.merchantId, selection, checkedAt: this.time, canManage: this.mode() !== 'readonly',
      total: all.length, matched: matches.length, pages, currentPage, pageSize: 25, counts: { enabled: all.filter(r => r.enabled === true).length, disabled: all.filter(r => r.enabled === false).length, unknown: all.filter(r => r.enabled === null).length },
      definitionsWithRecordedTimestamp: all.filter(r => r.legacyLastSentAt !== null).length, timezone: this.zone, timeBasis: 'explicit_activation_review',
      deliveryEvidence: 'scoped_provider_receipts', audienceEvidence: 'rechecked_at_dispatch', channelEvidence: 'reviewed_primary', salesAttribution: 'not_verified', rows: matches.slice((currentPage - 1) * 25, currentPage * 25) });
  }
  mutate(name: string, input: unknown) {
    if (name === 'scheduledMessages.resolveActionReceipt') {
      const { requestKey } = scheduledReceiptInput.parse(input), saved = this.receipts.get(requestKey); if (saved) return structuredClone(saved.outcome);
      const outcome = scheduledReceiptResult.parse({ state: 'cancelled', result: { state: 'cancelled', requestKey, actorId: this.actorId, merchantId: this.merchantId, cancelledAt: this.time } });
      this.receipts.set(requestKey, { signature: null, outcome }); this.writes++; return structuredClone(outcome);
    }
    if (this.mode() === 'readonly') throw fault('forbidden', 'FORBIDDEN');
    if (name === 'scheduledMessages.reviewAction') return this.review(input);
    if (name !== 'scheduledMessages.applyAction') throw fault('missing', 'NOT_FOUND');
    const value = scheduledActionApply.parse(input), signature = JSON.stringify(value), saved = this.receipts.get(value.requestKey);
    if (saved) { if (saved.outcome.state === 'cancelled') throw fault('cancelled', 'CONFLICT'); if (signature !== saved.signature) throw fault('reused', 'CONFLICT'); return structuredClone(saved.outcome.result); }
    const age = Date.parse(this.time) - Date.parse(value.checkedAt); if (age < 0 || age > 300000) throw fault('stale', 'CONFLICT');
    const review = this.review(value.target, value.checkedAt); if (review.reviewRevision !== value.reviewRevision) throw fault('stale', 'CONFLICT');
    const target = value.target, id = target.action === 'create' ? this.nextId++ : target.id, before = this.rows.get(id);
    this.version++;
    let authorizationId: number | null = null;
    if (target.action === 'delete') this.rows.delete(id);
    else {
      const enabled = target.action === 'toggle' && target.enabled, authorization = before ? { ...before.authorization } : noApproval();
      if (enabled) { authorizationId = this.version; Object.assign(authorization, { state: 'recorded', actorId: this.actorId, reviewedAt: review.checkedAt, timezone: this.zone, instanceId: 1, firstDueAt: review.nextDueAt }); }
      else if (authorization.state !== 'missing') authorization.state = 'revoked';
      const fields = target.action === 'create' || target.action === 'update' ? target.data : before!;
      this.rows.set(id, scheduledEvidenceRow.parse({ ...before, id, title: fields.title, message: fields.message, dayOfWeek: fields.dayOfWeek, time: fields.time,
        revision: this.marker(id), enabled, state: enabled ? 'enabled' : 'disabled', legacyLastSentAt: before?.legacyLastSentAt ?? null,
        createdAt: before?.createdAt ?? this.time, updatedAt: this.time, issues: target.action === 'toggle' ? before!.issues : [],
        authorization, nextDueAt: enabled ? review.nextDueAt : null, nextIssue: null, occurrenceCount: before?.occurrenceCount ?? 0, latestOccurrence: before?.latestOccurrence ?? null }));
    }
    const result = scheduledActionResult.parse({ requestKey: value.requestKey, actorId: this.actorId, merchantId: this.merchantId, id, action: target.action,
      enabled: target.action === 'delete' ? null : target.action === 'toggle' && target.enabled, authorizationId, nextDueAt: review.nextDueAt, savedAt: this.time });
    this.receipts.set(value.requestKey, { signature, outcome: { state: 'saved', result } }); this.writes++; return structuredClone(result);
  }
}
