import { describe, expect, it } from 'vitest';
import { byaanSiteSnapshot } from './integrations/byaan-site-contract';

describe('Byaan complete CMS snapshot contract', () => {
  it('retains Arabic public content without shrinking the business description', () => {
    const content = 'وصف عام\n'.repeat(5000);
    expect(byaanSiteSnapshot.parse({ title: 'الأكاديمية', content }).content).toBe(content);
  });
  it.each([
    { title: 'academy', content: 'x'.repeat(50001) }, { title: '<script>', content: '' },
    { title: 'academy', content: 'x\0y' }, { title: 'academy', content: '', merchantId: 999 },
  ])('rejects oversized or ambiguous snapshots without truncation', payload => {
    expect(byaanSiteSnapshot.safeParse(payload).success).toBe(false);
  });
  it('permits an explicit empty current snapshot to remove stale public content', () => {
    expect(byaanSiteSnapshot.parse({ title: 'Academy', content: '' }).content).toBe('');
  });
});
