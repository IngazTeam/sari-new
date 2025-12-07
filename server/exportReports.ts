import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Add Arabic font support for jsPDF
// Note: For production, you should include a proper Arabic font
// This is a workaround using default fonts

interface MessageStats {
  text: number;
  voice: number;
  image: number;
  total: number;
}

interface PeakHour {
  hour: number;
  count: number;
}

interface TopProduct {
  productId: number;
  productName: string;
  mentionCount: number;
  price: number;
}

interface ConversionRate {
  rate: number;
  totalConversations: number;
  convertedConversations: number;
}

interface DailyMessage {
  date: string;
  count: number;
}

interface AnalyticsData {
  merchantName: string;
  dateRange: string;
  messageStats: MessageStats;
  peakHours: PeakHour[];
  topProducts: TopProduct[];
  conversionRate: ConversionRate;
  dailyMessages: DailyMessage[];
}

/**
 * Generate Excel report for analytics data
 */
export async function generateExcelReport(data: AnalyticsData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sari Analytics';
  workbook.created = new Date();

  // Sheet 1: Overview
  const overviewSheet = workbook.addWorksheet('نظرة عامة');
  
  // Header
  overviewSheet.addRow(['تقرير تحليلات ساري']);
  overviewSheet.addRow([`المتجر: ${data.merchantName}`]);
  overviewSheet.addRow([`الفترة: ${data.dateRange}`]);
  overviewSheet.addRow([`تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}`]);
  overviewSheet.addRow([]);

  // Message Stats
  overviewSheet.addRow(['إحصائيات الرسائل']);
  overviewSheet.addRow(['النوع', 'العدد', 'النسبة']);
  const total = data.messageStats.total || 1;
  overviewSheet.addRow([
    'رسائل نصية',
    data.messageStats.text,
    `${Math.round((data.messageStats.text / total) * 100)}%`
  ]);
  overviewSheet.addRow([
    'رسائل صوتية',
    data.messageStats.voice,
    `${Math.round((data.messageStats.voice / total) * 100)}%`
  ]);
  overviewSheet.addRow([
    'رسائل صور',
    data.messageStats.image,
    `${Math.round((data.messageStats.image / total) * 100)}%`
  ]);
  overviewSheet.addRow(['الإجمالي', data.messageStats.total, '100%']);
  overviewSheet.addRow([]);

  // Conversion Rate
  overviewSheet.addRow(['معدل التحويل']);
  overviewSheet.addRow(['المؤشر', 'القيمة']);
  overviewSheet.addRow(['معدل التحويل', `${data.conversionRate.rate}%`]);
  overviewSheet.addRow(['إجمالي المحادثات', data.conversionRate.totalConversations]);
  overviewSheet.addRow(['المحادثات المحولة', data.conversionRate.convertedConversations]);

  // Style the overview sheet
  overviewSheet.getRow(1).font = { bold: true, size: 16 };
  overviewSheet.getRow(6).font = { bold: true, size: 14 };
  overviewSheet.getRow(7).font = { bold: true };
  overviewSheet.getRow(13).font = { bold: true, size: 14 };
  overviewSheet.getRow(14).font = { bold: true };

  // Sheet 2: Peak Hours
  const peakHoursSheet = workbook.addWorksheet('أوقات الذروة');
  peakHoursSheet.addRow(['الساعة', 'عدد الرسائل']);
  data.peakHours.forEach(hour => {
    peakHoursSheet.addRow([`${hour.hour}:00`, hour.count]);
  });
  peakHoursSheet.getRow(1).font = { bold: true };

  // Sheet 3: Top Products
  const topProductsSheet = workbook.addWorksheet('المنتجات الأكثر استفساراً');
  topProductsSheet.addRow(['الترتيب', 'اسم المنتج', 'عدد الإشارات', 'السعر']);
  data.topProducts.forEach((product, index) => {
    topProductsSheet.addRow([
      index + 1,
      product.productName,
      product.mentionCount,
      product.price.toString()
    ]);
  });
  topProductsSheet.getRow(1).font = { bold: true };

  // Sheet 4: Daily Messages
  const dailyMessagesSheet = workbook.addWorksheet('الرسائل اليومية');
  dailyMessagesSheet.addRow(['التاريخ', 'عدد الرسائل']);
  data.dailyMessages.forEach(day => {
    dailyMessagesSheet.addRow([
      new Date(day.date).toLocaleDateString('ar-SA'),
      day.count
    ]);
  });
  dailyMessagesSheet.getRow(1).font = { bold: true };

  // Auto-fit columns
  [overviewSheet, peakHoursSheet, topProductsSheet, dailyMessagesSheet].forEach(sheet => {
    sheet.columns.forEach(column => {
      column.width = 20;
    });
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Generate PDF report for analytics data
 */
export function generatePDFReport(data: AnalyticsData): Buffer {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(20);
  doc.text('Sari Analytics Report', 105, 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.text(`Store: ${data.merchantName}`, 20, 35);
  doc.text(`Period: ${data.dateRange}`, 20, 42);
  doc.text(`Report Date: ${new Date().toLocaleDateString('en-US')}`, 20, 49);

  // Message Stats Table
  doc.setFontSize(14);
  doc.text('Message Statistics', 20, 65);
  
  const total = data.messageStats.total || 1;
  autoTable(doc, {
    startY: 70,
    head: [['Type', 'Count', 'Percentage']],
    body: [
      ['Text Messages', data.messageStats.text.toString(), `${Math.round((data.messageStats.text / total) * 100)}%`],
      ['Voice Messages', data.messageStats.voice.toString(), `${Math.round((data.messageStats.voice / total) * 100)}%`],
      ['Image Messages', data.messageStats.image.toString(), `${Math.round((data.messageStats.image / total) * 100)}%`],
      ['Total', data.messageStats.total.toString(), '100%'],
    ],
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246] },
  });

  // Conversion Rate
  let finalY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(14);
  doc.text('Conversion Rate', 20, finalY);
  
  autoTable(doc, {
    startY: finalY + 5,
    head: [['Metric', 'Value']],
    body: [
      ['Conversion Rate', `${data.conversionRate.rate}%`],
      ['Total Conversations', data.conversionRate.totalConversations.toString()],
      ['Converted Conversations', data.conversionRate.convertedConversations.toString()],
    ],
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246] },
  });

  // Peak Hours
  if (data.peakHours.length > 0) {
    finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.text('Peak Hours', 20, finalY);
    
    const peakHoursData = data.peakHours.slice(0, 10).map(hour => [
      `${hour.hour}:00`,
      hour.count.toString()
    ]);

    autoTable(doc, {
      startY: finalY + 5,
      head: [['Hour', 'Messages']],
      body: peakHoursData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
    });
  }

  // Top Products (new page if needed)
  if (data.topProducts.length > 0) {
    doc.addPage();
    doc.setFontSize(14);
    doc.text('Top Products', 20, 20);
    
    const topProductsData = data.topProducts.map((product, index) => [
      (index + 1).toString(),
      product.productName,
      product.mentionCount.toString(),
      product.price.toString()
    ]);

    autoTable(doc, {
      startY: 25,
      head: [['Rank', 'Product Name', 'Mentions', 'Price']],
      body: topProductsData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
    });
  }

  // Daily Messages (new page if needed)
  if (data.dailyMessages.length > 0) {
    doc.addPage();
    doc.setFontSize(14);
    doc.text('Daily Messages Trend', 20, 20);
    
    const dailyMessagesData = data.dailyMessages.slice(0, 30).map(day => [
      new Date(day.date).toLocaleDateString('en-US'),
      day.count.toString()
    ]);

    autoTable(doc, {
      startY: 25,
      head: [['Date', 'Messages']],
      body: dailyMessagesData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
    });
  }

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  return Buffer.from(doc.output('arraybuffer'));
}
