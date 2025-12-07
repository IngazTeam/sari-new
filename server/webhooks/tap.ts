import crypto from 'crypto';
import { getPaymentGatewayByName, updatePaymentStatus, getPaymentById, updateSubscription, createInvoice, generateInvoiceNumber, updateInvoice } from '../db';
import { notifyOwner } from '../_core/notification';
import { generateInvoicePDF } from '../invoices/generator';
import { sendInvoiceEmail, isSMTPConfigured } from '../invoices/email';

/**
 * Verify Tap webhook signature
 * Tap sends a signature in the x-tap-signature header
 */
export async function verifyTapSignature(
  payload: string,
  signature: string,
  secretKey: string
): Promise<boolean> {
  try {
    const hash = crypto
      .createHmac('sha256', secretKey)
      .update(payload)
      .digest('hex');
    
    return hash === signature;
  } catch (error) {
    console.error('[Tap Webhook] Signature verification failed:', error);
    return false;
  }
}

/**
 * Handle Tap webhook events
 */
export async function handleTapWebhook(payload: any): Promise<{ success: boolean; message: string }> {
  const startTime = Date.now();
  console.log('[Tap Webhook] Received webhook:', {
    tapId: payload.id,
    status: payload.status,
    amount: payload.amount,
    currency: payload.currency,
  });

  try {
    const { id: tapId, status, reference, amount, currency } = payload;

    if (!reference) {
      console.error('[Tap Webhook] Missing reference in payload');
      return { success: false, message: 'Missing reference (payment ID)' };
    }

    const paymentId = parseInt(reference.number || reference);
    
    // Get payment from database
    const payment = await getPaymentById(paymentId);
    if (!payment) {
      console.error('[Tap Webhook] Payment not found:', paymentId);
      return { success: false, message: 'Payment not found' };
    }

    console.log('[Tap Webhook] Processing payment:', {
      paymentId,
      merchantId: payment.merchantId,
      subscriptionId: payment.subscriptionId,
      status,
    });

    // Handle different statuses
    if (status === 'CAPTURED' || status === 'AUTHORIZED') {
      // Payment successful
      await updatePaymentStatus(paymentId, 'completed', tapId);
      
      // Update subscription status
      if (payment.subscriptionId) {
        await updateSubscription(payment.subscriptionId, { status: 'active' });
        
        // Notify owner
        await notifyOwner({
          title: '✅ دفع ناجح - Tap',
          content: `تم استلام دفع بقيمة ${amount} ${currency} للاشتراك #${payment.subscriptionId}`,
        });
      }

      // Generate invoice
      try {
        const invoiceNumber = await generateInvoiceNumber();
        const invoice = await createInvoice({
          invoiceNumber,
          paymentId,
          merchantId: payment.merchantId,
          subscriptionId: payment.subscriptionId || null,
          amount: payment.amount,
          currency: payment.currency,
          status: 'paid',
          emailSent: false,
        });

        if (invoice) {
          // Generate PDF
          const pdfResult = await generateInvoicePDF(invoice);
          if (pdfResult) {
            await updateInvoice(invoice.id, {
              pdfPath: pdfResult.pdfPath,
              pdfUrl: pdfResult.pdfUrl,
            });

            // Send email if SMTP is configured
            if (isSMTPConfigured()) {
              const emailSent = await sendInvoiceEmail({ ...invoice, pdfUrl: pdfResult.pdfUrl });
              if (emailSent) {
                await updateInvoice(invoice.id, {
                  emailSent: true,
                  emailSentAt: new Date(),
                });
              }
            }
          }
        }
      } catch (error) {
        console.error('[Tap Webhook] Error generating invoice:', error);
      }

      const duration = Date.now() - startTime;
      console.log('[Tap Webhook] Payment completed successfully:', {
        paymentId,
        merchantId: payment.merchantId,
        duration: `${duration}ms`,
      });
      return { success: true, message: 'Payment completed successfully' };
    } else if (status === 'FAILED' || status === 'DECLINED') {
      // Payment failed
      await updatePaymentStatus(paymentId, 'failed', tapId);
      
      // Notify owner
      await notifyOwner({
        title: '❌ فشل الدفع - Tap',
        content: `فشل الدفع للاشتراك #${payment.subscriptionId}. السبب: ${status}`,
      });

      return { success: true, message: 'Payment marked as failed' };
    } else if (status === 'REFUNDED') {
      // Payment refunded
      await updatePaymentStatus(paymentId, 'refunded', tapId);
      
      // Update subscription status to cancelled
      if (payment.subscriptionId) {
        await updateSubscription(payment.subscriptionId, { status: 'cancelled' });
      }

      return { success: true, message: 'Payment refunded' };
    }

    return { success: true, message: `Status ${status} processed` };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Tap Webhook] Exception:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: `${duration}ms`,
      payload,
    });
    return { success: false, message: 'Internal server error' };
  }
}
