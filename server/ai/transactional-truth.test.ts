import { describe, expect, it } from 'vitest';
import { containsUnverifiedActionClaim } from './transactional-truth';

describe('transactional truth guard', () => {
  it.each([
    'تم تسجيل طلبك',
    'سجلت طلبك وبيتواصل معك الفريق',
    'تم حجز موعدك',
    'وصلت طلبك للمختص',
    'استفسارك مسجل للمتابعة',
  ])('rejects a claim without a persisted identifier: %s', response => {
    expect(containsUnverifiedActionClaim(response)).toBe(true);
  });

  it('allows a transactional confirmation backed by an identifier', () => {
    expect(containsUnverifiedActionClaim('تم تسجيل طلبك', 123)).toBe(false);
  });

  it('does not block ordinary support language', () => {
    expect(containsUnverifiedActionClaim('أقدر أوضح لك خطوات الطلب')).toBe(false);
  });
});
