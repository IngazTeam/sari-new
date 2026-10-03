import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { inspectMediaUpload } from './media-actions';
import { mediaUploadInput, mediaRemoveInput, mediaReceiptInput, mediaFileName } from '../shared/media-actions';
const value = () => ({ requestKey: randomUUID(), originalName: 'sample.png', mimeType: 'image/png' as const, category: 'product' as const,
  fileBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2]).toString('base64') });
describe('media upload intent and byte boundary', () => {
  it('binds the canonical bytes, category and safe name to a merchant-scoped storage key', () => {
    const input = value(), first = inspectMediaUpload(input, 1);
    expect(first.metadata.fileName).toBe(`media/1/product/${input.requestKey}.png`);
    expect(inspectMediaUpload(input, 2).digest).not.toBe(first.digest);
    expect(inspectMediaUpload({ ...input, category: 'promotion' }, 1).digest).not.toBe(first.digest);
    expect(first.metadata.fileSize).toBe(11); expect(first.metadata.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('accepts the actual advertised 5 MiB limit', () => {
    const input = value(), buffer = Buffer.alloc(5242880); Buffer.from(input.fileBase64, 'base64').copy(buffer);
    const data = inspectMediaUpload({ ...input, fileBase64: buffer.toString('base64') }, 1);
    expect(data.metadata.fileSize).toBe(5242880);
  });
  it.each(['bad-base64', 'data-uri', 'mismatched-mime', 'missing-pdf-eof', 'empty', 'oversize'])('rejects %s before storage access', attack => {
    const input: any = value();
    if (attack === 'bad-base64') input.fileBase64 = '!!!!';
    if (attack === 'data-uri') input.fileBase64 = 'data:image/png;base64,' + input.fileBase64;
    if (attack === 'mismatched-mime') input.mimeType = 'image/jpeg';
    if (attack === 'missing-pdf-eof') { input.mimeType = 'application/pdf'; input.fileBase64 = Buffer.from('%PDF-test').toString('base64'); }
    if (attack === 'empty') input.fileBase64 = '';
    if (attack === 'oversize') input.fileBase64 = Buffer.alloc(5242881).toString('base64');
    expect(() => inspectMediaUpload(input, 1)).toThrow();
  });
  it('strips path, markup, control and bidi overrides from the display name', () => {
    expect(mediaFileName('../<evil>\\a\n\u202e.png')).toBe('evila.png');
    expect(mediaFileName('///')).toBe('unnamed');
  });
  it.each([
    () => mediaUploadInput.parse({ ...value(), merchantId: 999 }),
    () => mediaUploadInput.parse({ ...value(), mimeType: 'image/svg+xml' }),
    () => mediaRemoveInput.parse({ requestKey: randomUUID(), id: 0, revision: 'a'.repeat(64) }),
    () => mediaRemoveInput.parse({ requestKey: randomUUID(), id: 1, revision: 'unknown' }),
    () => mediaReceiptInput.parse({ requestKey: 'not-a-uuid' }),
  ])('rejects an invalid or expanded action contract', parse => expect(parse).toThrow());
});
