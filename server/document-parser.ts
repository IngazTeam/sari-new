/**
 * Document Parser Module
 * Extracts text from PDF and DOCX files for the Knowledge Base feature
 */

const MAX_TEXT_LENGTH = 8000; // Maximum characters to extract

/**
 * Extract text content from a PDF or DOCX buffer
 */
export async function extractTextFromDocument(
  buffer: Buffer,
  fileType: 'pdf' | 'docx'
): Promise<{ text: string; pageCount?: number }> {
  try {
    if (fileType === 'pdf') {
      return await extractFromPdf(buffer);
    } else {
      return await extractFromDocx(buffer);
    }
  } catch (error) {
    console.error(`[DocumentParser] Failed to extract text from ${fileType}:`, error);
    throw new Error(`فشل استخراج النص من الملف. تأكد من أن الملف صالح وغير تالف.`);
  }
}

/**
 * Extract text from a PDF buffer using pdf-parse
 */
async function extractFromPdf(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const pdfParse = (await import('pdf-parse')).default;
  const result = await pdfParse(buffer);

  return {
    text: cleanAndTruncateText(result.text),
    pageCount: result.numpages,
  };
}

/**
 * Extract text from a DOCX buffer using mammoth
 */
async function extractFromDocx(buffer: Buffer): Promise<{ text: string }> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });

  return {
    text: cleanAndTruncateText(result.value),
  };
}

/**
 * Clean up extracted text: remove excessive whitespace, normalize newlines,
 * and truncate to MAX_TEXT_LENGTH
 */
function cleanAndTruncateText(raw: string): string {
  let text = raw
    // Remove excessive newlines (more than 2 consecutive)
    .replace(/\n{3,}/g, '\n\n')
    // Remove excessive spaces
    .replace(/ {3,}/g, ' ')
    // Trim each line
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim();

  // Truncate to max length, preserving word boundaries
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.substring(0, MAX_TEXT_LENGTH);
    // Cut at last complete sentence or paragraph
    const lastPeriod = text.lastIndexOf('.');
    const lastNewline = text.lastIndexOf('\n');
    const cutPoint = Math.max(lastPeriod, lastNewline);
    if (cutPoint > MAX_TEXT_LENGTH * 0.7) {
      text = text.substring(0, cutPoint + 1);
    }
    text += '\n\n[... تم اختصار المحتوى]';
  }

  return text;
}

/**
 * Detect file type from MIME type
 */
export function getFileTypeFromMime(mimeType: string): 'pdf' | 'docx' | null {
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    return 'docx';
  }
  return null;
}

/**
 * Validate file size (max 5MB)
 */
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function validateFileSize(sizeInBytes: number): boolean {
  return sizeInBytes <= MAX_FILE_SIZE;
}
