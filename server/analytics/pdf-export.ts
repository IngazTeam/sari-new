import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { readFile } from 'fs/promises';
import { join } from 'path';

interface ReportData {
  merchantId: number;
  merchantName: string;
  reportType: 'daily' | 'weekly' | 'monthly';
  dateRange: {
    start: Date;
    end: Date;
  };
  statistics: {
    totalConversations: number;
    totalMessages: number;
    successRate: number;
    averageResponseTime: number;
  };
  topPerformingCampaigns: Array<{
    name: string;
    successRate: number;
    messagesSent: number;
  }>;
  messageBreakdown: {
    text: number;
    image: number;
    voice: number;
    document: number;
  };
}

export async function generateAnalyticsReport(data: ReportData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const { width, height } = page.getSize();

  const margin = 40;
  let yPosition = height - margin;

  // Helper function to draw text
  const drawText = (text: string, size: number = 12, bold: boolean = false, color = rgb(0, 0, 0)) => {
    const fontSize = size;
    page.drawText(text, {
      x: margin,
      y: yPosition,
      size: fontSize,
      color,
      font: bold ? undefined : undefined,
    });
    yPosition -= fontSize + 10;
  };

  // Header
  drawText('تقرير التحليلات', 24, true, rgb(0, 51, 102));
  drawText(`${data.merchantName}`, 14, true);
  drawText(`الفترة: ${data.dateRange.start.toLocaleDateString('ar-SA')} - ${data.dateRange.end.toLocaleDateString('ar-SA')}`, 10);

  yPosition -= 20;

  // Statistics Section
  drawText('الإحصائيات الرئيسية', 16, true, rgb(0, 51, 102));

  const statsText = [
    `إجمالي المحادثات: ${data.statistics.totalConversations}`,
    `إجمالي الرسائل: ${data.statistics.totalMessages}`,
    `نسبة النجاح: ${data.statistics.successRate}%`,
    `متوسط وقت الرد: ${data.statistics.averageResponseTime}s`,
  ];

  statsText.forEach(stat => drawText(stat, 11));

  yPosition -= 20;

  // Message Breakdown
  drawText('توزيع الرسائل', 16, true, rgb(0, 51, 102));

  const messageStats = [
    `رسائل نصية: ${data.messageBreakdown.text}`,
    `صور: ${data.messageBreakdown.image}`,
    `رسائل صوتية: ${data.messageBreakdown.voice}`,
    `مستندات: ${data.messageBreakdown.document}`,
  ];

  messageStats.forEach(stat => drawText(stat, 11));

  yPosition -= 20;

  // Top Campaigns
  if (data.topPerformingCampaigns.length > 0) {
    drawText('أفضل الحملات أداءً', 16, true, rgb(0, 51, 102));

    data.topPerformingCampaigns.slice(0, 5).forEach(campaign => {
      drawText(`${campaign.name} - نسبة النجاح: ${campaign.successRate}%`, 11);
    });
  }

  // Footer
  yPosition = 40;
  drawText(`تم إنشاء التقرير في: ${new Date().toLocaleDateString('ar-SA')} ${new Date().toLocaleTimeString('ar-SA')}`, 9, false, rgb(128, 128, 128));

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export async function generateCampaignReport(
  campaignId: number,
  campaignName: string,
  campaignData: {
    totalSent: number;
    successCount: number;
    failureCount: number;
    deliveryRate: number;
    readRate: number;
    responseRate: number;
    averageResponseTime: number;
  }
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const { width, height } = page.getSize();

  const margin = 40;
  let yPosition = height - margin;

  // Helper function to draw text
  const drawText = (text: string, size: number = 12, bold: boolean = false, color = rgb(0, 0, 0)) => {
    const fontSize = size;
    page.drawText(text, {
      x: margin,
      y: yPosition,
      size: fontSize,
      color,
    });
    yPosition -= fontSize + 10;
  };

  // Header
  drawText('تقرير الحملة', 24, true, rgb(0, 51, 102));
  drawText(campaignName, 14, true);

  yPosition -= 20;

  // Campaign Statistics
  drawText('إحصائيات الحملة', 16, true, rgb(0, 51, 102));

  const stats = [
    `إجمالي الرسائل المرسلة: ${campaignData.totalSent}`,
    `الرسائل الناجحة: ${campaignData.successCount}`,
    `الرسائل الفاشلة: ${campaignData.failureCount}`,
    `نسبة التسليم: ${campaignData.deliveryRate}%`,
    `نسبة القراءة: ${campaignData.readRate}%`,
    `نسبة الرد: ${campaignData.responseRate}%`,
    `متوسط وقت الرد: ${campaignData.averageResponseTime}s`,
  ];

  stats.forEach(stat => drawText(stat, 11));

  // Footer
  yPosition = 40;
  drawText(`تم إنشاء التقرير في: ${new Date().toLocaleDateString('ar-SA')} ${new Date().toLocaleTimeString('ar-SA')}`, 9, false, rgb(128, 128, 128));

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
