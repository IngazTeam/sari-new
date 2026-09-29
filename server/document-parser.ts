/**
 * Document Parser Module
 * Extracts text from PDF, DOCX, and Excel files for the Knowledge Base feature
 */

import { KNOWLEDGE_PREVIEW_LIMIT } from '../shared/knowledge-preview';
export class DocumentExtractionError extends Error {
  constructor(public readonly issue: 'empty' | 'too_large' | 'unreadable') { super('Document extraction failed'); }
}

/**
 * Extract text content from a PDF, DOCX, or Excel buffer
 */
export async function extractTextFromDocument(
  buffer: Buffer,
  fileType: 'pdf' | 'docx' | 'xlsx'
): Promise<{ text: string; pageCount?: number }> {
  try {
    if (fileType === 'pdf') {
      return await extractFromPdf(buffer);
    } else if (fileType === 'xlsx') {
      return await extractFromExcel(buffer);
    } else {
      return await extractFromDocx(buffer);
    }
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error;
    // Parser errors may contain document contents; do not log raw exception details.
    throw new DocumentExtractionError('unreadable');
  }
}

/**
 * Extract text from a PDF buffer using pdf-parse
 */
async function extractFromPdf(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  // pdf-parse v2 uses class-based API: new PDFParse({ data }) → getText() → destroy()
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ pageJoiner: '' });
    return {
      text: normalizeDocumentText(result.text),
      pageCount: result.total || 0,
    };
  } finally {
    await parser.destroy();
  }
}

/**
 * Extract text from a DOCX buffer using mammoth
 */
async function extractFromDocx(buffer: Buffer): Promise<{ text: string }> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });

  return {
    text: normalizeDocumentText(result.value),
  };
}

/**
 * Extract text from an Excel file (xlsx) using exceljs
 * Reads all worksheets and formats cell values into structured text
 */
async function extractFromExcel(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = ExcelJSModule.default || ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  // @ts-ignore
  await workbook.xlsx.load(buffer);

  const sections: string[] = [];
  let sheetCount = 0;

  workbook.eachSheet((worksheet) => {
    sheetCount++;
    const sheetName = worksheet.name || `Sheet ${sheetCount}`;
    const rows: string[] = [];
    rows.push(`[${sheetName}]`);

    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = documentCellText(cell.value).trim();
        if (value) cells.push(`${cell.address}: ${value}`);
      });

      const line = cells.filter(c => c.length > 0).join('\t');
      if (line.trim().length === 0) return;

      rows.push(line);
    });

    if (rows.length > 1) {
      sections.push(rows.join('\n'));
    }
  });

  if (sections.length === 0) {
    throw new DocumentExtractionError('empty');
  }

  return {
    text: normalizeDocumentText(sections.join('\n\n')),
    pageCount: sheetCount,
  };
}

/**
 * Clean up extracted text: remove excessive whitespace, normalize newlines,
 * Never silently discard text: a file too large for a complete review must be split.
 */
function normalizeDocumentText(raw: string): string {
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

  if (text.length > KNOWLEDGE_PREVIEW_LIMIT || Buffer.byteLength(text, 'utf8') > 65_535) throw new DocumentExtractionError('too_large');
  if (!text) throw new DocumentExtractionError('empty');
  return text;
}

function documentCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (['string', 'number', 'boolean'].includes(typeof value)) return String(value);
  if (typeof value === 'object') {
    const cell = value as Record<string, any>;
    if (Array.isArray(cell.richText)) return cell.richText.map(part => String(part.text || '')).join('');
    if (typeof cell.text === 'string') return cell.text;
    // Read cached formula values only. Never invent values or execute formulas/external links.
    if ('formula' in cell || 'sharedFormula' in cell) {
      if (cell.result === undefined || cell.result === null) throw new DocumentExtractionError('unreadable');
      return documentCellText(cell.result);
    }
  }
  throw new DocumentExtractionError('unreadable');
}

/**
 * Detect file type from MIME type
 */
export function getFileTypeFromMime(mimeType: string): 'pdf' | 'docx' | 'xlsx' | null {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'docx';
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return 'xlsx';
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
