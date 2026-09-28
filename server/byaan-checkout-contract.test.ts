import { describe, expect, it } from 'vitest';
import { byaanCheckoutInput, readByaanCheckoutQuote } from './integrations/byaan-checkout-contract';
const input = { courseId: '17', sessionId: '8' };
const fixture = { success: true, kind: 'checkout_invitation', course_id: '17', session_id: '8', requires_session: false,
  available: true, currency: 'SAR', amount_minor: 11500, tax_minor: 1500, quoted_at: new Date().toISOString(),
  checkout_url: 'https://academy.example.com/courses/course-one/checkout?session_id=8', price_guaranteed: false,
  schedule: { date: '2026-10-01', time: '10:00', timezone: 'Asia/Riyadh' },
  payment_status: 'not_created', enrollment_status: 'not_created', sessions: [{ id: 8, date: '2026-10-01', time: '10:00', available: true }] };
describe('Byaan live checkout invitation contract', () => {
  it('preserves actual minor-unit pricing without manufacturing a financial fact', () => {
    expect(readByaanCheckoutQuote(fixture, input, 'academy.example.com')).toEqual(fixture);
    expect(byaanCheckoutInput.safeParse({ ...input, amount: 1 }).success).toBe(false);
  });
  it.each([
    { course_id: '18' }, { session_id: '9' }, { payment_status: 'paid' }, { enrollment_status: 'active' },
    { price_guaranteed: true }, { amount_minor: 1.5 }, { quoted_at: '2020-01-01T00:00:00Z' },
    { tax_minor: 12000 }, { sessions: [] }, { sessions: [...fixture.sessions, ...fixture.sessions] },
    { schedule: { ...fixture.schedule, time: '25:90' } }, { schedule: { ...fixture.schedule, timezone: 'unknown-zone' } },
    { schedule: { ...fixture.schedule, date: '2026-10-02' } },
    { available: false }, { requires_session: true }, { invoice_id: 'not-real' },
    { checkout_url: 'https://attacker.example.com/courses/a/checkout?session_id=8' },
    { checkout_url: 'https://academy.example.com/courses/a/checkout?session_id=9' },
    { checkout_url: 'https://academy.example.com/courses/a/checkout?session_id=8&redirect=https://evil.example.com' },
  ])('rejects inconsistent or unsafe provider data %j', patch => {
    expect(() => readByaanCheckoutQuote({ ...fixture, ...patch }, input, 'academy.example.com')).toThrow();
  });
  it('returns session choices without a checkout URL until a session is selected', () => {
    expect(readByaanCheckoutQuote({ ...fixture, session_id: null, requires_session: true, available: false, checkout_url: null },
      { courseId: '17' }, 'academy.example.com').requires_session).toBe(true);
  });
});
