/**
 * Subscription Manager
 * 
 * This module provides utilities for managing merchant subscriptions,
 * including proration calculations, expiry checks, and auto-renewal.
 */

import * as db from "../db";
import { createCharge } from "./tap";

// ============================================
// Types
// ============================================

export interface ProrationResult {
	proratedAmount: number;
	daysUsed: number;
	daysRemaining: number;
	oldPlanDailyRate: number;
	newPlanDailyRate: number;
	creditAmount: number;
	chargeAmount: number;
}

// ============================================
// Calculate Proration
// ============================================

/**
 * Calculate proration when upgrading or downgrading a subscription
 * 
 * @param subscriptionId - Current subscription ID
 * @param newPlanId - New plan ID
 * @param newBillingCycle - New billing cycle (monthly or yearly)
 * @returns Proration calculation result
 */
export async function calculateProration(
	subscriptionId: number,
	newPlanId: number,
	newBillingCycle: 'monthly' | 'yearly'
): Promise<ProrationResult> {
	// Get current subscription
	const subscription = await db.getMerchantSubscriptionById(subscriptionId);
	if (!subscription) {
		throw new Error('Subscription not found');
	}

	// Get current plan
	const currentPlan = await db.getSubscriptionPlanById(subscription.planId!);
	if (!currentPlan) {
		throw new Error('Current plan not found');
	}

	// Get new plan
	const newPlan = await db.getSubscriptionPlanById(newPlanId);
	if (!newPlan) {
		throw new Error('New plan not found');
	}

	// Calculate days used and remaining
	const now = new Date();
	const startDate = new Date(subscription.startDate);
	const endDate = new Date(subscription.endDate);

	const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
	const daysUsed = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
	const daysRemaining = totalDays - daysUsed;

	// Calculate daily rates
	const oldPlanPrice = subscription.billingCycle === 'monthly'
		? parseFloat(currentPlan.monthlyPrice)
		: parseFloat(currentPlan.yearlyPrice);
	const oldPlanDailyRate = oldPlanPrice / totalDays;

	const newPlanPrice = newBillingCycle === 'monthly'
		? parseFloat(newPlan.monthlyPrice)
		: parseFloat(newPlan.yearlyPrice);
	const newPlanDays = newBillingCycle === 'monthly' ? 30 : 365;
	const newPlanDailyRate = newPlanPrice / newPlanDays;

	// Calculate credit for unused days
	const creditAmount = oldPlanDailyRate * daysRemaining;

	// Calculate charge for new plan
	const chargeAmount = Math.max(0, newPlanPrice - creditAmount);

	return {
		proratedAmount: chargeAmount,
		daysUsed,
		daysRemaining,
		oldPlanDailyRate,
		newPlanDailyRate,
		creditAmount,
		chargeAmount,
	};
}

// ============================================
// Check Expired Subscriptions
// ============================================

/**
 * Check for expired subscriptions and update their status
 * This function should be called by a cron job every hour
 * 
 * @returns Number of subscriptions updated
 */
export async function checkExpiredSubscriptions(): Promise<number> {
	try {
		console.log('[Subscription Manager] Checking expired subscriptions...');

		const expiredSubscriptions = await db.getExpiredSubscriptions();

		if (expiredSubscriptions.length === 0) {
			console.log('[Subscription Manager] No expired subscriptions found');
			return 0;
		}

		let updatedCount = 0;

		for (const subscription of expiredSubscriptions) {
			try {
				// Update subscription status to expired
				await db.updateMerchantSubscription(subscription.id, {
					status: 'expired',
				});

				// Update merchant subscription status
				await db.updateMerchantSubscriptionStatus(subscription.merchantId, 'expired');

				// Send notification to merchant
				await sendExpiryNotification(subscription.merchantId, 'expired');

				updatedCount++;
				console.log(`[Subscription Manager] Subscription ${subscription.id} marked as expired`);
			} catch (error) {
				console.error(`[Subscription Manager] Error updating subscription ${subscription.id}:`, error);
			}
		}

		console.log(`[Subscription Manager] Updated ${updatedCount} expired subscriptions`);
		return updatedCount;
	} catch (error) {
		console.error('[Subscription Manager] Error checking expired subscriptions:', error);
		throw error;
	}
}

