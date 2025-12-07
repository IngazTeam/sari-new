import PDFDocument from 'pdfkit';
import { Invoice } from '../../drizzle/schema';
import { getMerchantById, getPaymentById, getPlanById, getSubscriptionById } from '../db';
import { storagePut } from '../storage';

/**
 * Generate invoice PDF
 */
export async function generateInvoicePDF(invoice: Invoice): Promise<{ pdfPath: string; pdfUrl: string } | null> {
  try {
    // Get related data
    const merchant = await getMerchantById(invoice.merchantId);
    const payment = await getPaymentById(invoice.paymentId);
    
    if (!merchant || !payment) {
      console.error('[Invoice PDF] Missing merchant or payment data');
      return null;
    }

    let plan = null;
    if (invoice.subscriptionId) {
      const subscription = await getSubscriptionById(invoice.subscriptionId);
      if (subscription && subscription.planId) {
        plan = await getPlanById(subscription.planId);
      }
    }

    // Create PDF document
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));

    // Header
    doc.fontSize(24).text('INVOICE / فاتورة', { align: 'center' });
    doc.moveDown();

    // Invoice details
    doc.fontSize(10);
    doc.text(`Invoice Number: ${invoice.invoiceNumber}`, 50, 120);
    doc.text(`رقم الفاتورة: ${invoice.invoiceNumber}`, 400, 120, { align: 'right' });
    
    const invoiceDate = new Date(invoice.createdAt).toLocaleDateString('en-US');
    const invoiceDateAr = new Date(invoice.createdAt).toLocaleDateString('ar-SA');
    doc.text(`Date: ${invoiceDate}`, 50, 140);
    doc.text(`التاريخ: ${invoiceDateAr}`, 400, 140, { align: 'right' });

    doc.text(`Status: ${invoice.status.toUpperCase()}`, 50, 160);
    doc.text(`الحالة: ${getStatusArabic(invoice.status)}`, 400, 160, { align: 'right' });

    // Line separator
    doc.moveTo(50, 190).lineTo(550, 190).stroke();

    // Bill to
    doc.fontSize(12).text('Bill To / الفاتورة إلى:', 50, 210);
    doc.fontSize(10);
    doc.text(merchant.businessName, 50, 230);
    if (merchant.phone) {
      doc.text(`Phone: ${merchant.phone}`, 50, 245);
    }

    // Line separator
    doc.moveTo(50, 280).lineTo(550, 280).stroke();

    // Items table header
    doc.fontSize(11).text('Description / الوصف', 50, 300);
    doc.text('Amount / المبلغ', 400, 300, { align: 'right' });
    
    doc.moveTo(50, 320).lineTo(550, 320).stroke();

    // Items
    let yPosition = 340;
    doc.fontSize(10);
    
    if (plan) {
      doc.text(`${plan.name} Subscription`, 50, yPosition);
      doc.text(`اشتراك ${plan.name}`, 50, yPosition + 15);
      doc.text(`${(invoice.amount / 100).toFixed(2)} ${invoice.currency}`, 400, yPosition, { align: 'right' });
      yPosition += 50;
    } else {
      doc.text('Payment', 50, yPosition);
      doc.text('دفعة', 50, yPosition + 15);
      doc.text(`${(invoice.amount / 100).toFixed(2)} ${invoice.currency}`, 400, yPosition, { align: 'right' });
      yPosition += 50;
    }

    // Line separator
    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
    yPosition += 20;

    // Total
    doc.fontSize(12);
    doc.text('Total / الإجمالي:', 300, yPosition);
    doc.text(`${(invoice.amount / 100).toFixed(2)} ${invoice.currency}`, 400, yPosition, { align: 'right' });

    // Footer
    doc.fontSize(8);
    doc.text('Thank you for your business! / شكراً لتعاملكم معنا!', 50, 700, { align: 'center' });
    doc.text('Sari - AI Sales Agent for WhatsApp', 50, 720, { align: 'center' });

    // Finalize PDF
    doc.end();

    // Wait for PDF generation to complete
    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });

    // Upload to S3
    const fileName = `invoices/${invoice.invoiceNumber}.pdf`;
    const result = await storagePut(fileName, pdfBuffer, 'application/pdf');

    if (!result) {
      console.error('[Invoice PDF] Failed to upload to S3');
      return null;
    }

    return {
      pdfPath: result.key,
      pdfUrl: result.url,
    };
  } catch (error) {
    console.error('[Invoice PDF] Error generating PDF:', error);
    return null;
  }
}

function getStatusArabic(status: string): string {
  const statusMap: Record<string, string> = {
    draft: 'مسودة',
    sent: 'مرسلة',
    paid: 'مدفوعة',
    cancelled: 'ملغاة',
  };
  return statusMap[status] || status;
}
