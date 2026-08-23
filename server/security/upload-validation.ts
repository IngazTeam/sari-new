const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ZIP_LOCAL_FILE = 0x04034b50;
const ZIP_CENTRAL_FILE = 0x02014b50;
const ZIP_END = 0x06054b50;
const MAX_ZIP_COMMENT_BYTES = 65_535;
const MAX_ZIP_ENTRIES = 2_000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;

export class UploadValidationError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'UploadValidationError';
  }
}

function reject(reason: string): never {
  throw new UploadValidationError(reason);
}

export function decodeCanonicalBase64Upload(encoded: string, maxBytes: number): Buffer {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) reject('invalid_size_policy');
  if (!encoded || encoded.length > Math.ceil(maxBytes / 3) * 4) reject('encoded_size_exceeded');
  if (encoded.length % 4 !== 0 || !STRICT_BASE64.test(encoded)) reject('invalid_base64');

  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length < 1) reject('empty_file');
  if (buffer.length > maxBytes) reject('decoded_size_exceeded');
  if (buffer.toString('base64') !== encoded) reject('non_canonical_base64');
  return buffer;
}

function startsWith(buffer: Buffer, signature: readonly number[], offset = 0): boolean {
  return buffer.length >= offset + signature.length
    && signature.every((byte, index) => buffer[offset + index] === byte);
}

function assertPdf(buffer: Buffer): void {
  if (!startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) reject('invalid_pdf_signature');
  const tail = buffer.subarray(Math.max(0, buffer.length - 2_048)).toString('latin1');
  if (!tail.includes('%%EOF')) reject('missing_pdf_eof');
}

export function assertMediaSignature(buffer: Buffer, mimeType: string): void {
  const valid = mimeType === 'image/jpeg'
    ? startsWith(buffer, [0xff, 0xd8, 0xff])
    : mimeType === 'image/png'
      ? startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : mimeType === 'image/gif'
        ? startsWith(buffer, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])
          || startsWith(buffer, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
        : mimeType === 'image/webp'
          ? startsWith(buffer, [0x52, 0x49, 0x46, 0x46])
            && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
          : false;

  if (mimeType === 'application/pdf') return assertPdf(buffer);
  if (!valid) reject('mime_signature_mismatch');
}

function findZipEnd(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - (MAX_ZIP_COMMENT_BYTES + 22));
  for (let offset = buffer.length - 22; offset >= minimum; offset--) {
    if (buffer.readUInt32LE(offset) === ZIP_END) return offset;
  }
  return reject('zip_end_missing');
}

export function assertOfficeOpenXml(buffer: Buffer, kind: 'docx' | 'xlsx'): void {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== ZIP_LOCAL_FILE) reject('invalid_zip_signature');
  const endOffset = findZipEnd(buffer);
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const centralDisk = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  const commentLength = buffer.readUInt16LE(endOffset + 20);

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) reject('multi_disk_zip');
  if (totalEntries < 1 || totalEntries > MAX_ZIP_ENTRIES) reject('zip_entry_count');
  if (centralOffset + centralSize > endOffset || endOffset + 22 + commentLength !== buffer.length) {
    reject('invalid_zip_bounds');
  }

  let cursor = centralOffset;
  let totalUncompressed = 0;
  const names = new Set<string>();

  for (let index = 0; index < totalEntries; index++) {
    if (cursor + 46 > endOffset || buffer.readUInt32LE(cursor) !== ZIP_CENTRAL_FILE) {
      reject('invalid_central_directory');
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const entryCommentLength = buffer.readUInt16LE(cursor + 32);
    const next = cursor + 46 + nameLength + extraLength + entryCommentLength;

    if (next > endOffset || (flags & 0x1) !== 0) reject('encrypted_or_invalid_zip');
    if (method !== 0 && method !== 8) reject('unsupported_zip_compression');
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) reject('zip64_not_supported');
    if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) reject('zip_entry_too_large');
    if (uncompressedSize > 1024 * 1024 && (compressedSize === 0 || uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO)) {
      reject('suspicious_compression_ratio');
    }

    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8').replace(/\\/g, '/');
    const segments = name.split('/');
    if (!name || name.startsWith('/') || /^[A-Za-z]:/.test(name) || segments.includes('..')) reject('unsafe_zip_path');
    names.add(name);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) reject('zip_uncompressed_size_exceeded');
    cursor = next;
  }

  if (cursor !== centralOffset + centralSize) reject('central_directory_size_mismatch');
  if (!names.has('[Content_Types].xml')) reject('office_content_types_missing');
  if (kind === 'docx' && !names.has('word/document.xml')) reject('docx_document_missing');
  if (kind === 'xlsx' && !names.has('xl/workbook.xml')) reject('xlsx_workbook_missing');
}

export function assertKnowledgeDocumentSignature(
  buffer: Buffer,
  fileType: 'pdf' | 'docx' | 'xlsx',
): void {
  if (fileType === 'pdf') return assertPdf(buffer);
  assertOfficeOpenXml(buffer, fileType);
}
