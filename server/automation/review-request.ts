/**
 * Review Request Automation System
 * 
 * Automatically requests customer reviews after successful delivery
 * to build trust and improve merchant reputation.
 */

import {
  createCustomerReview,
  getCustomerReviewsByMerchantId,
  getCustomerReviewsByOrderId,
  getMerchantById,
  getOrderById,
} from '../db';
import { sendTextMessage } from '../whatsapp';

/**
 * Check if we should request a review for an order
 */
export async function shouldRequestReview(orderId: number): Promise<boolean> {
  try {
    const order = await getOrderById(orderId);
    
    if (!order) {
      return false;
    }
    
    // Only request review for delivered orders
    if (order.status !== 'delivered') {
      return false;
    }
    
    // Check if review was already created
    const existingReviews = await getCustomerReviewsByOrderId(orderId);
    if (existingReviews.length > 0) {
      return false;
    }
    
    // Check if enough time has passed since delivery (3-7 days)
    const deliveryDate = order.updatedAt; // Use updatedAt as delivery date
    const daysSinceDelivery = Math.floor(
      (Date.now() - new Date(deliveryDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Request review between 3-7 days after delivery
    return daysSinceDelivery >= 3 && daysSinceDelivery <= 7;
  } catch (error) {
    console.error('[Review Request] Error checking if should request review:', error);
    return false;
  }
}

/**
 * Generate review request message
 */
export function generateReviewMessage(
  customerName: string,
  orderNumber: string,
  merchantName: string
): string {
  return `مرحباً ${customerName}! 👋

نتمنى أن تكون راضياً عن طلبك #${orderNumber} من ${merchantName} 🎉

رأيك يهمنا كثيراً! هل يمكنك مشاركة تجربتك معنا؟

⭐ ممتاز
⭐⭐ جيد جداً
⭐⭐⭐ جيد
⭐⭐⭐⭐ مقبول
⭐⭐⭐⭐⭐ ضعيف

يمكنك أيضاً إضافة تعليقك لمساعدتنا على التحسين 💚`;
}

/**
 * Send review request to customer
 */
export async function sendReviewRequest(
  orderId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Review Request] Sending review request for order ${orderId}...`);
    
    // Get order details
    const order = await getOrderById(orderId);
    
    if (!order) {
      return { success: false, error: 'Order not found' };
    }
    
    // Check if we should request review
    const should = await shouldRequestReview(orderId);
    if (!should) {
      return { success: false, error: 'Not eligible for review request' };
    }
    
    // Get merchant details
    const merchant = await getMerchantById(order.merchantId);
    if (!merchant) {
      return { success: false, error: 'Merchant not found' };
    }
    
    // Check customer phone
    if (!order.customerPhone) {
      return { success: false, error: 'Customer phone not found' };
    }
    
    // Generate message
    const message = generateReviewMessage(
      order.customerName,
      order.orderNumber || `ORD-${orderId}`,
      merchant.businessName
    );
    
    // Send message
    const result = await sendTextMessage(order.customerPhone, message);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    // Note: Review request tracking can be added later if needed
    // For now, we just send the message
    
    console.log(`[Review Request] Review request sent successfully for order ${orderId}`);
    
    return { success: true };
  } catch (error: any) {
    console.error('[Review Request] Error sending review request:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process review response from customer
 */
export async function processReviewResponse(
  orderId: number,
  rating: number,
  comment?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate rating (1-5 stars)
    if (rating < 1 || rating > 5) {
      return { success: false, error: 'Invalid rating' };
    }
    
    // Get order details
    const order = await getOrderById(orderId);
    if (!order) {
      return { success: false, error: 'Order not found' };
    }
    
    // Create review
    const review = await createCustomerReview({
      orderId,
      merchantId: order.merchantId,
      customerPhone: order.customerPhone,
      customerName: order.customerName,
      rating,
      comment: comment || null,
      isPublic: (rating >= 4) ? 1 : 0, // Only show positive reviews publicly
    });
    
    if (!review) {
      return { success: false, error: 'Failed to create review' };
    }
    
    // Send thank you message
    const thankYouMessage = rating >= 4
      ? `شكراً لك على تقييمك الإيجابي! ⭐ نسعد دائماً بخدمتك 💚`
      : `شكراً لك على ملاحظاتك. نعتذر عن أي إزعاج ونعدك بالتحسين المستمر 🙏`;
    
    await sendTextMessage(order.customerPhone, thankYouMessage);
    
    console.log(`[Review Request] Review processed for order ${orderId}: ${rating} stars`);
    
    return { success: true };
  } catch (error: any) {
    console.error('[Review Request] Error processing review:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get merchant review statistics
 */
export async function getMerchantReviewStats(
  merchantId: number
): Promise<{
  totalReviews: number;
  averageRating: number;
  ratingDistribution: { [key: number]: number };
}> {
  try {
    const reviews = await getCustomerReviewsByMerchantId(merchantId);
    
    if (reviews.length === 0) {
      return {
        totalReviews: 0,
        averageRating: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    }
    
    // Calculate average
    const totalRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0);
    const averageRating = totalRating / reviews.length;
    
    // Calculate distribution
    const distribution: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((r: any) => {
      distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    });
    
    return {
      totalReviews: reviews.length,
      averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
      ratingDistribution: distribution,
    };
  } catch (error) {
    console.error('[Review Request] Error getting review stats:', error);
    return {
      totalReviews: 0,
      averageRating: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }
}
