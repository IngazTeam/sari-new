import { describe, expect, it } from 'vitest';
import { decodeValidatedAudio, hasAudioSignature } from './audio';

describe('audio upload hardening', () => {
  it('recognizes supported container signatures', () => {
    expect(hasAudioSignature(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), 'audio/webm')).toBe(true);
    expect(hasAudioSignature(Buffer.from('OggS'), 'audio/ogg')).toBe(true);
    expect(hasAudioSignature(Buffer.from('RIFF0000WAVE'), 'audio/wav')).toBe(true);
    expect(hasAudioSignature(Buffer.from('ID3'), 'audio/mpeg')).toBe(true);
    expect(hasAudioSignature(Buffer.from([0, 0, 0, 0, ...Buffer.from('ftyp'), 0, 0, 0, 0]), 'audio/mp4')).toBe(true);
  });

  it('rejects malformed base64 rather than silently decoding it', () => {
    expect(() => decodeValidatedAudio('not base64!!!', 'audio/webm')).toThrow('INVALID_BASE64');
  });

  it('rejects content whose signature does not match its declared MIME type', () => {
    const disguisedHtml = Buffer.from('<html>not audio</html>').toString('base64');
    expect(() => decodeValidatedAudio(disguisedHtml, 'audio/ogg')).toThrow('AUDIO_SIGNATURE_MISMATCH');
  });
});
