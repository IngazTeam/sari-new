export const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/wav',
] as const;

export type SupportedAudioMimeType = typeof SUPPORTED_AUDIO_MIME_TYPES[number];

const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function startsWith(buffer: Buffer, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => buffer[offset + index] === value);
}

export function hasAudioSignature(buffer: Buffer, mimeType: SupportedAudioMimeType): boolean {
  if (buffer.length === 0) return false;

  switch (mimeType) {
    case 'audio/webm':
      return startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
    case 'audio/ogg':
      return buffer.subarray(0, 4).toString('ascii') === 'OggS';
    case 'audio/wav':
      return buffer.length >= 12
        && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && buffer.subarray(8, 12).toString('ascii') === 'WAVE';
    case 'audio/mpeg':
    case 'audio/mp3':
      return buffer.subarray(0, 3).toString('ascii') === 'ID3'
        || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    case 'audio/mp4':
      return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  }
}

export function decodeValidatedAudio(
  audioBase64: string,
  mimeType: SupportedAudioMimeType,
  maxBytes = 16 * 1024 * 1024,
): Buffer {
  if (!STRICT_BASE64.test(audioBase64)) {
    throw new Error('INVALID_BASE64');
  }

  const buffer = Buffer.from(audioBase64, 'base64');
  if (buffer.length === 0) throw new Error('EMPTY_AUDIO');
  if (buffer.length > maxBytes) throw new Error('AUDIO_TOO_LARGE');
  if (!hasAudioSignature(buffer, mimeType)) throw new Error('AUDIO_SIGNATURE_MISMATCH');
  return buffer;
}
