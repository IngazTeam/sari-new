import { expect, it } from 'vitest';
import { parseRequestedFollowupTime } from './requested-followup-time';
const source = new Date('2026-09-23T09:00:00Z'); // Wednesday noon Riyadh.
it.each([
  ['ذكرني الخميس الساعة 5 مساء', '2026-09-24T14:00:00.000Z'],
  ['كلمني بكرة الساعة ٩ صباحاً', '2026-09-24T06:00:00.000Z'],
  ['ذكرني 2026-09-26 الساعة 17:30', '2026-09-26T14:30:00.000Z'],
  ['remind me tomorrow at 5 pm', '2026-09-24T14:00:00.000Z'],
  ['تواصل معي اليوم الساعة 21:00', '2026-09-23T18:00:00.000Z'],
  ['كلمني الأربعاء الساعة 10 صباحا', '2026-09-30T07:00:00.000Z'],
])('persists an explicit %s using Riyadh time', (text, expected) => {
  const r = parseRequestedFollowupTime(text, source, source);
  expect(r?.kind).toBe('requested'); if (r?.kind === 'requested') expect(r.at.toISOString()).toBe(expected);
});
it.each(['ذكرني الخميس', 'ذكرني الخميس الساعة 5', 'ذكرني بكرة الساعة 25:00', 'ذكرني بكرة الساعة 17:61',
  'ذكرني 2026-02-30 الساعة 17:00', 'ذكرني 2027-09-01 الساعة 17:00', 'ذكرني اليوم الساعة 09:00',
  'كلمني غداً الساعة 2 صباحاً', 'كلمني غداً الساعة 11 مساء', 'كلمني الساعة 17:00',
  'ذكرني الخميس أو الجمعة الساعة 5 مساء', 'ذكرني الخميس الساعة 5 مساء اذا وافق شريكي',
  'ذكرني الخميس الساعة 5 مساء؟', 'ذكرني غدا الساعة 5 مساء بتوقيت دبي', 'ذكرني بكرة الساعة 5 مساء الساعة 6 مساء'])
  ('does not guess or silently shift %s', text => expect(parseRequestedFollowupTime(text, source, source)).toEqual({ kind: 'clarify' }));
it.each(['لا ترسل لي', 'هل يمكن تذكيري؟', 'بفكر', 'كم السعر؟', 'قال العميل ذكرني الخميس الساعة 5 مساء'])
  ('does not turn non-instructions into a scheduled task: %s', text => expect(parseRequestedFollowupTime(text, source, source)).toBeNull());
it('anchors relative dates to the original message even after a worker retry crosses midnight', () => {
  const input = 'ذكرني بكرة الساعة 5 مساء';
  expect(parseRequestedFollowupTime(input, source, new Date('2026-09-24T01:00:00Z'))).toEqual({ kind: 'requested', at: new Date('2026-09-24T14:00:00Z') });
  expect(parseRequestedFollowupTime(input, source, new Date('2026-09-25T01:00:00Z'))).toEqual({ kind: 'clarify' });
});
