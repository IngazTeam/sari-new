import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractTextFromDocument } from './document-parser';

async function docx(text: string) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}
describe('complete document text extraction', () => {
  it('keeps DOCX text beyond the old 8k cutoff without summaries', async () => {
    const text = 'معلومات تجريبية '.repeat(650) + 'END_MARKER';
    expect(text.length).toBeGreaterThan(8000);
    expect((await extractTextFromDocument(await docx(text), 'docx')).text).toBe(text);
  });
  it.each(['x'.repeat(30_001), '漢'.repeat(23_000)])('rejects character or database byte overflow instead of truncating (%#)', async text => {
    await expect(extractTextFromDocument(await docx(text), 'docx')).rejects.toMatchObject({ issue: 'too_large' });
  });
  it('rejects empty DOCX and malformed packages', async () => {
    await expect(extractTextFromDocument(await docx(''), 'docx')).rejects.toMatchObject({ issue: 'empty' });
    for (const kind of ['pdf','docx','xlsx'] as const) await expect(extractTextFromDocument(Buffer.from('not a document'), kind)).rejects.toMatchObject({ issue: 'unreadable' });
  });
  it('reads a real selectable-text PDF and rejects blank pages', async () => {
    const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText('Synthetic complete policy END_MARKER', { font, size: 12 });
    expect((await extractTextFromDocument(Buffer.from(await pdf.save()), 'pdf')).text).toContain('END_MARKER');
    const blank = await PDFDocument.create(); blank.addPage();
    await expect(extractTextFromDocument(Buffer.from(await blank.save()), 'pdf')).rejects.toMatchObject({ issue: 'empty' });
  });
  it('preserves Excel addresses, sheets, rich text, zero/false and cached formulas without evaluating', async () => {
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Products');
    sheet.getCell('A1').value = 'Name'; sheet.getCell('C1').value = 'Price';
    sheet.getCell('A2').value = { richText: [{ text: 'Demo ' }, { text: 'product' }] };
    sheet.getCell('C2').value = { formula: '1+2', result: 3 }; sheet.getCell('D2').value = 0; sheet.getCell('E2').value = false;
    book.addWorksheet('Policy').getCell('B3').value = { text: 'Public label', hyperlink: 'https://example.test/private' };
    const { text } = await extractTextFromDocument(Buffer.from(await book.xlsx.writeBuffer()), 'xlsx');
    for (const value of ['[Products]', 'A1: Name\tC1: Price', 'A2: Demo product\tC2: 3\tD2: 0\tE2: false', '[Policy]', 'B3: Public label']) expect(text).toContain(value);
    expect(text).not.toContain('[object Object]'); expect(text).not.toContain('example.test');
  });
  it('rejects uncached Excel formulas and empty workbooks rather than inventing data', async () => {
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Empty');
    await expect(extractTextFromDocument(Buffer.from(await book.xlsx.writeBuffer()), 'xlsx')).rejects.toMatchObject({ issue: 'empty' });
    sheet.getCell('C2').value = { formula: '1+2' };
    await expect(extractTextFromDocument(Buffer.from(await book.xlsx.writeBuffer()), 'xlsx')).rejects.toMatchObject({ issue: 'unreadable' });
  });
});
