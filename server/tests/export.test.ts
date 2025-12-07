import { describe, it, expect } from 'vitest';
import { generatePDFReport, generateExcelReport } from '../exportReports';

describe('Export Reports', () => {
  const mockData = {
    merchantName: 'Test Store',
    dateRange: '2024-01-01 - 2024-01-31',
    messageStats: {
      text: 100,
      voice: 50,
      image: 25,
      total: 175,
    },
    peakHours: [
      { hour: 10, count: 25 },
      { hour: 14, count: 30 },
      { hour: 20, count: 20 },
    ],
    topProducts: [
      { productId: 1, productName: 'Product 1', mentionCount: 15, price: 100 },
      { productId: 2, productName: 'Product 2', mentionCount: 10, price: 200 },
    ],
    conversionRate: {
      rate: 25,
      totalConversations: 100,
      convertedConversations: 25,
    },
    dailyMessages: [
      { date: '2024-01-01', count: 10 },
      { date: '2024-01-02', count: 15 },
      { date: '2024-01-03', count: 12 },
    ],
  };

  describe('generatePDFReport', () => {
    it('should generate PDF buffer', () => {
      const pdfBuffer = generatePDFReport(mockData);
      
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should generate valid PDF with correct header', () => {
      const pdfBuffer = generatePDFReport(mockData);
      const pdfString = pdfBuffer.toString('latin1');
      
      // Check PDF header
      expect(pdfString).toContain('%PDF');
    });

    it('should handle empty data gracefully', () => {
      const emptyData = {
        ...mockData,
        peakHours: [],
        topProducts: [],
        dailyMessages: [],
      };
      
      const pdfBuffer = generatePDFReport(emptyData);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });
  });

  describe('generateExcelReport', () => {
    it('should generate Excel buffer', async () => {
      const excelBuffer = await generateExcelReport(mockData);
      
      expect(excelBuffer).toBeInstanceOf(Buffer);
      expect(excelBuffer.length).toBeGreaterThan(0);
    });

    it('should generate valid Excel file', async () => {
      const excelBuffer = await generateExcelReport(mockData);
      
      // Check Excel file signature (PK zip header)
      const signature = excelBuffer.toString('hex', 0, 4);
      expect(signature).toBe('504b0304'); // PK\x03\x04
    });

    it('should handle empty data gracefully', async () => {
      const emptyData = {
        ...mockData,
        peakHours: [],
        topProducts: [],
        dailyMessages: [],
      };
      
      const excelBuffer = await generateExcelReport(emptyData);
      expect(excelBuffer).toBeInstanceOf(Buffer);
      expect(excelBuffer.length).toBeGreaterThan(0);
    });

    it('should create multiple sheets', async () => {
      const excelBuffer = await generateExcelReport(mockData);
      
      // Check Excel file structure (workbook.xml should exist)
      const excelString = excelBuffer.toString('latin1');
      expect(excelString).toContain('xl/workbook.xml');
      expect(excelString).toContain('xl/worksheets/');
    });
  });

  describe('Data Integrity', () => {
    it('should preserve message stats in PDF', () => {
      const pdfBuffer = generatePDFReport(mockData);
      const pdfString = pdfBuffer.toString('latin1');
      
      // Check if numbers are preserved
      expect(pdfString).toContain('100');
      expect(pdfString).toContain('50');
      expect(pdfString).toContain('25');
      expect(pdfString).toContain('175');
    });

    it('should preserve conversion rate in PDF', () => {
      const pdfBuffer = generatePDFReport(mockData);
      const pdfString = pdfBuffer.toString('latin1');
      
      expect(pdfString).toContain('25%');
    });
  });
});
