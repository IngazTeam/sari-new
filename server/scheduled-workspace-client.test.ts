import { expect, it } from 'vitest';
import { scheduledNavigation, scopedScheduledWorkspace, scopedScheduledHistory, scheduledStorageKey, scheduledForm, scheduledFormTarget, scopedScheduledResult, scheduledErrorKey } from '../client/src/lib/scheduled-workspace';
import { scheduledMessageSelection } from '../shared/scheduled-message-workspace';
import { scheduledWorkspaceAr as ar, scheduledWorkspaceEn as en } from '../client/src/locales/scheduled-workspace';
const selection = scheduledMessageSelection.parse({});
const data = () => ({ actorId: 7, merchantId: 20, checkedAt: '2026-10-03T09:00:00.000Z', canManage: true, selection, pageSize: 25, currentPage: 1, pages: 0, total: 0, matched: 0, counts: { enabled: 0, disabled: 0, unknown: 0 }, definitionsWithRecordedTimestamp: 0, timezone: 'UTC', timeBasis: 'explicit_activation_review', deliveryEvidence: 'scoped_provider_receipts', audienceEvidence: 'rechecked_at_dispatch', channelEvidence: 'reviewed_primary', salesAttribution: 'not_verified', rows: [] });
it('retains Sunday and full selection while neutralizing malformed URL filters', () => {
  expect(scheduledNavigation('?q=%20hello%20&day=0&state=enabled&sort=schedule&page=3')).toEqual({ query: 'hello', day: 0, state: 'enabled', sort: 'schedule', page: 3 });
  expect(scheduledNavigation('?page=Infinity&day=7&state=sent&sort=sql')).toEqual(selection);
});
it.each(['actor', 'merchant', 'selection', 'count', 'pages', 'rows'])('hides inconsistent %s workspace data', mode => {
  const raw: any = data(); expect(scopedScheduledWorkspace(raw, 7, 20, selection)).not.toBeNull();
  if (mode === 'actor') raw.actorId++; if (mode === 'merchant') raw.merchantId++; if (mode === 'selection') raw.selection = { ...selection, day: 0 };
  if (mode === 'count') raw.counts.enabled++; if (mode === 'pages') raw.pages = 1; if (mode === 'rows') raw.matched = 1;
  expect(scopedScheduledWorkspace(raw, 7, 20, selection)).toBeNull();
});
it('requires history scope and page agreement', () => {
  const raw = { actorId: 7, merchantId: 20, selection: { id: 2, page: 1 }, checkedAt: '2026-10-03T09:00:00.000Z', total: 0, pages: 0, currentPage: 1, pageSize: 25, rows: [] };
  expect(scopedScheduledHistory(raw, 7, 20, 2, 1)).not.toBeNull(); expect(scopedScheduledHistory(raw, 7, 21, 2, 1)).toBeNull(); expect(scopedScheduledHistory(raw, 7, 20, 3, 1)).toBeNull(); expect(scopedScheduledHistory(raw, 7, 20, 2, 2)).toBeNull();
});
it('validates individual fields and never infers a missing timezone', () => {
  expect(scheduledFormTarget({ title: ' ', message: '', day: '7', time: '99:99' }, null).errors).toEqual({ title: 'fieldRequired', message: 'fieldRequired', day: 'fieldRequired', time: 'fieldInvalid', timezone: 'fieldTimezone' });
  expect(scheduledFormTarget({ ...scheduledForm(), title: ' Weekly ', message: ' Text ' }, 'UTC').target).toEqual({ action: 'create', data: { title: 'Weekly', message: 'Text', dayOfWeek: 4, time: '10:00', timezone: 'UTC' } });
  expect(scheduledFormTarget({ title: 'a', message: 'x'.repeat(3801), day: '0', time: '00:00' }, 'UTC').errors.message).toBe('fieldInvalid');
});
it('validates saved effects and keeps actor/tenant request storage separate', () => {
  const key = '23e7d06e-a668-41ac-8327-f920a7d7c662', raw = { requestKey: key, actorId: 7, merchantId: 20, id: 2, action: 'create', enabled: false, authorizationId: null, nextDueAt: null, savedAt: '2026-10-03T09:00:00.000Z' };
  expect(scopedScheduledResult(raw, 7, 20, key)).not.toBeNull(); expect(scopedScheduledResult({ ...raw, enabled: true }, 7, 20, key)).toBeNull(); expect(scopedScheduledResult(raw, 7, 21, key)).toBeNull();
  expect(scheduledStorageKey(7, 20)).not.toBe(scheduledStorageKey(7, 21)); expect(scheduledStorageKey(7, 20)).not.toBe(scheduledStorageKey(8, 20));
  expect(scheduledErrorKey(Error('scheduled_action:channel'))).toBe('errorChannel'); expect(scheduledErrorKey(Error('PRIVATE SQL'))).toBe('errorUnavailable');
});
it('has Arabic/English parity without empty labels', () => { expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort()); expect([...Object.values(ar), ...Object.values(en)].every(v => v.trim())).toBe(true); });