// ============================================
// Send Expiry Reminders
// ============================================

/**
 * Send expiry reminders to merchants whose subscriptions are expiring soon
 * This function should be called by a cron job daily
 * 
 * @param daysBefore - Number of days before expiry to send reminder (7, 3, or 1)
 * @returns Number of reminders sent
 */
export async function sendExpiryReminders(daysBefore: number): Promise<number> {
	try {
		console.log(`[Subscription Manager] Sending ${daysBefore}-day expiry reminders...`);

		const expiringSubscriptions = await db.getExpiringSubscriptions(daysBefore);

		if (expiringSubscriptions.length === 0) {
			console.log(`[Subscription Manager] No subscriptions expiring in ${daysBefore} days`);
			return 0;
		}

		let sentCount = 0;

		for (const subscription of expiringSubscriptions) {
			try {
				await sendExpiryNotification(subscription.merchantId, 'reminder', daysBefore);
				sentCount++;
				console.log(`[Subscription Manager] Reminder sent to merchant ${subscription.merchantId}`);
			} catch (error) {
				console.error(`[Subscription Manager] Error sending reminder to merchant ${subscription.merchantId}:`, error);
			}
		}

		console.log(`[Subscription Manager] Sent ${sentCount} expiry reminders`);
		return sentCount;
	} catch (error) {
		console.error('[Subscription Manager] Error sending expiry reminders:', error);
		throw error;
	}
}

// ============================================
// Send Expiry Notification
// ============================================

async function sendExpiryNotification(
	merchantId: number,
	type: 'reminder' | 'expired',
	daysBefore?: number
): Promise<void> {
	try {
		// Get merchant details
		const merchant = await db.getMerchantById(merchantId);
		if (!merchant || !merchant.phone) {
			console.warn(`[Subscription Manager] Merchant ${merchantId} has no phone number`);
			return;
		}

		// Get WhatsApp connection
		const whatsappConnection = await db.getWhatsappConnectionByMerchantId(merchantId);
		if (!whatsappConnection) {
			console.warn(`[Subscription Manager] Merchant ${merchantId} has no WhatsApp connection`);
			return;
		}

		// Prepare message
		let message = '';
		if (type === 'reminder') {
			message = `⏰ تنبيه: اشتراكك في ساري سينتهي خلال ${daysBefore} ${daysBefore === 1 ? 'يوم' : 'أيام'}.\n\nلتجديد اشتراكك والاستمرار في استخدام الخدمة، يرجى زيارة لوحة التحكم.\n\nشكراً لاستخدامك ساري! 🌟`;
		} else {
			message = `⚠️ انتهى اشتراكك في ساري.\n\nلتجديد اشتراكك واستعادة الوصول إلى جميع الميزات، يرجى زيارة لوحة التحكم.\n\nنحن هنا لمساعدتك! 💙`;
		}

		// Send WhatsApp message
		// TODO: Implement WhatsApp notification
		// await sendWhatsAppMessage(whatsappConnection.instanceId, whatsappConnection.token, merchant.phone, message);

		console.log(`[Subscription Manager] ${type} notification sent to merchant ${merchantId}`);
	} catch (error) {
		console.error(`[Subscription Manager] Error sending notification to merchant ${merchantId}:`, error);
		throw error;
	}
}

// ============================================
// Auto Renew Subscriptions
// ============================================

/**
 * Automatically renew subscriptions that have auto-renewal enabled
 * This function should be called by a cron job daily
 * 
 * @returns Object with success and failure counts
 */
