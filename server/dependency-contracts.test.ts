import { createServer } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import multer from 'multer';
import nodemailer from 'nodemailer';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

describe('patched upload, document and mail dependencies', () => {
  it('accepts bounded multipart content and rejects oversized files without killing the server', async () => {
    const app = express();
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16, files: 1, parts: 2 } });
    app.post('/upload', (req, res) => upload.single('file')(req, res, error => {
      if (error) return void res.status(400).json({ code: error.code });
      res.json({ content: req.file?.buffer.toString('utf8') });
    }));
    const server = createServer(app).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as { port: number }).port;
    try {
      for (const [content, status] of [['safe', 200], ['x'.repeat(17), 400], ['still alive', 200]] as const) {
        const body = new FormData();
        body.append('file', new Blob([content]), 'fixture.txt');
        const response = await fetch(`http://127.0.0.1:${port}/upload`, { method: 'POST', body });
        expect(response.status).toBe(status);
        expect(await response.json()).toEqual(status === 200 ? { content } : { code: 'LIMIT_FILE_SIZE' });
      }
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it('extracts ordinary DOCX text and rejects a malformed document', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>اختبار مستند آمن</w:t></w:r></w:p></w:body></w:document>');
    const result = await mammoth.extractRawText({ buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
    expect(result.value.trim()).toBe('اختبار مستند آمن');
    await expect(mammoth.extractRawText({ buffer: Buffer.from('not a zip') })).rejects.toThrow();
  });
  it('builds email without an SMTP connection or injected Bcc header', async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    const result = await transport.sendMail({ from: 'sender@example.test', to: 'recipient@example.test',
      subject: 'Hello\r\nBcc: attacker@example.test', text: 'رسالة اختبار' });
    const message = result.message.toString();
    expect(message).not.toMatch(/^Bcc:/im);
    expect(result.envelope.to).toEqual(['recipient@example.test']);
  });
  it('preserves XLSX round trips after replacing the vulnerable UUID dependency', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Products').addRow(['منتج', 25]);
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(await workbook.xlsx.writeBuffer());
    expect(restored.getWorksheet('Products')?.getCell('A1').value).toBe('منتج');
    expect(restored.getWorksheet('Products')?.getCell('B1').value).toBe(25);
  });
});
