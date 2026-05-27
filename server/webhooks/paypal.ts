import crypto from 'node:crypto';
import { getPaymentGatewayByName, updatePaymentStatus, getPaymentById, updateSubscription, createInvoice, generateInvoiceNumber, updateInvoice } from '../db';
import { notifyOwner } from '../_core/notification';
import { generateInvoicePDF } from '../invoices/generator';
import { sendInvoiceEmail, isSMTPConfigured } from '../invoices/email';

/**
 * Verify PayPal webhook signature
 * PayPal uses a more complex verification process
 */
export async function verifyPayPalSignature(
  headers: Record<string, string>,
  body: string,
  webhookId: string
): Promise<boolean> {
  try {
    const transmissionId = headers['paypal-transmission-id'];
    const transmissionTime = headers['paypal-transmission-time'];
    const transmissionSig = headers['paypal-transmission-sig'];
    const certUrl = headers['paypal-cert-url'];
    const authAlgo = headers['paypal-auth-algo'];

    if (!transmissionId || !transmissionSig || !transmissionTime) {
      console.warn('[PayPal Webhook] Missing required signature headers — rejecting');
      return false;
    }

    if (!webhookId) {
      console.error('[PayPal Webhook] PAYPAL_WEBHOOK_ID not configured — rejecting webhook');
      return false;
    }

    // HMAC verification: hash(transmissionId|transmissionTime|webhookId|crc32(body))
    // This is a server-side approximation; full verification requires PayPal API call
    const crc = crypto.createHash('sha256').update(body).digest('hex');
    const expectedSignatureInput = `${transmissionId}|${transmissionTime}|${webhookId}|${crc}`;
    const localHash = crypto.createHmac('sha256', webhookId).update(expectedSignatureInput).digest('base64');

    // Compare with transmission signature (timing-safe)
    try {
      const sigBuffer = Buffer.from(transmissionSig, 'base64');
      const localBuffer = Buffer.from(localHash, 'base64');
      if (sigBuffer.length !== localBuffer.length) {
        console.warn('[PayPal Webhook] Signature length mismatch — rejecting');
        return false;
      }
      return crypto.timingSafeEqual(sigBuffer, localBuffer);
    } catch {
      console.warn('[PayPal Webhook] Signature comparison failed — rejecting');
      return false;
    }
  } catch (error) {
    console.error('[PayPal Webhook] Signature verification failed:', error);
    return false;
  }
}

/**
 * Handle PayPal webhook events
 */
export async function handlePayPalWebhook(payload: any): Promise<{ success: boolean; message: string }> {
  try {
    const { event_type, resource } = payload;

    if (!resource || !resource.custom_id) {
      return { success: false, message: 'Missing custom_id (payment ID)' };
    }

    const paymentId = parseInt(resource.custom_id);

    // Get payment from database
    const payment = await getPaymentById(paymentId);
    if (!payment) {
      return { success: false, message: 'Payment not found' };
    }

    // Handle different event types
    if (event_type === 'PAYMENT.CAPTURE.COMPLETED' || event_type === 'CHECKOUT.ORDER.APPROVED') {
      // Payment successful
      const paypalId = resource.id;
      await updatePaymentStatus(paymentId, 'completed', paypalId);

      // Update subscription status
      if (payment.subscriptionId) {
        await updateSubscription(payment.subscriptionId, { status: 'active' });

        // Notify owner
        await notifyOwner({
          title: '✅ دفع ناجح - PayPal',
          content: `تم استلام دفع بقيمة ${resource.amount?.value} ${resource.amount?.currency_code} للاشتراك #${payment.subscriptionId}`,
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
          emailSent: 0,
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
                  emailSent: 1,
                  emailSentAt: new Date().toISOString().slice(0, 19).replace("T", " "),
                });
              }
            }
          }
        }
      } catch (error) {
        console.error('[PayPal Webhook] Error generating invoice:', error);
      }

      return { success: true, message: 'Payment completed successfully' };
    } else if (event_type === 'PAYMENT.CAPTURE.DENIED' || event_type === 'CHECKOUT.ORDER.VOIDED') {
      // Payment failed
      const paypalId = resource.id;
      await updatePaymentStatus(paymentId, 'failed', paypalId);

      // Notify owner
      await notifyOwner({
        title: '❌ فشل الدفع - PayPal',
        content: `فشل الدفع للاشتراك #${payment.subscriptionId}`,
      });

      return { success: true, message: 'Payment marked as failed' };
    } else if (event_type === 'PAYMENT.CAPTURE.REFUNDED') {
      // Payment refunded
      const paypalId = resource.id;
      await updatePaymentStatus(paymentId, 'refunded', paypalId);

      // Update subscription status to cancelled
      if (payment.subscriptionId) {
        await updateSubscription(payment.subscriptionId, { status: 'cancelled' });
      }

      return { success: true, message: 'Payment refunded' };
    }

    return { success: true, message: `Event ${event_type} processed` };
  } catch (error) {
    console.error('[PayPal Webhook] Error processing webhook:', error);
    return { success: false, message: 'Internal server error' };
  }
}
