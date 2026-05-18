/**
 * WhatsApp Invoice Delivery Module
 * 
 * Send invoices via WhatsApp with PDF attachment
 */

import { Invoice } from '../../drizzle/schema';
import { generateInvoicePDF } from './generator';
import { sendImageMessage, sendTextMessage } from '../whatsapp';
import {
  createInvoice,
  getInvoiceById,
  getMerchantById,
  getOrderById,
  updateInvoice,
} from '../db';

/**
 * Send invoice via WhatsApp
 */
export async function sendInvoiceViaWhatsApp(
  invoiceId: number,
  customerPhone: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Invoice WhatsApp] Sending invoice ${invoiceId} to ${customerPhone}...`);
    
    // Get invoice from database
    const invoice = await getInvoiceById(invoiceId);
    
    if (!invoice) {
      return {
        success: false,
        error: 'Invoice not found',
      };
    }
    
    // Generate PDF if not already generated
    let pdfUrl = invoice.pdfUrl;
    
    if (!pdfUrl) {
      console.log(`[Invoice WhatsApp] Generating PDF for invoice ${invoiceId}...`);
      const pdfResult = await generateInvoicePDF(invoice);
      
      if (!pdfResult) {
        return {
          success: false,
          error: 'Failed to generate PDF',
        };
      }
      
      pdfUrl = pdfResult.pdfUrl;
      
      // Update invoice with PDF URL
      await updateInvoice(invoiceId, {
        pdfPath: pdfResult.pdfPath,
        pdfUrl: pdfResult.pdfUrl,
      });
    }
    
    // Get merchant info
    const merchant = await getMerchantById(invoice.merchantId);
    
    if (!merchant) {
      return {
        success: false,
        error: 'Merchant not found',
      };
    }
    
    // Send introductory message
    const introMessage = generateInvoiceMessage(invoice, merchant.businessName);
    await sendTextMessage(customerPhone, introMessage);
    
    // Small delay before sending file
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Send PDF file as image (WhatsApp limitation)
    // Note: For actual PDF sending, we need to use document API
    // For now, we'll send the PDF URL in the message
    const pdfMessage = `📄 يمكنك تحميل الفاتورة من الرابط التالي:\n${pdfUrl}`;
    const fileResult = await sendTextMessage(customerPhone, pdfMessage);
    
    if (!fileResult.success) {
      return {
        success: false,
        error: fileResult.error || 'Failed to send file',
      };
    }
    
    // Update invoice status to 'sent' if it was 'draft'
    if (invoice.status === 'draft') {
      await updateInvoice(invoiceId, {
        status: 'sent',
      });
    }
    
    console.log(`[Invoice WhatsApp] Invoice ${invoiceId} sent successfully to ${customerPhone}`);
    
    return {
      success: true,
    };
    
  } catch (error: any) {
    console.error('[Invoice WhatsApp] Error sending invoice:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Generate invoice message text
 */
function generateInvoiceMessage(invoice: Invoice, businessName: string): string {
  const amount = (invoice.amount / 100).toFixed(2);
  const currency = invoice.currency.toUpperCase();
  
  let message = `📄 *فاتورة من ${businessName}*\n\n`;
  message += `رقم الفاتورة: ${invoice.invoiceNumber}\n`;
  message += `المبلغ: ${amount} ${currency}\n`;
  message += `الحالة: ${getStatusArabic(invoice.status)}\n\n`;
  
  if (invoice.status === 'paid') {
    message += `✅ تم الدفع بنجاح\n`;
    message += `شكراً لتعاملكم معنا! 🙏`;
  } else if (invoice.status === 'sent') {
    message += `⏳ في انتظار الدفع\n`;
    message += `يرجى مراجعة الفاتورة المرفقة`;
  }
  
  return message;
}

/**
 * Get status in Arabic
 */
function getStatusArabic(status: string): string {
  const statusMap: Record<string, string> = {
    draft: 'مسودة',
    sent: 'مرسلة',
    paid: 'مدفوعة',
    cancelled: 'ملغاة',
  };
  return statusMap[status] || status;
}

/**
 * Send invoice automatically after order completion
 */
export async function sendOrderInvoice(
  orderId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Invoice WhatsApp] Sending invoice for order ${orderId}...`);
    
    // Get order
    const order = await getOrderById(orderId);
    
    if (!order) {
      return {
        success: false,
        error: 'Order not found',
      };
    }
    
    // Check if invoice already exists for this order
    // For now, we'll create a new invoice each time
    // TODO: Add metadata field to invoices table to track orderId
    
    // Create new invoice for the order
    // Note: paymentId is required, using orderId as placeholder
    const invoice = await createInvoice({
      merchantId: order.merchantId,
      paymentId: orderId, // Using orderId as placeholder
      invoiceNumber: `INV-${Date.now()}-${orderId}`,
      amount: Math.round(order.totalAmount * 100), // Convert to cents
      currency: 'SAR',
      status: 'draft',
    });
    
    if (!invoice) {
      return {
        success: false,
        error: 'Failed to create invoice',
      };
    }
    
    // Send invoice via WhatsApp
    return await sendInvoiceViaWhatsApp(invoice.id, order.customerPhone);
    
  } catch (error: any) {
    console.error('[Invoice WhatsApp] Error sending order invoice:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}
