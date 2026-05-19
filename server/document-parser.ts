/**
 * Document Parser Module
 * Extracts text from PDF, DOCX, and Excel files for the Knowledge Base feature
 */

const MAX_TEXT_LENGTH = 8000; // Maximum characters to extract

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
    console.error(`[DocumentParser] Failed to extract text from ${fileType}:`, error);
    throw new Error(`فشل استخراج النص من الملف. تأكد من أن الملف صالح وغير تالف.`);
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
    const result = await parser.getText();
    return {
      text: cleanAndTruncateText(result.text),
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
    text: cleanAndTruncateText(result.value),
  };
}

/**
 * Extract text from an Excel file (xlsx/xls) using exceljs
 * Reads all worksheets and formats cell values into structured text
 */
async function extractFromExcel(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const ExcelJSModule = await import('exceljs');
  const ExcelJS = ExcelJSModule.default || ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sections: string[] = [];
  let sheetCount = 0;

  workbook.eachSheet((worksheet) => {
    sheetCount++;
    const sheetName = worksheet.name || `Sheet ${sheetCount}`;
    const rows: string[] = [];
    let headerRow: string[] = [];

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        let value = '';
        if (cell.value !== null && cell.value !== undefined) {
          if (typeof cell.value === 'object' && 'text' in cell.value) {
            // Rich text or hyperlink
            value = (cell.value as any).text || String(cell.value);
          } else if (cell.value instanceof Date) {
            value = cell.value.toLocaleDateString('ar-SA');
          } else {
            value = String(cell.value);
          }
        }
        cells.push(value.trim());
      });

      const line = cells.filter(c => c.length > 0).join('\t');
      if (line.trim().length === 0) return;

      if (rowNumber === 1) {
        headerRow = cells;
        rows.push(`📋 [${sheetName}]`);
        rows.push(line);
      } else {
        rows.push(line);
      }
    });

    if (rows.length > 0) {
      sections.push(rows.join('\n'));
    }
  });

  if (sections.length === 0) {
    throw new Error('الملف فارغ أو لا يحتوي على بيانات');
  }

  return {
    text: cleanAndTruncateText(sections.join('\n\n')),
    pageCount: sheetCount,
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
export function getFileTypeFromMime(mimeType: string): 'pdf' | 'docx' | 'xlsx' | null {
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    return 'docx';
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  ) {
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
