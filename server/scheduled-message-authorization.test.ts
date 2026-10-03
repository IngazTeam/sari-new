import { expect, it } from 'vitest';
import { buildScheduledAuthorization, scheduledAuthorizationContract, scheduledAuthorizationDigest, parseScheduledAuthorization } from './scheduled-message-authorization';
const contract = () => buildScheduledAuthorization({ actorId: 7, merchantId: 20, scheduledMessageId: 9, reviewRevision: 'a'.repeat(64), instanceId: 12,
  definition: { title: 'Weekly', message: 'Hello', dayOfWeek: 6, time: '12:00', timezone: 'Asia/Riyadh' } }, new Date('2026-10-03T08:00:00Z'));
const stored = () => { const c = contract(); return { actor_id: 7, merchant_id: 20, scheduled_message_id: 9, active: 1, revoked_at: null, review_revision: c.reviewRevision, contract_digest: scheduledAuthorizationDigest(c), reviewed_contract: JSON.stringify(c) }; };
it('binds weekly terms to the exact actor, tenant, source revision, instance, message and first future occurrence', () => {
  expect(contract()).toMatchObject({ version: 1, actorId: 7, merchantId: 20, scheduledMessageId: 9, instanceId: 12, firstDueAt: '2026-10-03T09:00:00.000Z', repeat: 'weekly_until_paused', audienceLimit: 2000, admissionMinutes: 15, deliveryMinutes: 1440 });
  expect(parseScheduledAuthorization(stored(), 20, 9)).toEqual(contract());
});
it('accepts JSON key reordering but refuses modified content', () => {
  const row = stored(), c = contract();
  row.reviewed_contract = JSON.stringify(Object.fromEntries(Object.entries(c).reverse())); expect(parseScheduledAuthorization(row, 20, 9)).toEqual(c);
  c.definition.message = 'Changed'; row.reviewed_contract = JSON.stringify(c); expect(parseScheduledAuthorization(row, 20, 9)).toBeNull();
});
it.each([{ actor_id: 8 }, { merchant_id: 21 }, { scheduled_message_id: 10 }, { active: 0 }, { active: null }, { revoked_at: new Date() }, { review_revision: 'b'.repeat(64) }, { contract_digest: 'b'.repeat(64) }, { reviewed_contract: 'invalid' }])('rejects missing, revoked or forged stored scope %#', patch => {
  expect(parseScheduledAuthorization({ ...stored(), ...patch }, 20, 9)).toBeNull();
});
it('refuses altered nested scope even if a new digest is supplied', () => {
  const c = { ...contract(), merchantId: 21 }, row = { ...stored(), reviewed_contract: JSON.stringify(c), contract_digest: scheduledAuthorizationDigest(c) };
  expect(parseScheduledAuthorization(row, 20, 9)).toBeNull(); expect(parseScheduledAuthorization(null, 20, 9)).toBeNull();
});
it.each([{ firstDueAt: '2026-10-10T09:00:00.000Z' }, { messagePreview: 'Different' }, { audienceLimit: 2001 }, { deliveryMinutes: 1500 }, { repeat: 'daily' }, { instanceId: 0 }, { unknown: true }])('rejects inconsistent review promises %#', patch => {
  expect(scheduledAuthorizationContract.safeParse({ ...contract(), ...patch }).success).toBe(false);
});