export async function autoRenewSubscriptions(): Promise<{ success: number; failed: number }> {
	try {
		console.log('[Subscription Manager] Processing auto-renewals...');

		// Get subscriptions expiring in the next 24 hours with auto-renewal enabled
		const expiringSubscriptions = await db.getExpiringSubscriptions(1);
		const autoRenewSubscriptions = expiringSubscriptions.filter(s => s.autoRenew);

		if (autoRenewSubscriptions.length === 0) {
			console.log('[Subscription Manager] No subscriptions to auto-renew');
			return { success: 0, failed: 0 };
		}

		let successCount = 0;
		let failedCount = 0;

		for (const subscription of autoRenewSubscriptions) {
			try {
				// Get plan details
				const plan = await db.getSubscriptionPlanById(subscription.planId!);
				if (!plan) {
					throw new Error('Plan not found');
				}

				// Get merchant details
				const merchant = await db.getMerchantById(subscription.merchantId);
				if (!merchant) {
					throw new Error('Merchant not found');
				}

				// Calculate amount
				const amount = subscription.billingCycle === 'monthly'
					? parseFloat(plan.monthlyPrice)
					: parseFloat(plan.yearlyPrice);

				// Create charge in Tap
				// Note: In production, you would need to store customer payment method ID
				// For now, we'll create a transaction record and send a payment link

				const transaction = await db.createPaymentTransaction({
					merchantId: subscription.merchantId,
					subscriptionId: subscription.id,
					type: 'renewal',
					amount: amount.toString(),
					currency: plan.currency,
					status: 'pending',
					paymentMethod: 'tap',
					metadata: JSON.stringify({
						autoRenewal: true,
						billingCycle: subscription.billingCycle,
					}),
				});

				// TODO: Create Tap charge and send payment link to merchant
				// For now, we'll just log it
				console.log(`[Subscription Manager] Auto-renewal initiated for subscription ${subscription.id}`);

				successCount++;
			} catch (error) {
				console.error(`[Subscription Manager] Error auto-renewing subscription ${subscription.id}:`, error);
				failedCount++;

				// Send failure notification to merchant
				try {
					await sendAutoRenewalFailureNotification(subscription.merchantId);
				} catch (notifError) {
					console.error(`[Subscription Manager] Error sending failure notification:`, notifError);
				}
			}
		}

		console.log(`[Subscription Manager] Auto-renewal completed: ${successCount} success, ${failedCount} failed`);
		return { success: successCount, failed: failedCount };
	} catch (error) {
		console.error('[Subscription Manager] Error processing auto-renewals:', error);
		throw error;
	}
}

// ============================================
// Send Auto-Renewal Failure Notification
// ============================================

async function sendAutoRenewalFailureNotification(merchantId: number): Promise<void> {
	try {
		// Get merchant details
		const merchant = await db.getMerchantById(merchantId);
		if (!merchant || !merchant.phone) {
			return;
		}

		// Get WhatsApp connection
		const whatsappConnection = await db.getWhatsappConnectionByMerchantId(merchantId);
		if (!whatsappConnection) {
			return;
		}

		// Prepare message
		const message = `⚠️ فشل تجديد اشتراكك تلقائياً.\n\nيرجى تحديث معلومات الدفع في لوحة التحكم لتجديد اشتراكك.\n\nإذا كنت بحاجة إلى مساعدة، نحن هنا من أجلك! 💙`;

		// Send WhatsApp message
		// TODO: Implement WhatsApp notification
		// await sendWhatsAppMessage(whatsappConnection.instanceId, whatsappConnection.token, merchant.phone, message);
	} catch (error) {
		console.error(`[Subscription Manager] Error sending auto-renewal failure notification:`, error);
	}
}

// ============================================
// Calculate Days Remaining
// ============================================

/**
 * Calculate days remaining in a subscription
 * 
 * @param endDate - Subscription end date
 * @returns Number of days remaining (0 if expired)
 */
export function calculateDaysRemaining(endDate: string | Date): number {
	const now = new Date();
	const end = new Date(endDate);
	const diff = end.getTime() - now.getTime();
	const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
	return Math.max(0, days);
}

// ============================================
// Check if Subscription is Active
// ============================================

/**
 * Check if a subscription is currently active
 * 
 * @param subscription - Subscription object
 * @returns True if subscription is active
 */
export function isSubscriptionActive(subscription: any): boolean {
	if (!subscription) {
		return false;
	}

	if (subscription.status === 'cancelled' || subscription.status === 'expired') {
		return false;
	}

	const now = new Date();
	const endDate = new Date(subscription.endDate);

	return now <= endDate;
}
